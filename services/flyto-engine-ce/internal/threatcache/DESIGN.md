# threatcache — Design

Write-through cache + history-accrual layer for every external
threat-intel HTTP call the engine makes.

## Why this layer exists

Three reinforcing reasons, in priority order:

1. **Silent-zero defence.** Every scanner that calls a paid API has a
   failure mode where a 401 / 500 silently degrades to "0 indicators
   found → clean". Routing through this cache makes the success/failure
   signal observable: an empty `threat_intel_cache` row count after a
   discovery is a smoke alarm that the upstream is rejecting us.

2. **Quota.** HIBP individual ($3.95/mo) gives 1500 req/month.
   AbuseIPDB free gives 1000/day. abuse.ch is free but rate-limited.
   Without a cache, a busy multi-tenant deployment burns through these
   in hours.

3. **Phase 2 data accrual.** Every fresh response that hash-differs
   from the previous one writes a row to `threat_intel_history`. After
   a year of operation we have a private historical view of what
   abuse.ch / HIBP / VT *said* about each customer asset on each day.
   That dataset is what Phase 2 (we *become* the threat-intel source)
   builds on — see [[project-data-strategy]] in memory.

## Architecture

```
caller (scanner handler)
  │
  ▼
s.cachedFetch(source, key, ttl, fetcher)
  │
  ▼
internal/threatcache.Cache.GetOrFetch
  │
  ├─── fresh hit  → return Result{FromCache=true}
  │
  ├─── stale-within-grace
  │     → return stale Result{IsStale=true}
  │     → fire fetcher in goroutine, upsert on return
  │
  ├─── cold miss / stale-past-grace
  │     → call fetcher
  │     → upsert threat_intel_cache row
  │     → if hash-differs from previous → append threat_intel_history row
  │
  └─── HIBP conditional path (GetOrFetchCond)
        → send `If-None-Match` from prior ETag
        → 304 → extend expires_at, skip history
```

## Per-source TTL & key namespace

| Source | TTL | Key shape | Auth |
|---|---|---|---|
| `SourceHIBP` | 7d | `domain:<x>` | HIBP-API-Key + conditional ETag |
| `SourceHIBPPaste` | 7d | `email:<x>` | HIBP-API-Key |
| `SourceAbuseCH` | 1h | `threatfox/ip:<x>` / `threatfox/domain:<x>` / `urlhaus/host:<x>` / `feodo/blocklist` | Auth-Key |
| `SourceAbuseIPDB` | 24h | `ip:<x>` | Key header |
| `SourceVirusTotal` | 24h | `ip:<x>` / `domain:<x>` | x-apikey |
| `SourceURLScan` | 12h | `domain:<x>` | API-Key |
| `SourceShodan` | 12h | `ip:<x>` | URL param |
| `SourceShodanIDB` | 12h | `ip:<x>` | none |
| `SourceGreyNoise` | 12h | `ip:<x>` | none (community endpoint) |
| `SourceRDAP` | 7d | `domain:<x>` | none |
| `SourceCrtSh` | 24h | `apex:<x>` | none |
| `SourceRIPE` | 24h | `prefix-overview:<x>` / `routing-status:<x>` / `rpki:<x>` | none |
| `SourceIPInfo` | 24h | `asn:<x>` | optional token |
| `SourceIPAPI` | 24h | `ip:<x>` | none |

**Never put API keys in the cache key.** Two reasons: (a) keys get
rotated, cache should keep working; (b) keys are secrets, the cache
table is plain text.

## Schema

```sql
CREATE TABLE threat_intel_cache (
    source             TEXT NOT NULL,
    key                TEXT NOT NULL,
    data               TEXT NOT NULL,
    fetched_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at         TIMESTAMP NOT NULL,
    response_hash      TEXT NOT NULL,
    fetch_count        INTEGER NOT NULL DEFAULT 1,
    etag               TEXT NOT NULL DEFAULT '',
    last_modified      TEXT NOT NULL DEFAULT '',
    last_check_at      TIMESTAMP,
    not_modified_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (source, key)
);
CREATE TABLE threat_intel_history (
    id           TEXT PRIMARY KEY,
    source       TEXT NOT NULL,
    key          TEXT NOT NULL,
    prev_hash    TEXT,
    new_hash     TEXT NOT NULL,
    data         TEXT NOT NULL,
    observed_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

`threat_intel_cache` is the warm-path read; `threat_intel_history` is
append-only and grows monotonically. History rows are written ONLY when
the new payload's SHA-256 differs from the previous — identical
responses don't amplify.

## Conditional requests (HIBP-only today)

`Cache.GetOrFetchCond` accepts a `Fetcher` that takes `ConditionalHints`
and returns `notModified=true` when the provider says 304. On 304:

- `expires_at` extends by `ttl`
- `etag` + `last_modified` get re-recorded with the current check time
- `not_modified_count` increments
- No history row written

HIBP is the only provider in 2026-05 that supports ETag reliably.
AbuseIPDB / VT / Shodan don't expose it on their threat-intel endpoints.
The codepath is provider-agnostic — when a new provider adds ETag
support, swap `GetOrFetch` for `GetOrFetchCond` and pass a fetcher
that handles 304.

## Stale-while-revalidate

When the cached row's `expires_at` is in the past but within
`StaleGraceFn(source)` (default 30 min) of now, `GetOrFetch` returns
the stale body IMMEDIATELY with `Result.IsStale=true` and fires the
fetcher in a goroutine. The next call sees the refreshed row.

When the row is stale BEYOND grace, refresh runs inline; on upstream
failure the stale body is still returned with the err — better stale
than 500. Caller decides whether to surface "data is N hours old".

## Caller obligations

`s.cachedFetch` (in `api/threat_cache_helpers.go`) is the canonical
caller. It hides the cache/no-cache decision behind a nil check — when
`s.ThreatCache == nil` (unit tests, desktop sidecar), the fetcher runs
directly without the cache layer.

Callers MUST:

- Provide a non-nil fetcher
- Choose a key namespace that distinguishes lookup types
  (e.g. `threatfox/ip:` vs `threatfox/domain:` are different rows even
  though they hit the same upstream)
- Treat fetcher errors as inconclusive in their downstream logic — see
  [[feedback_env_key_vs_api_success]]

## Testing

`threatcache_test.go` covers:

- Fresh cache hit short-circuits upstream
- Cache miss writes a history row
- Identical response hash does NOT write a second history row
- Different response hash writes new history with correct prev→new chain
- 304 path extends `expires_at` without touching history
- Stale-within-grace returns stale + fires async refresh
- Upstream error with cache returns stale + propagates error
- `Invalidate()` forces next call to refetch
- `DefaultTTL` per-source + unknown-source fallback

All 9 cases pass `go test -count=1 ./internal/threatcache/...`
(0.2s, no external network).
