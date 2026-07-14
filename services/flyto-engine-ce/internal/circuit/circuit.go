// Package circuit implements a per-target circuit breaker for upstream
// API calls. When OpenAI / GitHub / Shodan / Trivy DB saturate or
// hard-fail, every handler that calls them piles up inflight requests
// until the pool exhausts and the whole engine cascades. The breaker
// fails fast while the upstream is impaired so callers can degrade
// gracefully (return cached / partial / "service temporarily
// unavailable") instead of 502.
//
// State machine:
//
//	closed   → normal traffic. Counts failures in a rolling window.
//	open     → fail fast. After CooldownPeriod, transition to half-open.
//	half-open → one probe allowed. Success closes; failure re-opens.
//
// Concurrency model: each Breaker holds a sync.Mutex around state
// transitions. The hot path (Allow + RecordSuccess) is a few mutex
// acquisitions, which is fine for our throughput. Lock contention is
// not a worry until we're at 10k+ rps per breaker — well beyond what
// the engine handles today.
package circuit

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

// State is one of the three breaker states.
type State int

const (
	StateClosed State = iota
	StateOpen
	StateHalfOpen
)

func (s State) String() string {
	switch s {
	case StateClosed:
		return "closed"
	case StateOpen:
		return "open"
	case StateHalfOpen:
		return "half-open"
	}
	return "unknown"
}

// Config tunes a single Breaker. Defaults via DefaultConfig() are sane
// for typical upstream APIs (LLM, GitHub, threat feeds).
type Config struct {
	// Name identifies the upstream for logs and metrics.
	Name string

	// FailureThreshold: open after this many failures inside the
	// rolling Window. Defaults to 5.
	FailureThreshold int

	// Window is the rolling window over which failures are counted.
	// Defaults to 1 minute.
	Window time.Duration

	// CooldownPeriod is how long the breaker stays open before
	// transitioning to half-open. Defaults to 30 seconds.
	CooldownPeriod time.Duration

	// MaxHalfOpenProbes caps how many concurrent half-open requests
	// are admitted while the breaker is testing recovery. Defaults to 1
	// — a single probe is enough to learn whether the upstream is
	// back; admitting more risks re-tripping under partial recovery.
	MaxHalfOpenProbes int

	// Now is the clock source — injectable for tests. Defaults to
	// time.Now.
	Now func() time.Time
}

// DefaultConfig returns Config defaults suitable for most upstreams.
// Pass Name and tweak Window / FailureThreshold for chattier APIs.
func DefaultConfig(name string) Config {
	return Config{
		Name:              name,
		FailureThreshold:  5,
		Window:            time.Minute,
		CooldownPeriod:    30 * time.Second,
		MaxHalfOpenProbes: 1,
		Now:               time.Now,
	}
}

// ErrOpen is returned by Allow when the breaker is open. Callers
// should fall back to cached / partial / degraded response — not retry.
var ErrOpen = errors.New("circuit breaker open")

// Breaker is the per-target state machine. Safe for concurrent use.
type Breaker struct {
	cfg Config

	mu             sync.Mutex
	state          State
	failures       []time.Time // sliding window
	openedAt       time.Time
	halfOpenProbes int
}

// New returns a Breaker in the closed state.
func New(cfg Config) *Breaker {
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	if cfg.FailureThreshold == 0 {
		cfg.FailureThreshold = 5
	}
	if cfg.Window == 0 {
		cfg.Window = time.Minute
	}
	if cfg.CooldownPeriod == 0 {
		cfg.CooldownPeriod = 30 * time.Second
	}
	if cfg.MaxHalfOpenProbes == 0 {
		cfg.MaxHalfOpenProbes = 1
	}
	return &Breaker{cfg: cfg, state: StateClosed}
}

// Allow returns nil when the caller may proceed with the upstream
// call, or ErrOpen when the breaker is open and the request should
// fail fast. The caller MUST follow Allow with RecordSuccess or
// RecordFailure once the upstream returns.
func (b *Breaker) Allow() error {
	b.mu.Lock()
	defer b.mu.Unlock()

	switch b.state {
	case StateClosed:
		return nil

	case StateOpen:
		if b.cfg.Now().Sub(b.openedAt) >= b.cfg.CooldownPeriod {
			b.state = StateHalfOpen
			b.halfOpenProbes = 1
			return nil
		}
		return fmt.Errorf("%s: %w", b.cfg.Name, ErrOpen)

	case StateHalfOpen:
		if b.halfOpenProbes >= b.cfg.MaxHalfOpenProbes {
			return fmt.Errorf("%s: %w (half-open probe in flight)", b.cfg.Name, ErrOpen)
		}
		b.halfOpenProbes++
		return nil
	}
	return nil
}

// RecordSuccess transitions half-open → closed and clears the failure
// window. In closed state it's a no-op.
func (b *Breaker) RecordSuccess() {
	b.mu.Lock()
	defer b.mu.Unlock()

	switch b.state {
	case StateHalfOpen:
		b.state = StateClosed
		b.failures = nil
		b.halfOpenProbes = 0
	case StateClosed:
		// Trim stale failures so the window stays accurate even when
		// success-only traffic dominates.
		b.trimLocked()
	}
}

// RecordFailure either bumps the failure count (closed) or re-opens
// the breaker (half-open). Caller passes the time of failure so tests
// can drive the state machine deterministically; production callers
// almost always pass time.Now().
func (b *Breaker) RecordFailure() {
	b.mu.Lock()
	defer b.mu.Unlock()

	now := b.cfg.Now()
	switch b.state {
	case StateClosed:
		b.failures = append(b.failures, now)
		b.trimLocked()
		if len(b.failures) >= b.cfg.FailureThreshold {
			b.state = StateOpen
			b.openedAt = now
		}

	case StateHalfOpen:
		b.state = StateOpen
		b.openedAt = now
		b.halfOpenProbes = 0
	}
}

// State returns the breaker's current state. Useful for metrics +
// health checks.
func (b *Breaker) State() State {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.state
}

// trimLocked drops failure timestamps older than Window. Caller must
// hold b.mu.
func (b *Breaker) trimLocked() {
	if len(b.failures) == 0 {
		return
	}
	cutoff := b.cfg.Now().Add(-b.cfg.Window)
	keep := b.failures[:0]
	for _, t := range b.failures {
		if t.After(cutoff) {
			keep = append(keep, t)
		}
	}
	b.failures = keep
}

// Do wraps a single upstream call with the breaker. Returns ErrOpen
// when the breaker is open; otherwise returns the call's result and
// records success/failure based on whether err is nil.
//
// This is the recommended entry point — manual Allow/RecordX is for
// callers that need to inspect the response before deciding success.
func (b *Breaker) Do(call func() error) error {
	if err := b.Allow(); err != nil {
		return err
	}
	err := call()
	if err != nil {
		b.RecordFailure()
		return err
	}
	b.RecordSuccess()
	return nil
}
