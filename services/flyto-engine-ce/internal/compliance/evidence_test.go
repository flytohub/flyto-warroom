package compliance

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"testing"
	"time"
)

func sampleResult() FrameworkResult {
	return FrameworkResult{
		Framework:  SOC2,
		PassCount:  1,
		FailCount:  0,
		TotalCount: 2,
		Score:      75.0,
		Controls: []ControlResult{
			{
				ControlID:   "CIS-3.10",
				ControlName: "TLS enforced",
				Status:      "pass",
				Details:     "HSTS active, cert valid 220 days.",
			},
			{
				ControlID:   "CIS-12.1",
				ControlName: "Vulnerability scanning",
				Status:      "fail",
				Details:     "No CVE scan executed in 30 days.",
			},
		},
	}
}

func TestBuildBinder_HashEachEvidenceItem(t *testing.T) {
	now := time.Date(2026, 5, 15, 12, 0, 0, 0, time.UTC)
	raw := map[string]string{
		"ssl_cert":    "subject=CN=flyto2.com, issuer=R3, valid_to=2026-12-30",
		"hsts_header": "max-age=63072000; includeSubDomains; preload",
		"cve_results": "critical=0 high=2 medium=11",
	}

	b := BuildBinder("org-42", "Acme", sampleResult(), raw, now)
	if b == nil {
		t.Fatal("expected binder, got nil")
	}
	if len(b.Controls) != 2 {
		t.Fatalf("expected 2 controls, got %d", len(b.Controls))
	}
	if b.EnvelopeHash == "" || len(b.EnvelopeHash) != 64 {
		t.Errorf("envelope hash should be a 64-char hex string, got %q", b.EnvelopeHash)
	}

	// CIS-3.10 maps to ssl_cert + hsts_header → 2 evidence items.
	var cis310 *ControlEvidence
	for i := range b.Controls {
		if b.Controls[i].ControlID == "CIS-3.10" {
			cis310 = &b.Controls[i]
		}
	}
	if cis310 == nil {
		t.Fatal("CIS-3.10 not present in binder")
	}
	if len(cis310.Evidence) != 2 {
		t.Errorf("CIS-3.10 expected 2 evidence items, got %d", len(cis310.Evidence))
	}
	// Re-derive the SHA-256 to prove what's printed matches the source.
	expected := sha256.Sum256([]byte(raw["ssl_cert"]))
	found := false
	for _, e := range cis310.Evidence {
		if e.Source == "ssl_cert" && e.Hash == hex.EncodeToString(expected[:]) {
			found = true
		}
	}
	if !found {
		t.Error("ssl_cert evidence hash does not match SHA-256 of the raw source — tamper-evident property broken")
	}
}

func TestBuildBinder_MissingSourceProducesEmptyEvidence(t *testing.T) {
	now := time.Date(2026, 5, 15, 0, 0, 0, 0, time.UTC)
	// No rawSources at all — every control should land with empty Evidence
	// but the control itself must still appear in the binder.
	b := BuildBinder("org-empty", "Empty", sampleResult(), map[string]string{}, now)
	if len(b.Controls) != 2 {
		t.Fatalf("expected controls to be preserved even without evidence, got %d", len(b.Controls))
	}
	for _, c := range b.Controls {
		if len(c.Evidence) != 0 {
			t.Errorf("control %s should have empty evidence, got %d items", c.ControlID, len(c.Evidence))
		}
	}
}

func TestBuildBinder_DeterministicEnvelopeHash(t *testing.T) {
	now := time.Date(2026, 5, 15, 0, 0, 0, 0, time.UTC)
	raw := map[string]string{"ssl_cert": "x", "hsts_header": "y", "cve_results": "z"}

	b1 := BuildBinder("o", "n", sampleResult(), raw, now)
	b2 := BuildBinder("o", "n", sampleResult(), raw, now)
	if b1.EnvelopeHash != b2.EnvelopeHash {
		t.Errorf("envelope hash should be deterministic for same inputs, got %q vs %q", b1.EnvelopeHash, b2.EnvelopeHash)
	}

	// Mutating one source must change the envelope hash.
	raw2 := map[string]string{"ssl_cert": "x'", "hsts_header": "y", "cve_results": "z"}
	b3 := BuildBinder("o", "n", sampleResult(), raw2, now)
	if b1.EnvelopeHash == b3.EnvelopeHash {
		t.Error("envelope hash did not change when a cited source changed — tamper-evident property broken")
	}
}

func TestRenderMarkdown_EmitsEnvelopeAndSummary(t *testing.T) {
	now := time.Date(2026, 5, 15, 12, 0, 0, 0, time.UTC)
	b := BuildBinder("org", "Acme", sampleResult(),
		map[string]string{"ssl_cert": "ok", "hsts_header": "ok", "cve_results": "stale"}, now)

	md := b.RenderMarkdown()
	if !strings.Contains(md, "Envelope hash") {
		t.Error("markdown should advertise the envelope hash for auditor cross-check")
	}
	if !strings.Contains(md, b.EnvelopeHash) {
		t.Error("markdown should include the actual envelope hash value")
	}
	if !strings.Contains(md, "CIS-3.10") || !strings.Contains(md, "CIS-12.1") {
		t.Error("markdown should mention every control")
	}
	if !strings.Contains(md, "PASS") || !strings.Contains(md, "FAIL") {
		t.Error("markdown should render status badges (PASS/FAIL)")
	}
}

func TestRenderHTML_WrapsMarkdownInPrintTheme(t *testing.T) {
	now := time.Date(2026, 5, 15, 0, 0, 0, 0, time.UTC)
	b := BuildBinder("o", "n", sampleResult(),
		map[string]string{"ssl_cert": "x"}, now)
	html := b.RenderHTML()

	if !strings.Contains(html, "<!DOCTYPE html>") {
		t.Error("RenderHTML should emit a doctype")
	}
	if !strings.Contains(html, "@media print") {
		t.Error("RenderHTML should include print stylesheet for browser save-as-PDF")
	}
	if !strings.Contains(html, b.EnvelopeHash) {
		t.Error("HTML should carry the envelope hash for auditor verification")
	}
}
