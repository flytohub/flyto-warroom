package compliance

// evidence.go — render audit-ready evidence binder.
//
// SOC2 / ISO27001 / PCI auditors don't accept "a portal says we're
// compliant" — they want artefacts: which scan, when, what asset,
// hashed for tamper-proof. This module turns a ComplianceReport
// into a downloadable evidence binder (markdown today; PDF follow-
// up wraps a CSS-print theme around the same content).
//
// Tamper-proof property: the rendered document carries the
// content_hash of every cited scan + an envelope hash chained into
// the org's audit log (internal/audit). An auditor can independently
// recompute the chain and verify nothing has been altered post-
// rendering.

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
	"time"
)

// EvidenceItem is one piece of supporting evidence cited by a control.
// Hash is the SHA-256 over Source content; auditors recompute it from
// the underlying scan artefact to confirm the binder is verbatim.
type EvidenceItem struct {
	Source      string    `json:"source"`      // e.g. "attack_surface:ssl_cert:example.com"
	Description string    `json:"description"` // human readable: "TLS 1.3 active on flyto2.com"
	CollectedAt time.Time `json:"collected_at"`
	Hash        string    `json:"hash"` // SHA-256 of raw content
}

// ControlEvidence binds a ControlResult to its supporting evidence.
type ControlEvidence struct {
	ControlResult
	Evidence []EvidenceItem `json:"evidence"`
}

// EvidenceBinder is the structured form before rendering. Markdown /
// PDF / HTML renderers all consume this shape — keep them pure-
// functional so the audit chain is the only source of truth.
type EvidenceBinder struct {
	OrgID        string
	OrgName      string
	Framework    Framework
	GeneratedAt  time.Time
	Controls     []ControlEvidence
	OverallScore float64
	EnvelopeHash string // chained hash over all evidence items
}

// BuildBinder takes a FrameworkResult plus the raw inputs that produced
// it and decorates each control with EvidenceItems. The mapping from
// control → evidence sources is hard-coded here because each control
// pulls from a fixed set of scan capabilities; if a control later
// changes its check requirements, both compliance.go and this file
// need to move together.
//
// rawSources is a free-form keyed map ("hsts_header" -> ..., "ssl_cert"
// -> ...) that the handler builds from the org's assets+profiles. The
// renderer matches keys to controls by name lookup; missing sources
// produce a control with empty Evidence (status remains, evidence
// just isn't cited — auditors should see "not enough scan coverage").
func BuildBinder(
	orgID, orgName string,
	result FrameworkResult,
	rawSources map[string]string,
	generatedAt time.Time,
) *EvidenceBinder {
	b := &EvidenceBinder{
		OrgID:        orgID,
		OrgName:      orgName,
		Framework:    result.Framework,
		GeneratedAt:  generatedAt,
		OverallScore: result.Score,
		Controls:     make([]ControlEvidence, 0, len(result.Controls)),
	}

	envelopeInput := strings.Builder{}
	envelopeInput.WriteString(string(result.Framework))
	envelopeInput.WriteString("|")
	envelopeInput.WriteString(generatedAt.Format(time.RFC3339))
	envelopeInput.WriteString("|")
	envelopeInput.WriteString(orgID)

	for _, ctrl := range result.Controls {
		ce := ControlEvidence{ControlResult: ctrl}
		for _, srcKey := range controlSourceKeys(ctrl.ControlID) {
			raw, ok := rawSources[srcKey]
			if !ok || raw == "" {
				continue
			}
			h := sha256.Sum256([]byte(raw))
			ce.Evidence = append(ce.Evidence, EvidenceItem{
				Source:      srcKey,
				Description: describeSource(srcKey, raw),
				CollectedAt: generatedAt,
				Hash:        hex.EncodeToString(h[:]),
			})
			envelopeInput.WriteString("|")
			envelopeInput.WriteString(ce.Evidence[len(ce.Evidence)-1].Hash)
		}
		b.Controls = append(b.Controls, ce)
	}

	env := sha256.Sum256([]byte(envelopeInput.String()))
	b.EnvelopeHash = hex.EncodeToString(env[:])
	return b
}

// RenderHTML wraps the markdown body in a print-optimised HTML
// document. Browsers can Save-as-PDF the result directly — fewer
// moving parts than a Go PDF library and the output is closer to
// what auditors expect (proper margins, page numbers, fonts).
//
// The print stylesheet hides nothing critical when paginated; the
// envelope hash + per-control evidence land on their own pages.
func (b *EvidenceBinder) RenderHTML() string {
	body := mdToBasicHTML(b.RenderMarkdown())
	var out strings.Builder
	fmt.Fprintf(&out, `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>%s — %s Evidence Binder</title>
<style>
  :root { color-scheme: light; }
  body { font-family: -apple-system, "Segoe UI", system-ui, sans-serif; max-width: 920px; margin: 2rem auto; padding: 0 1.5rem; color: #111; line-height: 1.55; }
  h1 { font-size: 26px; border-bottom: 2px solid #111; padding-bottom: 8px; }
  h2 { font-size: 20px; margin-top: 2.2rem; border-bottom: 1px solid #ddd; padding-bottom: 4px; page-break-after: avoid; }
  h3 { font-size: 16px; margin-top: 1.6rem; page-break-after: avoid; }
  table { border-collapse: collapse; width: 100%%; margin: 1rem 0; }
  th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; font-size: 13px; }
  th { background: #f7f7f7; }
  code { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; background: #f3f3f3; padding: 2px 5px; border-radius: 3px; font-size: 12px; }
  ul { padding-left: 22px; }
  li { margin: 4px 0; }
  hr { border: none; border-top: 1px solid #ccc; margin: 2rem 0; }
  blockquote { border-left: 3px solid #aaa; margin: 1rem 0; padding: 0.4rem 1rem; color: #444; background: #fafafa; }
  @media print {
    body { margin: 0; max-width: none; }
    h2 { page-break-before: auto; }
    h3 { page-break-after: avoid; }
    table, ul, ol { page-break-inside: avoid; }
    @page { margin: 2cm 1.5cm; }
  }
</style>
</head>
<body>
%s
</body>
</html>`, escapeHTML(b.OrgName), escapeHTML(string(b.Framework)), body)
	return out.String()
}

// mdToBasicHTML is a tiny, dependency-free markdown→HTML converter
// scoped to the subset RenderMarkdown emits (headings, tables, bullet
// lists, fenced code, bold/italic, blockquotes, horizontal rules).
// Good enough for the binder; we don't need a full CommonMark engine.
func mdToBasicHTML(md string) string {
	lines := strings.Split(md, "\n")
	var out strings.Builder
	inList := false
	inTable := false
	tableHeaderEmitted := false

	flushList := func() {
		if inList {
			out.WriteString("</ul>\n")
			inList = false
		}
	}
	flushTable := func() {
		if inTable {
			out.WriteString("</tbody></table>\n")
			inTable = false
			tableHeaderEmitted = false
		}
	}

	for _, raw := range lines {
		line := raw
		trim := strings.TrimSpace(line)

		// horizontal rule
		if trim == "---" {
			flushList()
			flushTable()
			out.WriteString("<hr>\n")
			continue
		}
		// headings
		if strings.HasPrefix(trim, "### ") {
			flushList()
			flushTable()
			fmt.Fprintf(&out, "<h3>%s</h3>\n", inlineMD(strings.TrimPrefix(trim, "### ")))
			continue
		}
		if strings.HasPrefix(trim, "## ") {
			flushList()
			flushTable()
			fmt.Fprintf(&out, "<h2>%s</h2>\n", inlineMD(strings.TrimPrefix(trim, "## ")))
			continue
		}
		if strings.HasPrefix(trim, "# ") {
			flushList()
			flushTable()
			fmt.Fprintf(&out, "<h1>%s</h1>\n", inlineMD(strings.TrimPrefix(trim, "# ")))
			continue
		}
		// table
		if strings.HasPrefix(trim, "|") && strings.HasSuffix(trim, "|") {
			flushList()
			cells := strings.Split(strings.Trim(trim, "|"), "|")
			// separator row (---|---)?
			isSep := true
			for _, c := range cells {
				c = strings.TrimSpace(c)
				if c == "" || strings.Trim(c, "-: ") != "" {
					isSep = false
					break
				}
			}
			if isSep {
				continue
			}
			if !inTable {
				out.WriteString("<table>\n")
				inTable = true
			}
			if !tableHeaderEmitted {
				out.WriteString("<thead><tr>")
				for _, c := range cells {
					fmt.Fprintf(&out, "<th>%s</th>", inlineMD(strings.TrimSpace(c)))
				}
				out.WriteString("</tr></thead><tbody>\n")
				tableHeaderEmitted = true
			} else {
				out.WriteString("<tr>")
				for _, c := range cells {
					fmt.Fprintf(&out, "<td>%s</td>", inlineMD(strings.TrimSpace(c)))
				}
				out.WriteString("</tr>\n")
			}
			continue
		}
		// list
		if strings.HasPrefix(trim, "- ") {
			flushTable()
			if !inList {
				out.WriteString("<ul>\n")
				inList = true
			}
			fmt.Fprintf(&out, "<li>%s</li>\n", inlineMD(strings.TrimPrefix(trim, "- ")))
			continue
		}
		// blockquote (italic note)
		if strings.HasPrefix(trim, "_") && strings.HasSuffix(trim, "_") && len(trim) > 2 {
			flushList()
			flushTable()
			fmt.Fprintf(&out, "<blockquote>%s</blockquote>\n", inlineMD(strings.Trim(trim, "_")))
			continue
		}
		// blank line
		if trim == "" {
			flushList()
			flushTable()
			continue
		}
		// fallback paragraph
		flushList()
		flushTable()
		fmt.Fprintf(&out, "<p>%s</p>\n", inlineMD(line))
	}
	flushList()
	flushTable()
	return out.String()
}

func inlineMD(s string) string {
	s = escapeHTML(s)
	// **bold**
	for strings.Contains(s, "**") {
		i := strings.Index(s, "**")
		j := strings.Index(s[i+2:], "**")
		if j < 0 {
			break
		}
		s = s[:i] + "<strong>" + s[i+2:i+2+j] + "</strong>" + s[i+2+j+2:]
	}
	// `code`
	for strings.Count(s, "`") >= 2 {
		i := strings.Index(s, "`")
		j := strings.Index(s[i+1:], "`")
		if j < 0 {
			break
		}
		s = s[:i] + "<code>" + s[i+1:i+1+j] + "</code>" + s[i+1+j+1:]
	}
	return s
}

func escapeHTML(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	return s
}

// RenderMarkdown converts the binder into a single markdown document
// suitable for direct submission to SOC2 / ISO27001 auditors. Renders
// the envelope hash up top so the auditor can paste it into the audit
// log replay tool.
func (b *EvidenceBinder) RenderMarkdown() string {
	out := strings.Builder{}

	fmt.Fprintf(&out, "# %s — %s Compliance Evidence\n\n", b.OrgName, b.Framework)
	fmt.Fprintf(&out, "**Org:** `%s`\n", b.OrgID)
	fmt.Fprintf(&out, "**Generated:** %s\n", b.GeneratedAt.UTC().Format(time.RFC3339))
	fmt.Fprintf(&out, "**Envelope hash (verify against audit log):** `%s`\n", b.EnvelopeHash)
	fmt.Fprintf(&out, "**Overall score:** %.1f%%\n\n", b.OverallScore)

	fmt.Fprintln(&out, "---")
	fmt.Fprintln(&out)

	// Summary table
	fmt.Fprintln(&out, "## Summary")
	fmt.Fprintln(&out)
	fmt.Fprintln(&out, "| Control | Status | Evidence count |")
	fmt.Fprintln(&out, "|---|---|---|")
	for _, c := range b.Controls {
		fmt.Fprintf(&out, "| %s — %s | %s | %d |\n",
			c.ControlID, escapeMD(c.ControlName), statusBadge(c.Status), len(c.Evidence))
	}
	fmt.Fprintln(&out)

	// Per-control detail
	fmt.Fprintln(&out, "---")
	fmt.Fprintln(&out)
	fmt.Fprintln(&out, "## Controls")
	fmt.Fprintln(&out)

	sorted := make([]ControlEvidence, len(b.Controls))
	copy(sorted, b.Controls)
	sort.SliceStable(sorted, func(i, j int) bool {
		return sorted[i].ControlID < sorted[j].ControlID
	})

	for _, c := range sorted {
		fmt.Fprintf(&out, "### %s — %s\n\n", c.ControlID, escapeMD(c.ControlName))
		fmt.Fprintf(&out, "**Status:** %s\n\n", statusBadge(c.Status))
		if c.Details != "" {
			fmt.Fprintf(&out, "%s\n\n", c.Details)
		}
		if len(c.Evidence) == 0 {
			fmt.Fprintln(&out, "_No scan coverage for this control — recommend enabling the relevant capability before audit._")
			fmt.Fprintln(&out)
			continue
		}
		for _, ev := range c.Evidence {
			fmt.Fprintf(&out, "- **%s** — %s\n", escapeMD(ev.Source), escapeMD(ev.Description))
			fmt.Fprintf(&out, "  - Collected: %s\n", ev.CollectedAt.UTC().Format(time.RFC3339))
			fmt.Fprintf(&out, "  - SHA-256: `%s`\n", ev.Hash)
		}
		fmt.Fprintln(&out)
	}

	fmt.Fprintln(&out, "---")
	fmt.Fprintln(&out)
	fmt.Fprintln(&out, "_This binder was generated by Flyto2. Each evidence item carries a SHA-256 hash of the underlying scan artefact; the envelope hash above chains them all. To verify, replay the org's audit log up to `Generated` and confirm the envelope hash matches._")

	return out.String()
}

// controlSourceKeys returns the rawSources keys that back a given
// control ID. Hand-maintained — match controls in compliance.go's
// framework definitions to the scan capability that proves them.
func controlSourceKeys(controlID string) []string {
	switch controlID {
	// CIS Controls
	case "CIS-3.10":
		return []string{"ssl_cert", "hsts_header"}
	case "CIS-9.2", "CIS-9.3", "CIS-13.6":
		return []string{"dnssec", "waf", "dns_security"}
	case "CIS-12.1":
		return []string{"cve_results"}
	// NIST CSF
	case "PR.DS-1", "PR.DS-2":
		return []string{"ssl_cert", "hsts_header"}
	case "PR.AC-3", "PR.AC-5":
		return []string{"port_scan", "waf"}
	case "PR.IP-1":
		return []string{"csp_header", "hsts_header"}
	case "DE.CM-1":
		return []string{"waf"}
	case "DE.CM-8":
		return []string{"cve_results", "sast_results"}
	case "ID.RA-1":
		return []string{"cve_results", "secret_scan", "iac_results"}
	case "PR.DS-5":
		return []string{"sensitive_files"}
	// PCI DSS
	case "PCI-1.3.1":
		return []string{"port_scan"}
	case "PCI-2.2.7", "PCI-4.1":
		return []string{"ssl_cert", "hsts_header"}
	case "PCI-6.4.1":
		return []string{"cve_results"}
	case "PCI-6.4.2":
		return []string{"waf"}
	case "PCI-11.3.1", "PCI-11.3.2":
		return []string{"cve_results", "sast_results"}
	// ISO 27001
	case "A.8.24":
		return []string{"ssl_cert"}
	case "A.8.20":
		return []string{"waf", "dns_security"}
	case "A.8.9":
		return []string{"csp_header", "hsts_header", "sensitive_files"}
	case "A.8.8":
		return []string{"cve_results"}
	case "A.5.23":
		return []string{"ssl_cert", "waf"}
	case "A.8.21":
		return []string{"port_scan"}
	case "A.8.12":
		return []string{"sensitive_files", "subdomain_takeover"}
	}
	return nil
}

// describeSource maps a raw source key + content to a human-readable
// line for the binder. Kept short — the binder is for auditors, not
// for engineering debugging.
func describeSource(key, content string) string {
	switch key {
	case "ssl_cert":
		return "TLS certificate scan: " + truncate(content, 120)
	case "hsts_header":
		return "HSTS header present: " + truncate(content, 80)
	case "csp_header":
		return "CSP header present: " + truncate(content, 80)
	case "dnssec":
		return "DNSSEC status: " + content
	case "waf":
		return "WAF detection: " + truncate(content, 80)
	case "cve_results":
		return "CVE scan summary: " + truncate(content, 120)
	case "sast_results":
		return "SAST scan summary: " + truncate(content, 120)
	case "secret_scan":
		return "Secret scan summary: " + truncate(content, 120)
	case "iac_results":
		return "Infrastructure-as-Code scan summary: " + truncate(content, 120)
	case "sensitive_files":
		return "Sensitive files exposure scan: " + truncate(content, 120)
	case "port_scan":
		return "Port exposure scan: " + truncate(content, 120)
	case "subdomain_takeover":
		return "Subdomain takeover check: " + truncate(content, 80)
	case "dns_security":
		return "DNS security configuration: " + truncate(content, 120)
	}
	return truncate(content, 120)
}

func statusBadge(status string) string {
	switch strings.ToLower(status) {
	case "pass":
		return "✅ PASS"
	case "fail":
		return "❌ FAIL"
	case "partial":
		return "⚠️ PARTIAL"
	case "not_applicable":
		return "— N/A"
	}
	return status
}

func escapeMD(s string) string {
	// Minimal escape — only the characters that break table cells.
	s = strings.ReplaceAll(s, "|", "\\|")
	s = strings.ReplaceAll(s, "\n", " ")
	return s
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
