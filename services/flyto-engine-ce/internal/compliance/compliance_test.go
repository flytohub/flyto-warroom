package compliance

import (
	"testing"
)

// TestEvaluateCompliance_AllFrameworks — evaluating with nil framework
// list defaults to the full SOC2/ISO/PCI/OWASP/GDPR/HIPAA/NIST set.
func TestEvaluateCompliance_AllFrameworks(t *testing.T) {
	data := ScanData{HasCVECheck: true, HasSecretScan: true, HasHSTS: true, HasSSL: true}
	r := EvaluateCompliance("org-1", data)

	if r.OrgID != "org-1" {
		t.Errorf("OrgID = %q, want org-1", r.OrgID)
	}
	if len(r.Frameworks) != 7 {
		t.Errorf("expected 7 frameworks, got %d", len(r.Frameworks))
	}
	wanted := map[Framework]bool{
		SOC2: true, ISO27001: true, PCI_DSS: true, OWASP_TOP10: true,
		GDPR: true, HIPAA: true, NIST_CSF: true,
	}
	for _, fw := range r.Frameworks {
		if !wanted[fw.Framework] {
			t.Errorf("unexpected framework: %s", fw.Framework)
		}
	}
}

// TestEvaluateFrameworks_FilteredSet — passing a specific framework
// only evaluates that one.
func TestEvaluateFrameworks_FilteredSet(t *testing.T) {
	r := EvaluateFrameworks("org-1", ScanData{}, []Framework{SOC2})
	if len(r.Frameworks) != 1 || r.Frameworks[0].Framework != SOC2 {
		t.Fatalf("expected SOC2 only, got %+v", r.Frameworks)
	}
}

// TestEvaluateFrameworks_UnknownFramework — silently ignored, not
// errored out, so a future framework name typo doesn't break callers.
func TestEvaluateFrameworks_UnknownFramework(t *testing.T) {
	r := EvaluateFrameworks("org-1", ScanData{}, []Framework{"BOGUS"})
	if len(r.Frameworks) != 0 {
		t.Errorf("BOGUS framework should be ignored, got %d frameworks", len(r.Frameworks))
	}
}

// TestCheckPass_CVECheck — CVE check pass requires HasCVECheck AND
// no critical CVEs.
func TestCheckPass_CVECheck(t *testing.T) {
	cases := []struct {
		name string
		data ScanData
		want bool
	}{
		{"no scan", ScanData{HasCVECheck: false}, false},
		{"clean scan", ScanData{HasCVECheck: true, CriticalCVEs: 0}, true},
		{"critical found", ScanData{HasCVECheck: true, CriticalCVEs: 1}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			status, _ := checkPass("cve_check", tc.data)
			got := status == checkPassStatus
			if got != tc.want {
				t.Errorf("checkPass(cve_check) = %v (%s), want %v", got, status, tc.want)
			}
		})
	}
}

// TestCheckPass_ScanCoverage — threshold is 70%.
func TestCheckPass_ScanCoverage(t *testing.T) {
	if status, _ := checkPass("scan_coverage", ScanData{ScannedRepoCount: 7, RepoCount: 10}); status != checkPassStatus {
		t.Errorf("70%% coverage should pass, got %s", status)
	}
	if status, _ := checkPass("scan_coverage", ScanData{ScannedRepoCount: 6, RepoCount: 10}); status == checkPassStatus {
		t.Error("60% coverage should fail")
	}
}

// TestCheckPass_UnknownCheck — unknown check IDs return false (don't
// silently pass) and a descriptive detail.
func TestCheckPass_UnknownCheck(t *testing.T) {
	status, detail := checkPass("totally-made-up", ScanData{})
	if status == checkPassStatus {
		t.Error("unknown check should not pass")
	}
	if detail == "" {
		t.Error("unknown check should return a non-empty detail")
	}
}

// TestEvaluate_CleanScan_PassesAllControls — given a fully-secure scan
// every control should pass. Catches detail-level regressions where a
// new check is added but checkPass forgets the matching case.
func TestEvaluate_CleanScan_PassesAllControls(t *testing.T) {
	data := ScanData{
		HasCVECheck: true, HasSecretScan: true,
		HasExternalPosture: true,
		HasHSTS:            true, HasCSP: true, HasXFrameOptions: true, HasXContentType: true,
		HasSPF: true, HasDMARC: true, HasDNSSEC: true,
		HasSSL: true, HasAutoScan: true,
		RepoCount: 10, ScannedRepoCount: 10,
		DangerousPorts: 0,
	}
	r := EvaluateFrameworks("org-1", data, []Framework{SOC2})
	for _, fw := range r.Frameworks {
		for _, c := range fw.Controls {
			if c.Status != "pass" {
				t.Errorf("expected all SOC2 controls to pass on clean data, %s = %s (%s)",
					c.ControlID, c.Status, c.Details)
			}
		}
		if fw.Score != 100 {
			t.Errorf("expected SOC2 score = 100 on clean data, got %v", fw.Score)
		}
	}
}

// TestEvaluate_PartialControl — some checks pass, some fail in the
// same control → status partial. This is what's reported as
// "improvement targets" to the operator.
func TestEvaluate_PartialControl(t *testing.T) {
	// SOC2 CC6.1 needs: secret_scan + auth_headers
	// auth_headers = HasHSTS && HasCSP. Set HSTS but not CSP →
	// secret_scan passes, auth_headers fails → partial. The org must
	// have an external posture, otherwise auth_headers is not_applicable.
	data := ScanData{
		HasSecretScan: true, SecretsFound: 0,
		HasExternalPosture: true,
		HasHSTS:            true, HasCSP: false,
	}
	r := EvaluateFrameworks("org-1", data, []Framework{SOC2})
	var cc61 *ControlResult
	for i := range r.Frameworks[0].Controls {
		if r.Frameworks[0].Controls[i].ControlID == "CC6.1" {
			cc61 = &r.Frameworks[0].Controls[i]
		}
	}
	if cc61 == nil {
		t.Fatal("CC6.1 control missing from SOC2 result")
	}
	if cc61.Status != "partial" {
		t.Errorf("CC6.1 with mixed checks should be partial, got %s", cc61.Status)
	}
	if r.Frameworks[0].PartialCount == 0 {
		t.Errorf("partial controls must increment partial_count, got %+v", r.Frameworks[0])
	}
	failStatuses, partialStatuses := 0, 0
	for _, c := range r.Frameworks[0].Controls {
		switch c.Status {
		case "fail":
			failStatuses++
		case "partial":
			partialStatuses++
		}
	}
	if r.Frameworks[0].FailCount != failStatuses || r.Frameworks[0].PartialCount != partialStatuses {
		t.Errorf("status counts drifted: fail_count=%d status_fail=%d partial_count=%d status_partial=%d",
			r.Frameworks[0].FailCount, failStatuses, r.Frameworks[0].PartialCount, partialStatuses)
	}
}

// TestEvaluate_ScoreArithmetic — score is pass-count / total-count
// not percentage of all checks. Pin the math.
func TestEvaluate_ScoreArithmetic(t *testing.T) {
	r := EvaluateFrameworks("org-1", ScanData{}, []Framework{SOC2})
	if r.Frameworks[0].Score != 0 {
		t.Errorf("empty scan should give SOC2 score 0, got %v", r.Frameworks[0].Score)
	}
	// Half-pass scenario — only auto-scan + cve_check work.
	data := ScanData{HasCVECheck: true, HasAutoScan: true, RepoCount: 10, ScannedRepoCount: 10}
	r = EvaluateFrameworks("org-1", data, []Framework{SOC2})
	if r.Frameworks[0].Score <= 0 || r.Frameworks[0].Score >= 100 {
		t.Errorf("expected 0 < SOC2 score < 100 on partial scan, got %v", r.Frameworks[0].Score)
	}
}

// TestEvaluate_InternalOnly_ExternalControlsNotApplicable — F3 regression.
// An internal-only org (connected repos, NO external attack surface) must
// NOT have the external-posture controls fabricated as FAIL. The header /
// SSL / auth-header checks return not_applicable and are excluded from the
// Pass/Fail counts AND from the score denominator, so a clean internal scan
// is not dragged down by a dimension the customer simply doesn't have.
func TestEvaluate_InternalOnly_ExternalControlsNotApplicable(t *testing.T) {
	// Internal-only: code scanning is clean, but HasExternalPosture=false
	// and every external signal (HSTS/CSP/SSL/...) is absent.
	data := ScanData{
		HasCVECheck: true, CriticalCVEs: 0, TotalCVEs: 0,
		HasSecretScan: true, SecretsFound: 0,
		HasAutoScan: true,
		RepoCount:   10, ScannedRepoCount: 10,
		HasExternalPosture: false,
	}

	// Each external-only check must be not_applicable, never fail.
	externalChecks := []string{
		"hsts", "csp", "x_frame_options", "x_content_type", "ssl",
		"auth_headers", "port_scan", "spf", "dmarc", "dnssec",
	}
	for _, c := range externalChecks {
		status, detail := checkPass(c, data)
		if status != checkNAStatus {
			t.Errorf("internal-only org: check %q = %q (%s), want not_applicable", c, status, detail)
		}
	}

	r := EvaluateFrameworks("org-internal", data, []Framework{SOC2})
	fw := r.Frameworks[0]

	// CC6.6 (hsts/csp/x_frame_options) is wholly external → not_applicable,
	// and must contribute to neither FailCount nor the score denominator.
	var cc66 *ControlResult
	for i := range fw.Controls {
		if fw.Controls[i].ControlID == "CC6.6" {
			cc66 = &fw.Controls[i]
		}
	}
	if cc66 == nil {
		t.Fatal("CC6.6 missing from SOC2 result")
	}
	if cc66.Status != checkNAStatus {
		t.Errorf("CC6.6 on internal-only org = %s, want not_applicable", cc66.Status)
	}

	// The N/A control must be excluded from the score denominator:
	// TotalCount counts only scorable controls.
	scorable := 0
	for _, c := range fw.Controls {
		if c.Status != checkNAStatus {
			scorable++
		}
	}
	if fw.TotalCount != scorable {
		t.Errorf("TotalCount=%d should exclude not_applicable controls (scorable=%d)", fw.TotalCount, scorable)
	}
	if fw.TotalCount == len(fw.Controls) {
		t.Errorf("expected at least one not_applicable control excluded from denominator, all %d counted", fw.TotalCount)
	}

	// No external control should have been fabricated as FAIL. With clean
	// internal scanning the framework should score 100 (the internal
	// controls all pass; the external ones are simply N/A).
	if fw.Score != 100 {
		t.Errorf("internal-only clean scan: SOC2 score = %v, want 100 (external controls excluded, not failed)", fw.Score)
	}
	if fw.FailCount != 0 {
		t.Errorf("internal-only clean scan must not fabricate failures, FailCount=%d", fw.FailCount)
	}
}

// TestJoinDetails — pure string joiner; semicolon-separated.
func TestJoinDetails(t *testing.T) {
	if got := joinDetails([]string{"a", "b", "c"}); got != "a; b; c" {
		t.Errorf("joinDetails = %q", got)
	}
	if got := joinDetails(nil); got != "" {
		t.Errorf("joinDetails(nil) = %q, want empty", got)
	}
	if got := joinDetails([]string{"only"}); got != "only" {
		t.Errorf("joinDetails([only]) = %q", got)
	}
}
