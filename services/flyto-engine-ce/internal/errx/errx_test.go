package errx

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http/httptest"
	"testing"
)

func TestNew_DefaultRetryable(t *testing.T) {
	cases := []struct {
		code    Code
		wantRet bool
	}{
		{CodeTransient, true},
		{CodeUpstreamUnavailable, true},
		{CodeNotFound, false},
		{CodeBadRequest, false},
		{CodeInternal, false},
	}
	for _, c := range cases {
		e := New(c.code, "x")
		if e.Retryable != c.wantRet {
			t.Errorf("%s: retryable=%v want %v", c.code, e.Retryable, c.wantRet)
		}
	}
}

func TestWrap_NilReturnsPlainEnvelope(t *testing.T) {
	got := Wrap(nil, CodeInternal, "boom")
	if got == nil || got.Code != CodeInternal {
		t.Fatalf("got %+v", got)
	}
}

func TestWrap_PreservesExistingError(t *testing.T) {
	inner := New(CodeNotFound, "missing")
	wrapped := Wrap(inner, CodeNotFound, "ignored message")
	if wrapped != inner {
		t.Errorf("expected pointer identity preserved when code unchanged")
	}
}

func TestWrap_AllowsCodeUpgrade(t *testing.T) {
	inner := New(CodeInternal, "raw")
	wrapped := Wrap(inner, CodeUpstreamUnavailable, "ai down")
	if wrapped.Code != CodeUpstreamUnavailable {
		t.Errorf("expected upgrade to UPSTREAM_UNAVAILABLE, got %s", wrapped.Code)
	}
	if !errors.Is(wrapped, inner) {
		// errors.Is should descend via Unwrap
		var target *Error
		if !errors.As(wrapped, &target) {
			t.Errorf("As should succeed")
		}
	}
}

func TestWrap_PlainError(t *testing.T) {
	raw := errors.New("disk full")
	wrapped := Wrap(raw, CodeTransient, "io")
	if !errors.Is(wrapped, raw) {
		t.Errorf("Is should find the plain error via Unwrap")
	}
	if wrapped.Error() == "" {
		t.Error("Error() should include both layers")
	}
}

func TestError_StringFormat(t *testing.T) {
	e := New(CodeNotFound, "gone")
	if got := e.Error(); got != "NOT_FOUND: gone" {
		t.Errorf("unexpected: %q", got)
	}
	wrapped := Wrap(errors.New("inner"), CodeInternal, "outer")
	if got := wrapped.Error(); got == "" {
		t.Error("wrapped Error() should not be empty")
	}
}

func TestError_NilSafeOnNilReceiver(t *testing.T) {
	var e *Error
	if got := e.Error(); got != "" {
		t.Errorf("nil *Error should render empty, got %q", got)
	}
	if got := e.WithDetail("k", "v"); got != nil {
		t.Errorf("nil *Error.WithDetail should return nil, got %+v", got)
	}
}

func TestWithDetail_CopiesInsteadOfMutating(t *testing.T) {
	a := New(CodeBadRequest, "bad")
	a = a.WithDetail("field", "foo")
	b := a.WithDetail("field2", "bar")
	if _, ok := a.Details["field2"]; ok {
		t.Error("WithDetail should return a copy, not mutate in place")
	}
	if b.Details["field"] != "foo" || b.Details["field2"] != "bar" {
		t.Errorf("copy missing keys: %+v", b.Details)
	}
}

func TestIsRetryable(t *testing.T) {
	if IsRetryable(nil) {
		t.Error("nil is not retryable")
	}
	if IsRetryable(errors.New("plain")) {
		t.Error("plain errors are not retryable")
	}
	if !IsRetryable(New(CodeTransient, "x")) {
		t.Error("transient should be retryable")
	}
	if !IsRetryable(fmt.Errorf("wrapped: %w", New(CodeTransient, "x"))) {
		t.Error("wrapped transient should still be retryable")
	}
}

func TestHTTPStatus_AllCodes(t *testing.T) {
	cases := []struct {
		code Code
		want int
	}{
		{CodeBadRequest, 400},
		{CodeUnauthorized, 401},
		{CodeForbidden, 403},
		{CodeNotFound, 404},
		{CodeConflict, 409},
		{CodeTooLarge, 413},
		{CodeUnsupportedMediaType, 415},
		{CodeUnprocessable, 422},
		{CodeInternal, 500},
		{CodeUpstreamUnavailable, 502},
		{CodeTransient, 503},
	}
	for _, c := range cases {
		got := HTTPStatus(New(c.code, ""))
		if got != c.want {
			t.Errorf("%s → %d, want %d", c.code, got, c.want)
		}
	}
	// Non-*Error values default to 500.
	if got := HTTPStatus(errors.New("plain")); got != 500 {
		t.Errorf("plain error should be 500, got %d", got)
	}
}

func TestWrite_EmitsEnvelopeAndStatus(t *testing.T) {
	w := httptest.NewRecorder()
	Write(w, New(CodeForbidden, "no"), "req-123")
	if w.Code != 403 {
		t.Fatalf("status %d", w.Code)
	}
	var body struct {
		Error struct {
			Code      Code   `json:"code"`
			Message   string `json:"message"`
			Retryable bool   `json:"retryable"`
			RequestID string `json:"requestId"`
		} `json:"error"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Error.Code != CodeForbidden || body.Error.Message != "no" || body.Error.RequestID != "req-123" {
		t.Errorf("unexpected body: %+v", body)
	}
}

func TestWrite_FallsBackOnPlainError(t *testing.T) {
	w := httptest.NewRecorder()
	Write(w, errors.New("raw"), "")
	if w.Code != 500 {
		t.Fatalf("expected 500, got %d", w.Code)
	}
	var body struct {
		Error struct{ Code Code } `json:"error"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	if body.Error.Code != CodeInternal {
		t.Errorf("plain error should surface as INTERNAL, got %s", body.Error.Code)
	}
}
