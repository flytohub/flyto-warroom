package scanqueue

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// TestQueue_Drains — N enqueued jobs all get handled exactly once.
// Pins the basic dispatch contract; without this you can silently drop
// jobs on rebuild and not notice until a customer asks "why didn't my
// scan run".
func TestQueue_Drains(t *testing.T) {
	var wg sync.WaitGroup
	const N = 50
	wg.Add(N)
	var seen sync.Map

	q := New(4, func(job ScanJob) {
		seen.Store(job.ScanID, struct{}{})
		wg.Done()
	})

	for i := 0; i < N; i++ {
		q.Enqueue(ScanJob{ScanID: testScanID(i)})
	}

	if !waitTimeout(&wg, 5*time.Second) {
		t.Fatal("queue didn't drain within 5s")
	}
	count := 0
	seen.Range(func(_, _ any) bool { count++; return true })
	if count != N {
		t.Errorf("handled %d unique jobs, want %d", count, N)
	}
}

// TestQueue_BoundedConcurrency — at most `concurrency` jobs are
// in-flight simultaneously. Without this guarantee a thousand-PR org
// could fork-bomb the engine on a webhook burst.
func TestQueue_BoundedConcurrency(t *testing.T) {
	const concurrency = 3
	var inflight int32
	var maxInflight int32

	var wg sync.WaitGroup
	const N = 30
	wg.Add(N)

	q := New(concurrency, func(_ ScanJob) {
		cur := atomic.AddInt32(&inflight, 1)
		// Track the high-water mark.
		for {
			old := atomic.LoadInt32(&maxInflight)
			if cur <= old || atomic.CompareAndSwapInt32(&maxInflight, old, cur) {
				break
			}
		}
		// Hold the worker briefly so concurrent enqueues stack up.
		time.Sleep(20 * time.Millisecond)
		atomic.AddInt32(&inflight, -1)
		wg.Done()
	})

	for i := 0; i < N; i++ {
		q.Enqueue(ScanJob{ScanID: testScanID(i)})
	}
	if !waitTimeout(&wg, 5*time.Second) {
		t.Fatal("queue didn't drain")
	}
	if got := atomic.LoadInt32(&maxInflight); got > concurrency {
		t.Errorf("max in-flight = %d, want ≤ %d", got, concurrency)
	}
}

// TestQueue_BlocksOnFullBuffer — when the channel buffer is full and
// no worker is ready, Enqueue blocks. Pins the back-pressure shape:
// a misbehaving caller can't OOM us by enqueueing infinitely.
func TestQueue_BlocksOnFullBuffer(t *testing.T) {
	// Single slow worker, fixed buffer (=100 in the impl).
	hold := make(chan struct{})
	q := New(1, func(_ ScanJob) {
		<-hold
	})

	// Fill buffer + the in-flight slot. The 102nd enqueue must block.
	for i := 0; i < 101; i++ {
		q.Enqueue(ScanJob{ScanID: testScanID(i)})
	}

	done := make(chan struct{})
	go func() {
		q.Enqueue(ScanJob{ScanID: "blocking"})
		close(done)
	}()

	select {
	case <-done:
		t.Error("Enqueue should have blocked when buffer full + worker busy")
	case <-time.After(100 * time.Millisecond):
		// expected — Enqueue is blocking
	}
	close(hold) // let the workers drain so the goroutine exits cleanly
}

// helpers

func waitTimeout(wg *sync.WaitGroup, d time.Duration) bool {
	done := make(chan struct{})
	go func() { wg.Wait(); close(done) }()
	select {
	case <-done:
		return true
	case <-time.After(d):
		return false
	}
}

func testScanID(i int) string {
	return "scan-" + string(rune('0'+i%10)) + "-" + string(rune('0'+(i/10)%10))
}
