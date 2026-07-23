// Package findingimport parses external-scanner output (SARIF today; Trivy-JSON
// and others slot in later via the same ImportedFinding contract) into a
// normalized, store-agnostic shape the handler layer maps onto the finding
// model (code_alerts / external_issue_tracker).
//
// Why a dedicated pure package: enterprise vuln-mgmt is a consolidation layer.
// A customer's existing scanner already emits findings; re-running our own
// scanner is wasteful and loses their tuning. SARIF (Static Analysis Results
// Interchange Format, an OASIS standard — schema 2.1.0) is the lingua franca
// most SAST/SCA/secret scanners can export, so importing SARIF folds that
// output onto the platform's finding model and CTEM pipeline.
//
// This file is PURE (io.Reader in, []ImportedFinding out) so the parse +
// severity/fingerprint mapping is golden-testable with a constructed
// spec-valid sample, independent of the DB. Persistence + authz live in the
// api layer (handlers_findings_import.go).
package findingimport

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"strings"
)

// Scanner source label stamped onto every finding produced by ParseSARIF, so
// imported findings are distinguishable from native scans and the cross-source
// dup-merge (P3 Vuln slice 3) can fold a SARIF dup with a native one.
const ScannerSARIF = "sarif"

// ImportedFinding is the normalized, vendor-neutral finding a parser emits.
// The api layer maps it onto store.CodeAlert (the natural target — SARIF is
// rule + file:line shaped) or external_issue_tracker for host-shaped results.
//
// It is intentionally NOT a store type: keeping the parser store-agnostic lets
// the same ImportedFinding contract serve every future format (Trivy-JSON =
// slice 6b) without the parser package importing the store.
type ImportedFinding struct {
	// RuleID is the scanner's rule identifier (e.g. "go/sql-injection",
	// "CVE-2024-1234"). Part of the stable fingerprint basis.
	RuleID string

	// Title is a short human label — the rule name, or the rule id when the
	// rule carries no friendlier name.
	Title string

	// Description is the result message text (the finding's body).
	Description string

	// Severity is the normalized enum: critical | high | medium | low | info.
	// Derived from SARIF level + rank + the rule's security-severity property
	// (see severityFromSARIF for the mapping table).
	Severity string

	// File / StartLine locate the finding in source. Empty / zero when the
	// result carries no physical location (e.g. a project-level result).
	File      string
	StartLine int

	// CVE is the associated CVE id when the rule advertises one (via
	// rule.properties.cve or a "CVE-…"/"external/cwe/…" tag). Empty otherwise.
	CVE string

	// Fingerprint is STABLE across re-imports so persistence is idempotent
	// (no duplicate pile-up) and the dup-merge has a stable key. Prefers the
	// SARIF-provided partialFingerprints/fingerprints when present, else
	// derived from (ruleId, file, startLine). See fingerprintFor.
	Fingerprint string

	// Scanner is the source label (ScannerSARIF) — stamped so imported
	// findings are distinguishable + cross-scanner merge can identify them.
	Scanner string

	// Category is the optional finding-category hint a parser can set to steer
	// the persist target's resource-attach (e.g. "cve" → the package_version
	// path, "secret"/"iac" → file-path resolution). Empty when the parser has
	// no category opinion, in which case the handler falls back to a per-format
	// default. ParseSARIF leaves this empty (SARIF is uniformly SAST-shaped →
	// the handler defaults it to "sast"); ParseTrivy sets it per result kind.
	Category string

	// Suppressed reports whether the SARIF result carried a suppression
	// (result.suppressions non-empty). The handler does NOT import suppressed
	// results as open findings — they're counted as skipped. Surfaced here
	// (rather than dropped in the parser) so the caller decides policy and the
	// golden test can assert the parser SAW the suppression.
	Suppressed bool
}

// ---- SARIF 2.1.0 schema subset (only the fields we consume) ----

type sarifLog struct {
	Version string     `json:"version"`
	Runs    []sarifRun `json:"runs"`
}

type sarifRun struct {
	Tool    sarifTool     `json:"tool"`
	Results []sarifResult `json:"results"`
}

type sarifTool struct {
	Driver sarifDriver `json:"driver"`
}

type sarifDriver struct {
	Name  string      `json:"name"`
	Rules []sarifRule `json:"rules"`
}

type sarifRule struct {
	ID               string         `json:"id"`
	Name             string         `json:"name"`
	ShortDescription sarifText      `json:"shortDescription"`
	Properties       sarifRuleProps `json:"properties"`
}

type sarifRuleProps struct {
	// SecuritySeverity is a CVSS-like 0-10 string ("9.8"), the SARIF
	// convention (used by CodeQL et al.) for conveying severity.
	SecuritySeverity string   `json:"security-severity"`
	Tags             []string `json:"tags"`
	CVE              string   `json:"cve"`
}

type sarifResult struct {
	RuleID              string                     `json:"ruleId"`
	RuleIndex           *int                       `json:"ruleIndex"`
	Level               string                     `json:"level"`
	Rank                *float64                   `json:"rank"`
	Message             sarifText                  `json:"message"`
	Locations           []sarifLocation            `json:"locations"`
	PartialFingerprints map[string]string          `json:"partialFingerprints"`
	Fingerprints        map[string]string          `json:"fingerprints"`
	Suppressions        []sarifSuppression         `json:"suppressions"`
	Properties          map[string]json.RawMessage `json:"properties"`
}

type sarifSuppression struct {
	Kind   string `json:"kind"`
	Status string `json:"status"`
}

type sarifText struct {
	Text string `json:"text"`
}

type sarifLocation struct {
	PhysicalLocation sarifPhysicalLocation `json:"physicalLocation"`
}

type sarifPhysicalLocation struct {
	ArtifactLocation sarifArtifactLocation `json:"artifactLocation"`
	Region           sarifRegion           `json:"region"`
}

type sarifArtifactLocation struct {
	URI string `json:"uri"`
}

type sarifRegion struct {
	StartLine int `json:"startLine"`
}

// ParseSARIF reads a SARIF 2.1.0 document and returns one ImportedFinding per
// result across every run/tool. It tolerates missing optional fields, multiple
// runs/tools, and absent rule metadata. It does NOT drop suppressed results —
// they're returned with Suppressed=true so the caller owns the import policy.
//
// Errors are returned, never swallowed (Gate D): a malformed body is a 400 at
// the handler, not a silent empty import.
func ParseSARIF(r io.Reader) ([]ImportedFinding, error) {
	if r == nil {
		return nil, fmt.Errorf("sarif: nil reader")
	}
	var doc sarifLog
	dec := json.NewDecoder(r)
	if err := dec.Decode(&doc); err != nil {
		return nil, fmt.Errorf("sarif: decode: %w", err)
	}
	if len(doc.Runs) == 0 {
		return nil, fmt.Errorf("sarif: no runs in document")
	}

	var out []ImportedFinding
	for ri := range doc.Runs {
		run := &doc.Runs[ri]
		// Index the run's rule metadata by id (and by ordinal, so a result
		// referencing ruleIndex but no ruleId still resolves). SARIF lets a
		// result reference its rule by id OR by index into driver.rules.
		rulesByID := make(map[string]*sarifRule, len(run.Tool.Driver.Rules))
		for i := range run.Tool.Driver.Rules {
			rl := &run.Tool.Driver.Rules[i]
			if rl.ID != "" {
				rulesByID[rl.ID] = rl
			}
		}
		for i := range run.Results {
			res := &run.Results[i]
			rule := resolveRule(run, res, rulesByID)
			out = append(out, normalizeResult(res, rule))
		}
	}
	return out, nil
}

// resolveRule finds the rule metadata for a result, by ruleId first then by
// ruleIndex. Returns nil when neither resolves (result with no rule metadata).
func resolveRule(run *sarifRun, res *sarifResult, byID map[string]*sarifRule) *sarifRule {
	if res.RuleID != "" {
		if rl, ok := byID[res.RuleID]; ok {
			return rl
		}
	}
	if res.RuleIndex != nil {
		idx := *res.RuleIndex
		if idx >= 0 && idx < len(run.Tool.Driver.Rules) {
			return &run.Tool.Driver.Rules[idx]
		}
	}
	return nil
}

func normalizeResult(res *sarifResult, rule *sarifRule) ImportedFinding {
	ruleID := res.RuleID
	if ruleID == "" && rule != nil {
		ruleID = rule.ID
	}

	file, line := locationOf(res)

	f := ImportedFinding{
		RuleID:      ruleID,
		Title:       titleFor(ruleID, rule),
		Description: strings.TrimSpace(res.Message.Text),
		Severity:    severityFromSARIF(res, rule),
		File:        file,
		StartLine:   line,
		CVE:         cveFor(rule),
		Scanner:     ScannerSARIF,
		Suppressed:  isSuppressed(res),
	}
	f.Fingerprint = fingerprintFor(res, ruleID, file, line)
	return f
}

func titleFor(ruleID string, rule *sarifRule) string {
	if rule != nil {
		if rule.Name != "" {
			return rule.Name
		}
		if rule.ShortDescription.Text != "" {
			return rule.ShortDescription.Text
		}
	}
	return ruleID
}

// locationOf returns the first physical location's file uri + startLine.
// SARIF allows multiple locations; the first is the primary finding site,
// matching how scanners (CodeQL, Semgrep) emit the anchor location first.
func locationOf(res *sarifResult) (string, int) {
	for i := range res.Locations {
		pl := res.Locations[i].PhysicalLocation
		if uri := strings.TrimSpace(pl.ArtifactLocation.URI); uri != "" {
			return uri, pl.Region.StartLine
		}
	}
	return "", 0
}

// cveFor extracts a CVE id from the rule, preferring the explicit
// properties.cve, falling back to a "CVE-…" tag. Empty when the rule
// advertises none — most SAST rules are CWE-shaped, not CVE-shaped.
func cveFor(rule *sarifRule) string {
	if rule == nil {
		return ""
	}
	if cve := strings.TrimSpace(rule.Properties.CVE); cve != "" {
		return cve
	}
	for _, tag := range rule.Properties.Tags {
		t := strings.TrimSpace(tag)
		if strings.HasPrefix(strings.ToUpper(t), "CVE-") {
			return t
		}
	}
	return ""
}

func isSuppressed(res *sarifResult) bool {
	// A SARIF result is suppressed when it carries any suppression whose
	// status is not "rejected". Per spec, status ∈ {accepted, underReview,
	// rejected}; absent status defaults to accepted. A "rejected" suppression
	// means the suppression itself was declined → the result is NOT suppressed.
	for _, s := range res.Suppressions {
		if strings.EqualFold(strings.TrimSpace(s.Status), "rejected") {
			continue
		}
		return true
	}
	return false
}

// severityFromSARIF maps SARIF severity signals onto the platform enum.
//
// Precedence (strongest signal first):
//  1. rule.properties.security-severity — a CVSS-like 0-10 score, the richest
//     signal (CodeQL/GitHub convention). 9.0+→critical, 7.0+→high,
//     4.0+→medium, >0→low.
//  2. result.rank — SARIF's 0-100 priority. 80+→critical, 50+→high,
//     20+→medium, else low. (Only consulted when no security-severity.)
//  3. result.level — error→high, warning→medium, note/none→low. The coarse
//     fallback every SARIF result has.
//
// Default when nothing is present: medium (a finding with no severity signal
// is not safe to assume low — consolidation should surface it, not bury it).
func severityFromSARIF(res *sarifResult, rule *sarifRule) string {
	if rule != nil {
		if s, ok := severityFromSecuritySeverity(rule.Properties.SecuritySeverity); ok {
			return s
		}
	}
	if res.Rank != nil {
		return severityFromRank(*res.Rank)
	}
	switch strings.ToLower(strings.TrimSpace(res.Level)) {
	case "error":
		return "high"
	case "warning":
		return "medium"
	case "note", "none":
		return "low"
	}
	return "medium"
}

func severityFromSecuritySeverity(raw string) (string, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", false
	}
	v, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return "", false
	}
	switch {
	case v >= 9.0:
		return "critical", true
	case v >= 7.0:
		return "high", true
	case v >= 4.0:
		return "medium", true
	case v > 0:
		return "low", true
	default:
		return "info", true
	}
}

func severityFromRank(rank float64) string {
	switch {
	case rank >= 80:
		return "critical"
	case rank >= 50:
		return "high"
	case rank >= 20:
		return "medium"
	default:
		return "low"
	}
}

// fingerprintFor produces a STABLE per-finding fingerprint, idempotent across
// re-imports so persistence (CreateCodeAlert ON CONFLICT org_id,fingerprint)
// updates rather than duplicates.
//
// Basis precedence:
//  1. SARIF-provided fingerprints/partialFingerprints when present — these are
//     the scanner's own stable identity (survives line shifts), the strongest
//     dedup key. We hash a sorted join of them with the ruleId.
//  2. Otherwise (ruleId, file, startLine) — the spec-recommended fallback
//     identity for a result that carries no fingerprints.
//
// Prefixed "sarif:" before hashing so a SARIF finding's key can't collide with
// a native scan's key by accident while still being a stable, comparable basis
// for the cross-source dup-merge (which compares normalized identity, not the
// raw hash).
func fingerprintFor(res *sarifResult, ruleID, file string, line int) string {
	var basis string
	if fps := joinFingerprints(res.PartialFingerprints, res.Fingerprints); fps != "" {
		basis = "fp|" + ruleID + "|" + fps
	} else {
		basis = "loc|" + ruleID + "|" + file + "|" + strconv.Itoa(line)
	}
	h := sha256.Sum256([]byte("sarif:" + basis))
	return fmt.Sprintf("%x", h)
}

// joinFingerprints renders the SARIF partialFingerprints (and the rarer
// fingerprints) maps into a deterministic, sort-stable string. Returns "" when
// both maps are empty.
func joinFingerprints(partial, full map[string]string) string {
	merged := make(map[string]string, len(partial)+len(full))
	for k, v := range partial {
		merged[k] = v
	}
	// full (result.fingerprints — end-user computed) overrides partial on a key
	// clash; both are stable, full is the stronger signal.
	for k, v := range full {
		merged[k] = v
	}
	if len(merged) == 0 {
		return ""
	}
	keys := make([]string, 0, len(merged))
	for k := range merged {
		keys = append(keys, k)
	}
	sortStrings(keys)
	var b strings.Builder
	for i, k := range keys {
		if i > 0 {
			b.WriteByte(';')
		}
		b.WriteString(k)
		b.WriteByte('=')
		b.WriteString(merged[k])
	}
	return b.String()
}

// sortStrings is a tiny insertion sort — avoids pulling sort just for a handful
// of fingerprint keys, keeps the package's import surface minimal.
func sortStrings(s []string) {
	for i := 1; i < len(s); i++ {
		for j := i; j > 0 && s[j-1] > s[j]; j-- {
			s[j-1], s[j] = s[j], s[j-1]
		}
	}
}
