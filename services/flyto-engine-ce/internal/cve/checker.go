// Package cve checks dependencies against the OSV (Open Source Vulnerabilities) API.
package cve

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"regexp"
	"strings"
	"time"

	"github.com/flytohub/flyto-engine/internal/endpoints"
	"github.com/flytohub/flyto-engine/internal/httpx"
	"github.com/flytohub/flyto-engine/internal/osvutil"
)

// osvAPI is the batch-query endpoint. The base is env-driven (the
// enterprise-offline build points at an internal OSV mirror) but the
// path is fixed — whatever you're hitting had better speak the OSV
// batch protocol or this whole package breaks.
func osvAPI() string { return endpoints.OSVAPI() + "/v1/querybatch" }

// Dependency represents a package to check
type Dependency struct {
	Name      string `json:"name"`
	Version   string `json:"version"`
	Ecosystem string `json:"ecosystem"` // npm, PyPI, Go, crates.io, Maven, RubyGems, Packagist
}

// Vulnerability represents a found CVE/advisory
type Vulnerability struct {
	ID         string   `json:"id"` // e.g. "GHSA-xxxx" or "CVE-2024-xxxx"
	Summary    string   `json:"summary"`
	Severity   string   `json:"severity"` // CRITICAL, HIGH, MODERATE, LOW
	Package    string   `json:"package"`
	Version    string   `json:"version"`
	FixedIn    string   `json:"fixed_in"`   // version that fixes it, if known
	References []string `json:"references"` // URLs
	Published  string   `json:"published"`
	// Malicious is true when the advisory describes the package itself
	// as a supply-chain attack (typosquat, dependency confusion,
	// credential stealer) rather than a vulnerable-but-legit library.
	// Detected by ID prefix "MAL-" or summary text. Surfaced in the
	// engine's malware view separately from regular CVEs because the
	// remediation is "remove this dependency entirely", not "upgrade".
	Malicious bool `json:"malicious,omitempty"`

	// CVSS base score (0.0-10.0). Extracted from the CVSS v3/v4 vector.
	// When unavailable (no vector or score-less vector), 0 and severity
	// string is used as fallback. This is the industry-standard penalty
	// weight — used directly by the scoring engine instead of heuristic
	// multipliers like "critical×10".
	CVSSScore float64 `json:"cvss_score,omitempty"` // 0.0-10.0

	// Enrichment fields — populated post-scan by EnrichVulnerabilities.
	EPSS            float64 `json:"epss,omitempty"`             // 0.0-1.0 exploit probability
	EPSSPercentile  float64 `json:"epss_percentile,omitempty"`  // 0.0-1.0
	InKEV           bool    `json:"in_kev,omitempty"`           // CISA Known Exploited
	ExternalExposed bool    `json:"external_exposed,omitempty"` // Shodan reports same CVE on external IP
	RiskScore       int     `json:"risk_score,omitempty"`       // 0-100 composite risk
}

// Result holds all vulnerabilities found
type Result struct {
	TotalDeps       int             `json:"total_deps"`
	VulnerableDeps  int             `json:"vulnerable_deps"`
	Critical        int             `json:"critical"`
	High            int             `json:"high"`
	Moderate        int             `json:"moderate"`
	Low             int             `json:"low"`
	Vulnerabilities []Vulnerability `json:"vulnerabilities"`
	// Partial is true when at least one OSV batch failed. The remaining
	// batches succeeded, but the caller should treat the counts as a
	// lower bound — there may be vulns we didn't get to check.
	Partial           bool `json:"partial,omitempty"`
	UncheckedDepCount int  `json:"unchecked_dep_count,omitempty"`
}

// Map flyto-indexer ecosystem names to OSV ecosystem names
var ecosystemMap = map[string]string{
	"npm":      "npm",
	"pypi":     "PyPI",
	"go":       "Go",
	"cargo":    "crates.io",
	"maven":    "Maven",
	"gem":      "RubyGems",
	"composer": "Packagist",
}

// Check queries the OSV API for known vulnerabilities in the given dependencies.
// Processes in batches of 100 (OSV batch limit is 1000).
func Check(deps []Dependency) (*Result, error) {
	result := &Result{TotalDeps: len(deps)}

	// Filter to deps with known versions and supported ecosystems
	var queries []osvQuery
	var queryDeps []Dependency
	for _, d := range deps {
		eco, ok := ecosystemMap[d.Ecosystem]
		if !ok || d.Version == "" || strings.HasPrefix(d.Version, "file:") || d.Version == "@" {
			continue
		}
		// Clean version: strip leading >= ^ ~ etc for exact match
		ver := cleanVersion(d.Version)
		if ver == "" {
			continue
		}
		queries = append(queries, osvQuery{
			Package: osvPackage{Name: d.Name, Ecosystem: eco},
			Version: ver,
		})
		queryDeps = append(queryDeps, d)
	}

	if len(queries) == 0 {
		return result, nil
	}

	// Batch queries (max 100 per request to be safe). Each batch is
	// independent — on failure we record how many deps we couldn't check
	// so the caller can surface "partial data" rather than silently
	// reporting fewer vulnerabilities than reality.
	batchSize := 100
	for i := 0; i < len(queries); i += batchSize {
		end := i + batchSize
		if end > len(queries) {
			end = len(queries)
		}
		batch := queries[i:end]
		batchDeps := queryDeps[i:end]

		vulns, err := queryOSV(batch, batchDeps)
		if err != nil {
			slog.Warn("cve: OSV batch query failed — results are partial",
				"error", err,
				"batch_start", i,
				"batch_size", len(batch),
			)
			result.Partial = true
			result.UncheckedDepCount += len(batch)
			continue
		}
		result.Vulnerabilities = append(result.Vulnerabilities, vulns...)
	}

	// Enrich with summary + severity from individual vuln lookups.
	// The OSV /v1/querybatch endpoint returns only IDs (no severity,
	// no summary) — every batch row arrived with severity=MODERATE
	// from the GHSA→MODERATE fallback in classifySeverity, regardless
	// of the real CVSS or GHSA-textual severity. Hitting /v1/vulns/{id}
	// is the only way to get severity, so we hydrate here and rerun
	// classifySeverity against the enriched record. Cached per ID to
	// avoid duplicate calls when the same advisory hits multiple deps.
	enrichCount := 0
	const maxEnrich = 60
	type cacheEntry struct {
		v  osvVuln
		ok bool
	}
	cache := make(map[string]cacheEntry, len(result.Vulnerabilities))
	// Track consecutive failures — if 5 in a row come back empty
	// we're likely rate-limited (429) and should stop. Without
	// this, a sustained OSV outage burns the full enrich budget
	// for every scan in the queue.
	consecutiveEmpty := 0
	for i := range result.Vulnerabilities {
		if enrichCount >= maxEnrich {
			break
		}
		if consecutiveEmpty >= 5 {
			break
		}
		id := result.Vulnerabilities[i].ID
		entry, hit := cache[id]
		if !hit {
			v, ok := fetchVulnFull(id)
			entry = cacheEntry{v: v, ok: ok}
			cache[id] = entry
			enrichCount++
			if ok {
				consecutiveEmpty = 0
			} else {
				consecutiveEmpty++
			}
		}
		if !entry.ok {
			continue
		}
		if result.Vulnerabilities[i].Summary == "" {
			result.Vulnerabilities[i].Summary = entry.v.Summary
		}
		// Re-classify with the hydrated record. The batch path always
		// missed the real severity (querybatch returns IDs only) so
		// without this re-run every advisory landed at MODERATE via
		// the GHSA fallback — observed: 261/261 CVEs in production.
		result.Vulnerabilities[i].Severity = classifySeverity(entry.v)
		result.Vulnerabilities[i].CVSSScore = extractBestCVSSScore(entry.v)
		// Same problem applied to the fix-version: querybatch never
		// returned `affected[].ranges` so extractFixedVersion ran on
		// an empty struct in the batch path and left FixedIn="". The
		// pulse "(fix: X.Y.Z)" suffix never showed up, even on
		// advisories where the fix existed. Re-run on the hydrated
		// record so users see the upgrade target inline.
		if result.Vulnerabilities[i].FixedIn == "" {
			current := cleanVersion(result.Vulnerabilities[i].Version)
			if fix := extractFixedVersionFor(entry.v, current); fix != "" {
				result.Vulnerabilities[i].FixedIn = fix
			}
		}
		// OSV exposes supply-chain malware as either MAL-* IDs (newer
		// PyPI / npm advisories) or summary text containing "malicious"
		// / "credential" stealer language on legacy GHSA records. We
		// normalise both into the Malicious bool.
		result.Vulnerabilities[i].Malicious = isMaliciousAdvisory(
			result.Vulnerabilities[i].ID,
			entry.v.Summary,
		)
	}

	// Count by severity
	seen := make(map[string]bool)
	for _, v := range result.Vulnerabilities {
		if !seen[v.Package+":"+v.ID] {
			seen[v.Package+":"+v.ID] = true
			switch v.Severity {
			case "CRITICAL":
				result.Critical++
			case "HIGH":
				result.High++
			case "MODERATE":
				result.Moderate++
			default:
				result.Low++
			}
		}
	}
	result.VulnerableDeps = countUnique(result.Vulnerabilities)

	return result, nil
}

func countUnique(vulns []Vulnerability) int {
	seen := make(map[string]bool)
	for _, v := range vulns {
		seen[v.Package] = true
	}
	return len(seen)
}

func cleanVersion(v string) string {
	// Strip common version prefixes
	v = strings.TrimLeft(v, "^~>=<! ")
	// Take first version if range (e.g. "1.2.3 || 2.0.0" -> "1.2.3")
	if idx := strings.IndexAny(v, " |,"); idx > 0 {
		v = v[:idx]
	}
	// Skip empty or path references
	if v == "" || strings.HasPrefix(v, "/") || strings.HasPrefix(v, ".") {
		return ""
	}
	return v
}

// OSV API types
type osvQuery struct {
	Package osvPackage `json:"package"`
	Version string     `json:"version"`
}

type osvPackage struct {
	Name      string `json:"name"`
	Ecosystem string `json:"ecosystem"`
}

type osvBatchRequest struct {
	Queries []osvQuery `json:"queries"`
}

type osvBatchResponse struct {
	Results []osvResult `json:"results"`
}

type osvResult struct {
	Vulns []osvVuln `json:"vulns"`
}

type osvVuln struct {
	ID         string        `json:"id"`
	Summary    string        `json:"summary"`
	Details    string        `json:"details"`
	Severity   []osvSeverity `json:"severity"`
	Affected   []osvAffected `json:"affected"`
	References []osvRef      `json:"references"`
	Published  string        `json:"published"`
	// DatabaseSpecific is GitHub's location for the textual GHSA
	// severity ("CRITICAL" / "HIGH" / "MODERATE" / "LOW"). The
	// top-level severity[] array is empty for the bulk of GHSA
	// advisories, so without reading this field every GHSA collapsed
	// to MODERATE via the fallback below — observed live: 261/261
	// vulns rated MODERATE on a real org because we never looked
	// here.
	DatabaseSpecific osvDatabaseSpecific `json:"database_specific"`
}

type osvDatabaseSpecific struct {
	Severity string `json:"severity"`
}

type osvSeverity struct {
	Type  string `json:"type"`
	Score string `json:"score"`
}

type osvAffected struct {
	Package osvAffectedPkg `json:"package"`
	Ranges  []osvRange     `json:"ranges"`
}

type osvAffectedPkg struct {
	Name      string `json:"name"`
	Ecosystem string `json:"ecosystem"`
}

type osvRange struct {
	Events []osvEvent `json:"events"`
}

type osvEvent struct {
	Fixed      string `json:"fixed,omitempty"`
	Introduced string `json:"introduced,omitempty"`
}

type osvRef struct {
	Type string `json:"type"`
	URL  string `json:"url"`
}

func queryOSV(queries []osvQuery, deps []Dependency) ([]Vulnerability, error) {
	body, err := json.Marshal(osvBatchRequest{Queries: queries})
	if err != nil {
		return nil, err
	}

	client := httpx.New(30 * time.Second)
	resp, err := client.Post(osvAPI(), "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("osv request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("osv status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var batchResp osvBatchResponse
	if err := json.NewDecoder(resp.Body).Decode(&batchResp); err != nil {
		return nil, fmt.Errorf("osv decode: %w", err)
	}

	var vulns []Vulnerability
	for i, result := range batchResp.Results {
		if i >= len(deps) {
			break
		}
		dep := deps[i]
		for _, v := range result.Vulns {
			severity := classifySeverity(v)
			cvssScore := extractBestCVSSScore(v)
			fixedIn := extractFixedVersionFor(v, cleanVersion(dep.Version))
			refs := make([]string, 0, len(v.References))
			for _, r := range v.References {
				refs = append(refs, r.URL)
			}
			vulns = append(vulns, Vulnerability{
				ID:         v.ID,
				Summary:    v.Summary,
				Severity:   severity,
				CVSSScore:  cvssScore,
				Package:    dep.Name,
				Version:    dep.Version,
				FixedIn:    fixedIn,
				References: refs,
				Published:  v.Published,
			})
		}
	}

	return vulns, nil
}

// isMaliciousAdvisory returns true when the advisory describes the
// package itself as a supply-chain attack rather than a flaw in
// legitimate code. Two signals:
//
//  1. ID prefix "MAL-" — OSV's dedicated malicious-package namespace.
//  2. Summary text — older GHSA records lack the prefix but say
//     "malicious package", "typosquat", "credential stealer", etc.
//
// Conservative match: only surface when both ID and summary suggest
// malware risk so we don't tag legit-but-bad-name packages.
func isMaliciousAdvisory(id, summary string) bool {
	if strings.HasPrefix(strings.ToUpper(id), "MAL-") {
		return true
	}
	s := strings.ToLower(summary)
	for _, keyword := range []string{
		"malicious package",
		"typosquat",
		"typo-squat",
		"credential stealer",
		"credential-stealing",
		"supply chain attack",
		"dependency confusion",
		"backdoor",
		"exfiltrat",
	} {
		if strings.Contains(s, keyword) {
			return true
		}
	}
	return false
}

func classifySeverity(v osvVuln) string {
	// 1. Prefer CVSS scores when a numeric score can actually be
	//    extracted (V3 or V4 — newer GHSAs use V4). OSV often
	//    publishes the full CVSS *vector* without a trailing score
	//    (e.g. "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N"). When
	//    that happens extractCVSSScore returns 0 — without this
	//    score-presence guard we'd collapse every such advisory to
	//    LOW. Skip and let the next branch take over.
	for _, s := range v.Severity {
		if s.Type != "CVSS_V3" && s.Type != "CVSS_V4" {
			continue
		}
		score := extractCVSSScore(s.Score)
		if score <= 0 {
			continue
		}
		switch {
		case score >= 9.0:
			return "CRITICAL"
		case score >= 7.0:
			return "HIGH"
		case score >= 4.0:
			return "MODERATE"
		default:
			return "LOW"
		}
	}
	// 2. GHSA ships textual severity in database_specific.severity,
	//    even when the top-level severity[] is empty OR carries a
	//    score-less vector. Without this branch every advisory
	//    without an extractable CVSS score collapsed to MODERATE
	//    (or LOW after the score-presence fix) — production saw
	//    261/261 CVEs rated MODERATE on a real org because we never
	//    looked here.
	if ds := strings.ToUpper(strings.TrimSpace(v.DatabaseSpecific.Severity)); ds != "" {
		switch ds {
		case "CRITICAL", "HIGH", "MODERATE", "MEDIUM", "LOW":
			if ds == "MEDIUM" {
				return "MODERATE"
			}
			return ds
		}
	}
	// 3. Final fallback: GHSAs without CVSS or textual severity are
	//    rare but exist (older advisories). MODERATE is a safer
	//    default than LOW because GitHub-reviewed GHSAs are
	//    moderate-or-worse by curation.
	if strings.HasPrefix(v.ID, "GHSA-") {
		return "MODERATE"
	}
	return "LOW"
}

// cvssScoreRE finds the trailing numeric score in CVSS strings.
// Real OSV responses look like
//
//	"CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H 9.8"
//
// — the score is a space-separated float at the end. Some sources
// emit just the bare float "9.8". Both shapes need to parse to 9.8.
var cvssScoreRE = regexp.MustCompile(`\b(\d+(?:\.\d+)?)\s*$`)

// extractBestCVSSScore returns the best available numeric CVSS score (0-10)
// from an OSV vulnerability record. Returns 0 if no score extractable.
func extractBestCVSSScore(v osvVuln) float64 {
	for _, s := range v.Severity {
		if s.Type != "CVSS_V3" && s.Type != "CVSS_V4" {
			continue
		}
		score := extractCVSSScore(s.Score)
		if score > 0 {
			return score
		}
	}
	return 0
}

func extractCVSSScore(s string) float64 {
	// Try the plain-float case first — fast path for sources that
	// give us "9.8" directly.
	var score float64
	if _, err := fmt.Sscanf(strings.TrimSpace(s), "%f", &score); err == nil && score > 0 {
		return score
	}
	// Fall back to the vector-string form. Match a trailing decimal,
	// e.g. ".../A:H 9.8" → "9.8".
	if m := cvssScoreRE.FindStringSubmatch(s); m != nil {
		_, _ = fmt.Sscanf(m[1], "%f", &score)
		if score > 0 {
			return score
		}
	}
	return 0
}

// fetchVulnSummary gets summary + details for a single vuln ID from OSV.
// fetchVulnFull pulls the complete OSV record for one vulnerability.
// /v1/querybatch returns IDs only; this endpoint is the source of
// truth for severity[], database_specific, summary, references, etc.
// The bool return is the "did we actually get a record" flag —
// callers shouldn't trust the returned osvVuln when it's false
// (don't re-classify severity on an empty record).
func fetchVulnFull(vulnID string) (osvVuln, bool) {
	client := httpx.New(10 * time.Second)
	resp, err := client.Get(endpoints.OSVAPI() + "/v1/vulns/" + vulnID)
	if err != nil {
		return osvVuln{}, false
	}
	// Honour rate-limit signals — OSV returns 429 + Retry-After
	// when we burst past the public quota. Don't loop on the
	// next call; consume the body so the conn returns to the
	// pool and bail. Caller decides whether to retry next pass.
	if resp.StatusCode == 429 {
		_ = resp.Body.Close()
		return osvVuln{}, false
	}
	if resp.StatusCode != 200 {
		_ = resp.Body.Close()
		return osvVuln{}, false
	}
	defer resp.Body.Close()
	var v osvVuln
	if err := json.NewDecoder(resp.Body).Decode(&v); err != nil {
		return osvVuln{}, false
	}
	// OSV always echoes back the ID it was queried for. Empty ID
	// means the response wasn't actually a vuln record (e.g. test
	// stub default, mirror returning an error envelope).
	if v.ID == "" {
		return osvVuln{}, false
	}
	if v.Summary == "" && v.Details != "" {
		d := v.Details
		if len(d) > 200 {
			d = d[:200] + "..."
		}
		v.Summary = d
	}
	return v, true
}

func extractFixedVersion(v osvVuln) string {
	return extractFixedVersionFor(v, "")
}

func extractFixedVersionFor(v osvVuln, current string) string {
	ranges := make([][]osvutil.Event, 0, len(v.Affected))
	for _, a := range v.Affected {
		for _, r := range a.Ranges {
			events := make([]osvutil.Event, 0, len(r.Events))
			for _, e := range r.Events {
				events = append(events, osvutil.Event{
					Introduced: e.Introduced,
					Fixed:      e.Fixed,
				})
			}
			if len(events) > 0 {
				ranges = append(ranges, events)
			}
		}
	}
	return osvutil.SelectFixedVersion(current, ranges)
}
