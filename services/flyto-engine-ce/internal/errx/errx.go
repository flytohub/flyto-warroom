// Package errx provides the engine's typed error envelope.
//
// Every handler / subsystem converts failures into a *Error before they
// reach the client so responses carry a machine-readable `code`, a human
// `message`, a `retryable` flag, and optional `details`. The HTTP layer
// uses these to emit consistent JSON:
//
//	{
//	  "error": {
//	    "code": "NOT_FOUND",
//	    "message": "resource not found",
//	    "retryable": false,
//	    "requestId": "r-abc123"
//	  }
//	}
//
// retryable is the load-bearing field: callers and the worker use it to
// decide whether a retry makes sense. Most infra blips (DB timeout,
// transient 5xx from an AI provider) are retryable; validation,
// authorization, and "not found" are not.
//
// Stdlib errors.Is / errors.As work: wrap an *Error via fmt.Errorf("%w", e)
// and the chain stays intact.
package errx

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
)

// Code is the machine-readable error code. Keep the set small and stable —
// clients may key user-facing logic off these values.
type Code string

const (
	CodeBadRequest           Code = "BAD_REQUEST"
	CodeUnauthorized         Code = "UNAUTHORIZED"
	CodeForbidden            Code = "FORBIDDEN"
	CodeNotFound             Code = "NOT_FOUND"
	CodeConflict             Code = "CONFLICT"
	CodeUnprocessable        Code = "UNPROCESSABLE"
	CodeTooLarge             Code = "TOO_LARGE"
	CodeUnsupportedMediaType Code = "UNSUPPORTED_MEDIA_TYPE"
	CodeInternal             Code = "INTERNAL"
	CodeTransient            Code = "TRANSIENT"            // retryable infra failure
	CodeUpstreamUnavailable  Code = "UPSTREAM_UNAVAILABLE" // e.g. AI provider down
)

// Error is the typed envelope. Fields serialise to JSON directly.
type Error struct {
	Code      Code           `json:"code"`
	Message   string         `json:"message"`
	Retryable bool           `json:"retryable"`
	Details   map[string]any `json:"details,omitempty"`
	// wrapped is the underlying cause — kept out of JSON to avoid leaking
	// internal error strings to clients.
	wrapped error
}

// Error implements the error interface. The printed form includes the
// wrapped cause so logs stay useful without surfacing the cause over HTTP.
func (e *Error) Error() string {
	if e == nil {
		return ""
	}
	if e.wrapped != nil {
		return fmt.Sprintf("%s: %s: %v", e.Code, e.Message, e.wrapped)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// Unwrap lets errors.Is / errors.As traverse into the cause.
func (e *Error) Unwrap() error { return e.wrapped }

// New builds an Error without a cause.
func New(code Code, message string) *Error {
	return &Error{Code: code, Message: message, Retryable: defaultRetryable(code)}
}

// Wrap annotates an existing error with an envelope. If err is already an
// *Error, the existing code/message are preserved; otherwise the new
// envelope wraps it.
func Wrap(err error, code Code, message string) *Error {
	if err == nil {
		return New(code, message)
	}
	var e *Error
	if errors.As(err, &e) {
		// If the caller is re-wrapping with a more specific code, let them.
		if code != "" && code != e.Code {
			return &Error{Code: code, Message: message, Retryable: defaultRetryable(code), wrapped: err}
		}
		return e
	}
	return &Error{Code: code, Message: message, Retryable: defaultRetryable(code), wrapped: err}
}

// WithDetail returns a copy of e with the given key=value added to Details.
// Safe to call on nil (returns nil).
func (e *Error) WithDetail(key string, value any) *Error {
	if e == nil {
		return nil
	}
	d := make(map[string]any, len(e.Details)+1)
	for k, v := range e.Details {
		d[k] = v
	}
	d[key] = value
	cp := *e
	cp.Details = d
	return &cp
}

// IsRetryable reports whether err (possibly wrapped) is flagged retryable.
// Non-*Error values are treated as non-retryable.
func IsRetryable(err error) bool {
	var e *Error
	if !errors.As(err, &e) {
		return false
	}
	return e.Retryable
}

// HTTPStatus maps an error to its HTTP status code. Non-*Error values
// return 500.
func HTTPStatus(err error) int {
	var e *Error
	if !errors.As(err, &e) {
		return http.StatusInternalServerError
	}
	switch e.Code {
	case CodeBadRequest:
		return http.StatusBadRequest
	case CodeUnprocessable:
		return http.StatusUnprocessableEntity
	case CodeUnauthorized:
		return http.StatusUnauthorized
	case CodeForbidden:
		return http.StatusForbidden
	case CodeNotFound:
		return http.StatusNotFound
	case CodeConflict:
		return http.StatusConflict
	case CodeTooLarge:
		return http.StatusRequestEntityTooLarge
	case CodeUnsupportedMediaType:
		return http.StatusUnsupportedMediaType
	case CodeUpstreamUnavailable:
		return http.StatusBadGateway
	case CodeTransient:
		return http.StatusServiceUnavailable
	default:
		return http.StatusInternalServerError
	}
}

// Write serialises err as the JSON envelope and sets the HTTP status.
// requestID is embedded in the payload when non-empty so clients can
// correlate errors with server-side logs.
func Write(w http.ResponseWriter, err error, requestID string) {
	var e *Error
	if !errors.As(err, &e) {
		e = Wrap(err, CodeInternal, "internal error")
	}
	body := struct {
		Error any `json:"error"`
	}{
		Error: struct {
			Code      Code           `json:"code"`
			Message   string         `json:"message"`
			Retryable bool           `json:"retryable"`
			RequestID string         `json:"requestId,omitempty"`
			Details   map[string]any `json:"details,omitempty"`
		}{
			Code:      e.Code,
			Message:   e.Message,
			Retryable: e.Retryable,
			RequestID: requestID,
			Details:   e.Details,
		},
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(HTTPStatus(e))
	_ = json.NewEncoder(w).Encode(body)
}

// defaultRetryable classifies a Code as retryable by default. Callers can
// still override by mutating Error.Retryable.
func defaultRetryable(code Code) bool {
	switch code {
	case CodeTransient, CodeUpstreamUnavailable:
		return true
	}
	return false
}
