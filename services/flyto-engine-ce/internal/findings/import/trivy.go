package findingimport

// trivy.go — Trivy-JSON external-scanner import (P3 Vuln slice 6b). Slots into
// the SARIF import framework (slice 6a) via the SAME ImportedFinding contract,
// so the handler's format= switch gains a `trivy` arm with no new route and no
// new authz entry.
//
// WHY Trivy: SARIF (slice 6a) covers SAST/SCA/secret scanners that export the
// OASIS interchange format, but the single most common container/SCA scanner —
// Aqua Trivy — emits its OWN native JSON (`trivy image|fs|repo --format json`),
// not SARIF, and that native shape carries the package-level CVE identity
// (PkgName/InstalledVersion/FixedVersion/CVE) that the consolidation layer wants
// to fold onto the finding model. Importing it folds a customer's existing
// Trivy output onto the platform's finding model + CTEM pipeline (the CVE join
// lights up the exploitability timeline + cross-feed dup-merge) without forcing
// a re-scan.
//
// SCHEMA REUSE: internal/containerscan/trivy.go already unmarshals Trivy's
// `Results[].Vulnerabilities[]` for live image scans. The struct subset here
// MIRRORS that (rather than importing it — containerscan is subprocess-shaped
// and store-coupled; this package stays pure) and EXTENDS it with the import-
// relevant fields the live path drops: FixedVersion, CVSS, PrimaryURL, plus the
// Misconfigurations[]/Secrets[] result kinds. Keeping the shape aligned with the
// real `trivy --format json` output is what makes this near-autonomous and
// golden-testable with a constructed real-shaped report.
//
// This file is PURE (io.Reader in, []ImportedFinding out) so the parse +
// severity/fingerprint mapping is golden-testable independent of the DB.
// Persistence + authz live in the api layer (handlers_findings_import.go).

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

// ScannerTrivy is the source label stamped onto every finding ParseTrivy emits,
// so imported Trivy findings are distinguishable from native scans + SARIF
// imports, and the cross-source dup-merge (slice 3) can identify them.
const ScannerTrivy = "trivy"

// ---- Trivy `--format json` schema subset (only the fields we consume) ----
//
// Mirrors internal/containerscan/trivy.go's trivyJSON, extended with the
// import-relevant fields (FixedVersion / CVSS / PrimaryURL) + the
// Misconfigurations[]/Secrets[] result kinds that live image scans ignore.

type trivyReport struct {
	// SchemaVersion / ArtifactName / ArtifactType identify the report; we read
	// ArtifactName as the scan target fallback (image ref / repo / fs path) when
	// a Result carries no Target of its own.
	ArtifactName string         `json:"ArtifactName"`
	ArtifactType string         `json:"ArtifactType"`
	Results      []trivyResult  `json:"Results"`
	Metadata     *trivyMetadata `json:"Metadata"`
}

type trivyMetadata struct {
	ImageID string `json:"ImageID"`
	OS      struct {
		Family string `json:"Family"`
		Name   string `json:"Name"`
	} `json:"OS"`
}

type trivyResult struct {
	Target          string                  `json:"Target"`
	Class           string                  `json:"Class"` // "os-pkgs" | "lang-pkgs" | "config" | "secret"
	Type            string                  `json:"Type"`  // "debian" | "npm" | "dockerfile" | …
	Vulnerabilities []trivyVulnerability    `json:"Vulnerabilities"`
	Misconfigs      []trivyMisconfiguration `json:"Misconfigurations"`
	Secrets         []trivySecret           `json:"Secrets"`
}

type trivyVulnerability struct {
	VulnerabilityID  string               `json:"VulnerabilityID"` // the CVE (or GHSA/…) id
	PkgName          string               `json:"PkgName"`
	InstalledVersion string               `json:"InstalledVersion"`
	FixedVersion     string               `json:"FixedVersion"`
	Severity         string               `json:"Severity"` // CRITICAL/HIGH/MEDIUM/LOW/UNKNOWN
	Title            string               `json:"Title"`
	Description      string               `json:"Description"`
	PrimaryURL       string               `json:"PrimaryURL"`
	CVSS             map[string]trivyCVSS `json:"CVSS"` // keyed by source ("nvd","redhat",…)
}

// trivyCVSS is one source's CVSS block. We read V3Score (preferred) / V2Score
// only to refine UNKNOWN-severity vulns; the primary signal is Severity.
type trivyCVSS struct {
	V3Score float64 `json:"V3Score"`
	V2Score float64 `json:"V2Score"`
}

type trivyMisconfiguration struct {
	ID          string `json:"ID"`
	Title       string `json:"Title"`
	Description string `json:"Description"`
	Severity    string `json:"Severity"`
	Message     string `json:"Message"`
	PrimaryURL  string `json:"PrimaryURL"`
}

type trivySecret struct {
	RuleID    string `json:"RuleID"`
	Category  string `json:"Category"`
	Severity  string `json:"Severity"`
	Title     string `json:"Title"`
	StartLine int    `json:"StartLine"`
}

// TrivyImportStats is the per-parse breakdown of which Trivy result kinds were
// covered vs deferred. The handler surfaces these in the import response so a
// caller knows, e.g., that a config-only report yielded misconfig findings and
// no vulnerabilities — never a silent empty import (Gate D).
type TrivyImportStats struct {
	Vulnerabilities int
	Misconfigs      int
	Secrets         int
}

// ParseTrivy reads a Trivy `--format json` report and returns one
// ImportedFinding per vulnerability, misconfiguration, and secret across every
// Result. It REUSES the containerscan trivy schema (extended) so the import
// shape matches real Trivy output.
//
// Coverage (this slice):
//   - Vulnerabilities[]  → category "cve"     (CVE-bearing — drives the
//     package_version resource-attach + exploitability +
//     cross-feed dup-merge).
//   - Misconfigurations[] → category "iac"    (IaC/config misconfig, file-shaped).
//   - Secrets[]          → category "secret"  (leaked secret, file:line-shaped).
//
// Errors are returned, never swallowed (Gate D): a malformed body is a 400 at
// the handler, not a silent empty import. An empty-but-valid report (no
// Results, or Results with no findings) returns (nil, nil) — that is a real
// "clean scan", not an error.
func ParseTrivy(r io.Reader) ([]ImportedFinding, error) {
	stats, findings, err := parseTrivy(r)
	_ = stats // stats are surfaced via ParseTrivyWithStats; this is the contract twin.
	return findings, err
}

// ParseTrivyWithStats is ParseTrivy plus the per-kind coverage breakdown. The
// handler uses this variant so the import response can report what was covered.
func ParseTrivyWithStats(r io.Reader) ([]ImportedFinding, TrivyImportStats, error) {
	stats, findings, err := parseTrivy(r)
	return findings, stats, err
}

func parseTrivy(r io.Reader) (TrivyImportStats, []ImportedFinding, error) {
	var stats TrivyImportStats
	if r == nil {
		return stats, nil, fmt.Errorf("trivy: nil reader")
	}
	var doc trivyReport
	dec := json.NewDecoder(r)
	if err := dec.Decode(&doc); err != nil {
		return stats, nil, fmt.Errorf("trivy: decode: %w", err)
	}
	// A Trivy report always has a Results key (even if empty for a clean scan);
	// a body with NEITHER Results nor an artifact name is not a Trivy report —
	// reject it so a caller pointing at the wrong format gets a 400, not a
	// silent empty import.
	if doc.Results == nil && strings.TrimSpace(doc.ArtifactName) == "" {
		return stats, nil, fmt.Errorf("trivy: not a Trivy JSON report (no Results, no ArtifactName)")
	}

	// Scan target: a Result's own Target wins; else the report's ArtifactName
	// (the image ref / repo / fs root). Used to anchor the finding's "where".
	artifact := strings.TrimSpace(doc.ArtifactName)

	var out []ImportedFinding
	for ri := range doc.Results {
		res := &doc.Results[ri]
		target := strings.TrimSpace(res.Target)
		if target == "" {
			target = artifact
		}
		for vi := range res.Vulnerabilities {
			v := &res.Vulnerabilities[vi]
			if strings.TrimSpace(v.VulnerabilityID) == "" {
				// A vuln with no id has no stable identity and no CVE to join on
				// — skip rather than mint an unkeyable finding. Mirrors the live
				// scan path (containerscan drops id-less vulns).
				continue
			}
			out = append(out, normalizeTrivyVuln(v, target))
			stats.Vulnerabilities++
		}
		for mi := range res.Misconfigs {
			out = append(out, normalizeTrivyMisconfig(&res.Misconfigs[mi], target))
			stats.Misconfigs++
		}
		for si := range res.Secrets {
			out = append(out, normalizeTrivySecret(&res.Secrets[si], target))
			stats.Secrets++
		}
	}
	return stats, out, nil
}

func normalizeTrivyVuln(v *trivyVulnerability, target string) ImportedFinding {
	cve := strings.TrimSpace(v.VulnerabilityID)
	f := ImportedFinding{
		RuleID:      cve,
		Title:       trivyVulnTitle(v),
		Description: trivyVulnDescription(v),
		Severity:    severityFromTrivy(v.Severity, v.CVSS),
		// File carries the locator: the scan target + the affected package, so
		// the finding's "where" survives onto code_alerts.file_path-style reads.
		File:    trivyLocator(target, v.PkgName, v.InstalledVersion),
		CVE:     onlyCVE(cve), // only a real CVE-… id joins the exploitability table.
		Scanner: ScannerTrivy,
		// Category steers the persist target's resource-attach: CVE-bearing →
		// the package_version path. Surfaced here so the handler maps it without
		// re-deriving.
		Category: "cve",
	}
	f.Fingerprint = trivyFingerprint("vuln", target, v.PkgName, v.InstalledVersion, cve)
	return f
}

func normalizeTrivyMisconfig(m *trivyMisconfiguration, target string) ImportedFinding {
	id := strings.TrimSpace(m.ID)
	title := strings.TrimSpace(m.Title)
	if title == "" {
		title = id
	}
	desc := strings.TrimSpace(m.Description)
	if msg := strings.TrimSpace(m.Message); msg != "" {
		if desc != "" {
			desc += "\n\n"
		}
		desc += msg
	}
	f := ImportedFinding{
		RuleID:      id,
		Title:       title,
		Description: desc,
		Severity:    severityFromTrivy(m.Severity, nil),
		File:        strings.TrimSpace(target),
		Scanner:     ScannerTrivy,
		Category:    "iac", // misconfig is IaC/config-shaped (file-anchored).
	}
	f.Fingerprint = trivyFingerprint("misconfig", target, id, "", "")
	return f
}

func normalizeTrivySecret(s *trivySecret, target string) ImportedFinding {
	rule := strings.TrimSpace(s.RuleID)
	title := strings.TrimSpace(s.Title)
	if title == "" {
		title = strings.TrimSpace(s.Category)
	}
	if title == "" {
		title = rule
	}
	f := ImportedFinding{
		RuleID:    rule,
		Title:     title,
		Severity:  severityFromTrivy(s.Severity, nil),
		File:      strings.TrimSpace(target),
		StartLine: s.StartLine,
		Scanner:   ScannerTrivy,
		Category:  "secret",
	}
	f.Fingerprint = trivyFingerprint("secret", target, rule, fmt.Sprintf("%d", s.StartLine), "")
	return f
}

// trivyVulnTitle prefers Trivy's Title, falling back to the vuln id when the
// feed carries no human title (common for GHSA/OS-vendor advisories).
func trivyVulnTitle(v *trivyVulnerability) string {
	if t := strings.TrimSpace(v.Title); t != "" {
		return t
	}
	return strings.TrimSpace(v.VulnerabilityID)
}

// trivyVulnDescription assembles the finding body: the advisory text plus the
// package coordinates + fix status, so the consolidation read (and a human)
// can see "what package, what version, fix available where" at a glance. The
// CVE rides in the description too (importDescription re-adds it from CVE; this
// keeps the body self-contained for the secret/misconfig kinds that share it).
func trivyVulnDescription(v *trivyVulnerability) string {
	var b strings.Builder
	if d := strings.TrimSpace(v.Description); d != "" {
		b.WriteString(d)
	}
	writeLine := func(label, val string) {
		val = strings.TrimSpace(val)
		if val == "" {
			return
		}
		if b.Len() > 0 {
			b.WriteByte('\n')
		}
		b.WriteString(label)
		b.WriteString(": ")
		b.WriteString(val)
	}
	if b.Len() > 0 {
		b.WriteString("\n")
	}
	writeLine("Package", v.PkgName)
	writeLine("Installed", v.InstalledVersion)
	if fv := strings.TrimSpace(v.FixedVersion); fv != "" {
		writeLine("Fixed in", fv)
	} else {
		// Surface the "no fix" state explicitly — it changes remediation
		// posture (mitigate/accept vs upgrade) and a blank line would hide it.
		writeLine("Fixed in", "(no fix available)")
	}
	writeLine("Advisory", v.PrimaryURL)
	return strings.TrimSpace(b.String())
}

// trivyLocator renders the finding's "where": target plus the package coords.
// e.g. "alpine:3.18 (openssl 3.1.0-r0)". Stored as File so the persist path can
// carry it onto the finding's file_path-style read.
func trivyLocator(target, pkg, version string) string {
	target = strings.TrimSpace(target)
	pkg = strings.TrimSpace(pkg)
	version = strings.TrimSpace(version)
	switch {
	case pkg == "":
		return target
	case version == "":
		if target == "" {
			return pkg
		}
		return target + " (" + pkg + ")"
	default:
		if target == "" {
			return pkg + " " + version
		}
		return target + " (" + pkg + " " + version + ")"
	}
}

// onlyCVE returns the id only when it is a real CVE-… identifier. Trivy's
// VulnerabilityID is also GHSA-…/OS-vendor advisory ids, which do NOT key the
// CISA-KEV/EPSS exploitability table — returning those as CVE would mint a join
// that never resolves. Non-CVE ids still ride in RuleID/title/fingerprint.
func onlyCVE(id string) string {
	if strings.HasPrefix(strings.ToUpper(strings.TrimSpace(id)), "CVE-") {
		return strings.TrimSpace(id)
	}
	return ""
}

// severityFromTrivy maps Trivy's severity band onto the platform enum.
//
//	CRITICAL → critical   HIGH → high   MEDIUM → medium   LOW → low
//	UNKNOWN  → refine from the highest CVSS score when present, else medium.
//
// PRODUCT DECISION (flagged): UNKNOWN defaults to MEDIUM, not low. An
// unscored vuln is not safe to bury — the consolidation layer should surface
// it for triage, matching severityFromSARIF's "no signal → medium" stance.
// When the vuln carries a CVSS block we use it to place UNKNOWN more precisely
// (>=9 critical, >=7 high, >=4 medium, >0 low) rather than flatten to medium.
func severityFromTrivy(raw string, cvss map[string]trivyCVSS) string {
	switch strings.ToUpper(strings.TrimSpace(raw)) {
	case "CRITICAL":
		return "critical"
	case "HIGH":
		return "high"
	case "MEDIUM":
		return "medium"
	case "LOW":
		return "low"
	case "UNKNOWN", "":
		if s, ok := severityFromCVSS(cvss); ok {
			return s
		}
		return "medium"
	default:
		// An unrecognized band (forward-compat with a future Trivy level) is
		// surfaced as medium rather than dropped — never silently misgrade.
		return "medium"
	}
}

// severityFromCVSS picks the highest V3 (then V2) score across CVSS sources and
// bands it. Returns ok=false when no positive score is present.
func severityFromCVSS(cvss map[string]trivyCVSS) (string, bool) {
	var best float64
	for _, c := range cvss {
		if c.V3Score > best {
			best = c.V3Score
		}
		if c.V2Score > best {
			best = c.V2Score
		}
	}
	switch {
	case best >= 9.0:
		return "critical", true
	case best >= 7.0:
		return "high", true
	case best >= 4.0:
		return "medium", true
	case best > 0:
		return "low", true
	default:
		return "", false
	}
}

// trivyFingerprint produces a STABLE per-finding fingerprint, idempotent across
// re-imports so persistence (CreateCodeAlert ON CONFLICT org_id,fingerprint)
// updates rather than duplicates, and the cross-feed dup-merge has a stable key.
//
// Basis for a vuln: (target, pkgName, installedVersion, vulnID) — the natural
// identity of "this CVE on this package@version on this target". A fix-version
// bump or a re-scan of the same image yields the same fingerprint, so the
// finding refreshes in place. Prefixed "trivy:" so a Trivy finding's key can't
// collide with a SARIF/native key while staying a comparable basis for the
// cross-source merge.
func trivyFingerprint(kind, target, a, b, c string) string {
	basis := strings.Join([]string{kind, target, a, b, c}, "|")
	h := sha256.Sum256([]byte("trivy:" + basis))
	return fmt.Sprintf("%x", h)
}
