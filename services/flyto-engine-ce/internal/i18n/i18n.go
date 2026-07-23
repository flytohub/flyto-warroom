// Package i18n provides CDN-backed translation for server-side messages.
//
// It fetches locale bundles from the flyto-i18n CDN (GitHub raw / jsDelivr)
// and caches them in memory with a configurable TTL. The Bundle is safe for
// concurrent use by multiple goroutines.
//
// Translation keys follow the flat dot-notation convention used across the
// Flyto2 platform: "engine.error.not_found.repo". The CDN serves nested JSON;
// this package flattens it on load so lookups are O(1) map reads.
package i18n

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/flytohub/flyto-engine/internal/httpx"
)

// cdnSources are tried in order. GitHub raw is faster but occasionally
// 503s under heavy traffic; jsDelivr is the CDN-backed fallback.
var cdnSources = []string{
	"https://raw.githubusercontent.com/flytohub/flyto-i18n/main/dist/engine/%s.json",
	"https://cdn.jsdelivr.net/gh/flytohub/flyto-i18n@main/dist/engine/%s.json",
}

// httpClient is a shared client with short timeouts — translation fetch
// must never block request handling for long.
var httpClient = httpx.New(5 * time.Second)

// Bundle holds flattened translations for all loaded locales.
type Bundle struct {
	mu          sync.RWMutex
	locales     map[string]map[string]string // locale → key → translated string
	ttl         time.Duration
	fetched     map[string]time.Time
	allowRemote bool

	// loading deduplicates concurrent fetch attempts for the same locale.
	loading sync.Map // locale → *sync.Once (reset after TTL)
}

// New creates a Bundle with the given cache TTL and remote CDN loading enabled.
func New(ttl time.Duration) *Bundle {
	return newBundle(ttl, true)
}

// NewOffline creates a Bundle that never fetches remote locale files. Air-gapped
// and community self-hosted deployments use this to avoid surprise egress.
func NewOffline(ttl time.Duration) *Bundle {
	return newBundle(ttl, false)
}

func newBundle(ttl time.Duration, allowRemote bool) *Bundle {
	return &Bundle{
		locales:     make(map[string]map[string]string),
		fetched:     make(map[string]time.Time),
		ttl:         ttl,
		allowRemote: allowRemote,
	}
}

// T translates key for the given locale. Falls back to "en" when the
// locale is missing or the key is absent. Returns the raw key as a last
// resort so callers always get a non-empty string.
//
// Supports parameter interpolation: {0}, {1}, ... are replaced positionally.
func (b *Bundle) T(locale, key string, params ...string) string {
	b.ensureLoaded(locale)

	b.mu.RLock()
	msg := b.lookup(locale, key)
	if msg == "" && locale != "en" {
		msg = b.lookup("en", key)
	}
	b.mu.RUnlock()

	if msg == "" {
		return key
	}
	for i, p := range params {
		msg = strings.ReplaceAll(msg, fmt.Sprintf("{%d}", i), p)
	}
	return msg
}

// Has reports whether a translation exists for the key in the given locale
// (or English fallback).
func (b *Bundle) Has(locale, key string) bool {
	b.mu.RLock()
	defer b.mu.RUnlock()
	if m, ok := b.locales[locale]; ok {
		if _, exists := m[key]; exists {
			return true
		}
	}
	if locale != "en" {
		if m, ok := b.locales["en"]; ok {
			if _, exists := m[key]; exists {
				return true
			}
		}
	}
	return false
}

func (b *Bundle) lookup(locale, key string) string {
	if m, ok := b.locales[locale]; ok {
		return m[key]
	}
	return ""
}

// Preload fetches English plus the specified locales synchronously.
// Call this at server startup so the first requests don't hit CDN latency.
func (b *Bundle) Preload(locales ...string) {
	if !b.allowRemote {
		return
	}
	all := []string{"en"}
	for _, l := range locales {
		if l != "en" {
			all = append(all, l)
		}
	}
	var wg sync.WaitGroup
	for _, locale := range all {
		wg.Add(1)
		go func(l string) {
			defer wg.Done()
			b.fetchAndStore(l)
		}(locale)
	}
	wg.Wait()
}

// ensureLoaded triggers a fetch if the locale is missing or stale.
// Non-blocking for subsequent requests — only the first caller per TTL
// window actually fetches.
func (b *Bundle) ensureLoaded(locale string) {
	if !b.allowRemote {
		return
	}
	b.mu.RLock()
	t, loaded := b.fetched[locale]
	fresh := loaded && time.Since(t) < b.ttl
	b.mu.RUnlock()

	if fresh {
		return
	}

	// Deduplicate: only one goroutine fetches per locale per TTL window.
	key := locale
	onceVal, _ := b.loading.LoadOrStore(key, &sync.Once{})
	once := onceVal.(*sync.Once)
	once.Do(func() {
		// Fire-and-forget for non-preload paths so request latency is unaffected.
		go func() {
			b.fetchAndStore(locale)
			// Reset the Once so next TTL expiry can trigger again.
			b.loading.Delete(key)
		}()
	})
}

// fetchAndStore downloads the locale JSON from CDN and stores it.
func (b *Bundle) fetchAndStore(locale string) {
	for _, src := range cdnSources {
		url := fmt.Sprintf(src, locale)
		resp, err := httpClient.Get(url)
		if err != nil {
			slog.Debug("i18n: cdn fetch failed", "locale", locale, "url", url, "error", err)
			continue
		}
		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			continue
		}
		body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // 1 MiB cap
		resp.Body.Close()
		if err != nil {
			continue
		}

		flat := flatten(body)
		if len(flat) > 0 {
			b.mu.Lock()
			b.locales[locale] = flat
			b.fetched[locale] = time.Now()
			b.mu.Unlock()
			slog.Info("i18n: loaded locale from cdn", "locale", locale, "keys", len(flat))
			return
		}
	}
	slog.Warn("i18n: failed to load locale from all cdn sources", "locale", locale)
}

// flatten converts nested JSON (as served by flyto-i18n CDN) to a flat
// dot-notation map. Example: {"engine":{"error":{"not_found":"..."}}}
// becomes {"engine.error.not_found": "..."}.
//
// Special-case: the CDN's flat_to_nested parks generic-namespace
// strings under a "_self" key when they collide with a child dict
// (e.g. "engine.error.bad_request" coexists with
// "engine.error.bad_request.url_required"). Without lifting _self
// back to its parent, TranslateError's generic fallback (step 2)
// can never find the bare-namespace value and falls all the way
// through to raw English. See flyto-i18n scripts/build-dist.py
// flat_to_nested comment for the encoding contract.
func flatten(data []byte) map[string]string {
	var nested map[string]any
	if err := json.Unmarshal(data, &nested); err != nil {
		return nil
	}
	result := make(map[string]string, 64)
	flattenRecursive("", nested, result)
	// Lift "*._self" back to bare parent paths. Iterate over a
	// snapshot so we can mutate result inside the loop.
	for k, v := range result {
		if !strings.HasSuffix(k, "._self") {
			continue
		}
		parent := strings.TrimSuffix(k, "._self")
		if parent == "" {
			continue
		}
		// Only adopt when the parent isn't already populated by a
		// real flat entry — defensive against future CDN format
		// drift that emits both forms.
		if _, exists := result[parent]; !exists {
			result[parent] = v
		}
		delete(result, k) // _self is internal, no caller looks it up
	}
	return result
}

func flattenRecursive(prefix string, m map[string]any, out map[string]string) {
	for k, v := range m {
		key := k
		if prefix != "" {
			key = prefix + "." + k
		}
		switch val := v.(type) {
		case string:
			out[key] = val
		case map[string]any:
			flattenRecursive(key, val, out)
		}
	}
}
