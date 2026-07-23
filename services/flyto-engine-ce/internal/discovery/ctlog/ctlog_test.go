package ctlog

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"
	"time"
)

// crt.sh returns one JSON entry per cert with name_value containing
// newline-separated SANs. Multiple entries can repeat the same name.
// The discovery client must flatten, dedupe, drop wildcards, and
// reject names outside the requested root.
func TestDiscoverSubdomains_FlattensAndDedupes(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query().Get("q")
		w.Header().Set("Content-Type", "application/json")
		switch q {
		case "%.example.com":
			_ = json.NewEncoder(w).Encode([]crtshEntry{
				{NameValue: "api.example.com\nwww.example.com"},
				{NameValue: "api.example.com"}, // dup
				{NameValue: "*.example.com"},   // wildcard, drop
				{NameValue: "evilexample.com"}, // sibling, drop
				{NameValue: "deep.nested.example.com"},
				{NameValue: "  CaSe.example.com  "}, // case/whitespace normalize
			})
		case "example.com":
			_ = json.NewEncoder(w).Encode([]crtshEntry{
				{NameValue: "example.com"},
				{NameValue: "unrelated.org"}, // crt.sh substring leak, drop
			})
		default:
			t.Fatalf("unexpected query %q", q)
		}
	}))
	defer srv.Close()

	c := NewClient()
	c.Endpoint = srv.URL

	got, err := c.DiscoverSubdomains(context.Background(), "example.com")
	if err != nil {
		t.Fatalf("DiscoverSubdomains error: %v", err)
	}
	sort.Strings(got)
	want := []string{
		"api.example.com",
		"case.example.com",
		"deep.nested.example.com",
		"example.com",
		"www.example.com",
	}
	if !equal(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

// 429 must surface as ErrRateLimited so the worker can mark the run
// rate_limited and back off — distinct from generic network errors.
func TestDiscoverSubdomains_RateLimited(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	c := NewClient()
	c.Endpoint = srv.URL

	_, err := c.DiscoverSubdomains(context.Background(), "example.com")
	if !errors.Is(err, ErrRateLimited) {
		t.Fatalf("want ErrRateLimited, got %v", err)
	}
}

// Transient 502 must be retried, not surfaced. Prod log audit
// 2026-05-18 03:49 UTC showed every certphish term failing with
// `crt.sh status 502` despite the same query succeeding locally
// seconds later — the upstream edge is just flaky under load.
func TestFetch_RetriesTransient502(t *testing.T) {
	var calls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if calls < 2 {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]crtshEntry{{NameValue: "a.b.com"}})
	}))
	defer srv.Close()

	c := NewClient()
	c.Endpoint = srv.URL
	c.RetryBaseDelay = 1 * time.Millisecond // keep test fast

	got, err := c.Fetch(context.Background(), srv.URL+"/?q=%25foo%25&output=json")
	if err != nil {
		t.Fatalf("expected retry to succeed: %v", err)
	}
	if calls != 2 {
		t.Errorf("expected 2 attempts (1 fail + 1 success), got %d", calls)
	}
	if len(got) != 1 || got[0] != "a.b.com" {
		t.Errorf("payload lost: %v", got)
	}
}

// 404 is treated as transient too: prod evidence shows crt.sh
// returns 404 for cache misses under load, NOT for "no certs"
// (no certs returns 200 + empty body via TestDiscoverSubdomains_EmptyBody).
func TestFetch_Retries404AsTransient(t *testing.T) {
	var calls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if calls < 2 {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("[]"))
	}))
	defer srv.Close()

	c := NewClient()
	c.Endpoint = srv.URL
	c.RetryBaseDelay = 1 * time.Millisecond

	_, err := c.Fetch(context.Background(), srv.URL+"/?q=%25foo%25&output=json")
	if err != nil {
		t.Fatalf("404 should be retried as transient: %v", err)
	}
	if calls != 2 {
		t.Errorf("expected 2 attempts, got %d", calls)
	}
}

// 429 must NOT be retried — propagates as ErrRateLimited so the
// caller can pause the entire sweep.
func TestFetch_RateLimitNotRetried(t *testing.T) {
	var calls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	c := NewClient()
	c.Endpoint = srv.URL
	c.RetryBaseDelay = 1 * time.Millisecond

	_, err := c.Fetch(context.Background(), srv.URL+"/?q=%25foo%25&output=json")
	if !errors.Is(err, ErrRateLimited) {
		t.Fatalf("want ErrRateLimited, got %v", err)
	}
	if calls != 1 {
		t.Errorf("429 must NOT be retried (caller backs off); got %d attempts", calls)
	}
}

// All retries exhausted on persistent 502 — error should still
// surface so the caller knows the term failed completely.
func TestFetch_RetryExhausted(t *testing.T) {
	var calls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer srv.Close()

	c := NewClient()
	c.Endpoint = srv.URL
	c.RetryBaseDelay = 1 * time.Millisecond
	c.MaxRetries = 2 // 3 total attempts

	_, err := c.Fetch(context.Background(), srv.URL+"/?q=%25foo%25&output=json")
	if err == nil {
		t.Fatal("expected error after all retries exhausted")
	}
	if calls != 3 {
		t.Errorf("expected 1+2 retries = 3 attempts, got %d", calls)
	}
}

// Context cancel mid-retry must short-circuit and NOT keep
// hammering the upstream.
func TestFetch_ContextCancelStopsRetry(t *testing.T) {
	var calls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer srv.Close()

	c := NewClient()
	c.Endpoint = srv.URL
	c.RetryBaseDelay = 100 * time.Millisecond
	c.MaxRetries = 5

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	_, err := c.Fetch(ctx, srv.URL+"/?q=%25foo%25&output=json")
	if err == nil {
		t.Fatal("expected error")
	}
	// Should be at most 1-2 attempts — definitely less than full 6.
	if calls > 2 {
		t.Errorf("context cancel should short-circuit; got %d attempts", calls)
	}
}

// Empty response body is a valid "no certs logged" — not an error.
// We hit this in the wild for fresh / private root domains.
func TestDiscoverSubdomains_EmptyBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		// no body
	}))
	defer srv.Close()

	c := NewClient()
	c.Endpoint = srv.URL

	got, err := c.DiscoverSubdomains(context.Background(), "example.com")
	if err != nil {
		t.Fatalf("empty body should not error: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("want empty, got %v", got)
	}
}

func TestIsSubdomainOf(t *testing.T) {
	cases := []struct {
		name, root string
		want       bool
	}{
		{"api.example.com", "example.com", true},
		{"deep.nested.example.com", "example.com", true},
		{"example.com", "example.com", false}, // strict
		{"evilexample.com", "example.com", false},
		{"example.com.evil.org", "example.com", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isSubdomainOf(tc.name, tc.root); got != tc.want {
				t.Errorf("isSubdomainOf(%q, %q) = %v, want %v",
					tc.name, tc.root, got, tc.want)
			}
		})
	}
	_ = strings.Compare // silence import if optimised away
}

func equal(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
