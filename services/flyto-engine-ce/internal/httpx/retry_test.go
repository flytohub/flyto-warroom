package httpx

import (
	"net/http"
	"strings"
	"testing"
	"time"
)

// stubRT is a base RoundTripper that returns the queued responses/errors
// in order and counts how many times it was called.
type stubRT struct {
	calls    int
	statuses []int // status to return per call; 0 means "transport error"
}

func (s *stubRT) RoundTrip(req *http.Request) (*http.Response, error) {
	i := s.calls
	s.calls++
	if i >= len(s.statuses) {
		i = len(s.statuses) - 1
	}
	if s.statuses[i] == 0 {
		return nil, &netErr{}
	}
	return &http.Response{
		StatusCode: s.statuses[i],
		Body:       http.NoBody,
		Request:    req,
	}, nil
}

type netErr struct{}

func (e *netErr) Error() string { return "simulated transport error" }

func newRetryClient(base http.RoundTripper, p RetryPolicy) *http.Client {
	return &http.Client{Transport: &retryRoundTripper{base: base, policy: p}}
}

func TestRetry_RetriesThenSucceeds(t *testing.T) {
	base := &stubRT{statuses: []int{503, 503, 200}}
	var observed int
	c := newRetryClient(base, RetryPolicy{MaxAttempts: 3, BaseDelay: time.Millisecond, Observer: func(*http.Request, *http.Response, error) { observed++ }})

	resp, err := c.Get("http://example.test/")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
	if base.calls != 3 {
		t.Errorf("base called %d times, want 3 (2 retries)", base.calls)
	}
	if observed != 3 {
		t.Errorf("observer called %d times, want 3 (once per attempt)", observed)
	}
}

func TestRetry_GivesUpAtMaxAttempts(t *testing.T) {
	base := &stubRT{statuses: []int{503}}
	c := newRetryClient(base, RetryPolicy{MaxAttempts: 2, BaseDelay: time.Millisecond})
	resp, err := c.Get("http://example.test/")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.StatusCode != 503 {
		t.Errorf("status = %d, want 503 (gave up, returned last response)", resp.StatusCode)
	}
	if base.calls != 2 {
		t.Errorf("base called %d times, want 2 (capped at MaxAttempts)", base.calls)
	}
}

func TestRetry_DoesNotRetryPOST(t *testing.T) {
	base := &stubRT{statuses: []int{503, 200}}
	c := newRetryClient(base, RetryPolicy{MaxAttempts: 3, BaseDelay: time.Millisecond})
	resp, err := c.Post("http://example.test/", "text/plain", strings.NewReader("x"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.StatusCode != 503 {
		t.Errorf("status = %d, want 503 (POST must not be retried)", resp.StatusCode)
	}
	if base.calls != 1 {
		t.Errorf("base called %d times, want 1 (non-idempotent, no replay)", base.calls)
	}
}

func TestRetry_RetriesTransportError(t *testing.T) {
	base := &stubRT{statuses: []int{0, 200}} // transport error then success
	c := newRetryClient(base, RetryPolicy{MaxAttempts: 2, BaseDelay: time.Millisecond})
	resp, err := c.Get("http://example.test/")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.StatusCode != 200 || base.calls != 2 {
		t.Errorf("got status=%d calls=%d, want 200 / 2", resp.StatusCode, base.calls)
	}
}

func TestRetry_NoRetryWhenDisabled(t *testing.T) {
	base := &stubRT{statuses: []int{503, 200}}
	c := newRetryClient(base, RetryPolicy{MaxAttempts: 1, BaseDelay: time.Millisecond})
	resp, _ := c.Get("http://example.test/")
	if resp.StatusCode != 503 || base.calls != 1 {
		t.Errorf("got status=%d calls=%d, want 503 / 1 (retry disabled)", resp.StatusCode, base.calls)
	}
}

func TestBackoffDelay_DoublesAndCaps(t *testing.T) {
	p := RetryPolicy{BaseDelay: 10 * time.Millisecond, MaxDelay: 30 * time.Millisecond}
	got := []time.Duration{backoffDelay(p, 1), backoffDelay(p, 2), backoffDelay(p, 3)}
	want := []time.Duration{10 * time.Millisecond, 20 * time.Millisecond, 30 * time.Millisecond} // 10, 20, 40→cap 30
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("backoffDelay attempt %d = %v, want %v", i+1, got[i], want[i])
		}
	}
}
