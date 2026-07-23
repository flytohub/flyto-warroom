package containerscan

import (
	"context"
	"os/exec"
	"testing"
)

// TestScanImage_NoTrivy pins the soft-fail behaviour. When trivy
// isn't on PATH, ScanImage must return a non-nil result with
// SkippedBecauseUnavailable=true (and nil error) — anything stricter
// would cascade into "scan failed" telemetry on every desktop /
// non-container environment that doesn't bake the binary in.
func TestScanImage_NoTrivy(t *testing.T) {
	if _, err := exec.LookPath("trivy"); err == nil {
		t.Skip("trivy is on PATH — this test only meaningful when missing")
	}
	res, err := ScanImage(context.Background(), "alpine:3.20", "")
	if err != nil {
		t.Fatalf("ScanImage with missing trivy returned error: %v", err)
	}
	if res == nil {
		t.Fatal("ScanImage returned nil result")
	}
	if !res.SkippedBecauseUnavailable {
		t.Error("SkippedBecauseUnavailable should be true when trivy missing")
	}
	if len(res.Vulnerabilities) != 0 {
		t.Errorf("Vulnerabilities should be empty when scanner missing, got %d", len(res.Vulnerabilities))
	}
}

// TestScanImage_EmptyRef rejects empty refs immediately so callers
// don't silently no-op on malformed Dockerfile parsing upstream.
func TestScanImage_EmptyRef(t *testing.T) {
	if _, err := ScanImage(context.Background(), "", ""); err == nil {
		t.Fatal("expected error for empty image ref")
	}
	if _, err := ScanImage(context.Background(), "   ", ""); err == nil {
		t.Fatal("expected error for whitespace-only image ref")
	}
}

// TestEnrichExploitability pins the KEV/EPSS exploitability stamping that
// the container scoring path weights on. Pure + dependency-free: the KEV
// predicate and EPSS map stand in for cve.KEVCache.Contains and
// cve.FetchEPSS results the api caller supplies.
func TestEnrichExploitability(t *testing.T) {
	const kevCVE = "CVE-2021-44228"   // in KEV, EPSS 0
	const highEPSS = "CVE-2022-22965" // EPSS >= 0.50, not KEV
	const lowEPSS = "CVE-2020-0001"   // EPSS < 0.50, not KEV
	const unknown = "CVE-2099-9999"   // absent from EPSS map

	kevSet := map[string]bool{kevCVE: true}
	inKEV := func(id string) bool { return kevSet[id] }
	epss := map[string]float64{
		highEPSS: 0.91,
		lowEPSS:  ExploitableEPSSThreshold - 0.01, // just below threshold
		kevCVE:   0.0,
	}

	type want struct {
		inKEV       bool
		epss        float64
		exploitable bool
	}
	cases := []struct {
		name     string
		cve      string
		inKEV    func(string) bool
		epss     map[string]float64
		expected want
	}{
		{
			name:     "in KEV, EPSS zero => exploitable",
			cve:      kevCVE,
			inKEV:    inKEV,
			epss:     epss,
			expected: want{inKEV: true, epss: 0.0, exploitable: true},
		},
		{
			name:     "high EPSS, not KEV => exploitable",
			cve:      highEPSS,
			inKEV:    inKEV,
			epss:     epss,
			expected: want{inKEV: false, epss: 0.91, exploitable: true},
		},
		{
			name:     "EPSS just below threshold, not KEV => not exploitable",
			cve:      lowEPSS,
			inKEV:    inKEV,
			epss:     epss,
			expected: want{inKEV: false, epss: ExploitableEPSSThreshold - 0.01, exploitable: false},
		},
		{
			name:     "unknown CVE id stays zero EPSS, not exploitable",
			cve:      unknown,
			inKEV:    inKEV,
			epss:     epss,
			expected: want{inKEV: false, epss: 0.0, exploitable: false},
		},
		{
			name:     "nil predicate + nil map => all zero, no panic",
			cve:      kevCVE,
			inKEV:    nil,
			epss:     nil,
			expected: want{inKEV: false, epss: 0.0, exploitable: false},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			vulns := []Vulnerability{{CVEID: tc.cve}}
			EnrichExploitability(vulns, tc.inKEV, tc.epss)
			got := vulns[0]
			if got.InKEV != tc.expected.inKEV {
				t.Errorf("InKEV=%v, want %v", got.InKEV, tc.expected.inKEV)
			}
			if got.EPSS != tc.expected.epss {
				t.Errorf("EPSS=%v, want %v", got.EPSS, tc.expected.epss)
			}
			if got.Exploitable != tc.expected.exploitable {
				t.Errorf("Exploitable=%v, want %v", got.Exploitable, tc.expected.exploitable)
			}
		})
	}
}

// TestEnrichExploitability_KeyedByCVEID confirms the EPSS map resolves to
// the right vuln when a batch carries several CVEs, and that determinism
// holds across repeated runs (same inputs => identical outputs).
func TestEnrichExploitability_KeyedByCVEID(t *testing.T) {
	inKEV := func(id string) bool { return id == "CVE-A" }
	epss := map[string]float64{
		"CVE-A": 0.10, // KEV wins regardless of low EPSS
		"CVE-B": 0.80, // high EPSS
		"CVE-C": 0.20, // neither
	}
	build := func() []Vulnerability {
		return []Vulnerability{{CVEID: "CVE-A"}, {CVEID: "CVE-B"}, {CVEID: "CVE-C"}}
	}

	first := build()
	EnrichExploitability(first, inKEV, epss)

	if !first[0].InKEV || !first[0].Exploitable {
		t.Errorf("CVE-A should be KEV+exploitable, got %+v", first[0])
	}
	if first[0].EPSS != 0.10 {
		t.Errorf("CVE-A EPSS=%v, want 0.10 (keyed correctly)", first[0].EPSS)
	}
	if first[1].InKEV || !first[1].Exploitable || first[1].EPSS != 0.80 {
		t.Errorf("CVE-B should be exploitable via EPSS only, got %+v", first[1])
	}
	if first[2].Exploitable || first[2].EPSS != 0.20 {
		t.Errorf("CVE-C should not be exploitable, got %+v", first[2])
	}

	// Determinism: a second run over fresh input must match field-for-field.
	second := build()
	EnrichExploitability(second, inKEV, epss)
	for i := range first {
		if first[i] != second[i] {
			t.Errorf("non-deterministic at %d: %+v vs %+v", i, first[i], second[i])
		}
	}
}

func TestAvailable(t *testing.T) {
	got := Available()
	_, lookErr := exec.LookPath("trivy")
	want := lookErr == nil
	if got != want {
		t.Errorf("Available()=%v, exec.LookPath agrees=%v", got, want)
	}
}
