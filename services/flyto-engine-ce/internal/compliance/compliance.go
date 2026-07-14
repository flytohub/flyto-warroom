// Package compliance maps scan results to compliance framework controls.
package compliance

import (
	"fmt"
	"time"
)

// Framework identifies a compliance standard.
type Framework string

const (
	SOC2        Framework = "SOC2"
	ISO27001    Framework = "ISO27001"
	PCI_DSS     Framework = "PCI_DSS"
	OWASP_TOP10 Framework = "OWASP_TOP10"
	GDPR        Framework = "GDPR"
	HIPAA       Framework = "HIPAA"
	NIST_CSF    Framework = "NIST_CSF"
)

// Control represents a single compliance requirement.
type Control struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Checks      []string `json:"checks"` // which scan capabilities map to this control
}

// ControlResult is the evaluation of a single control.
type ControlResult struct {
	ControlID   string `json:"control_id"`
	ControlName string `json:"control_name"`
	Status      string `json:"status"` // pass | fail | partial | not_applicable
	Details     string `json:"details"`
}

// Per-check evaluation statuses. A check is not_applicable when the scan
// dimension it depends on is absent for this customer (e.g. an
// internal-only org has no external HTTP/DNS/port assets, so the
// external-header / SSL / auth-header controls cannot meaningfully
// pass or fail — they are excluded from Pass/Fail counts and from the
// Score denominator rather than fabricated as FAIL).
const (
	checkPassStatus = "pass"
	checkFailStatus = "fail"
	checkNAStatus   = "not_applicable"
)

// FrameworkResult is the compliance evaluation for one framework.
type FrameworkResult struct {
	Framework    Framework       `json:"framework"`
	PassCount    int             `json:"pass_count"`
	PartialCount int             `json:"partial_count"`
	FailCount    int             `json:"fail_count"`
	TotalCount   int             `json:"total_count"`
	Score        float64         `json:"score"` // 0-100 percentage
	Controls     []ControlResult `json:"controls"`
}

// ComplianceReport is the full evaluation across all requested frameworks.
type ComplianceReport struct {
	OrgID        string            `json:"org_id"`
	EvaluatedAt  time.Time         `json:"evaluated_at"`
	Frameworks   []FrameworkResult `json:"frameworks"`
	OverallScore float64           `json:"overall_score"`
}

// ScanData is the aggregated data from scans used for compliance evaluation.
type ScanData struct {
	HasCVECheck      bool `json:"has_cve_check"`
	CriticalCVEs     int  `json:"critical_cves"`
	HighCVEs         int  `json:"high_cves"`
	TotalCVEs        int  `json:"total_cves"`
	HasSecretScan    bool `json:"has_secret_scan"`
	SecretsFound     int  `json:"secrets_found"`
	HasHSTS          bool `json:"has_hsts"`
	HasCSP           bool `json:"has_csp"`
	HasXFrameOptions bool `json:"has_x_frame_options"`
	HasXContentType  bool `json:"has_x_content_type"`
	HasSPF           bool `json:"has_spf"`
	HasDMARC         bool `json:"has_dmarc"`
	HasDNSSEC        bool `json:"has_dnssec"`
	HasSSL           bool `json:"has_ssl"`
	OpenPorts        int  `json:"open_ports"`
	DangerousPorts   int  `json:"dangerous_ports"` // DB, telnet, FTP etc exposed
	HasAutoScan      bool `json:"has_auto_scan"`
	RepoCount        int  `json:"repo_count"`
	ScannedRepoCount int  `json:"scanned_repo_count"`

	// HasExternalPosture is true only when the org has at least one
	// confirmed external asset (http_endpoint / dns / port). When false
	// the org is internal-only and the external-header / SSL / auth-header
	// checks return not_applicable instead of a fabricated FAIL, so the
	// missing external dimension does not drag the compliance score down.
	HasExternalPosture bool `json:"has_external_posture"`

	// DAST probe results — probe category → vulnerable?
	// Populated from PentestScan.Results when available.
	DastVulnerable map[string]bool `json:"dast_vulnerable,omitempty"`
}

// dastComplianceMap maps DAST probe categories to the compliance check
// names used in frameworkControls. Each probe category can affect
// multiple compliance checks.
var dastComplianceMap = map[string][]string{
	"sql_injection":          {"dast_injection"},
	"xss":                    {"dast_injection"},
	"crlf":                   {"dast_injection"},
	"command_injection":      {"dast_injection"},
	"nosql_injection":        {"dast_injection"},
	"ssrf":                   {"dast_ssrf"},
	"xxe":                    {"dast_misconfig"},
	"cors":                   {"dast_misconfig"},
	"host_injection":         {"dast_misconfig"},
	"cookie_security":        {"dast_misconfig"},
	"graphql_introspection":  {"dast_misconfig"},
	"cache_poisoning":        {"dast_misconfig"},
	"clickjacking":           {"dast_misconfig"},
	"content_type_confusion": {"dast_misconfig"},
	"idor":                   {"dast_access_control"},
	"open_redirect":          {"dast_access_control"},
	"directory_traversal":    {"dast_access_control"},
	"subdomain_takeover":     {"dast_access_control"},
	"jwt":                    {"dast_crypto", "dast_auth"},
	"websocket_auth":         {"dast_auth"},
	"request_smuggling":      {"dast_injection", "dast_misconfig"},
	"prototype_pollution":    {"dast_injection"},
	"rate_limiting":          {"dast_insecure_design"},
}

// frameworkControls defines which controls belong to each framework.
var frameworkControls = map[Framework][]Control{
	SOC2: {
		{ID: "CC6.1", Name: "Logical Access Controls", Description: "Restrict access to information assets", Checks: []string{"secret_scan", "auth_headers"}},
		{ID: "CC6.6", Name: "System Boundaries", Description: "Manage threats at system boundaries", Checks: []string{"hsts", "csp", "x_frame_options"}},
		{ID: "CC6.8", Name: "Malicious Software Prevention", Description: "Prevent installation of unauthorized software", Checks: []string{"cve_check", "dependency_scan"}},
		{ID: "CC7.1", Name: "Monitoring", Description: "Detect configuration changes and vulnerabilities", Checks: []string{"auto_scan", "cve_check"}},
		{ID: "CC7.2", Name: "System Monitoring", Description: "Monitor system components for anomalies", Checks: []string{"auto_scan", "port_scan"}},
		{ID: "CC8.1", Name: "Change Management", Description: "Authorize, design, develop, configure, test changes", Checks: []string{"auto_scan", "scan_coverage"}},
	},
	ISO27001: {
		{ID: "A.8.9", Name: "Configuration Management", Description: "Ensure configurations are established and maintained", Checks: []string{"cve_check", "auto_scan"}},
		{ID: "A.8.8", Name: "Technical Vulnerability Management", Description: "Obtain information about technical vulnerabilities", Checks: []string{"cve_check", "dependency_scan"}},
		{ID: "A.8.12", Name: "Data Leakage Prevention", Description: "Prevent unauthorized disclosure of information", Checks: []string{"secret_scan"}},
		{ID: "A.8.20", Name: "Network Security", Description: "Protect information in networks", Checks: []string{"hsts", "ssl", "port_scan"}},
		{ID: "A.8.24", Name: "Use of Cryptography", Description: "Effective use of cryptography", Checks: []string{"hsts", "ssl"}},
		{ID: "A.8.25", Name: "Secure Development Lifecycle", Description: "Rules for secure development", Checks: []string{"auto_scan", "scan_coverage", "cve_check"}},
	},
	PCI_DSS: {
		{ID: "6.2", Name: "Custom Software Security", Description: "Develop software securely", Checks: []string{"cve_check", "secret_scan", "scan_coverage"}},
		{ID: "6.3.2", Name: "Software Inventory", Description: "Maintain an inventory of custom and third-party software", Checks: []string{"dependency_scan"}},
		{ID: "6.5", Name: "Known Vulnerabilities", Description: "Address common coding vulnerabilities", Checks: []string{"cve_check", "dast_injection"}},
		{ID: "11.3", Name: "Vulnerability Scanning", Description: "Perform internal and external vulnerability scans", Checks: []string{"cve_check", "port_scan", "auto_scan"}},
		{ID: "2.2.2", Name: "System Hardening", Description: "Remove unnecessary services and ports", Checks: []string{"port_scan", "x_content_type"}},
	},
	OWASP_TOP10: {
		{ID: "A01", Name: "Broken Access Control", Description: "Access control enforcement", Checks: []string{"auth_headers", "x_frame_options", "csp", "dast_access_control"}},
		{ID: "A02", Name: "Cryptographic Failures", Description: "Failures related to cryptography", Checks: []string{"hsts", "ssl", "secret_scan", "dast_crypto"}},
		{ID: "A03", Name: "Injection", Description: "SQL, NoSQL, OS command injection", Checks: []string{"csp", "x_content_type", "dast_injection"}},
		{ID: "A04", Name: "Insecure Design", Description: "Missing or ineffective control design", Checks: []string{"dast_insecure_design"}},
		{ID: "A05", Name: "Security Misconfiguration", Description: "Missing or misconfigured security hardening", Checks: []string{"hsts", "csp", "x_frame_options", "x_content_type", "port_scan", "dast_misconfig"}},
		{ID: "A06", Name: "Vulnerable Components", Description: "Using components with known vulnerabilities", Checks: []string{"cve_check", "dependency_scan"}},
		{ID: "A07", Name: "Identification and Authentication Failures", Description: "Authentication and session management flaws", Checks: []string{"dast_auth"}},
		{ID: "A09", Name: "Security Logging and Monitoring", Description: "Insufficient logging and monitoring", Checks: []string{"auto_scan"}},
		{ID: "A10", Name: "Server-Side Request Forgery", Description: "SSRF flaws", Checks: []string{"dast_ssrf"}},
	},
	GDPR: {
		{ID: "Art.25", Name: "Data Protection by Design", Description: "Implement appropriate technical measures", Checks: []string{"hsts", "ssl", "csp", "secret_scan"}},
		{ID: "Art.32", Name: "Security of Processing", Description: "Ensure appropriate security of personal data", Checks: []string{"hsts", "ssl", "cve_check", "secret_scan"}},
		{ID: "Art.5.1f", Name: "Integrity and Confidentiality", Description: "Protection against unauthorized processing", Checks: []string{"secret_scan", "hsts", "ssl"}},
	},
	HIPAA: {
		{ID: "164.312(a)", Name: "Access Control", Description: "Implement technical policies for electronic PHI access", Checks: []string{"auth_headers", "secret_scan"}},
		{ID: "164.312(c)", Name: "Integrity", Description: "Protect ePHI from improper alteration", Checks: []string{"hsts", "ssl", "csp"}},
		{ID: "164.312(e)", Name: "Transmission Security", Description: "Guard against unauthorized access during transmission", Checks: []string{"hsts", "ssl"}},
		{ID: "164.308(a)(5)", Name: "Security Awareness", Description: "Security awareness and training program", Checks: []string{"auto_scan", "cve_check"}},
	},
	NIST_CSF: {
		{ID: "ID.RA-1", Name: "Asset Vulnerabilities", Description: "Identify and document asset vulnerabilities", Checks: []string{"cve_check", "dependency_scan", "port_scan"}},
		{ID: "PR.DS-2", Name: "Data in Transit", Description: "Protect data in transit", Checks: []string{"hsts", "ssl"}},
		{ID: "PR.IP-12", Name: "Vulnerability Management", Description: "Develop and implement a vulnerability management plan", Checks: []string{"cve_check", "auto_scan"}},
		{ID: "PR.AC-7", Name: "Device and Asset Authentication", Description: "Authenticate users, devices, and assets", Checks: []string{"auth_headers", "secret_scan"}},
		{ID: "DE.CM-8", Name: "Vulnerability Scans", Description: "Perform vulnerability scans", Checks: []string{"cve_check", "port_scan", "auto_scan"}},
	},
}

// checkPass evaluates a specific check capability against the scan data.
// It returns one of checkPassStatus / checkFailStatus / checkNAStatus and a
// human-readable detail. not_applicable is returned when the dimension a
// check depends on is absent for this customer; the caller excludes those
// from Pass/Fail counts and from the Score denominator.
func checkPass(check string, data ScanData) (string, string) {
	switch check {
	case "cve_check":
		if !data.HasCVECheck {
			return checkFailStatus, "CVE scanning not performed"
		}
		if data.CriticalCVEs > 0 {
			return checkFailStatus, fmt.Sprintf("%d critical CVEs found", data.CriticalCVEs)
		}
		return checkPassStatus, "No critical CVEs"
	case "dependency_scan":
		if !data.HasCVECheck {
			return checkFailStatus, "Dependency scanning not performed"
		}
		if data.TotalCVEs > 0 {
			return checkFailStatus, fmt.Sprintf("%d vulnerable dependencies", data.TotalCVEs)
		}
		return checkPassStatus, "All dependencies clean"
	case "secret_scan":
		if !data.HasSecretScan {
			return checkFailStatus, "Secret scanning not performed"
		}
		if data.SecretsFound > 0 {
			return checkFailStatus, fmt.Sprintf("%d secrets found in code", data.SecretsFound)
		}
		return checkPassStatus, "No secrets detected"
	case "hsts":
		if !data.HasExternalPosture {
			return checkNAStatus, "HSTS: no external attack surface (internal-only org)"
		}
		if data.HasHSTS {
			return checkPassStatus, "HSTS header present"
		}
		return checkFailStatus, "Missing Strict-Transport-Security header"
	case "csp":
		if !data.HasExternalPosture {
			return checkNAStatus, "CSP: no external attack surface (internal-only org)"
		}
		if data.HasCSP {
			return checkPassStatus, "CSP header present"
		}
		return checkFailStatus, "Missing Content-Security-Policy header"
	case "x_frame_options":
		if !data.HasExternalPosture {
			return checkNAStatus, "X-Frame-Options: no external attack surface (internal-only org)"
		}
		if data.HasXFrameOptions {
			return checkPassStatus, "X-Frame-Options header present"
		}
		return checkFailStatus, "Missing X-Frame-Options header"
	case "x_content_type":
		if !data.HasExternalPosture {
			return checkNAStatus, "X-Content-Type-Options: no external attack surface (internal-only org)"
		}
		if data.HasXContentType {
			return checkPassStatus, "X-Content-Type-Options header present"
		}
		return checkFailStatus, "Missing X-Content-Type-Options header"
	case "ssl":
		if !data.HasExternalPosture {
			return checkNAStatus, "SSL/TLS: no external attack surface (internal-only org)"
		}
		if data.HasSSL {
			return checkPassStatus, "SSL/TLS active"
		}
		return checkFailStatus, "No SSL/TLS detected"
	case "auth_headers":
		if !data.HasExternalPosture {
			return checkNAStatus, "Security headers: no external attack surface (internal-only org)"
		}
		if data.HasHSTS && data.HasCSP {
			return checkPassStatus, "Security headers present"
		}
		return checkFailStatus, "Security headers evaluation"
	case "port_scan":
		if !data.HasExternalPosture {
			return checkNAStatus, "Port exposure: no external attack surface (internal-only org)"
		}
		if data.DangerousPorts > 0 {
			return checkFailStatus, fmt.Sprintf("%d dangerous ports exposed", data.DangerousPorts)
		}
		return checkPassStatus, "No dangerous ports exposed"
	case "auto_scan":
		if data.HasAutoScan {
			return checkPassStatus, "Automated scanning enabled"
		}
		return checkFailStatus, "No automated scanning configured"
	case "scan_coverage":
		if data.ScannedRepoCount > 0 && data.RepoCount > 0 {
			pct := data.ScannedRepoCount * 100 / data.RepoCount
			if pct >= 70 {
				return checkPassStatus, fmt.Sprintf("Scan coverage %d%% (%d/%d repos)", pct, data.ScannedRepoCount, data.RepoCount)
			}
			return checkFailStatus, fmt.Sprintf("Scan coverage %d%% (below 70%% threshold)", pct)
		}
		return checkFailStatus, "No scan coverage data"
	case "spf":
		if !data.HasExternalPosture {
			return checkNAStatus, "SPF: no external attack surface (internal-only org)"
		}
		if data.HasSPF {
			return checkPassStatus, "SPF record present"
		}
		return checkFailStatus, "Missing SPF record"
	case "dmarc":
		if !data.HasExternalPosture {
			return checkNAStatus, "DMARC: no external attack surface (internal-only org)"
		}
		if data.HasDMARC {
			return checkPassStatus, "DMARC record present"
		}
		return checkFailStatus, "Missing DMARC record"
	case "dnssec":
		if !data.HasExternalPosture {
			return checkNAStatus, "DNSSEC: no external attack surface (internal-only org)"
		}
		if data.HasDNSSEC {
			return checkPassStatus, "DNSSEC enabled"
		}
		return checkFailStatus, "DNSSEC not enabled"

	// DAST probe-derived checks. Each maps to one or more probe
	// categories via dastComplianceMap. A check passes when no
	// mapped probe found the target vulnerable, or when no DAST
	// data is available (not_applicable semantics — we don't fail
	// on missing data, only on proven vulnerability).
	case "dast_injection":
		return dastCheckPass(data, "dast_injection", "Injection probes (SQLi/XSS/CRLF)")
	case "dast_ssrf":
		return dastCheckPass(data, "dast_ssrf", "SSRF probe")
	case "dast_misconfig":
		return dastCheckPass(data, "dast_misconfig", "Misconfiguration probes (XXE/CORS/Host/Cookie)")
	case "dast_access_control":
		return dastCheckPass(data, "dast_access_control", "Access control probes (IDOR/redirect/traversal)")
	case "dast_crypto":
		return dastCheckPass(data, "dast_crypto", "Cryptographic probes (JWT)")
	case "dast_auth":
		return dastCheckPass(data, "dast_auth", "Authentication probes (JWT)")
	case "dast_insecure_design":
		return dastCheckPass(data, "dast_insecure_design", "Insecure design probes (rate limiting)")

	default:
		return checkFailStatus, "Unknown check: " + check
	}
}

// dastCheckPass evaluates a DAST-derived compliance check. It looks up
// which probe categories map to the given check name and returns fail if
// any of those probes found the target vulnerable. When no DAST data is
// present the check is not_applicable (no evidence either way — it is
// excluded from Pass/Fail counts rather than fabricated as pass or fail).
func dastCheckPass(data ScanData, checkName, label string) (string, string) {
	if len(data.DastVulnerable) == 0 {
		return checkNAStatus, label + ": no DAST data available"
	}
	var vulnProbes []string
	for probeCategory, checks := range dastComplianceMap {
		for _, c := range checks {
			if c == checkName && data.DastVulnerable[probeCategory] {
				vulnProbes = append(vulnProbes, probeCategory)
			}
		}
	}
	if len(vulnProbes) > 0 {
		return checkFailStatus, fmt.Sprintf("%s: DAST found vulnerable (%s)", label, joinDetails(vulnProbes))
	}
	return checkPassStatus, label + ": DAST probes passed"
}

// EvaluateCompliance evaluates scan data against all compliance frameworks.
func EvaluateCompliance(orgID string, data ScanData) *ComplianceReport {
	return EvaluateFrameworks(orgID, data, nil)
}

// EvaluateFrameworks evaluates scan data against specific frameworks.
// If frameworks is nil or empty, all frameworks are evaluated.
func EvaluateFrameworks(orgID string, data ScanData, frameworks []Framework) *ComplianceReport {
	if len(frameworks) == 0 {
		frameworks = []Framework{SOC2, ISO27001, PCI_DSS, OWASP_TOP10, GDPR, HIPAA, NIST_CSF}
	}

	report := &ComplianceReport{
		OrgID:       orgID,
		EvaluatedAt: time.Now().UTC(),
	}

	for _, fw := range frameworks {
		controls, ok := frameworkControls[fw]
		if !ok {
			continue
		}

		fr := FrameworkResult{
			Framework: fw,
		}

		// scorable counts controls that contribute to the score
		// denominator — wholly not_applicable controls (every check N/A
		// because the dimension is absent for this customer) are excluded
		// so a missing external surface doesn't drag the score down.
		scorable := 0

		for _, ctrl := range controls {
			cr := ControlResult{
				ControlID:   ctrl.ID,
				ControlName: ctrl.Name,
			}

			passCount := 0
			failCount := 0
			var details []string
			for _, check := range ctrl.Checks {
				status, detail := checkPass(check, data)
				switch status {
				case checkPassStatus:
					passCount++
				case checkNAStatus:
					// excluded from pass/fail tallies
				default:
					failCount++
				}
				details = append(details, detail)
			}

			switch {
			case passCount == 0 && failCount == 0:
				// every check is not_applicable → control excluded from
				// Pass/Fail counts and from the score denominator.
				cr.Status = checkNAStatus
			case failCount == 0:
				cr.Status = "pass"
				fr.PassCount++
				scorable++
			case passCount == 0:
				cr.Status = "fail"
				fr.FailCount++
				scorable++
			default:
				cr.Status = "partial"
				fr.PartialCount++
				scorable++
			}
			cr.Details = joinDetails(details)
			fr.Controls = append(fr.Controls, cr)
		}

		fr.TotalCount = scorable
		if scorable > 0 {
			fr.Score = float64(fr.PassCount) / float64(scorable) * 100
		}
		report.Frameworks = append(report.Frameworks, fr)
	}

	if len(report.Frameworks) > 0 {
		var sum float64
		for _, fr := range report.Frameworks {
			sum += fr.Score
		}
		report.OverallScore = sum / float64(len(report.Frameworks))
	}

	return report
}

func joinDetails(parts []string) string {
	result := ""
	for i, p := range parts {
		if i > 0 {
			result += "; "
		}
		result += p
	}
	return result
}
