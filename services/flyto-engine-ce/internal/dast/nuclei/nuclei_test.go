package nuclei

import (
	"strings"
	"testing"
)

func TestParseNucleiJSON_BasicVuln(t *testing.T) {
	out := []byte(`{"template-id":"http-missing-security-headers","info":{"name":"Missing HSTS","severity":"medium","description":"HSTS not set","reference":["https://example.com"]},"matched-at":"https://target.tld","host":"target.tld"}
{"template-id":"tls-version","info":{"name":"TLS 1.0 detected","severity":"high"},"matched-at":"https://target.tld:443"}`)
	target := Target{URL: "https://target.tld", AssetID: "asset_1"}
	findings := parseNucleiJSON(out, target, "active_verified")
	if len(findings) != 2 {
		t.Fatalf("want 2 findings, got %d", len(findings))
	}
	if findings[0].Severity != "medium" || findings[1].Severity != "high" {
		t.Errorf("severities wrong: %+v", findings)
	}
	if findings[0].VerificationMethod != "active_verified" {
		t.Errorf("verification_method should be active_verified, got %s",
			findings[0].VerificationMethod)
	}
}

func TestParseNucleiJSON_DropsInfo(t *testing.T) {
	out := []byte(`{"template-id":"meta","info":{"severity":"info"},"matched-at":"x"}
{"template-id":"x","info":{"severity":"unknown"},"matched-at":"x"}
{"template-id":"y","info":{"name":"Real","severity":"high"},"matched-at":"x"}`)
	findings := parseNucleiJSON(out, Target{URL: "x", AssetID: "a"}, "active_verified")
	if len(findings) != 1 {
		t.Errorf("info + unknown should be dropped; want 1 finding, got %d", len(findings))
	}
}

func TestParseNucleiJSON_AuthenticatedFlag(t *testing.T) {
	out := []byte(`{"template-id":"x","info":{"name":"Y","severity":"medium"},"matched-at":"x"}`)
	target := Target{URL: "x", AssetID: "a", AuthCookie: "sid=xxx"}
	findings := parseNucleiJSON(out, target, "authenticated_verified")
	if len(findings) != 1 || findings[0].VerificationMethod != "authenticated_verified" {
		t.Errorf("authenticated session should flip method, got %+v", findings)
	}
}

func TestParseNucleiJSON_GarbageLinesSkipped(t *testing.T) {
	out := []byte(`not-json-at-all
{"template-id":"x","info":{"name":"Y","severity":"high"},"matched-at":"x"}
`)
	findings := parseNucleiJSON(out, Target{URL: "x", AssetID: "a"}, "active_verified")
	if len(findings) != 1 {
		t.Errorf("garbage lines should be skipped, got %d findings", len(findings))
	}
}

func TestParseNucleiJSON_CVEAttribution(t *testing.T) {
	out := []byte(`{"template-id":"cve-2021-44228","info":{"name":"Log4Shell","severity":"critical","classification":{"cve-id":["cve-2021-44228"]}},"matched-at":"x"}`)
	findings := parseNucleiJSON(out, Target{URL: "x", AssetID: "a"}, "active_verified")
	if len(findings) != 1 || len(findings[0].CVEs) != 1 {
		t.Errorf("CVE attribution missing: %+v", findings)
	}
	if !strings.HasPrefix(findings[0].CVEs[0], "cve-") {
		t.Errorf("CVE id format unexpected: %v", findings[0].CVEs)
	}
}

func TestEngine_ScanRejectsEmptyTarget(t *testing.T) {
	e := NewEngine()
	if _, err := e.Scan(nil, Target{}); err == nil {
		t.Error("empty URL should error")
	}
}

func TestDefaultTemplateTags_ExcludesIntrusive(t *testing.T) {
	// Conservative-by-default check: fuzzing / brute / default-
	// logins MUST NOT be in the default tag set.
	for _, t1 := range DefaultTemplateTags {
		for _, banned := range []string{"fuzz", "brute", "default-logins", "dos", "intrusive"} {
			if t1 == banned {
				t.Errorf("default tag set must exclude %q; found", banned)
			}
		}
	}
}
