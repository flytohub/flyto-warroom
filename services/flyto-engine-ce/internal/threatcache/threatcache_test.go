package threatcache

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// memStore is an in-memory Store implementation used by the tests.
// Tracks every method call so assertions can prove the cache layer
// hit the right rows in the right order.
type memStore struct {
	mu                 sync.Mutex
	rows               map[string]row
	history            []historyEntry
	hints              map[string]hintEntry
	upsertCount        int
	getCount           int
	historyAppendCount int
	hintsSetCount      int
}

type row struct {
	data         []byte
	fetchedAt    time.Time
	expiresAt    time.Time
	responseHash string
}

type historyEntry struct {
	id, source, key, prevHash, newHash string
	data                               []byte
	observedAt                         time.Time
}

type hintEntry struct {
	etag         string
	lastModified string
	lastCheckAt  time.Time
	notModified  bool
}

func newMemStore() *memStore {
	return &memStore{
		rows:  map[string]row{},
		hints: map[string]hintEntry{},
	}
}

func (m *memStore) cacheKey(source, key string) string { return source + "|" + key }

func (m *memStore) GetCache(ctx context.Context, source, key string) ([]byte, time.Time, time.Time, string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.getCount++
	r, ok := m.rows[m.cacheKey(source, key)]
	if !ok {
		return nil, time.Time{}, time.Time{}, "", errors.New("not found")
	}
	return r.data, r.fetchedAt, r.expiresAt, r.responseHash, nil
}

func (m *memStore) UpsertCache(ctx context.Context, source, key string, data []byte, fetchedAt, expiresAt time.Time, responseHash string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.upsertCount++
	m.rows[m.cacheKey(source, key)] = row{data: data, fetchedAt: fetchedAt, expiresAt: expiresAt, responseHash: responseHash}
	return nil
}

func (m *memStore) AppendCacheHistory(ctx context.Context, id, source, key, prevHash, newHash string, data []byte, observedAt time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.historyAppendCount++
	m.history = append(m.history, historyEntry{id, source, key, prevHash, newHash, data, observedAt})
	return nil
}

func (m *memStore) GetCacheHints(ctx context.Context, source, key string) (string, string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	h, ok := m.hints[m.cacheKey(source, key)]
	if !ok {
		return "", "", nil
	}
	return h.etag, h.lastModified, nil
}

func (m *memStore) SetCacheHints(ctx context.Context, source, key, etag, lastModified string, lastCheckAt time.Time, notModified bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.hintsSetCount++
	m.hints[m.cacheKey(source, key)] = hintEntry{etag, lastModified, lastCheckAt, notModified}
	return nil
}

func newCacheUnderTest(s Store) *Cache {
	c := New(s)
	// Use a near-zero grace by default so stale tests exercise the
	// expired-but-within-grace branch only when explicitly opted in.
	c.StaleGraceFn = func(Source) time.Duration { return 0 }
	return c
}

// ─────────────────────────────────────────────────────────────────
//  Tests
// ─────────────────────────────────────────────────────────────────

func TestCacheHit_NoUpstreamCall(t *testing.T) {
	store := newMemStore()
	c := newCacheUnderTest(store)
	ctx := context.Background()

	// First fetch — miss → calls upstream.
	var calls int32
	fetcher := func() ([]byte, error) {
		atomic.AddInt32(&calls, 1)
		return []byte("payload-v1"), nil
	}
	res, err := c.GetOrFetch(ctx, SourceHIBP, "k1", time.Hour, fetcher)
	if err != nil {
		t.Fatalf("first call err: %v", err)
	}
	if res.FromCache {
		t.Fatalf("first call should NOT be FromCache")
	}
	if string(res.Data) != "payload-v1" {
		t.Fatalf("first call data: %q", res.Data)
	}
	if got := atomic.LoadInt32(&calls); got != 1 {
		t.Fatalf("expected 1 upstream call, got %d", got)
	}

	// Second fetch — fresh cache hit → no upstream call.
	res2, err := c.GetOrFetch(ctx, SourceHIBP, "k1", time.Hour, fetcher)
	if err != nil {
		t.Fatalf("second call err: %v", err)
	}
	if !res2.FromCache {
		t.Fatalf("second call SHOULD be FromCache")
	}
	if got := atomic.LoadInt32(&calls); got != 1 {
		t.Fatalf("upstream called twice (expected 1, got %d) — cache failed to short-circuit", got)
	}
}

func TestCacheMiss_WritesHistoryRow(t *testing.T) {
	store := newMemStore()
	c := newCacheUnderTest(store)
	ctx := context.Background()

	_, err := c.GetOrFetch(ctx, SourceCrtSh, "apex:foo.com", time.Hour, func() ([]byte, error) {
		return []byte("certs"), nil
	})
	if err != nil {
		t.Fatalf("fetch err: %v", err)
	}
	if store.historyAppendCount != 1 {
		t.Fatalf("expected 1 history row on first fresh fetch, got %d", store.historyAppendCount)
	}
	if len(store.history) != 1 || string(store.history[0].data) != "certs" {
		t.Fatalf("history payload wrong: %+v", store.history)
	}
	if store.history[0].prevHash != "" {
		t.Fatalf("first history row should have empty prevHash, got %q", store.history[0].prevHash)
	}
}

func TestIdenticalContent_NoNewHistory(t *testing.T) {
	store := newMemStore()
	c := newCacheUnderTest(store)
	ctx := context.Background()

	body := []byte("same-bytes")
	// Force a miss-then-miss by setting TTL to zero so the second
	// call falls through (cache present but expired AND outside grace).
	fetcher := func() ([]byte, error) { return body, nil }

	if _, err := c.GetOrFetch(ctx, SourceRDAP, "domain:foo.com", 1*time.Nanosecond, fetcher); err != nil {
		t.Fatalf("first: %v", err)
	}
	time.Sleep(5 * time.Millisecond) // ensure expires_at is in the past
	if _, err := c.GetOrFetch(ctx, SourceRDAP, "domain:foo.com", 1*time.Nanosecond, fetcher); err != nil {
		t.Fatalf("second: %v", err)
	}

	if store.historyAppendCount != 1 {
		t.Fatalf("identical content should NOT add a second history row (got %d total)", store.historyAppendCount)
	}
}

func TestDifferentContent_AddsHistory(t *testing.T) {
	store := newMemStore()
	c := newCacheUnderTest(store)
	ctx := context.Background()

	// First payload.
	if _, err := c.GetOrFetch(ctx, SourceRIPE, "ip:1.2.3.4", 1*time.Nanosecond, func() ([]byte, error) {
		return []byte("v1"), nil
	}); err != nil {
		t.Fatalf("first: %v", err)
	}
	time.Sleep(5 * time.Millisecond)
	// Different payload → new history row.
	if _, err := c.GetOrFetch(ctx, SourceRIPE, "ip:1.2.3.4", 1*time.Nanosecond, func() ([]byte, error) {
		return []byte("v2"), nil
	}); err != nil {
		t.Fatalf("second: %v", err)
	}

	if store.historyAppendCount != 2 {
		t.Fatalf("changed content should add 2nd history row, got %d total", store.historyAppendCount)
	}
	last := store.history[1]
	if last.prevHash == "" || last.newHash == "" || last.prevHash == last.newHash {
		t.Fatalf("hash chain wrong: prev=%q new=%q", last.prevHash, last.newHash)
	}
	expectedHash := sha256.Sum256([]byte("v2"))
	if last.newHash != hex.EncodeToString(expectedHash[:]) {
		t.Fatalf("hash mismatch: want %s got %s", hex.EncodeToString(expectedHash[:]), last.newHash)
	}
}

func TestNotModified_ExtendsExpiryWithoutHistory(t *testing.T) {
	store := newMemStore()
	c := newCacheUnderTest(store)
	ctx := context.Background()

	// Seed a cache row directly so the second call can see "prior body".
	now := time.Now().UTC()
	_ = store.UpsertCache(ctx, "hibp", "k1", []byte("body-v1"), now, now.Add(-1*time.Hour), hashOf([]byte("body-v1")))
	_ = store.SetCacheHints(ctx, "hibp", "k1", "etag-1", "", now.Add(-1*time.Hour), false)

	// Conditional fetcher reports 304.
	res, err := c.GetOrFetchCond(ctx, SourceHIBP, "k1", time.Hour, func(hints ConditionalHints) ([]byte, string, string, bool, error) {
		if hints.IfNoneMatch != "etag-1" {
			t.Fatalf("expected If-None-Match=etag-1, got %q", hints.IfNoneMatch)
		}
		return nil, "etag-1", "", true, nil
	})
	if err != nil {
		t.Fatalf("304 path err: %v", err)
	}
	if !res.FromCache || string(res.Data) != "body-v1" {
		t.Fatalf("304 should return prior body from cache: %+v", res)
	}
	if store.historyAppendCount != 0 {
		t.Fatalf("304 must NOT write a history row, got %d", store.historyAppendCount)
	}
	// Hints row should be touched so we record the 304.
	if store.hintsSetCount != 2 {
		// 1 from our seed + 1 from the 304 path
		t.Fatalf("hints set count expected 2 (seed + 304), got %d", store.hintsSetCount)
	}
}

func TestStaleWithinGrace_ReturnsStaleAndRefreshesAsync(t *testing.T) {
	store := newMemStore()
	c := New(store)
	c.StaleGraceFn = func(Source) time.Duration { return 1 * time.Hour }
	ctx := context.Background()

	// Seed a stale row: expired 1 minute ago, still within 1h grace.
	now := time.Now().UTC()
	_ = store.UpsertCache(ctx, "shodan_internetdb", "ip:8.8.8.8", []byte("old"), now.Add(-2*time.Hour), now.Add(-1*time.Minute), hashOf([]byte("old")))

	refreshed := make(chan struct{})
	res, err := c.GetOrFetch(ctx, SourceShodanIDB, "ip:8.8.8.8", time.Hour, func() ([]byte, error) {
		// Tag the bg refresh so the test can wait for it.
		defer close(refreshed)
		return []byte("new"), nil
	})
	if err != nil {
		t.Fatalf("stale-grace err: %v", err)
	}
	if !res.IsStale || string(res.Data) != "old" {
		t.Fatalf("expected stale 'old' returned synchronously, got %+v", res)
	}

	select {
	case <-refreshed:
		// Background refresh ran. Verify the row was updated.
	case <-time.After(2 * time.Second):
		t.Fatal("background refresh never fired within 2s")
	}
	// Allow refresh upsert to land.
	time.Sleep(50 * time.Millisecond)
	data, _, _, _, err := store.GetCache(ctx, "shodan_internetdb", "ip:8.8.8.8")
	if err != nil {
		t.Fatalf("post-refresh GetCache: %v", err)
	}
	if string(data) != "new" {
		t.Fatalf("expected refreshed body 'new', got %q", data)
	}
}

func TestFetcherErrorWithCache_ReturnsStaleWithError(t *testing.T) {
	store := newMemStore()
	c := newCacheUnderTest(store)
	ctx := context.Background()

	now := time.Now().UTC()
	_ = store.UpsertCache(ctx, "abuse_ch", "feodo/blocklist", []byte("cached-list"), now.Add(-2*time.Hour), now.Add(-1*time.Hour), hashOf([]byte("cached-list")))

	wantErr := errors.New("upstream 500")
	res, err := c.GetOrFetch(ctx, SourceAbuseCH, "feodo/blocklist", time.Hour, func() ([]byte, error) {
		return nil, wantErr
	})
	if !errors.Is(err, wantErr) {
		t.Fatalf("expected wrapped upstream err, got %v", err)
	}
	if res == nil || !res.IsStale || string(res.Data) != "cached-list" {
		t.Fatalf("expected stale cache fallback, got %+v", res)
	}
}

func TestInvalidate_ForcesNextCallToRefetch(t *testing.T) {
	store := newMemStore()
	c := newCacheUnderTest(store)
	ctx := context.Background()

	// Seed and verify a fresh hit.
	now := time.Now().UTC()
	_ = store.UpsertCache(ctx, "rdap", "domain:foo.com", []byte("cached"), now, now.Add(1*time.Hour), hashOf([]byte("cached")))

	var hits int32
	fetcher := func() ([]byte, error) {
		atomic.AddInt32(&hits, 1)
		return []byte("fresh-after-invalidate"), nil
	}
	res, _ := c.GetOrFetch(ctx, SourceRDAP, "domain:foo.com", time.Hour, fetcher)
	if !res.FromCache {
		t.Fatalf("should hit cache before invalidate")
	}
	if atomic.LoadInt32(&hits) != 0 {
		t.Fatalf("upstream should NOT have been called before invalidate")
	}

	if err := c.Invalidate(ctx, SourceRDAP, "domain:foo.com"); err != nil {
		t.Fatalf("invalidate err: %v", err)
	}
	res2, _ := c.GetOrFetch(ctx, SourceRDAP, "domain:foo.com", time.Hour, fetcher)
	if res2.FromCache {
		t.Fatalf("after invalidate, FromCache should be false (got %+v)", res2)
	}
	if string(res2.Data) != "fresh-after-invalidate" {
		t.Fatalf("invalidated read returned wrong body: %q", res2.Data)
	}
	if atomic.LoadInt32(&hits) != 1 {
		t.Fatalf("expected exactly 1 upstream after invalidate, got %d", hits)
	}
}

func TestDefaultTTL_KnownAndUnknown(t *testing.T) {
	if DefaultTTL(SourceHIBP) != 7*24*time.Hour {
		t.Fatalf("HIBP default TTL wrong")
	}
	if DefaultTTL(SourceAbuseCH) != time.Hour {
		t.Fatalf("abuse.ch default TTL wrong")
	}
	// Unknown source falls through to 1h. Asserting this explicitly so
	// adding a new Source constant without updating DefaultTTL is at
	// least covered by sane defaults.
	if DefaultTTL(Source("nonexistent")) != time.Hour {
		t.Fatalf("unknown source should fall back to 1h")
	}
}

// TestRefreshInBackground_DedupsConcurrent — audit 2026-05-17. When
// N requests concurrently hit a stale entry, only ONE background
// refresh goroutine should run upstream. Without dedup the
// thundering herd would fan out N parallel fetches.
func TestRefreshInBackground_DedupsConcurrent(t *testing.T) {
	store := newMemStore()
	c := New(store)
	var fetchCount atomic.Int32
	fetcher := func() ([]byte, error) {
		fetchCount.Add(1)
		// Hold the slot briefly so peers actually race for the dedup
		// guard rather than racing through serially.
		time.Sleep(40 * time.Millisecond)
		return []byte(`{"ok":true}`), nil
	}
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			c.refreshInBackground(SourceShodan, "ip:1.2.3.4", time.Hour, "prev", fetcher)
		}()
	}
	wg.Wait()
	got := fetchCount.Load()
	if got != 1 {
		t.Errorf("expected exactly 1 upstream fetch under 10-way concurrency; got %d", got)
	}
}
