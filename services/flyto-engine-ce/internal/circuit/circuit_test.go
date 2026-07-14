package circuit

import (
	"errors"
	"testing"
	"time"
)

// fixedClock returns a *time.Time pointer so tests can advance the
// clock without rebuilding the breaker each step.
type fixedClock struct{ t time.Time }

func (c *fixedClock) Now() time.Time          { return c.t }
func (c *fixedClock) advance(d time.Duration) { c.t = c.t.Add(d) }

func TestBreaker_OpensAfterThreshold(t *testing.T) {
	clk := &fixedClock{t: time.Unix(0, 0)}
	b := New(Config{
		Name:             "test",
		FailureThreshold: 3,
		Window:           time.Minute,
		CooldownPeriod:   30 * time.Second,
		Now:              clk.Now,
	})

	for i := 0; i < 3; i++ {
		if err := b.Allow(); err != nil {
			t.Fatalf("Allow %d: unexpected %v", i, err)
		}
		b.RecordFailure()
	}

	if b.State() != StateOpen {
		t.Fatalf("expected Open after 3 failures, got %s", b.State())
	}
	if err := b.Allow(); !errors.Is(err, ErrOpen) {
		t.Fatalf("expected ErrOpen, got %v", err)
	}
}

func TestBreaker_HalfOpenProbeRecovers(t *testing.T) {
	clk := &fixedClock{t: time.Unix(0, 0)}
	b := New(Config{
		Name: "test", FailureThreshold: 1, Window: time.Minute,
		CooldownPeriod: 10 * time.Second, Now: clk.Now,
	})

	if err := b.Allow(); err != nil {
		t.Fatal(err)
	}
	b.RecordFailure() // open

	// During cooldown, calls fail fast.
	if err := b.Allow(); !errors.Is(err, ErrOpen) {
		t.Fatalf("expected ErrOpen during cooldown, got %v", err)
	}

	// After cooldown, half-open admits one probe.
	clk.advance(11 * time.Second)
	if err := b.Allow(); err != nil {
		t.Fatalf("expected probe to be admitted, got %v", err)
	}
	if b.State() != StateHalfOpen {
		t.Fatalf("expected HalfOpen, got %s", b.State())
	}
	// Second concurrent probe blocked.
	if err := b.Allow(); !errors.Is(err, ErrOpen) {
		t.Fatalf("expected second probe to be rejected, got %v", err)
	}

	// Probe succeeds — breaker closes.
	b.RecordSuccess()
	if b.State() != StateClosed {
		t.Fatalf("expected Closed after successful probe, got %s", b.State())
	}
}

func TestBreaker_HalfOpenProbeReopens(t *testing.T) {
	clk := &fixedClock{t: time.Unix(0, 0)}
	b := New(Config{
		Name: "test", FailureThreshold: 1, Window: time.Minute,
		CooldownPeriod: 10 * time.Second, Now: clk.Now,
	})

	_ = b.Allow()
	b.RecordFailure()
	clk.advance(11 * time.Second)
	_ = b.Allow() // half-open probe
	b.RecordFailure()

	if b.State() != StateOpen {
		t.Fatalf("expected Open after failed probe, got %s", b.State())
	}
}

func TestBreaker_FailureWindowTrims(t *testing.T) {
	clk := &fixedClock{t: time.Unix(0, 0)}
	b := New(Config{
		Name: "test", FailureThreshold: 3, Window: time.Minute,
		CooldownPeriod: 30 * time.Second, Now: clk.Now,
	})

	// 2 failures, then wait > window, then 2 more — should NOT open
	// because the first two have aged out.
	_ = b.Allow()
	b.RecordFailure()
	_ = b.Allow()
	b.RecordFailure()
	clk.advance(2 * time.Minute)
	_ = b.Allow()
	b.RecordFailure()
	_ = b.Allow()
	b.RecordFailure()

	if b.State() != StateClosed {
		t.Fatalf("expected Closed (aged failures), got %s", b.State())
	}
}

func TestBreaker_Do(t *testing.T) {
	b := New(DefaultConfig("test"))
	calls := 0
	err := b.Do(func() error {
		calls++
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if calls != 1 {
		t.Fatalf("expected 1 call, got %d", calls)
	}
}

func TestRegistry_LooksUpAndConfigures(t *testing.T) {
	r := NewRegistry()
	b1 := r.Get("openai")
	b2 := r.Get("openai")
	if b1 != b2 {
		t.Fatalf("Get must return the same breaker for the same name")
	}
	cfg := Config{Name: "openai", FailureThreshold: 99}
	b3 := r.Configure(cfg)
	if b3 == b1 {
		t.Fatalf("Configure should replace, not return the old breaker")
	}
}
