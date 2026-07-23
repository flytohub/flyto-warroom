package findingimport

import (
	"strings"
	"testing"
)

// sarifGolden is a constructed spec-valid SARIF 2.1.0 document used as the
// golden input: scanner output in, normalized findings out. It exercises the
// fields the parser consumes:
//   - result 1: a high-severity SAST finding WITH partialFingerprints + a
//     rule carrying security-severity (8.1 → high) and a CVE tag.
//   - result 2: a SUPPRESSED finding (accepted) → parsed but flagged Suppressed.
//   - result 3: a result with only level=note and no rule metadata → low,
//     fingerprint derived from (ruleId, file, line).
const sarifGolden = `{
  "version": "2.1.0",
  "runs": [
    {
      "tool": {
        "driver": {
          "name": "CodeQL",
          "rules": [
            {
              "id": "go/sql-injection",
              "name": "SQL injection",
              "shortDescription": { "text": "Database query built from user-controlled sources" },
              "properties": {
                "security-severity": "8.1",
                "tags": ["security", "external/cwe/cwe-089", "CVE-2024-9999"]
              }
            },
            {
              "id": "go/weak-hash",
              "name": "Use of a weak hash",
              "properties": { "security-severity": "3.5" }
            }
          ]
        }
      },
      "results": [
        {
          "ruleId": "go/sql-injection",
          "level": "error",
          "message": { "text": "User input flows into a SQL query." },
          "locations": [
            {
              "physicalLocation": {
                "artifactLocation": { "uri": "internal/db/query.go" },
                "region": { "startLine": 42 }
              }
            }
          ],
          "partialFingerprints": { "primaryLocationLineHash": "abc123def456" }
        },
        {
          "ruleId": "go/weak-hash",
          "level": "warning",
          "message": { "text": "MD5 used for a security-sensitive hash." },
          "locations": [
            {
              "physicalLocation": {
                "artifactLocation": { "uri": "internal/auth/hash.go" },
                "region": { "startLine": 7 }
              }
            }
          ],
          "suppressions": [ { "kind": "external", "status": "accepted" } ]
        },
        {
          "ruleId": "style/todo-left",
          "level": "note",
          "message": { "text": "TODO left in code." },
          "locations": [
            {
              "physicalLocation": {
                "artifactLocation": { "uri": "main.go" },
                "region": { "startLine": 100 }
              }
            }
          ]
        }
      ]
    }
  ]
}`

func TestParseSARIF_Golden(t *testing.T) {
	findings, err := ParseSARIF(strings.NewReader(sarifGolden))
	if err != nil {
		t.Fatalf("ParseSARIF: %v", err)
	}
	if len(findings) != 3 {
		t.Fatalf("got %d findings, want 3", len(findings))
	}

	byRule := map[string]ImportedFinding{}
	for _, f := range findings {
		byRule[f.RuleID] = f
	}

	// ── Result 1: security-severity 8.1 → high, CVE tag picked up,
	//    partialFingerprints drive a stable fingerprint, file+line set. ──
	f1, ok := byRule["go/sql-injection"]
	if !ok {
		t.Fatal("missing go/sql-injection finding")
	}
	if f1.Severity != "high" {
		t.Errorf("sql-injection severity = %q, want high (security-severity 8.1)", f1.Severity)
	}
	if f1.Title != "SQL injection" {
		t.Errorf("sql-injection title = %q, want %q", f1.Title, "SQL injection")
	}
	if f1.File != "internal/db/query.go" || f1.StartLine != 42 {
		t.Errorf("sql-injection location = %s:%d, want internal/db/query.go:42", f1.File, f1.StartLine)
	}
	if f1.CVE != "CVE-2024-9999" {
		t.Errorf("sql-injection CVE = %q, want CVE-2024-9999", f1.CVE)
	}
	if f1.Scanner != ScannerSARIF {
		t.Errorf("sql-injection scanner = %q, want %q", f1.Scanner, ScannerSARIF)
	}
	if f1.Suppressed {
		t.Error("sql-injection should not be suppressed")
	}
	if f1.Fingerprint == "" {
		t.Error("sql-injection fingerprint is empty")
	}

	// Fingerprint stability: re-parsing the same doc yields the same fp
	// (idempotent re-import basis). And the partialFingerprint-derived fp must
	// differ from a pure (rule,file,line) fp — proving the partialFingerprint
	// path is taken, not the location fallback.
	again, _ := ParseSARIF(strings.NewReader(sarifGolden))
	if again[0].Fingerprint != f1.Fingerprint {
		t.Error("fingerprint not stable across re-parse — re-import would duplicate")
	}
	locFP := fingerprintFor(&sarifResult{}, "go/sql-injection", "internal/db/query.go", 42)
	if f1.Fingerprint == locFP {
		t.Error("expected partialFingerprints to drive the fingerprint, not the location fallback")
	}

	// ── Result 2: suppressed (accepted) → flagged, severity still mapped. ──
	f2, ok := byRule["go/weak-hash"]
	if !ok {
		t.Fatal("missing go/weak-hash finding")
	}
	if !f2.Suppressed {
		t.Error("weak-hash should be flagged Suppressed (suppressions: accepted)")
	}
	if f2.Severity != "low" {
		t.Errorf("weak-hash severity = %q, want low (security-severity 3.5)", f2.Severity)
	}

	// ── Result 3: no rule metadata, level=note → low; fingerprint from
	//    (ruleId, file, line) since no partialFingerprints. ──
	f3, ok := byRule["style/todo-left"]
	if !ok {
		t.Fatal("missing style/todo-left finding")
	}
	if f3.Severity != "low" {
		t.Errorf("todo-left severity = %q, want low (level=note)", f3.Severity)
	}
	if f3.Title != "style/todo-left" {
		t.Errorf("todo-left title = %q, want the ruleId fallback", f3.Title)
	}
	wantFP := fingerprintFor(&sarifResult{}, "style/todo-left", "main.go", 100)
	if f3.Fingerprint != wantFP {
		t.Errorf("todo-left fingerprint = %q, want location-derived %q", f3.Fingerprint, wantFP)
	}
}

// TestSeverityMapping pins the SARIF→enum mapping table (the product decision).
func TestSeverityMapping(t *testing.T) {
	cases := []struct {
		name   string
		secSev string
		rank   *float64
		level  string
		want   string
	}{
		{"security-severity critical", "9.8", nil, "warning", "critical"},
		{"security-severity high", "7.0", nil, "note", "high"},
		{"security-severity medium", "4.0", nil, "error", "medium"},
		{"security-severity low", "0.1", nil, "error", "low"},
		{"rank critical", "", fptr(85), "note", "critical"},
		{"rank high", "", fptr(55), "note", "high"},
		{"rank medium", "", fptr(25), "note", "medium"},
		{"rank low", "", fptr(5), "note", "low"},
		{"level error", "", nil, "error", "high"},
		{"level warning", "", nil, "warning", "medium"},
		{"level note", "", nil, "note", "low"},
		{"nothing → medium default", "", nil, "", "medium"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			res := &sarifResult{Level: c.level, Rank: c.rank}
			var rule *sarifRule
			if c.secSev != "" {
				rule = &sarifRule{Properties: sarifRuleProps{SecuritySeverity: c.secSev}}
			}
			if got := severityFromSARIF(res, rule); got != c.want {
				t.Errorf("severity = %q, want %q", got, c.want)
			}
		})
	}
}

// TestParseSARIF_MultiRun proves multiple runs/tools all contribute findings.
func TestParseSARIF_MultiRun(t *testing.T) {
	doc := `{
      "version": "2.1.0",
      "runs": [
        {"tool":{"driver":{"name":"A","rules":[]}},"results":[
          {"ruleId":"a/one","level":"error","message":{"text":"x"}}
        ]},
        {"tool":{"driver":{"name":"B","rules":[]}},"results":[
          {"ruleId":"b/one","level":"warning","message":{"text":"y"}},
          {"ruleId":"b/two","level":"note","message":{"text":"z"}}
        ]}
      ]
    }`
	findings, err := ParseSARIF(strings.NewReader(doc))
	if err != nil {
		t.Fatalf("ParseSARIF: %v", err)
	}
	if len(findings) != 3 {
		t.Fatalf("got %d findings across 2 runs, want 3", len(findings))
	}
}

// TestParseSARIF_RejectedSuppression — a rejected suppression does NOT suppress
// the result (the suppression itself was declined).
func TestParseSARIF_RejectedSuppression(t *testing.T) {
	doc := `{
      "version":"2.1.0",
      "runs":[{"tool":{"driver":{"name":"A","rules":[]}},"results":[
        {"ruleId":"a/one","level":"error","message":{"text":"x"},
         "suppressions":[{"kind":"external","status":"rejected"}]}
      ]}]
    }`
	findings, err := ParseSARIF(strings.NewReader(doc))
	if err != nil {
		t.Fatalf("ParseSARIF: %v", err)
	}
	if len(findings) != 1 || findings[0].Suppressed {
		t.Errorf("rejected suppression should NOT suppress; got Suppressed=%v", findings[0].Suppressed)
	}
}

// TestParseSARIF_Errors — malformed / empty inputs error, never silently empty.
func TestParseSARIF_Errors(t *testing.T) {
	if _, err := ParseSARIF(strings.NewReader("not json")); err == nil {
		t.Error("malformed JSON should error")
	}
	if _, err := ParseSARIF(strings.NewReader(`{"version":"2.1.0","runs":[]}`)); err == nil {
		t.Error("no-runs document should error")
	}
	if _, err := ParseSARIF(nil); err == nil {
		t.Error("nil reader should error")
	}
}

func fptr(f float64) *float64 { return &f }
