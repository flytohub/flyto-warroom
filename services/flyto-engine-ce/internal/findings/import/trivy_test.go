package findingimport

import (
	"strings"
	"testing"
)

// trivyGolden is a constructed real-shaped `trivy image --format json` report:
// 2 targets (an OS-package target + a lang-package target), several vulns
// including one with NO FixedVersion and one with UNKNOWN severity, plus a
// misconfiguration and a secret result so the per-kind coverage is exercised.
//
//   - target 1 (alpine os-pkgs): CVE-2024-0001 CRITICAL (fixed), CVE-2024-0002
//     UNKNOWN (no fix; carries a CVSS 7.5 block → refined to high).
//   - target 2 (Gemfile.lock lang-pkgs): CVE-2024-0003 MEDIUM (fixed),
//     GHSA-xxxx-yyyy-zzzz HIGH (non-CVE id → CVE field empty, still imported).
//   - a Dockerfile misconfig (AVD-DS-0002, HIGH) and a secret (HIGH).
const trivyGolden = `{
  "SchemaVersion": 2,
  "ArtifactName": "myimage:1.2.3",
  "ArtifactType": "container_image",
  "Metadata": { "ImageID": "sha256:deadbeef", "OS": { "Family": "alpine", "Name": "3.18.4" } },
  "Results": [
    {
      "Target": "myimage:1.2.3 (alpine 3.18.4)",
      "Class": "os-pkgs",
      "Type": "alpine",
      "Vulnerabilities": [
        {
          "VulnerabilityID": "CVE-2024-0001",
          "PkgName": "openssl",
          "InstalledVersion": "3.1.0-r0",
          "FixedVersion": "3.1.4-r0",
          "Severity": "CRITICAL",
          "Title": "openssl: buffer overflow",
          "Description": "A buffer overflow in OpenSSL.",
          "PrimaryURL": "https://avd.aquasec.com/nvd/cve-2024-0001"
        },
        {
          "VulnerabilityID": "CVE-2024-0002",
          "PkgName": "busybox",
          "InstalledVersion": "1.36.1-r0",
          "Severity": "UNKNOWN",
          "Title": "busybox: unspecified issue",
          "CVSS": { "nvd": { "V3Score": 7.5 } }
        }
      ]
    },
    {
      "Target": "Gemfile.lock",
      "Class": "lang-pkgs",
      "Type": "bundler",
      "Vulnerabilities": [
        {
          "VulnerabilityID": "CVE-2024-0003",
          "PkgName": "rack",
          "InstalledVersion": "2.2.3",
          "FixedVersion": "2.2.6.4",
          "Severity": "MEDIUM",
          "Title": "rack: DoS"
        },
        {
          "VulnerabilityID": "GHSA-xxxx-yyyy-zzzz",
          "PkgName": "nokogiri",
          "InstalledVersion": "1.13.0",
          "FixedVersion": "1.13.10",
          "Severity": "HIGH",
          "Title": "nokogiri: XML"
        }
      ]
    },
    {
      "Target": "Dockerfile",
      "Class": "config",
      "Type": "dockerfile",
      "Misconfigurations": [
        {
          "ID": "AVD-DS-0002",
          "Title": "Image user should not be 'root'",
          "Description": "Running containers as root is dangerous.",
          "Message": "Specify at least 1 USER command.",
          "Severity": "HIGH",
          "PrimaryURL": "https://avd.aquasec.com/misconfig/ds002"
        }
      ]
    },
    {
      "Target": "config/secrets.yml",
      "Class": "secret",
      "Type": "secret",
      "Secrets": [
        {
          "RuleID": "aws-access-key-id",
          "Category": "AWS",
          "Severity": "HIGH",
          "Title": "AWS Access Key ID",
          "StartLine": 12
        }
      ]
    }
  ]
}`

func TestParseTrivy_Golden(t *testing.T) {
	findings, stats, err := ParseTrivyWithStats(strings.NewReader(trivyGolden))
	if err != nil {
		t.Fatalf("ParseTrivy: %v", err)
	}
	// 4 vulns + 1 misconfig + 1 secret = 6 findings.
	if len(findings) != 6 {
		t.Fatalf("got %d findings, want 6", len(findings))
	}
	if stats.Vulnerabilities != 4 || stats.Misconfigs != 1 || stats.Secrets != 1 {
		t.Errorf("coverage = %+v, want vulns=4 misconfigs=1 secrets=1", stats)
	}

	byRule := map[string]ImportedFinding{}
	for _, f := range findings {
		byRule[f.RuleID] = f
	}

	// ── CVE-2024-0001: CRITICAL, fixed, CVE set, scanner=trivy, category=cve. ──
	v1, ok := byRule["CVE-2024-0001"]
	if !ok {
		t.Fatal("missing CVE-2024-0001")
	}
	if v1.Severity != "critical" {
		t.Errorf("CVE-2024-0001 severity = %q, want critical", v1.Severity)
	}
	if v1.CVE != "CVE-2024-0001" {
		t.Errorf("CVE-2024-0001 CVE = %q, want CVE-2024-0001", v1.CVE)
	}
	if v1.Category != "cve" {
		t.Errorf("CVE-2024-0001 category = %q, want cve", v1.Category)
	}
	if v1.Scanner != ScannerTrivy {
		t.Errorf("CVE-2024-0001 scanner = %q, want trivy", v1.Scanner)
	}
	if !strings.Contains(v1.File, "openssl") || !strings.Contains(v1.File, "myimage:1.2.3") {
		t.Errorf("CVE-2024-0001 locator = %q, want target+package", v1.File)
	}
	if !strings.Contains(v1.Description, "3.1.4-r0") {
		t.Errorf("CVE-2024-0001 description missing fixed version: %q", v1.Description)
	}
	if v1.Fingerprint == "" {
		t.Error("CVE-2024-0001 fingerprint empty")
	}

	// ── CVE-2024-0002: UNKNOWN severity + CVSS 7.5 → refined to high; NO fix
	//    surfaced explicitly in the description. ──
	v2, ok := byRule["CVE-2024-0002"]
	if !ok {
		t.Fatal("missing CVE-2024-0002")
	}
	if v2.Severity != "high" {
		t.Errorf("CVE-2024-0002 severity = %q, want high (UNKNOWN refined via CVSS 7.5)", v2.Severity)
	}
	if !strings.Contains(v2.Description, "no fix available") {
		t.Errorf("CVE-2024-0002 should flag no-fix; description = %q", v2.Description)
	}

	// ── GHSA non-CVE id: imported, but CVE field empty (won't mint a dead
	//    KEV/EPSS join), still carries the id in RuleID. ──
	g, ok := byRule["GHSA-xxxx-yyyy-zzzz"]
	if !ok {
		t.Fatal("missing GHSA finding")
	}
	if g.Severity != "high" {
		t.Errorf("GHSA severity = %q, want high", g.Severity)
	}
	if g.CVE != "" {
		t.Errorf("GHSA CVE = %q, want empty (not a CVE-… id)", g.CVE)
	}
	if g.Category != "cve" {
		t.Errorf("GHSA category = %q, want cve (still a vuln finding)", g.Category)
	}

	// ── Misconfig → category iac, message folded into description. ──
	mc, ok := byRule["AVD-DS-0002"]
	if !ok {
		t.Fatal("missing misconfig AVD-DS-0002")
	}
	if mc.Severity != "high" {
		t.Errorf("misconfig severity = %q, want high", mc.Severity)
	}
	if mc.Category != "iac" {
		t.Errorf("misconfig category = %q, want iac", mc.Category)
	}
	if !strings.Contains(mc.Description, "USER command") {
		t.Errorf("misconfig description missing message: %q", mc.Description)
	}

	// ── Secret → category secret, start line carried. ──
	sec, ok := byRule["aws-access-key-id"]
	if !ok {
		t.Fatal("missing secret finding")
	}
	if sec.Category != "secret" {
		t.Errorf("secret category = %q, want secret", sec.Category)
	}
	if sec.StartLine != 12 {
		t.Errorf("secret start line = %d, want 12", sec.StartLine)
	}
	if sec.File != "config/secrets.yml" {
		t.Errorf("secret file = %q, want config/secrets.yml", sec.File)
	}

	// ── Fingerprint stability: re-parse → identical fingerprints (idempotent
	//    re-import basis). And the vuln fingerprint must equal the explicit
	//    (target,pkg,version,cve) basis — proving the stable key. ──
	again, _, _ := ParseTrivyWithStats(strings.NewReader(trivyGolden))
	byRule2 := map[string]ImportedFinding{}
	for _, f := range again {
		byRule2[f.RuleID] = f
	}
	if byRule2["CVE-2024-0001"].Fingerprint != v1.Fingerprint {
		t.Error("fingerprint not stable across re-parse — re-import would duplicate")
	}
	wantFP := trivyFingerprint("vuln", "myimage:1.2.3 (alpine 3.18.4)", "openssl", "3.1.0-r0", "CVE-2024-0001")
	if v1.Fingerprint != wantFP {
		t.Errorf("CVE-2024-0001 fingerprint = %q, want stable basis %q", v1.Fingerprint, wantFP)
	}
}

// TestSeverityFromTrivy pins the Trivy→enum mapping table (the product decision).
func TestSeverityFromTrivy(t *testing.T) {
	cases := []struct {
		name string
		raw  string
		cvss map[string]trivyCVSS
		want string
	}{
		{"critical", "CRITICAL", nil, "critical"},
		{"high", "HIGH", nil, "high"},
		{"medium", "MEDIUM", nil, "medium"},
		{"low", "LOW", nil, "low"},
		{"unknown no cvss → medium default", "UNKNOWN", nil, "medium"},
		{"empty → medium default", "", nil, "medium"},
		{"unknown refined critical via cvss", "UNKNOWN", map[string]trivyCVSS{"nvd": {V3Score: 9.8}}, "critical"},
		{"unknown refined high via cvss", "UNKNOWN", map[string]trivyCVSS{"nvd": {V3Score: 7.0}}, "high"},
		{"unknown refined low via cvss v2", "UNKNOWN", map[string]trivyCVSS{"nvd": {V2Score: 2.5}}, "low"},
		{"lowercase tolerated", "critical", nil, "critical"},
		{"unrecognized → medium", "BOGUS", nil, "medium"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := severityFromTrivy(c.raw, c.cvss); got != c.want {
				t.Errorf("severityFromTrivy(%q) = %q, want %q", c.raw, got, c.want)
			}
		})
	}
}

// TestParseTrivy_Errors — malformed / wrong-shape / nil inputs error, never a
// silent empty import (Gate D).
func TestParseTrivy_Errors(t *testing.T) {
	if _, err := ParseTrivy(strings.NewReader("not json")); err == nil {
		t.Error("malformed JSON should error")
	}
	if _, err := ParseTrivy(strings.NewReader(`{"foo":"bar"}`)); err == nil {
		t.Error("non-Trivy JSON (no Results, no ArtifactName) should error")
	}
	if _, err := ParseTrivy(nil); err == nil {
		t.Error("nil reader should error")
	}
	// A valid empty (clean) scan report is NOT an error — it's zero findings.
	cleaned, err := ParseTrivy(strings.NewReader(`{"ArtifactName":"clean:latest","Results":[]}`))
	if err != nil {
		t.Errorf("clean scan should not error: %v", err)
	}
	if len(cleaned) != 0 {
		t.Errorf("clean scan should yield 0 findings, got %d", len(cleaned))
	}
}

// TestParseTrivy_SkipsIDLessVuln — a vuln with no VulnerabilityID has no stable
// identity and is dropped (mirrors the live scan path).
func TestParseTrivy_SkipsIDLessVuln(t *testing.T) {
	doc := `{"ArtifactName":"x:1","Results":[{"Target":"x:1","Vulnerabilities":[
	  {"VulnerabilityID":"","PkgName":"p","Severity":"HIGH"},
	  {"VulnerabilityID":"CVE-2024-9999","PkgName":"q","Severity":"LOW"}
	]}]}`
	findings, err := ParseTrivy(strings.NewReader(doc))
	if err != nil {
		t.Fatalf("ParseTrivy: %v", err)
	}
	if len(findings) != 1 || findings[0].RuleID != "CVE-2024-9999" {
		t.Errorf("id-less vuln should be skipped; got %+v", findings)
	}
}
