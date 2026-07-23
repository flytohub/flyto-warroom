// Package ctlog discovers subdomains by querying public Certificate
// Transparency logs via crt.sh.
//
// Unlike internal/verifier/asset/subdomain.go which uses crt.sh to
// *verify* a single known hostname (does x.example.com appear in any
// log entry?), this package performs *bulk discovery* — for a given
// root domain, return every hostname that ever had a certificate
// logged. That feeds the proactive collection pipeline: scheduled
// worker sweeps -> upsert into attack_surface -> growth trend over
// time.
//
// Trade-offs:
//
//   - crt.sh free tier rate-limits aggressively. The caller (worker
//     loop) is responsible for pacing — this package does not sleep
//     internally so callers can choose their own backoff.
//
//   - Bulk responses can be huge (10k+ entries for popular domains).
//     We cap response body at 50MB and de-dup on parse. The returned
//     list is the unique set of hostnames; original certificate
//     metadata is dropped.
//
//   - Wildcard certificates (`*.example.com`) are filtered out — they
//     don't describe a real subdomain, just a policy.
//
//   - We trust crt.sh's substring-matching to return strict subdomains
//     of the root, but verify suffix match locally to defend against
//     a sibling-domain leak (e.g. `evilexample.com` for q=%.example.com).
package ctlog

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/flytohub/flyto-engine/internal/httpx"
)

const (
	defaultEndpoint  = "https://crt.sh"
	defaultUserAgent = "flyto-engine/ct-discovery (+https://flyto2.com)"
	defaultTimeout   = 60 * time.Second
	maxResponseBytes = 50 * 1024 * 1024 // 50MB cap

	// Retry policy for transient upstream errors. crt.sh sits behind
	// a shared edge that frequently 502s / 504s under load; prod log
	// audit 2026-05-18 also showed 404 returning for queries that
	// succeed seconds later on a fresh connection (likely cache
	// fragmentation, not "no certs"). Empty body still means "no
	// certs"; that is NOT retried (it's a successful response).
	defaultMaxRetries     = 2
	defaultRetryBaseDelay = 5 * time.Second
)

// Client queries crt.sh for CT log entries. Construct via NewClient.
type Client struct {
	HTTP      *http.Client
	Endpoint  string
	UserAgent string

	// MaxRetries is the per-request retry cap on transient errors
	// (5xx, 404, network timeout). 429 is NOT retried — that surface
	// as ErrRateLimited so the caller can back off the entire sweep.
	// 0 disables retries entirely (useful for tests).
	MaxRetries int
	// RetryBaseDelay is the gap before the first retry. The second
	// retry uses 2× this (exponential). Capped internally at 30s.
	RetryBaseDelay time.Duration
}

// NewClient returns a Client with sensible defaults.
func NewClient() *Client {
	return &Client{
		HTTP:           httpx.New(defaultTimeout),
		Endpoint:       defaultEndpoint,
		UserAgent:      defaultUserAgent,
		MaxRetries:     defaultMaxRetries,
		RetryBaseDelay: defaultRetryBaseDelay,
	}
}

// crtshEntry mirrors the subset of crt.sh JSON we consume. The full
// schema also carries issuer info, NotBefore/NotAfter, etc — none of
// which we need for subdomain discovery.
type crtshEntry struct {
	NameValue string `json:"name_value"`
}

// ErrRateLimited signals the caller should back off — crt.sh
// returned a 429 or 503 (their typical throttle responses). Callers
// distinguish this from transient network errors via errors.Is.
var ErrRateLimited = fmt.Errorf("crt.sh rate limited")

// DiscoverSubdomains returns the unique set of hostnames that have
// ever had a CT-logged certificate covering rootDomain or its
// subdomains. Includes rootDomain itself if it has a cert.
//
// On HTTP 429/503 returns ErrRateLimited so the caller can mark the
// run rate_limited and back off the next sweep.
func (c *Client) DiscoverSubdomains(ctx context.Context, rootDomain string) ([]string, error) {
	rootDomain = strings.ToLower(strings.TrimSpace(rootDomain))
	if rootDomain == "" {
		return nil, fmt.Errorf("empty root domain")
	}
	// crt.sh's q parameter accepts the literal pattern; %25 is `%`
	// URL-encoded. `%.example.com` matches any name with at least
	// one label before example.com — strict subdomains. The bare
	// root match is appended below via a second query.
	url := fmt.Sprintf("%s/?q=%%25.%s&output=json", c.Endpoint, rootDomain)
	subs, err := c.fetch(ctx, url)
	if err != nil {
		return nil, err
	}

	// Second query covers the apex (e.g. example.com itself). Costs
	// one extra round-trip but ensures we don't miss the root cert.
	apexURL := fmt.Sprintf("%s/?q=%s&output=json", c.Endpoint, rootDomain)
	apex, err := c.fetch(ctx, apexURL)
	if err != nil {
		// Don't fail the whole discovery on apex miss — subdomain
		// results are still valuable. Log via the caller.
		apex = nil
	}

	seen := make(map[string]struct{}, len(subs)+len(apex))
	for _, name := range subs {
		if isSubdomainOf(name, rootDomain) {
			seen[name] = struct{}{}
		}
	}
	for _, name := range apex {
		// Apex query results often include the root itself plus a
		// random scatter of unrelated names where crt.sh substring-
		// matched on the certificate metadata. Filter strictly.
		if name == rootDomain || isSubdomainOf(name, rootDomain) {
			seen[name] = struct{}{}
		}
	}

	out := make([]string, 0, len(seen))
	for name := range seen {
		out = append(out, name)
	}
	return out, nil
}

// Fetch hits one crt.sh URL and parses the JSON response into a
// flattened list of hostnames. Exported for callers (e.g.
// internal/discovery/certphish) that need custom query patterns
// beyond DiscoverSubdomains' root-anchored search. Wildcards
// (`*.foo`) are filtered out — same policy as DiscoverSubdomains.
func (c *Client) Fetch(ctx context.Context, url string) ([]string, error) {
	return c.fetch(ctx, url)
}

// fetch hits one crt.sh URL with retry-on-transient. Wraps
// fetchOnce; on transient failure (5xx other than 503/429,
// 404 — which crt.sh returns for cache misses, not for
// "no certs" — and network timeouts) it retries up to
// c.MaxRetries with exponential backoff. 429/503 surface as
// ErrRateLimited and are NOT retried so the caller can pause
// the entire sweep instead of hammering through the limit.
func (c *Client) fetch(ctx context.Context, url string) ([]string, error) {
	maxAttempts := 1 + c.MaxRetries
	if maxAttempts < 1 {
		maxAttempts = 1
	}
	delay := c.RetryBaseDelay
	if delay <= 0 {
		delay = defaultRetryBaseDelay
	}
	var lastErr error
	for attempt := 0; attempt < maxAttempts; attempt++ {
		out, err := c.fetchOnce(ctx, url)
		if err == nil {
			return out, nil
		}
		// Don't retry on rate-limit — propagate so caller backs off.
		if errors.Is(err, ErrRateLimited) {
			return nil, err
		}
		// Don't retry if the caller's context is done — futile.
		if ctx.Err() != nil {
			return nil, err
		}
		// Only retry on transient classes.
		if !isTransient(err) {
			return nil, err
		}
		lastErr = err
		// Last attempt — don't sleep then re-loop.
		if attempt == maxAttempts-1 {
			break
		}
		// Exponential backoff capped at 30s. Respect context cancel.
		sleep := delay * (1 << attempt)
		if sleep > 30*time.Second {
			sleep = 30 * time.Second
		}
		select {
		case <-ctx.Done():
			return nil, err
		case <-time.After(sleep):
		}
	}
	return nil, fmt.Errorf("crt.sh after %d attempts: %w", maxAttempts, lastErr)
}

// fetchOnce is one round-trip + parse, no retry logic. Pulled out
// so the retry wrapper can stay focused on policy.
func (c *Client) fetchOnce(ctx context.Context, url string) ([]string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", c.UserAgent)
	req.Header.Set("Accept", "application/json")

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("crt.sh request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode == http.StatusServiceUnavailable {
		return nil, ErrRateLimited
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("crt.sh status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))
	if err != nil {
		return nil, fmt.Errorf("read crt.sh body: %w", err)
	}

	// Empty body = no certs logged for this query. Not an error.
	if len(body) == 0 {
		return nil, nil
	}

	var entries []crtshEntry
	if err := json.Unmarshal(body, &entries); err != nil {
		return nil, fmt.Errorf("parse crt.sh json: %w", err)
	}

	out := make([]string, 0, len(entries))
	for _, e := range entries {
		for _, raw := range strings.Split(e.NameValue, "\n") {
			name := strings.ToLower(strings.TrimSpace(raw))
			if name == "" {
				continue
			}
			if strings.HasPrefix(name, "*.") {
				continue // wildcards aren't real hosts
			}
			out = append(out, name)
		}
	}
	return out, nil
}

// isTransient reports whether err warrants a retry. Empirically:
//   - net/timeout (deadline exceeded mid-request) → almost always
//     recovers on next try from a different cache shard
//   - 404 → crt.sh returns this for cache misses under load, not
//     for "no certs" (no certs returns 200 + empty body)
//   - 5xx other than 503 → backend hiccup
//
// 429 / 503 are NOT classified transient because the upstream is
// asking us to back off. parsing errors are NOT transient (same
// payload, same parse fail).
func isTransient(err error) bool {
	msg := err.Error()
	// network/socket level — net.Error timeout + connection reset
	// both serialise into the wrapped error string.
	if strings.Contains(msg, "context deadline exceeded") ||
		strings.Contains(msg, "deadline exceeded") ||
		strings.Contains(msg, "connection reset") ||
		strings.Contains(msg, "EOF") ||
		strings.Contains(msg, "i/o timeout") ||
		strings.Contains(msg, "TLS handshake") {
		return true
	}
	// HTTP status path — fetchOnce formats as `crt.sh status N`.
	for _, code := range []string{"404", "500", "502", "504"} {
		if strings.Contains(msg, "crt.sh status "+code) {
			return true
		}
	}
	return false
}

// isSubdomainOf reports whether name is a strict subdomain of root.
// Defends against substring leaks like `evilexample.com` matching
// crt.sh's `q=%.example.com` query.
func isSubdomainOf(name, root string) bool {
	if name == root {
		return false
	}
	return strings.HasSuffix(name, "."+root)
}
