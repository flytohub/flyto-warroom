package httpx

import (
	"net/http"
	"time"

	"github.com/flytohub/flyto-engine/internal/circuit"
)

// NewWithCircuit returns an http.Client whose transport wraps the
// platform baseline (Transport()) with a circuit breaker (internal/
// circuit). When the breaker is open the round-trip fails fast with
// circuit.ErrOpen instead of hammering a downstream that's already
// failing — the caller should fall back to cached/degraded behavior.
//
// Opt-in, mirroring NewWithRetry: the breaker is NOT added to the
// default Transport(), so New()/Default() callers are unaffected. A
// caller adopts it explicitly per upstream (pass circuit.DefaultConfig
// (name) and tune the window/threshold for that provider).
//
// A transport error or a 5xx response counts as a failure; everything
// else (including 4xx, which is the caller's fault not the upstream's)
// counts as a success so client-side mistakes don't trip the breaker.
func NewWithCircuit(timeout time.Duration, cfg circuit.Config) *http.Client {
	c := New(timeout)
	c.Transport = &circuitRoundTripper{base: c.Transport, breaker: circuit.New(cfg)}
	return c
}

type circuitRoundTripper struct {
	base    http.RoundTripper
	breaker *circuit.Breaker
}

func (rt *circuitRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	if err := rt.breaker.Allow(); err != nil {
		return nil, err // breaker open — fail fast
	}
	resp, err := rt.base.RoundTrip(req)
	if err != nil || (resp != nil && resp.StatusCode >= 500) {
		rt.breaker.RecordFailure()
	} else {
		rt.breaker.RecordSuccess()
	}
	return resp, err
}
