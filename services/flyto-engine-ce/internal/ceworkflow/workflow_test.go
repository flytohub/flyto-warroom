package ceworkflow

import (
	"strings"
	"testing"
	"time"

	"github.com/flytohub/flyto-engine/internal/ceplatform"
)

func TestAnalyzeBuildsTransparentEvidenceAndRemediation(t *testing.T) {
	work := ceplatform.AnalysisWork{
		Scan: ceplatform.Scan{ID: "scan-1", OrgID: "org-1", RepoID: "repo-1"},
		Findings: []ceplatform.Finding{
			{
				ID:          "finding-secret",
				Category:    "secret",
				Severity:    "critical",
				RuleID:      "secret.generic",
				Name:        "Potential secret",
				File:        "config.txt",
				Line:        4,
				Fingerprint: "fp-secret",
			},
			{
				ID:          "finding-iac",
				Category:    "iac",
				Severity:    "high",
				RuleID:      "iac.public",
				Name:        "Public resource",
				File:        "main.tf",
				Line:        11,
				Fingerprint: "fp-iac",
			},
		},
	}

	result := Analyze(work)

	if len(result.Evidence) != 2 {
		t.Fatalf("evidence count = %d, want 2", len(result.Evidence))
	}
	if len(result.Remediations) != 2 {
		t.Fatalf("remediation count = %d, want 2", len(result.Remediations))
	}
	if len(result.AttackPaths) != 2 {
		t.Fatalf("attack-path hypotheses = %d, want 2", len(result.AttackPaths))
	}
	for _, path := range result.AttackPaths {
		if path.Confidence != "hypothesis" {
			t.Fatalf("confidence = %q, want hypothesis", path.Confidence)
		}
		if !strings.Contains(path.Summary, "validate safely") {
			t.Fatalf("summary must preserve validation caveat: %q", path.Summary)
		}
	}
	if !strings.HasPrefix(result.Evidence[0].Digest, "sha256:") {
		t.Fatalf("evidence digest = %q", result.Evidence[0].Digest)
	}
	if !strings.Contains(result.Remediations[0].Recommendation, "re-run") {
		t.Fatalf("recommendation must close the verification loop: %q", result.Remediations[0].Recommendation)
	}
}

func TestRenderReportStatesCommunityAuthorityBoundary(t *testing.T) {
	work := ceplatform.ReportWork{
		Project: ceplatform.Project{Name: "Example"},
		Findings: []ceplatform.Finding{{
			ID: "finding-1", Severity: "high", Name: "Example finding", RuleID: "example",
		}},
		AttackPaths: []ceplatform.AttackPath{{
			Title: "Example risk chain hypothesis", Severity: "high", Confidence: "hypothesis",
		}},
		Evidence: []ceplatform.Evidence{{ID: "evidence-1"}},
	}

	body, err := RenderReport(work, time.Date(2026, 7, 23, 10, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	for _, marker := range []string{
		"Flyto2 Warroom CE Evidence Report",
		"locally computed and non-comparable",
		"not claims of verified exploitability",
		"Example risk chain hypothesis",
	} {
		if !strings.Contains(body, marker) {
			t.Fatalf("report missing %q", marker)
		}
	}
}
