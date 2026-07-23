package cve

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestCheck_HappyPath — feed a fake OSV server one critical vuln and
// assert the result mirrors what the real API would return. Pins the
// transformation: ecosystem mapping, severity classification, fixed-in
// extraction, summary count.
func TestCheck_HappyPath(t *testing.T) {
	server := newOSVStub(t, map[string]osvBatchResponse{
		"querybatch": {Results: []osvResult{{
			Vulns: []osvVuln{{
				ID:      "GHSA-test-1234",
				Summary: "RCE in lodash",
				Severity: []osvSeverity{{
					Type:  "CVSS_V3",
					Score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H 9.8",
				}},
				Affected: []osvAffected{{
					Ranges: []osvRange{{Events: []osvEvent{
						{Introduced: "0"},
						{Fixed: "4.17.21"},
					}}},
				}},
				References: []osvRef{{Type: "ADVISORY", URL: "https://example.com/x"}},
				Published:  "2024-01-01T00:00:00Z",
			}},
		}}},
	})
	defer server.Close()
	t.Setenv("FLYTO_OSV_API_URL", server.URL)

	deps := []Dependency{
		{Name: "lodash", Version: "4.17.20", Ecosystem: "npm"},
	}
	res, err := Check(deps)
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if res.TotalDeps != 1 {
		t.Errorf("TotalDeps = %d, want 1", res.TotalDeps)
	}
	if res.VulnerableDeps != 1 {
		t.Errorf("VulnerableDeps = %d, want 1", res.VulnerableDeps)
	}
	if res.Critical != 1 {
		t.Errorf("Critical = %d, want 1 (CVSS 9.8 should classify as CRITICAL)", res.Critical)
	}
	if len(res.Vulnerabilities) != 1 {
		t.Fatalf("Vulnerabilities len = %d", len(res.Vulnerabilities))
	}
	v := res.Vulnerabilities[0]
	if v.FixedIn != "4.17.21" {
		t.Errorf("FixedIn = %q, want 4.17.21", v.FixedIn)
	}
	if v.Severity != "CRITICAL" {
		t.Errorf("Severity = %q, want CRITICAL", v.Severity)
	}
}

// TestCheck_PartialOnFailure — when OSV returns 5xx, the result is
// flagged Partial=true and UncheckedDepCount counts the lost batch.
// User experience: "we found N vulns BUT we couldn't check M deps —
// re-scan when OSV is up". Better than silent under-counting.
func TestCheck_PartialOnFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer server.Close()
	t.Setenv("FLYTO_OSV_API_URL", server.URL)

	deps := []Dependency{
		{Name: "lodash", Version: "4.17.20", Ecosystem: "npm"},
		{Name: "express", Version: "4.18.0", Ecosystem: "npm"},
	}
	res, err := Check(deps)
	if err != nil {
		t.Fatalf("Check should not return error on per-batch failure: %v", err)
	}
	if !res.Partial {
		t.Error("Partial should be true when OSV failed")
	}
	if res.UncheckedDepCount != 2 {
		t.Errorf("UncheckedDepCount = %d, want 2 (both deps lost)", res.UncheckedDepCount)
	}
}

// TestCheck_FiltersUnsupportedEcosystem — refuses to query for
// ecosystems we don't know how to map. Stops the OSV API from
// receiving garbage like {"ecosystem":"some-internal-build-system"}.
func TestCheck_FiltersUnsupportedEcosystem(t *testing.T) {
	hits := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		_, _ = w.Write([]byte(`{"results":[]}`))
	}))
	defer server.Close()
	t.Setenv("FLYTO_OSV_API_URL", server.URL)

	deps := []Dependency{
		{Name: "weirdmod", Version: "1.0.0", Ecosystem: "internal-bazel"},
		{Name: "alsoweird", Version: "", Ecosystem: "npm"}, // empty version — also filtered
	}
	res, err := Check(deps)
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if res.TotalDeps != 2 {
		t.Errorf("TotalDeps reflects input, got %d", res.TotalDeps)
	}
	if hits != 0 {
		t.Errorf("OSV should not have been hit (no valid queries), got %d hits", hits)
	}
}

// TestCleanVersion — pins the version-prefix stripping rules. The
// scanner gives us strings like "^1.2.3" or "~1.0.0 || 2.0.0"; OSV
// wants exact versions. Wrong here = every npm dep shows as 0 vulns.
//
// Note: file:/path-prefixed versions are filtered upstream in Check()
// before cleanVersion runs, so they're not in this table.
func TestCleanVersion(t *testing.T) {
	cases := []struct{ in, want string }{
		{"^1.2.3", "1.2.3"},
		{"~1.0.0", "1.0.0"},
		{">=2.0.0", "2.0.0"},
		{"1.2.3", "1.2.3"},
		{"1.2.3 || 2.0.0", "1.2.3"},
		{"1.2.3, 2.0.0", "1.2.3"},
		{"", ""},
		{"./local", ""},
	}
	for _, tc := range cases {
		got := cleanVersion(tc.in)
		if got != tc.want {
			t.Errorf("cleanVersion(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestExtractFixedVersionFor_SelectsRangeForCurrentVersion(t *testing.T) {
	v := osvVuln{
		ID: "GHSA-cq8v-f236-94qc",
		Affected: []osvAffected{
			{Ranges: []osvRange{{Events: []osvEvent{
				{Introduced: "0.9.0"},
				{Fixed: "0.9.3"},
			}}}},
			{Ranges: []osvRange{{Events: []osvEvent{
				{Introduced: "0.10.0"},
				{Fixed: "0.10.1"},
			}}}},
			{Ranges: []osvRange{{Events: []osvEvent{
				{Introduced: "0.7.0"},
				{Fixed: "0.8.6"},
			}}}},
		},
	}
	if got := extractFixedVersionFor(v, "0.8.5"); got != "0.8.6" {
		t.Fatalf("extractFixedVersionFor(0.8.5) = %q, want 0.8.6", got)
	}
	if got := extractFixedVersionFor(v, "0.9.2"); got != "0.9.3" {
		t.Fatalf("extractFixedVersionFor(0.9.2) = %q, want 0.9.3", got)
	}
}

func TestExtractFixedVersionFor_CombinedRangeEvents(t *testing.T) {
	v := osvVuln{
		ID: "RUSTSEC-2026-0097",
		Affected: []osvAffected{{
			Ranges: []osvRange{{Events: []osvEvent{
				{Introduced: "0.7.0"},
				{Fixed: "0.8.6"},
				{Introduced: "0.9.0"},
				{Fixed: "0.9.3"},
				{Introduced: "0.10.0"},
				{Fixed: "0.10.1"},
			}}},
		}},
	}
	if got := extractFixedVersionFor(v, "0.8.5"); got != "0.8.6" {
		t.Fatalf("extractFixedVersionFor(0.8.5) = %q, want 0.8.6", got)
	}
}

// TestClassifySeverity_CVSSScoreBuckets — CVSS thresholds drive the
// CRITICAL/HIGH/MODERATE/LOW bucketing. If we tweak these a customer's
// "critical CVE count" suddenly changes — the test pins the boundaries.
func TestClassifySeverity_CVSSScoreBuckets(t *testing.T) {
	mk := func(score string) osvVuln {
		return osvVuln{Severity: []osvSeverity{{Type: "CVSS_V3", Score: score}}}
	}
	cases := []struct {
		score string
		want  string
	}{
		{"9.8", "CRITICAL"},
		{"9.0", "CRITICAL"}, // boundary inclusive
		{"8.9", "HIGH"},
		{"7.0", "HIGH"}, // boundary inclusive
		{"6.9", "MODERATE"},
		{"4.0", "MODERATE"}, // boundary inclusive
		{"3.9", "LOW"},
	}
	for _, tc := range cases {
		got := classifySeverity(mk(tc.score))
		if got != tc.want {
			t.Errorf("classifySeverity(%q) = %q, want %q", tc.score, got, tc.want)
		}
	}
}

// TestClassifySeverity_DatabaseSpecific pins the GHSA path: when the
// top-level severity[] is empty (the common case in production), the
// classifier must read database_specific.severity. A real org's full
// 261-CVE batch landed as 100% MODERATE before this branch existed
// because every advisory hit the GHSA→MODERATE fallback.
func TestClassifySeverity_DatabaseSpecific(t *testing.T) {
	cases := []struct {
		name string
		in   osvVuln
		want string
	}{
		{
			name: "GHSA with database_specific HIGH",
			in:   osvVuln{ID: "GHSA-aaaa-bbbb-cccc", DatabaseSpecific: osvDatabaseSpecific{Severity: "HIGH"}},
			want: "HIGH",
		},
		{
			name: "GHSA with database_specific CRITICAL",
			in:   osvVuln{ID: "GHSA-xxxx", DatabaseSpecific: osvDatabaseSpecific{Severity: "CRITICAL"}},
			want: "CRITICAL",
		},
		{
			name: "GHSA with database_specific MEDIUM normalises to MODERATE",
			in:   osvVuln{ID: "GHSA-mmmm", DatabaseSpecific: osvDatabaseSpecific{Severity: "MEDIUM"}},
			want: "MODERATE",
		},
		{
			name: "CVSS_V3 wins over database_specific",
			in: osvVuln{
				ID:               "GHSA-cvss",
				Severity:         []osvSeverity{{Type: "CVSS_V3", Score: "9.8"}},
				DatabaseSpecific: osvDatabaseSpecific{Severity: "LOW"},
			},
			want: "CRITICAL",
		},
		{
			name: "CVSS_V4 also accepted (newer GHSAs)",
			in:   osvVuln{Severity: []osvSeverity{{Type: "CVSS_V4", Score: "8.5"}}},
			want: "HIGH",
		},
		{
			name: "score-less CVSS vector falls through to database_specific",
			// OSV often publishes the full vector without a trailing
			// numeric score (real example: GHSA-5h86-8mv2-jq9f). Before
			// the fall-through fix this collapsed to LOW (extractCVSSScore=0).
			in: osvVuln{
				ID:               "GHSA-vector-only",
				Severity:         []osvSeverity{{Type: "CVSS_V3", Score: "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N"}},
				DatabaseSpecific: osvDatabaseSpecific{Severity: "HIGH"},
			},
			want: "HIGH",
		},
		{
			name: "GHSA without CVSS or database_specific keeps MODERATE fallback",
			in:   osvVuln{ID: "GHSA-bare"},
			want: "MODERATE",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := classifySeverity(tc.in); got != tc.want {
				t.Errorf("got %q, want %q", got, tc.want)
			}
		})
	}
}

// ── stub server ─────────────────────────────────────────────────────

func newOSVStub(t *testing.T, replies map[string]osvBatchResponse) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Match by URL path suffix — querybatch / vulns/{id} etc.
		for key, reply := range replies {
			if strings.HasSuffix(r.URL.Path, key) {
				_ = json.NewEncoder(w).Encode(reply)
				return
			}
		}
		_, _ = io.Copy(io.Discard, r.Body)
		_, _ = w.Write([]byte(`{"results":[]}`))
	}))
}

// TestIsMaliciousAdvisory pins the malware heuristic — both the MAL-
// ID-prefix path and the summary-keyword path. Run with -v to see
// which case fires for each input.
func TestIsMaliciousAdvisory(t *testing.T) {
	cases := []struct {
		name    string
		id      string
		summary string
		want    bool
	}{
		{"MAL prefix lowercase", "mal-2024-001", "anything", true},
		{"MAL prefix uppercase", "MAL-2024-001", "anything", true},
		{"MAL substring not at start", "FOO-MAL-2024-001", "boring", false},
		{"summary typosquat", "GHSA-xxxx", "Typosquat of express — credential stealer", true},
		{"summary credential-stealing", "GHSA-yyyy", "Credential-stealing payload found", true},
		{"summary backdoor", "GHSA-zzzz", "Backdoor in postinstall hook", true},
		{"summary data exfil", "GHSA-1234", "Package exfiltrates env vars on install", true},
		{"legit CVE in legit lib", "CVE-2024-1234", "buffer overflow in strncpy parser", false},
		{"empty", "", "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isMaliciousAdvisory(tc.id, tc.summary); got != tc.want {
				t.Errorf("isMaliciousAdvisory(%q, %q) = %v, want %v",
					tc.id, tc.summary, got, tc.want)
			}
		})
	}
}
