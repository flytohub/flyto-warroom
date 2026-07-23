// Package threatcache wraps every external threat-intel API call
// with a write-through cache backed by Postgres (`threat_intel_cache`).
//
// Why this exists:
//  1. Saves API quota and money (HIBP / VT / Shodan / AbuseIPDB
//     all have per-day or per-hour limits).
//  2. Builds our own historical database from day 1, so Phase 2
//     ("we ARE the threat-intel source") has prior art to learn
//     from — see DATA_STRATEGY.md.
//  3. Lets product survive API outages — stale cache > nothing.
//  4. Per-source TTLs match the natural cadence of each provider
//     (HIBP weekly, abuse.ch hourly, etc).
//
// Call pattern for a wrapping scanner:
//
//	result, fresh, err := cache.GetOrFetch(ctx, source, key, ttl, func() ([]byte, error) {
//	    return apiCall()
//	})
//
//	if err != nil && result != nil {
//	    // Fall back to stale cache when API failed. Logged
//	    // so on-call can see whether the customer's "0 breaches"
//	    // was confirmed today or 7 days ago.
//	}
package threatcache

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"log/slog"
	"runtime/debug"
	"sync"
	"time"
)

// Source identifies the provider. Add new ones here so the per-
// source TTL map stays in one place.
type Source string

const (
	SourceHIBP       Source = "hibp"
	SourceHIBPPaste  Source = "hibp_paste"
	SourceAbuseCH    Source = "abuse_ch"
	SourceAbuseIPDB  Source = "abuseipdb"
	SourceVirusTotal Source = "virustotal"
	SourceShodan     Source = "shodan"
	SourceShodanIDB  Source = "shodan_internetdb"
	SourceGreyNoise  Source = "greynoise"
	SourceRDAP       Source = "rdap"
	SourceCrtSh      Source = "crt_sh"
	SourceRIPE       Source = "ripe"
	SourceIPInfo     Source = "ipinfo"
	SourceIPAPI      Source = "ip_api" // ip-api.com geoip
	SourceURLScan    Source = "urlscan"
)

// DefaultTTL returns the recommended cache lifetime per source.
// Picked to match what each provider actually updates:
//   - HIBP: breaches are added every few weeks → 7 days is fine
//   - abuse.ch: active C2 changes hourly → 1h
//   - AbuseIPDB / VT: consensus shifts within a day → 24h
//   - GreyNoise: scanner observations change daily → 12h
//   - WHOIS / RDAP: registration data rarely flips → 7 days
//   - crt.sh: new certs added weekly → 24h
//
// Caller can override with an explicit ttl arg.
func DefaultTTL(source Source) time.Duration {
	switch source {
	case SourceHIBP, SourceHIBPPaste, SourceRDAP:
		return 7 * 24 * time.Hour
	case SourceAbuseCH:
		return 1 * time.Hour
	case SourceAbuseIPDB, SourceVirusTotal:
		return 24 * time.Hour
	case SourceURLScan:
		return 12 * time.Hour
	case SourceShodan, SourceShodanIDB:
		return 12 * time.Hour
	case SourceGreyNoise:
		return 12 * time.Hour
	case SourceCrtSh:
		return 24 * time.Hour
	case SourceRIPE, SourceIPInfo, SourceIPAPI:
		return 24 * time.Hour
	}
	return 1 * time.Hour
}

// Result represents a cached or freshly-fetched response.
type Result struct {
	Data         []byte
	FetchedAt    time.Time
	ExpiresAt    time.Time
	FromCache    bool // true if this came from threat_intel_cache (not a live API call)
	IsStale      bool // true if FromCache and expires_at < now (served while async refresh runs)
	WasUpdated   bool // true if the fresh API result differed from prior cached value (new history row written)
	ResponseHash string
}

// Store is the persistence contract. Implemented by the SQL store
// in flyto-engine/internal/store.
type Store interface {
	GetCache(ctx context.Context, source, key string) (data []byte, fetchedAt, expiresAt time.Time, responseHash string, err error)
	UpsertCache(ctx context.Context, source, key string, data []byte, fetchedAt, expiresAt time.Time, responseHash string) error
	AppendCacheHistory(ctx context.Context, id, source, key, prevHash, newHash string, data []byte, observedAt time.Time) error
	// Conditional-request bookkeeping. Empty strings when not
	// supplied by the provider on the last fetch.
	GetCacheHints(ctx context.Context, source, key string) (etag, lastModified string, err error)
	SetCacheHints(ctx context.Context, source, key, etag, lastModified string, lastCheckAt time.Time, notModified bool) error
}

// Fetcher is the function signature for refresh callers. The
// `hints` argument lets the implementation set
// `If-None-Match` / `If-Modified-Since` on the outgoing HTTP
// request when the provider supports conditional GET. Return
// `(nil, NotModifiedError, ...)` to signal "provider said 304 —
// nothing changed". Return `(data, "", "", nil)` for a normal
// fresh response. Caller passes hints from store on cache hit.
type Fetcher func(hints ConditionalHints) (data []byte, etag string, lastModified string, notModified bool, err error)

// ConditionalHints carries the values we send back to the provider
// to ask "anything new since last time?".
type ConditionalHints struct {
	IfNoneMatch     string
	IfModifiedSince string
}

// Cache is the user-facing wrapper. One per process.
type Cache struct {
	Store        Store
	StaleGraceFn func(Source) time.Duration // optional, default 30m
	NewID        func() string              // optional, default time-based

	// refreshInFlight dedups concurrent background refreshes for the
	// same (source, key). Without this, the stale-while-revalidate
	// path could fan out N parallel refreshes when N requests
	// concurrently hit an expired entry — audit 2026-05-17 flagged
	// this as a goroutine fan-out risk.
	refreshMu       sync.Mutex
	refreshInFlight map[string]struct{}
}

// New returns a Cache wired to the given Store. StaleGrace defaults
// to 30 min — caches expired by less than that serve a stale copy
// while we refresh in the background.
func New(s Store) *Cache {
	return &Cache{
		Store:           s,
		StaleGraceFn:    func(Source) time.Duration { return 30 * time.Minute },
		NewID:           func() string { return time.Now().UTC().Format("20060102T150405.000000000Z") },
		refreshInFlight: map[string]struct{}{},
	}
}

// ErrNoFetcher is returned when GetOrFetch hits a cache miss and
// no fetch function was supplied (caller asked "do we have this?"
// without offering to fetch fresh).
var ErrNoFetcher = errors.New("threatcache: cache miss and no fetcher provided")

// GetOrFetch is the main entry point. The fetcher is called only
// when there's no fresh cache. When fetcher is nil and the cache
// miss → ErrNoFetcher (caller can decide what to do).
//
// Stale-while-revalidate: when cached but past expires_at,
// returns the stale copy IMMEDIATELY and fires the fetcher in a
// goroutine to refresh. The next call gets the fresh copy.
//
// Side effect: every successful fetch (different response than
// last time) appends a row to threat_intel_history — that's how
// Phase 2's data moat starts accruing without extra engineering.
//
// Pass-through wrapper for callers that don't want to deal with
// conditional requests. Internally calls GetOrFetchCond with a
// shim fetcher that ignores hints and always returns fresh data.
func (c *Cache) GetOrFetch(
	ctx context.Context,
	source Source,
	key string,
	ttl time.Duration,
	fetcher func() ([]byte, error),
) (*Result, error) {
	var wrapped Fetcher
	if fetcher != nil {
		wrapped = func(_ ConditionalHints) ([]byte, string, string, bool, error) {
			d, err := fetcher()
			return d, "", "", false, err
		}
	}
	return c.GetOrFetchCond(ctx, source, key, ttl, wrapped)
}

// GetOrFetchCond is the conditional-request-aware variant. The
// fetcher receives the previous ETag / Last-Modified hints and is
// expected to send them as `If-None-Match` / `If-Modified-Since`
// headers. When the provider returns 304 Not Modified the fetcher
// returns `notModified=true` — we then bump the cache's
// `expires_at` forward without consuming API quota or writing
// history rows.
func (c *Cache) GetOrFetchCond(
	ctx context.Context,
	source Source,
	key string,
	ttl time.Duration,
	fetcher Fetcher,
) (*Result, error) {
	if ttl <= 0 {
		ttl = DefaultTTL(source)
	}

	now := time.Now().UTC()
	cached, fetchedAt, expiresAt, prevHash, err := c.Store.GetCache(ctx, string(source), key)
	hasCached := err == nil && len(cached) > 0

	if hasCached && now.Before(expiresAt) {
		// Fresh cache — return immediately.
		return &Result{
			Data:         cached,
			FetchedAt:    fetchedAt,
			ExpiresAt:    expiresAt,
			FromCache:    true,
			ResponseHash: prevHash,
		}, nil
	}

	if hasCached {
		// Stale cache. If within grace window, serve stale +
		// async refresh. Outside grace, refresh inline.
		grace := c.StaleGraceFn(source)
		insideGrace := now.Before(expiresAt.Add(grace))
		if insideGrace && fetcher != nil {
			// Background refresh uses a shim that discards
			// conditional hints — most callers see refresh from
			// `now` regardless of whether the provider supports
			// 304. Cost trade-off: bg refresh prefers fresh body
			// to avoid the extra round-trip handling complexity.
			f := fetcher
			go c.refreshInBackground(source, key, ttl, prevHash, func() ([]byte, error) {
				d, _, _, _, err := f(ConditionalHints{})
				return d, err
			})
			return &Result{
				Data:         cached,
				FetchedAt:    fetchedAt,
				ExpiresAt:    expiresAt,
				FromCache:    true,
				IsStale:      true,
				ResponseHash: prevHash,
			}, nil
		}
		// Past grace — try a fresh fetch. If it fails, fall back
		// to the stale copy so we don't 500 the caller.
	}

	if fetcher == nil {
		if hasCached {
			return &Result{
				Data: cached, FetchedAt: fetchedAt, ExpiresAt: expiresAt,
				FromCache: true, IsStale: true, ResponseHash: prevHash,
			}, nil
		}
		return nil, ErrNoFetcher
	}

	// Pull existing hints so the fetcher can send a conditional
	// request. Providers that don't support ETag will see empty
	// strings and just do a normal fetch.
	hints := ConditionalHints{}
	if etag, lastMod, hintErr := c.Store.GetCacheHints(ctx, string(source), key); hintErr == nil {
		hints.IfNoneMatch = etag
		hints.IfModifiedSince = lastMod
	}

	data, newETag, newLastMod, notModified, err := fetcher(hints)
	if err != nil {
		if hasCached {
			// Live fetch failed → serve stale + flag.
			return &Result{
				Data: cached, FetchedAt: fetchedAt, ExpiresAt: expiresAt,
				FromCache: true, IsStale: true, ResponseHash: prevHash,
			}, err
		}
		return nil, err
	}

	// 304 Not Modified — provider says "nothing changed since you
	// last asked". We extend expires_at without rewriting the body
	// and skip the history row.
	if notModified {
		_ = c.Store.SetCacheHints(ctx, string(source), key, newETag, newLastMod, now, true)
		// Also bump expires_at by extending the cache row in place
		// — we treat the 304 as confirmation that the cached body
		// is still authoritative for another `ttl` window.
		if hasCached {
			_ = c.Store.UpsertCache(ctx, string(source), key, cached, fetchedAt, now.Add(ttl), prevHash)
		}
		return &Result{
			Data:         cached,
			FetchedAt:    fetchedAt,
			ExpiresAt:    now.Add(ttl),
			FromCache:    true,
			IsStale:      false,
			ResponseHash: prevHash,
		}, nil
	}

	newHash := hashOf(data)
	newExpires := now.Add(ttl)
	if err := c.Store.UpsertCache(ctx, string(source), key, data, now, newExpires, newHash); err != nil {
		return nil, err
	}
	_ = c.Store.SetCacheHints(ctx, string(source), key, newETag, newLastMod, now, false)

	// New history row when content actually changed — gives us
	// the "when did this first appear?" answer for free.
	wasUpdated := newHash != prevHash
	if wasUpdated {
		_ = c.Store.AppendCacheHistory(ctx, c.NewID(), string(source), key, prevHash, newHash, data, now)
	}

	return &Result{
		Data:         data,
		FetchedAt:    now,
		ExpiresAt:    newExpires,
		FromCache:    false,
		WasUpdated:   wasUpdated,
		ResponseHash: newHash,
	}, nil
}

// refreshInBackground is the stale-while-revalidate fetcher. Runs
// without the caller's context (uses a fresh one) so the goroutine
// outlives the original request. Errors are swallowed — the next
// call retries.
//
// Dedup contract (audit 2026-05-17): when N concurrent requests
// hit the same (source, key) within the stale-grace window, only
// ONE refresh goroutine actually runs. The rest skip — they'll see
// the freshly-updated entry on their next call. Without this,
// thundering-herd would spawn N parallel upstream fetches and
// blow through any rate-limit budget.
func (c *Cache) refreshInBackground(source Source, key string, ttl time.Duration, prevHash string, fetcher func() ([]byte, error)) {
	dedupKey := string(source) + "|" + key
	c.refreshMu.Lock()
	if _, busy := c.refreshInFlight[dedupKey]; busy {
		c.refreshMu.Unlock()
		return
	}
	c.refreshInFlight[dedupKey] = struct{}{}
	c.refreshMu.Unlock()
	defer func() {
		c.refreshMu.Lock()
		delete(c.refreshInFlight, dedupKey)
		c.refreshMu.Unlock()
		if r := recover(); r != nil {
			// Panic must not crash the worker — but it must NOT be invisible
			// either, or a refresh that panics every time looks like a silently
			// stale cache. Log the panic value + stack so it's diagnosable.
			slog.Error("threatcache: background refresh panicked (cache left stale)",
				"source", source, "key", key, "panic", r, "stack", string(debug.Stack()))
		}
	}()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, err := fetcher()
	if err != nil || len(data) == 0 {
		return
	}
	newHash := hashOf(data)
	now := time.Now().UTC()
	if err := c.Store.UpsertCache(ctx, string(source), key, data, now, now.Add(ttl), newHash); err != nil {
		return
	}
	if newHash != prevHash {
		_ = c.Store.AppendCacheHistory(ctx, c.NewID(), string(source), key, prevHash, newHash, data, now)
	}
}

// Invalidate forces a cache miss for (source, key) on the next
// GetOrFetch call. Used by event-driven refresh — e.g. when a
// customer triggers a manual rescan we want to bypass TTL and pull
// the freshest possible data. Doesn't delete the row (history
// stays intact); just sets expires_at to the past.
func (c *Cache) Invalidate(ctx context.Context, source Source, key string) error {
	data, fetchedAt, _, hash, err := c.Store.GetCache(ctx, string(source), key)
	if err != nil {
		return nil // nothing to invalidate
	}
	past := time.Now().UTC().Add(-1 * time.Minute)
	return c.Store.UpsertCache(ctx, string(source), key, data, fetchedAt, past, hash)
}

func hashOf(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
