// Package ceworkflow turns provider-free Community scan findings into local
// evidence, remediation suggestions, risk-chain hypotheses, and reports.
//
// The output is deterministic and intentionally non-authoritative. Commercial
// correlation models, proprietary datasets, managed providers, and live
// remediation execution compose outside this package.
package ceworkflow

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"html/template"
	"sort"
	"strings"
	"time"

	"github.com/flytohub/flyto-engine/internal/ceplatform"
)

type AnalysisResult struct {
	AttackPaths  []ceplatform.AttackPath
	Evidence     []ceplatform.Evidence
	Remediations []ceplatform.Remediation
}

// Analyze produces transparent CE workflow records from one completed scan.
// It never claims exploitability or verified attack-path authority.
func Analyze(work ceplatform.AnalysisWork) AnalysisResult {
	findings := append([]ceplatform.Finding(nil), work.Findings...)
	sort.SliceStable(findings, func(i, j int) bool {
		left, right := severityRank(findings[i].Severity), severityRank(findings[j].Severity)
		if left != right {
			return left < right
		}
		return findings[i].Fingerprint < findings[j].Fingerprint
	})

	result := AnalysisResult{
		AttackPaths:  []ceplatform.AttackPath{},
		Evidence:     make([]ceplatform.Evidence, 0, len(findings)),
		Remediations: make([]ceplatform.Remediation, 0, len(findings)),
	}
	for _, finding := range findings {
		result.Evidence = append(result.Evidence, ceplatform.Evidence{
			ID:        stableID("evidence", work.Scan.ID, finding.Fingerprint),
			ScanID:    work.Scan.ID,
			ProjectID: work.Scan.OrgID,
			RepoID:    work.Scan.RepoID,
			FindingID: finding.ID,
			Kind:      "scanner_finding",
			Digest:    evidenceDigest(finding),
			Summary:   evidenceSummary(finding),
		})
		result.Remediations = append(result.Remediations, ceplatform.Remediation{
			ID:             stableID("remediation", finding.ID),
			ProjectID:      work.Scan.OrgID,
			RepoID:         work.Scan.RepoID,
			FindingID:      finding.ID,
			Recommendation: recommendation(finding),
		})
	}

	for category, group := range groupByCategory(findings) {
		highRisk := selectHighRisk(group, 4)
		if len(highRisk) == 0 {
			continue
		}
		findingIDs := make([]string, 0, len(highRisk))
		for _, finding := range highRisk {
			findingIDs = append(findingIDs, finding.ID)
		}
		severity := highRisk[0].Severity
		title := categoryTitle(category) + " risk chain hypothesis"
		result.AttackPaths = append(result.AttackPaths, ceplatform.AttackPath{
			ID:         stableID("path", work.Scan.ID, category),
			ScanID:     work.Scan.ID,
			ProjectID:  work.Scan.OrgID,
			RepoID:     work.Scan.RepoID,
			Title:      title,
			Severity:   severity,
			FindingIDs: findingIDs,
			Summary: fmt.Sprintf(
				"%d related %s finding(s) may combine into a material repository risk. Review scope and validate safely before treating this hypothesis as exploitable.",
				len(highRisk), category,
			),
			Confidence: "hypothesis",
		})
	}
	sort.Slice(result.AttackPaths, func(i, j int) bool {
		left, right := severityRank(result.AttackPaths[i].Severity), severityRank(result.AttackPaths[j].Severity)
		if left != right {
			return left < right
		}
		return result.AttackPaths[i].Title < result.AttackPaths[j].Title
	})
	return result
}

func RenderReport(work ceplatform.ReportWork, generatedAt time.Time) (string, error) {
	severity := map[string]int{"critical": 0, "high": 0, "medium": 0, "low": 0}
	for _, finding := range work.Findings {
		severity[strings.ToLower(finding.Severity)]++
	}
	data := struct {
		Project     ceplatform.Project
		GeneratedAt string
		Findings    []ceplatform.Finding
		AttackPaths []ceplatform.AttackPath
		Evidence    []ceplatform.Evidence
		Severity    map[string]int
	}{
		Project:     work.Project,
		GeneratedAt: generatedAt.UTC().Format(time.RFC3339),
		Findings:    work.Findings,
		AttackPaths: work.AttackPaths,
		Evidence:    work.Evidence,
		Severity:    severity,
	}
	var output bytes.Buffer
	if err := reportTemplate.Execute(&output, data); err != nil {
		return "", err
	}
	return output.String(), nil
}

func groupByCategory(findings []ceplatform.Finding) map[string][]ceplatform.Finding {
	groups := map[string][]ceplatform.Finding{}
	for _, finding := range findings {
		category := strings.ToLower(strings.TrimSpace(finding.Category))
		if category == "" {
			category = "security"
		}
		groups[category] = append(groups[category], finding)
	}
	return groups
}

func selectHighRisk(findings []ceplatform.Finding, limit int) []ceplatform.Finding {
	selected := make([]ceplatform.Finding, 0, limit)
	for _, finding := range findings {
		if severityRank(finding.Severity) > severityRank("medium") {
			continue
		}
		selected = append(selected, finding)
		if len(selected) == limit {
			break
		}
	}
	return selected
}

func severityRank(value string) int {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "critical":
		return 0
	case "high":
		return 1
	case "medium":
		return 2
	case "low":
		return 3
	default:
		return 4
	}
}

func evidenceDigest(finding ceplatform.Finding) string {
	hash := sha256.Sum256([]byte(strings.Join([]string{
		finding.Fingerprint,
		finding.Category,
		finding.RuleID,
		finding.File,
		fmt.Sprintf("%d", finding.Line),
	}, "\x00")))
	return "sha256:" + hex.EncodeToString(hash[:])
}

func evidenceSummary(finding ceplatform.Finding) string {
	location := strings.TrimSpace(finding.File)
	if finding.Line > 0 {
		location = fmt.Sprintf("%s:%d", location, finding.Line)
	}
	if location == "" {
		location = "repository"
	}
	return fmt.Sprintf("%s %s detected at %s by rule %s", finding.Severity, finding.Category, location, finding.RuleID)
}

func recommendation(finding ceplatform.Finding) string {
	switch strings.ToLower(strings.TrimSpace(finding.Category)) {
	case "secret":
		return "Revoke or rotate the exposed value, remove it from source and history where appropriate, then re-run the repository scan."
	case "iac":
		return "Update the infrastructure definition to enforce the reported security control, review the planned change, then re-run the scan."
	case "dependency":
		return "Upgrade to a supported patched dependency version, run the project test suite, then re-run dependency analysis."
	case "sast":
		return "Review the reported data or control flow, apply a narrowly scoped code fix with regression coverage, then re-run static analysis."
	default:
		return "Review the finding and its evidence, apply an authorized corrective change, then re-run the scan to verify the fingerprint cleared."
	}
}

func categoryTitle(category string) string {
	category = strings.ReplaceAll(strings.TrimSpace(category), "_", " ")
	if category == "" {
		return "Security"
	}
	return strings.ToUpper(category[:1]) + category[1:]
}

func stableID(prefix string, parts ...string) string {
	hash := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return prefix + "_" + hex.EncodeToString(hash[:16])
}

var reportTemplate = template.Must(template.New("ce-report").Parse(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Flyto2 Warroom CE Evidence Report</title>
<style>
body{font:15px system-ui,sans-serif;max-width:1120px;margin:40px auto;padding:0 24px;color:#172033;background:#fff}
h1,h2{color:#111827}.notice{padding:12px 16px;background:#eef6ff;border-left:4px solid #2563eb}
.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:20px 0}
.metric{padding:16px;border:1px solid #dbe2ea;border-radius:8px}.critical{color:#b91c1c}.high{color:#c2410c}
table{width:100%;border-collapse:collapse;margin:12px 0 28px}th,td{text-align:left;border-bottom:1px solid #e5e7eb;padding:9px;vertical-align:top}
code{font-size:12px;overflow-wrap:anywhere}@media(max-width:720px){.metrics{grid-template-columns:repeat(2,1fr)}}
</style></head><body>
<h1>Flyto2 Warroom CE Evidence Report</h1>
<p><strong>{{.Project.Name}}</strong> · generated {{.GeneratedAt}}</p>
<p class="notice">Community results are locally computed and non-comparable. Risk chains are transparent hypotheses, not claims of verified exploitability or Flyto2 rating authority.</p>
<div class="metrics">
<div class="metric critical"><strong>{{index .Severity "critical"}}</strong><br>Critical</div>
<div class="metric high"><strong>{{index .Severity "high"}}</strong><br>High</div>
<div class="metric"><strong>{{len .AttackPaths}}</strong><br>Risk hypotheses</div>
<div class="metric"><strong>{{len .Evidence}}</strong><br>Evidence records</div>
</div>
<h2>Risk-chain hypotheses</h2>
<table><thead><tr><th>Severity</th><th>Hypothesis</th><th>Rationale</th></tr></thead><tbody>
{{range .AttackPaths}}<tr><td>{{.Severity}}</td><td>{{.Title}}</td><td>{{.Summary}}</td></tr>
{{else}}<tr><td colspan="3">No high-risk chain hypothesis was produced.</td></tr>{{end}}</tbody></table>
<h2>Findings</h2>
<table><thead><tr><th>Severity</th><th>Finding</th><th>Location</th><th>Evidence</th></tr></thead><tbody>
{{range .Findings}}<tr><td>{{.Severity}}</td><td>{{.Name}}<br><code>{{.RuleID}}</code></td><td><code>{{.File}}:{{.Line}}</code></td><td>{{.Detail}}</td></tr>
{{else}}<tr><td colspan="4">No findings in this scan.</td></tr>{{end}}</tbody></table>
</body></html>`))
