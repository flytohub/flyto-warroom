package httpx

import (
	"io"
	"net/http"
	"time"
)

// RetryPolicy configures NewWithRetry. The zero value disables retries
// (MaxAttempts <= 1 means "one shot"). Backoff grows exponentially —
// BaseDelay * 2^(n-1), capped at MaxDelay — the same doubling shape as
// internal/backoff, applied per-request instead of per-loop-tick.
type RetryPolicy struct {
	// MaxAttempts is the total number of attempts including the first.
	// <= 1 disables retrying.
	MaxAttempts int
	// BaseDelay is the wait before the 2nd attempt. Doubles each retry.
	BaseDelay time.Duration
	// MaxDelay caps any single backoff wait. 0 means no cap.
	MaxDelay time.Duration
	// Observer, when set, is called once per attempt with the request,
	// the response (nil on transport error) and the error (nil on a
	// completed round-trip). Instrumentation only — it MUST NOT mutate
	// the request or consume the response body.
	Observer func(req *http.Request, resp *http.Response, err error)
}

// NewWithRetry returns an http.Client whose transport wraps the
// platform baseline (Transport()) with retry + observer behavior per
// policy. Existing callers keep using New/Default and opt in here only
// when they want retries or instrumentation.
//
// Safety: only idempotent methods (GET/HEAD/OPTIONS/PUT/DELETE/TRACE)
// are retried, and only on a transport error or a retryable status
// (429/502/503/504). Non-idempotent POST/PATCH are never replayed, so
// a retry can't double a side effect. A request with a body is only
// retried when its GetBody is set (so the body can be rewound).
func NewWithRetry(timeout time.Duration, policy RetryPolicy) *http.Client {
	c := New(timeout)
	c.Transport = &retryRoundTripper{base: c.Transport, policy: policy}
	return c
}

type retryRoundTripper struct {
	base   http.RoundTripper
	policy RetryPolicy
}

func (rt *retryRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	attempts := rt.policy.MaxAttempts
	if attempts < 1 {
		attempts = 1
	}
	var resp *http.Response
	var err error
	for attempt := 1; attempt <= attempts; attempt++ {
		resp, err = rt.base.RoundTrip(req)
		if rt.policy.Observer != nil {
			rt.policy.Observer(req, resp, err)
		}
		if attempt == attempts || !retryable(req, resp, err) {
			return resp, err
		}
		// Drain+close the failed response so the connection returns to
		// the pool, then rewind the body for the replay. If the body
		// can't be rewound, give up and return what we have.
		if resp != nil {
			drainBody(resp)
		}
		if !rewindBody(req) {
			return resp, err
		}
		select {
		case <-req.Context().Done():
			return nil, req.Context().Err()
		case <-time.After(backoffDelay(rt.policy, attempt)):
		}
	}
	return resp, err
}

// retryable reports whether another attempt is warranted AND safe.
func retryable(req *http.Request, resp *http.Response, err error) bool {
	if !idempotent(req.Method) {
		return false
	}
	if err != nil {
		return true // transport-level failure (conn reset, timeout, DNS)
	}
	switch resp.StatusCode {
	case http.StatusTooManyRequests, // 429
		http.StatusBadGateway,         // 502
		http.StatusServiceUnavailable, // 503
		http.StatusGatewayTimeout:     // 504
		return true
	}
	return false
}

func idempotent(method string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions,
		http.MethodPut, http.MethodDelete, http.MethodTrace:
		return true
	}
	return false
}

// rewindBody resets req.Body for a replay. Returns true when the next
// attempt can proceed: no body, or a body that GetBody can reproduce.
func rewindBody(req *http.Request) bool {
	if req.Body == nil {
		return true
	}
	if req.GetBody == nil {
		return false
	}
	body, err := req.GetBody()
	if err != nil {
		return false
	}
	req.Body = body
	return true
}

func drainBody(resp *http.Response) {
	if resp.Body == nil {
		return
	}
	_, _ = io.Copy(io.Discard, resp.Body)
	_ = resp.Body.Close()
}

// backoffDelay returns BaseDelay * 2^(attempt-1), capped at MaxDelay.
// attempt is 1-based, so the wait before the 2nd attempt is BaseDelay.
func backoffDelay(p RetryPolicy, attempt int) time.Duration {
	d := p.BaseDelay
	for i := 1; i < attempt; i++ {
		d *= 2
		if d < 0 || (p.MaxDelay > 0 && d > p.MaxDelay) {
			return p.MaxDelay
		}
	}
	if p.MaxDelay > 0 && d > p.MaxDelay {
		return p.MaxDelay
	}
	return d
}
