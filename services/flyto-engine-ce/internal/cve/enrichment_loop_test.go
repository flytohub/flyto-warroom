package cve

import (
	"context"
	"sync/atomic"
	"testing"
	"time"
)

// TestRunKEVCacheLoop_RespectsContextCancel — audit 2026-05-17 found
// the loop was previously spawned with context.Background() from
// cmd/server/main.go, so SIGTERM would leave the goroutine running.
// This test pins the cancellation contract: ctx cancel must end the
// loop within a few ticker periods.
func TestRunKEVCacheLoop_RespectsContextCancel(t *testing.T) {
	cache := NewKEVCache()
	ctx, cancel := context.WithCancel(context.Background())

	var done atomic.Bool
	go func() {
		// Tiny interval so the test doesn't sleep; the post-cancel
		// path will exit on the next ctx.Done() check.
		RunKEVCacheLoop(ctx, cache, 50*time.Millisecond)
		done.Store(true)
	}()

	// Let it tick a couple of times, then cancel.
	time.Sleep(150 * time.Millisecond)
	cancel()

	// Wait up to 1s for the goroutine to return.
	deadline := time.Now().Add(1 * time.Second)
	for time.Now().Before(deadline) {
		if done.Load() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Errorf("RunKEVCacheLoop did not exit within 1s of context cancel")
}

// TestRunKEVCacheLoop_CancelDuringRetryBackoff — the initial-load
// retry path sleeps between attempts. ctx cancel must interrupt the
// sleep, not wait it out.
func TestRunKEVCacheLoop_CancelDuringRetryBackoff(t *testing.T) {
	cache := NewKEVCache()
	ctx, cancel := context.WithCancel(context.Background())

	var done atomic.Bool
	go func() {
		// Use a large ticker interval so the test doesn't sit on it.
		RunKEVCacheLoop(ctx, cache, time.Hour)
		done.Store(true)
	}()

	// Cancel before the first retry attempt completes; the retry
	// backoff (10s+) must yield to ctx.
	time.Sleep(50 * time.Millisecond)
	cancel()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if done.Load() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Errorf("RunKEVCacheLoop did not honour ctx during retry backoff")
}
