package backoff

import (
	"testing"
	"time"
)

func TestController_BaseInterval(t *testing.T) {
	c := New(10*time.Second, 1*time.Hour)
	if got := c.NextInterval(); got != 10*time.Second {
		t.Errorf("base interval want 10s, got %v", got)
	}
}

func TestController_DoublesOnFailure(t *testing.T) {
	c := New(time.Second, 16*time.Second)

	expectations := []time.Duration{
		2 * time.Second,  // 1st failure: 2× base
		4 * time.Second,  // 2nd: 4× base
		8 * time.Second,  // 3rd: 8× base
		16 * time.Second, // 4th: capped at max
		16 * time.Second, // 5th: still capped
	}
	for i, want := range expectations {
		c.Failure()
		got := c.NextInterval()
		if got != want {
			t.Errorf("after %d failures: got %v, want %v", i+1, got, want)
		}
	}
}

func TestController_SuccessResets(t *testing.T) {
	c := New(time.Second, time.Minute)
	c.Failure()
	c.Failure()
	c.Failure()
	if c.Failures() != 3 {
		t.Errorf("failures = %d, want 3", c.Failures())
	}
	c.Success()
	if c.Failures() != 0 {
		t.Errorf("Success should reset, got %d", c.Failures())
	}
	if c.NextInterval() != time.Second {
		t.Errorf("post-reset interval should be base, got %v", c.NextInterval())
	}
}

func TestController_MaxClampedToBase(t *testing.T) {
	// Misconfigured caller: max < base. Controller silently bumps max
	// up to base instead of producing a 0-or-negative interval.
	c := New(time.Minute, time.Second)
	c.Failure()
	if got := c.NextInterval(); got < time.Minute {
		t.Errorf("max should clamp up to base, got %v", got)
	}
}
