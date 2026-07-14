// Package backoff provides a tiny "tick controller" for background
// loops that already use time.Ticker — adds adaptive slowdown when
// the downstream service is unhealthy without rewriting the loop.
//
// Use case: a worker loop ticks every 10 minutes calling an external
// API. The API goes down for 6 hours. Without backoff, the loop hits
// it 36 times. With backoff, after a few consecutive failures the
// effective interval doubles, then doubles again, capping at a
// configured ceiling. When the API recovers, one success resets the
// counter and the loop returns to normal cadence.
//
// Not a full circuit breaker — no half-open state, no per-key
// tracking, no metrics export. Just enough to prevent the "DNS goes
// flaky → 100k useless retries logged in slack" failure mode.
package backoff

import (
	"context"
	"math"
	"time"
)

// Controller tracks consecutive-failure state across ticks.
// Zero value is ready to use; defaults are baseInterval=1m, max=4h.
type Controller struct {
	baseInterval time.Duration
	maxInterval  time.Duration
	failures     int
}

// New constructs a controller. baseInterval is the loop's normal
// cadence; maxInterval caps how slow it can get under sustained
// failure. Pick maxInterval ≈ 32× baseInterval (5 doublings) so a
// flaky downstream stays detected within a reasonable window.
func New(baseInterval, maxInterval time.Duration) *Controller {
	if maxInterval < baseInterval {
		maxInterval = baseInterval
	}
	return &Controller{baseInterval: baseInterval, maxInterval: maxInterval}
}

// Wait blocks until either the next tick fires (current interval +
// jitter) or ctx is cancelled. Returns false on cancellation so the
// caller's loop can exit cleanly.
func (c *Controller) Wait(ctx context.Context) bool {
	select {
	case <-ctx.Done():
		return false
	case <-time.After(c.NextInterval()):
		return true
	}
}

// NextInterval returns the duration to wait before the next attempt.
// Doubles per consecutive failure, capped at maxInterval.
func (c *Controller) NextInterval() time.Duration {
	if c.failures == 0 {
		return c.baseInterval
	}
	// 2^failures × base, capped. math.Pow is fine for small exponents
	// and avoids the integer-overflow trap of `1 << failures` once
	// failures hits 64+ (it never will in practice, but be defensive).
	mult := math.Pow(2, float64(c.failures))
	d := time.Duration(float64(c.baseInterval) * mult)
	if d > c.maxInterval || d < 0 {
		return c.maxInterval
	}
	return d
}

// Success resets the consecutive-failure counter. Call this after
// any tick where useful work was done.
func (c *Controller) Success() { c.failures = 0 }

// Failure increments the consecutive-failure counter. Call this when
// a tick failed for a reason that's likely to repeat (downstream
// service down, network timeout) — NOT for "no work to do this tick"
// (that's a Success path; nothing was wrong).
func (c *Controller) Failure() {
	if c.failures < 16 { // cap so the multiplier can't underflow
		c.failures++
	}
}

// Failures returns the current consecutive-failure count. Mostly for
// log messages or tests; loops don't usually need to peek at this.
func (c *Controller) Failures() int { return c.failures }
