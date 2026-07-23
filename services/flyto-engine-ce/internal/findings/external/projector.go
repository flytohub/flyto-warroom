// Package external projects attack_surface scanner metadata into
// per-resource findings. Audit B3: previously the frontend
// (flyto-code/.../buildDomainRows.ts) parsed `attack_surface.metadata`
// JSON in the browser and synthesised findings from five generators
// (HTTP / DNS / ports / SSL / sensitive_files). That violated the
// backend-truth rule and silently drifted whenever the scanners
// changed their metadata shape.
//
// This package is the canonical server-side implementation. It is
// store-agnostic — callers pass (assetType, metadataJSON) and get
// back zero or more Findings. The handler layer is responsible for
// looking up attack_surface rows + threading them through Project.
//
// i18n keys mirror the existing frontend keys (`dast.*`) so the
// migration can swap consumers without touching locale files.
//
// Out of scope for B3: per-finding first_seen_at / last_seen_at
// lifecycle tracking — that needs a separate writer table. Findings
// today are projected on read; staleness is implicit (the asset
// row's discovered_at). A follow-up audit item adds the lifecycle
// ledger.
package external

import (
	"encoding/json"
	"fmt"
	"sort"
)

// Finding is the wire shape the kernel endpoint ships per resource.
// Same per-Finding contract the audit doc (DOMAINS_VIEW_KERNEL_SPEC.md)
// specified — i18n keys, not localised text, so backend stays
// locale-agnostic and the frontend's tOr(key, fallback) flow keeps
// working.
//
// `Evidence` is a category-specific bag. Frontend renders it inside
// the row drawer; backend just passes scanner facts through.
// Examples by category:
//
//	http_endpoint     → { "server": "nginx/1.18" }
//	http_endpoint     → { "powered_by": "PHP/7.4" }
//	port_scan         → { "port": 6379, "service": "redis" }
//	sensitive_files   → { "files": ["/git/.git/config", ".env"] }
//
// `ID` is a stable fingerprint per (resource scope, finding key) so
// the row stays deterministic across renders even when scanner data
// changes order. Handlers wrap this in their own resource-scoped
// fingerprint for cross-resource dedup.
type Finding struct {
	ID       string         `json:"id"`
	Category string         `json:"category"` // frontend | attack_surface | rest_api | graphql | dns
	Severity string         `json:"severity"` // CRITICAL | HIGH | MEDIUM | LOW
	TitleKey string         `json:"title_key"`
	DescKey  string         `json:"desc_key"`
	Evidence map[string]any `json:"evidence,omitempty"`
}

// Project projects one attack_surface row's metadata into findings.
// Returns nil for asset types we don't classify (subdomain identity
// rows etc.) — those carry no finding-shaped data. Empty metadata
// or unparseable JSON also returns nil; the projector never crashes
// the handler.
func Project(assetType, metadataJSON string) []Finding {
	if assetType == "" {
		return nil
	}
	switch assetType {
	case "http_endpoint":
		return projectHTTP(metadataJSON)
	case "dns_security":
		return projectDNS(metadataJSON)
	case "port_scan":
		return projectPorts(metadataJSON)
	case "ssl_cert":
		return projectSSL(metadataJSON)
	case "sensitive_files":
		return projectSensitiveFiles(metadataJSON)
	}
	return nil
}

// ── HTTP endpoint ────────────────────────────────────────────────

// dangerousPorts mirrors the frontend's hand-curated list of ports
// that we surface as findings when discovered open. Critical bucket
// = database / cache / search (data-loss blast radius); High = the
// rest (legacy auth, file shares, remote desktop, etc.).
var (
	dangerousPorts = map[int]bool{
		21: true, 23: true, 25: true, 445: true, 1433: true,
		3306: true, 3389: true, 5432: true, 5900: true, 6379: true,
		9200: true, 27017: true,
	}
	criticalPorts = map[int]bool{
		6379: true, 27017: true, 9200: true, 3306: true,
		5432: true, 1433: true,
	}
)

type httpMeta struct {
	Scheme  string            `json:"scheme"`
	Status  int               `json:"status"`
	Headers map[string]string `json:"headers"`
}

func projectHTTP(metadataJSON string) []Finding {
	var m httpMeta
	if metadataJSON == "" {
		return nil
	}
	if err := json.Unmarshal([]byte(metadataJSON), &m); err != nil {
		return nil
	}

	var out []Finding
	switch m.Scheme {
	case "https":
		h := m.Headers
		if h == nil {
			h = map[string]string{}
		}
		if h["Strict-Transport-Security"] == "" {
			out = append(out, Finding{
				ID:       "http:hsts_not_set",
				Category: "frontend",
				Severity: "HIGH",
				TitleKey: "dast.hstsNotSet",
				DescKey:  "dast.hstsNotSetDesc",
			})
		}
		csp := h["Content-Security-Policy"]
		if csp == "" {
			out = append(out, Finding{
				ID:       "http:csp_not_set",
				Category: "frontend",
				Severity: "HIGH",
				TitleKey: "dast.cspNotSet",
				DescKey:  "dast.cspNotSetDesc",
			})
		}
		if s := h["Server"]; s != "" {
			out = append(out, Finding{
				ID:       "http:server_leak",
				Category: "frontend",
				Severity: "LOW",
				TitleKey: "dast.serverLeak",
				DescKey:  "dast.serverLeakDesc",
				Evidence: map[string]any{"server": s},
			})
		}
		if pb := h["X-Powered-By"]; pb != "" {
			out = append(out, Finding{
				ID:       "http:powered_by_leak",
				Category: "frontend",
				Severity: "MEDIUM",
				TitleKey: "dast.poweredByLeak",
				DescKey:  "dast.poweredByLeakDesc",
				Evidence: map[string]any{"powered_by": pb},
			})
		}
		if h["X-Content-Type-Options"] == "" {
			out = append(out, Finding{
				ID:       "http:no_sniff",
				Category: "frontend",
				Severity: "MEDIUM",
				TitleKey: "dast.noSniff",
				DescKey:  "dast.noSniffDesc",
			})
		}
		// Clickjacking guard: X-Frame-Options OR CSP frame-ancestors
		// directive. Frontend's check uses substring containment on
		// CSP — keep parity.
		if h["X-Frame-Options"] == "" && !containsFrameAncestors(csp) {
			out = append(out, Finding{
				ID:       "http:clickjacking",
				Category: "frontend",
				Severity: "MEDIUM",
				TitleKey: "dast.clickjacking",
				DescKey:  "dast.clickjackingDesc",
			})
		}
	case "http":
		// Site reachable over plain HTTP without redirect → bad.
		// 301/302 means the operator wired the redirect already;
		// no finding in that case.
		if m.Status != 0 && m.Status != 301 && m.Status != 302 {
			out = append(out, Finding{
				ID:       "http:http_only",
				Category: "frontend",
				Severity: "HIGH",
				TitleKey: "dast.httpOnly",
				DescKey:  "dast.httpOnlyDesc",
				Evidence: map[string]any{"status": m.Status},
			})
		}
	}
	return out
}

func containsFrameAncestors(csp string) bool {
	// Same heuristic as the frontend's String.includes — substring
	// match is loose enough to catch most CSP forms (`frame-ancestors
	// 'self'`, `frame-ancestors *.example.com`, etc.).
	return csp != "" && indexOf(csp, "frame-ancestors") >= 0
}

// indexOf is a tiny strings.Contains shim that avoids importing
// strings for one use — keeps the projector dependency-light.
func indexOf(s, substr string) int {
	n := len(substr)
	if n == 0 {
		return 0
	}
	for i := 0; i+n <= len(s); i++ {
		if s[i:i+n] == substr {
			return i
		}
	}
	return -1
}

// ── DNS security ─────────────────────────────────────────────────

type dnsMeta struct {
	SPF            bool  `json:"spf"`
	DMARC          bool  `json:"dmarc"`
	DNSSEC         bool  `json:"dnssec"`
	CAA            *bool `json:"caa"` // pointer so we can tell "missing" vs "false"
	AXFRVulnerable bool  `json:"axfr_vulnerable"`
}

func projectDNS(metadataJSON string) []Finding {
	if metadataJSON == "" {
		return nil
	}
	var m dnsMeta
	if err := json.Unmarshal([]byte(metadataJSON), &m); err != nil {
		return nil
	}
	var out []Finding
	if !m.SPF {
		out = append(out, Finding{
			ID: "dns:no_spf", Category: "attack_surface", Severity: "MEDIUM",
			TitleKey: "dast.noSpf", DescKey: "dast.noSpfDesc",
		})
	}
	if !m.DMARC {
		out = append(out, Finding{
			ID: "dns:no_dmarc", Category: "attack_surface", Severity: "MEDIUM",
			TitleKey: "dast.noDmarc", DescKey: "dast.noDmarcDesc",
		})
	}
	if !m.DNSSEC {
		out = append(out, Finding{
			ID: "dns:no_dnssec", Category: "attack_surface", Severity: "LOW",
			TitleKey: "dast.noDnssec", DescKey: "dast.noDnssecDesc",
		})
	}
	// Only flag CAA when scanner explicitly reported `false`. A
	// missing `caa` field (nil pointer) means "scanner didn't
	// determine" — don't fabricate a finding. Mirrors frontend's
	// `m.caa === false` strict-equality check.
	if m.CAA != nil && !*m.CAA {
		out = append(out, Finding{
			ID: "dns:no_caa", Category: "attack_surface", Severity: "LOW",
			TitleKey: "dast.noCaa", DescKey: "dast.noCaaDesc",
		})
	}
	if m.AXFRVulnerable {
		out = append(out, Finding{
			ID: "dns:axfr_vulnerable", Category: "attack_surface", Severity: "HIGH",
			TitleKey: "dast.axfrVulnerable", DescKey: "dast.axfrVulnerableDesc",
		})
	}
	return out
}

// ── Port scan ────────────────────────────────────────────────────

type portMeta struct {
	OpenPorts []struct {
		Port    int    `json:"port"`
		Service string `json:"service"`
	} `json:"open_ports"`
}

func projectPorts(metadataJSON string) []Finding {
	if metadataJSON == "" {
		return nil
	}
	var m portMeta
	if err := json.Unmarshal([]byte(metadataJSON), &m); err != nil {
		return nil
	}
	// Deterministic order — sort by port number so two scans of the
	// same host produce identical Finding sequences. Without this,
	// scanner ordering quirks would churn the operator's view.
	sort.SliceStable(m.OpenPorts, func(i, j int) bool {
		return m.OpenPorts[i].Port < m.OpenPorts[j].Port
	})
	var out []Finding
	for _, p := range m.OpenPorts {
		if !dangerousPorts[p.Port] {
			continue
		}
		sev := "HIGH"
		if criticalPorts[p.Port] {
			sev = "CRITICAL"
		}
		out = append(out, Finding{
			ID:       fmt.Sprintf("port:open:%d", p.Port),
			Category: "attack_surface",
			Severity: sev,
			TitleKey: "dast.openPort",
			DescKey:  "dast.openPortDesc",
			Evidence: map[string]any{"port": p.Port, "service": p.Service},
		})
	}
	return out
}

// ── SSL / TLS cert ───────────────────────────────────────────────

type sslMeta struct {
	// Pointer so we can distinguish missing from explicit false —
	// frontend's check is `ssl.hsts_preload === false`. Only flag
	// when the scanner explicitly reported no preload.
	HSTSPreload *bool `json:"hsts_preload"`
}

func projectSSL(metadataJSON string) []Finding {
	if metadataJSON == "" {
		return nil
	}
	var m sslMeta
	if err := json.Unmarshal([]byte(metadataJSON), &m); err != nil {
		return nil
	}
	if m.HSTSPreload != nil && !*m.HSTSPreload {
		return []Finding{{
			ID: "ssl:no_hsts_preload", Category: "frontend", Severity: "LOW",
			TitleKey: "dast.noHstsPreload", DescKey: "dast.noHstsPreloadDesc",
		}}
	}
	return nil
}

// ── Sensitive files ──────────────────────────────────────────────

type sensitiveFile struct {
	Path string `json:"path"`
	Risk string `json:"risk"`
}

type sensitiveFilesMeta struct {
	Files []sensitiveFile `json:"files"`
}

func projectSensitiveFiles(metadataJSON string) []Finding {
	if metadataJSON == "" {
		return nil
	}
	var m sensitiveFilesMeta
	if err := json.Unmarshal([]byte(metadataJSON), &m); err != nil {
		return nil
	}
	if len(m.Files) == 0 {
		return nil
	}
	var critical, high []string
	for _, f := range m.Files {
		switch f.Risk {
		case "critical":
			critical = append(critical, f.Path)
		case "high":
			high = append(high, f.Path)
		}
	}
	var out []Finding
	if len(critical) > 0 {
		out = append(out, Finding{
			ID:       "sensitive_files:critical",
			Category: "attack_surface",
			Severity: "CRITICAL",
			TitleKey: "dast.sensitiveFilesCritical",
			DescKey:  "dast.sensitiveFilesCriticalDesc",
			Evidence: map[string]any{"files": critical},
		})
	}
	if len(high) > 0 {
		out = append(out, Finding{
			ID:       "sensitive_files:high",
			Category: "attack_surface",
			Severity: "HIGH",
			TitleKey: "dast.sensitiveFilesHigh",
			DescKey:  "dast.sensitiveFilesHighDesc",
			Evidence: map[string]any{"files": high},
		})
	}
	return out
}
