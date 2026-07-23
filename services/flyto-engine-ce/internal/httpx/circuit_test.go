package httpx

import (
	"errors"
	"net/http"
	"testing"

	"github.com/flytohub/flyto-engine/internal/circuit"
)

func TestCircuit_OpensAfterThresholdAndFailsFast(t *testing.T) {
	base := &stubRT{statuses: []int{500, 500, 500}} // always failing upstream
	cfg := circuit.DefaultConfig("test")
	cfg.FailureThreshold = 2
	c := &http.Client{Transport: &circuitRoundTripper{base: base, breaker: circuit.New(cfg)}}

	// First two calls reach the upstream (both 500) and trip the breaker.
	for i := 0; i < 2; i++ {
		if _, err := c.Get("http://example.test/"); err != nil {
			t.Fatalf("call %d: unexpected error before breaker opens: %v", i, err)
		}
	}
	if base.calls != 2 {
		t.Fatalf("base called %d times, want 2 before open", base.calls)
	}
	// Third call must fail fast with ErrOpen WITHOUT hitting the upstream.
	_, err := c.Get("http://example.test/")
	if !errors.Is(err, circuit.ErrOpen) {
		t.Fatalf("expected circuit.ErrOpen once breaker is open, got %v", err)
	}
	if base.calls != 2 {
		t.Errorf("base called %d times, want still 2 (fail-fast, no upstream hit)", base.calls)
	}
}

func TestCircuit_SuccessKeepsClosed(t *testing.T) {
	base := &stubRT{statuses: []int{200, 200, 200, 200}}
	cfg := circuit.DefaultConfig("test")
	cfg.FailureThreshold = 2
	c := &http.Client{Transport: &circuitRoundTripper{base: base, breaker: circuit.New(cfg)}}
	for i := 0; i < 4; i++ {
		resp, err := c.Get("http://example.test/")
		if err != nil {
			t.Fatalf("call %d errored: %v", i, err)
		}
		if resp.StatusCode != 200 {
			t.Fatalf("call %d status %d", i, resp.StatusCode)
		}
	}
	if base.calls != 4 {
		t.Errorf("base called %d times, want 4 (breaker stays closed on success)", base.calls)
	}
}

// 4xx is the caller's fault, not the upstream's — it must NOT trip the breaker.
func TestCircuit_4xxDoesNotTrip(t *testing.T) {
	base := &stubRT{statuses: []int{404, 404, 404, 404, 404}}
	cfg := circuit.DefaultConfig("test")
	cfg.FailureThreshold = 2
	c := &http.Client{Transport: &circuitRoundTripper{base: base, breaker: circuit.New(cfg)}}
	for i := 0; i < 5; i++ {
		if _, err := c.Get("http://example.test/"); err != nil {
			t.Fatalf("call %d: 4xx must not open breaker, got %v", i, err)
		}
	}
	if base.calls != 5 {
		t.Errorf("base called %d times, want 5 (4xx never trips)", base.calls)
	}
}
