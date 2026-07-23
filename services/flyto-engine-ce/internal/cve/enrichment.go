// Package cve — EPSS + CISA KEV enrichment for CVE findings.
//
// EPSS (Exploit Prediction Scoring System) provides a probability score
// (0.0-1.0) indicating how likely a CVE is to be exploited in the wild.
// CISA KEV (Known Exploited Vulnerabilities) is the authoritative catalog
// of CVEs actively exploited in the wild — presence = confirmed threat.
//
// Together they let us answer "should I fix this now?" instead of just
// "is this CVSS score high?".
package cve

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	neturl "net/url"
	"strings"
	"sync"
	"time"

	"github.com/flytohub/flyto-engine/internal/httpx"
)

var _ = sync.RWMutex{} // keep sync import — used by ghsaCVEAlias above

// ── EPSS ──────────────────────────────────────────

// EPSSEntry holds the EPSS score for a single CVE.
type EPSSEntry struct {
	CVE        string  `json:"cve"`
	EPSS       float64 `json:"epss"`       // 0.0-1.0 probability of exploitation
	Percentile float64 `json:"percentile"` // 0.0-1.0 (0.95 = top 5%)
}

// FetchEPSS queries the FIRST EPSS API for a batch of CVE IDs.
// Returns a map of cveID → EPSSEntry. Missing CVEs are omitted.
// API: https://api.first.org/data/v1/epss?cve=CVE-xxxx,CVE-yyyy
// ghsaCVEAlias is a process-local cache of GHSA-id → CVE-id
// resolutions. OSV's /v1/vulns/{id} endpoint returns the full
// vuln record including its CVE aliases; we cache because the
// same GHSA shows up across many repos and we don't want to
// burn N OSV calls. Cleared on process restart (intentional —
// OSV records do change as advisories get updated).
var ghsaCVEAlias = struct {
	sync.RWMutex
	m map[string]string
}{m: make(map[string]string)}

// resolveGHSAtoCVE pulls the CVE alias out of an OSV record's
// aliases list. Returns empty when the GHSA has no CVE counterpart
// (e.g. older GHSAs that never got assigned). Cached.
func resolveGHSAtoCVE(ghsaID string) string {
	if !strings.HasPrefix(ghsaID, "GHSA-") {
		return ""
	}
	ghsaCVEAlias.RLock()
	if v, ok := ghsaCVEAlias.m[ghsaID]; ok {
		ghsaCVEAlias.RUnlock()
		return v
	}
	ghsaCVEAlias.RUnlock()

	client := httpx.New(8 * time.Second)
	resp, err := client.Get("https://api.osv.dev/v1/vulns/" + neturl.QueryEscape(ghsaID))
	if err != nil || resp.StatusCode != 200 {
		if resp != nil {
			resp.Body.Close()
		}
		// Cache the miss as empty so we don't retry for this run.
		ghsaCVEAlias.Lock()
		ghsaCVEAlias.m[ghsaID] = ""
		ghsaCVEAlias.Unlock()
		return ""
	}
	defer resp.Body.Close()
	var rec struct {
		Aliases []string `json:"aliases"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&rec); err != nil {
		return ""
	}
	var found string
	for _, a := range rec.Aliases {
		if strings.HasPrefix(a, "CVE-") {
			found = a
			break
		}
	}
	ghsaCVEAlias.Lock()
	ghsaCVEAlias.m[ghsaID] = found
	ghsaCVEAlias.Unlock()
	return found
}

func FetchEPSS(cveIDs []string) map[string]EPSSEntry {
	if len(cveIDs) == 0 {
		return nil
	}

	// EPSS only knows CVE-* ids. OSV usually gives us GHSA-*; for
	// those we resolve the CVE alias via OSV's /vulns/{id} endpoint
	// first, then EPSS-lookup the alias. Without this the EPSS map
	// was always empty for the typical npm/PyPI advisory feed.
	var cveOnly []string
	// Map back from the CVE we queried → the original ID(s) the
	// caller passed. Lets us return the EPSS entry keyed by both
	// the CVE and the original GHSA so caller-side lookups by
	// either id resolve.
	origByCVE := map[string][]string{}
	for _, id := range cveIDs {
		if strings.HasPrefix(id, "CVE-") {
			cveOnly = append(cveOnly, id)
			origByCVE[id] = append(origByCVE[id], id)
			continue
		}
		if strings.HasPrefix(id, "GHSA-") {
			alias := resolveGHSAtoCVE(id)
			if alias == "" {
				continue
			}
			cveOnly = append(cveOnly, alias)
			origByCVE[alias] = append(origByCVE[alias], id)
		}
	}
	if len(cveOnly) == 0 {
		return nil
	}

	result := make(map[string]EPSSEntry)

	// EPSS API supports comma-separated CVE IDs, batch up to 100
	const batchSize = 100
	for i := 0; i < len(cveOnly); i += batchSize {
		end := i + batchSize
		if end > len(cveOnly) {
			end = len(cveOnly)
		}
		batch := cveOnly[i:end]

		// URL-escape each CVE ID to prevent query parameter injection
		escaped := make([]string, len(batch))
		for j, id := range batch {
			escaped[j] = neturl.QueryEscape(id)
		}
		epssURL := fmt.Sprintf("https://api.first.org/data/v1/epss?cve=%s", strings.Join(escaped, ","))
		client := httpx.New(15 * time.Second)
		resp, err := client.Get(epssURL)
		if err != nil {
			slog.Warn("cve: EPSS fetch failed", "error", err, "batch_size", len(batch))
			continue
		}
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, 512*1024))
		resp.Body.Close()
		if readErr != nil {
			slog.Warn("cve: EPSS read failed", "error", readErr)
			continue
		}

		if resp.StatusCode != 200 {
			slog.Warn("cve: EPSS status", "status", resp.StatusCode)
			continue
		}

		var apiResp struct {
			Data []struct {
				CVE        string `json:"cve"`
				EPSS       string `json:"epss"`
				Percentile string `json:"percentile"`
			} `json:"data"`
		}
		if err := json.Unmarshal(body, &apiResp); err != nil {
			slog.Warn("cve: EPSS parse failed", "error", err)
			continue
		}

		for _, d := range apiResp.Data {
			var epss, pct float64
			if _, err := fmt.Sscanf(d.EPSS, "%f", &epss); err != nil {
				slog.Warn("cve: EPSS score parse failed", "cve", d.CVE, "value", d.EPSS)
				continue
			}
			if _, err := fmt.Sscanf(d.Percentile, "%f", &pct); err != nil {
				pct = 0 // percentile is optional, score is mandatory
			}
			entry := EPSSEntry{
				CVE:        d.CVE,
				EPSS:       epss,
				Percentile: pct,
			}
			// Mirror the EPSS entry under EVERY original ID the
			// caller passed (CVE + any GHSA aliases that resolved
			// to this CVE). So a caller that asked about GHSA-abcd
			// can still find the score in the result map.
			result[d.CVE] = entry
			for _, orig := range origByCVE[d.CVE] {
				if orig != d.CVE {
					result[orig] = entry
				}
			}
		}
	}

	slog.Info("cve: EPSS enrichment complete", "queried", len(cveOnly), "found", len(result))
	return result
}

// ── CISA KEV ──────────────────────────────────────

// KEVEntry represents a single entry in the CISA KEV catalog.
type KEVEntry struct {
	CVEID           string `json:"cveID"`
	VendorProject   string `json:"vendorProject"`
	Product         string `json:"product"`
	VulnName        string `json:"vulnerabilityName"`
	DateAdded       string `json:"dateAdded"`
	DueDate         string `json:"dueDate"`
	KnownRansomware string `json:"knownRansomwareCampaignUse"`
}

// KEVCache is a thread-safe in-memory cache of the CISA KEV catalog.
// Refreshed every 24 hours by the worker.
type KEVCache struct {
	mu      sync.RWMutex
	entries map[string]*KEVEntry // cveID → entry
	loaded  time.Time
}

// NewKEVCache creates an empty cache. Call Refresh() to populate.
func NewKEVCache() *KEVCache {
	return &KEVCache{entries: make(map[string]*KEVEntry)}
}

// Refresh downloads the full KEV catalog from CISA and replaces the
// cache. Takes ctx so SIGTERM / loop-shutdown cancels the in-flight
// HTTP fetch — without the request context, a blocking Get() can
// outlive RunKEVCacheLoop's ctx.Done() handling by the full 30s
// client timeout, and the goroutine leaks past server shutdown.
func (c *KEVCache) Refresh(ctx context.Context) error {
	url := "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
	client := httpx.New(30 * time.Second)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("KEV request: %w", err)
	}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("KEV fetch: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("KEV status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 10*1024*1024)) // cap 10MB
	if err != nil {
		return fmt.Errorf("KEV read: %w", err)
	}

	var catalog struct {
		Vulnerabilities []KEVEntry `json:"vulnerabilities"`
	}
	if err := json.Unmarshal(body, &catalog); err != nil {
		return fmt.Errorf("KEV parse: %w", err)
	}

	entries := make(map[string]*KEVEntry, len(catalog.Vulnerabilities))
	for i := range catalog.Vulnerabilities {
		entries[catalog.Vulnerabilities[i].CVEID] = &catalog.Vulnerabilities[i]
	}

	c.mu.Lock()
	c.entries = entries
	c.loaded = time.Now()
	c.mu.Unlock()

	slog.Info("cve: KEV cache refreshed", "count", len(entries))
	return nil
}

// Lookup returns the KEV entry for a CVE ID, or nil if not in KEV.
func (c *KEVCache) Lookup(cveID string) *KEVEntry {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.entries[cveID]
}

// Contains returns true if the CVE is in the KEV catalog.
func (c *KEVCache) Contains(cveID string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	_, ok := c.entries[cveID]
	return ok
}

// Count returns the number of entries in the cache.
func (c *KEVCache) Count() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.entries)
}

// RunKEVCacheLoop refreshes the KEV cache on startup (with retry)
// and every interval. Respects ctx so SIGTERM cancels the loop
// and the goroutine doesn't outlive the server's shutdown grace
// window — audit 2026-05-17 flagged context.Background() at the
// caller as a goroutine leak vector.
func RunKEVCacheLoop(ctx context.Context, cache *KEVCache, interval time.Duration) {
	// Initial load with 3 retries — avoid false negatives for the first 24h
	for attempt := 1; attempt <= 3; attempt++ {
		if ctx.Err() != nil {
			return
		}
		if err := cache.Refresh(ctx); err != nil {
			slog.Warn("cve: KEV load attempt failed", "attempt", attempt, "error", err)
			if attempt < 3 {
				select {
				case <-ctx.Done():
					return
				case <-time.After(time.Duration(attempt*10) * time.Second):
				}
			}
		} else {
			break
		}
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := cache.Refresh(ctx); err != nil {
				slog.Warn("cve: KEV refresh failed", "error", err)
			}
		}
	}
}

// ── Risk Score Computation ────────────────────────

// ComputeRiskScore computes a 0-100 risk score for a vulnerability
// using CVSS severity + EPSS probability + KEV status + external exposure.
func ComputeRiskScore(severity string, epss float64, inKEV, externalExposed bool) int {
	score := 0

	// CVSS severity base
	switch strings.ToUpper(severity) {
	case "CRITICAL":
		score += 30
	case "HIGH":
		score += 20
	case "MODERATE", "MEDIUM":
		score += 10
	case "LOW":
		score += 5
	}

	// EPSS exploitation probability
	if epss > 0.5 {
		score += 25 // top 50% — very likely to be exploited
	} else if epss > 0.1 {
		score += 15 // top 90%
	} else if epss > 0.01 {
		score += 5 // top 99%
	}

	// CISA KEV — actively exploited in the wild
	if inKEV {
		score += 25
	}

	// External exposure — Shodan reports same CVE on external IP
	if externalExposed {
		score += 20
	}

	if score > 100 {
		score = 100
	}
	return score
}

// EnrichVulnerabilities enriches a slice of vulnerabilities with EPSS, KEV,
// external exposure, and risk score data. Modifies in-place.
func EnrichVulnerabilities(vulns []Vulnerability, kevCache *KEVCache, externalCVEs map[string]bool) {
	// Collect all CVE IDs for batch EPSS query
	var cveIDs []string
	for _, v := range vulns {
		cveIDs = append(cveIDs, v.ID)
	}

	// Fetch EPSS scores in batch
	epssMap := FetchEPSS(cveIDs)

	// Enrich each vulnerability
	for i := range vulns {
		v := &vulns[i]

		// EPSS
		if entry, ok := epssMap[v.ID]; ok {
			v.EPSS = entry.EPSS
			v.EPSSPercentile = entry.Percentile
		}

		// KEV
		if kevCache != nil {
			v.InKEV = kevCache.Contains(v.ID)
		}

		// External exposure
		if externalCVEs != nil {
			v.ExternalExposed = externalCVEs[v.ID]
		}

		// Risk score
		v.RiskScore = ComputeRiskScore(v.Severity, v.EPSS, v.InKEV, v.ExternalExposed)
	}
}
