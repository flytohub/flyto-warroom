/**
 * Unified Scoring — categories, sub-vectors, weights, formulas.
 *
 * Combines internal code analysis AND external attack surface into one
 * 250-900 score. Categories sum to 100%.
 *
 * Sub-vectors have a `mode`:
 *   "scored"    → counts toward score, weight is active
 *   "observing" → data collected & shown (dashed border + eye icon) but excluded from score
 *   "context"   → informational only, never scored (grayed out + info icon)
 *
 * Cross-dimensional modifiers (blast radius, PR adjacency, taint,
 * pentest, autofix) are computed server-side by internal/correlate
 * and shipped on every score response — frontend renders verbatim
 * (see [[feedback-frontend-backend-truth-handoff]]).
 */

import { t } from '@lib/i18n';
import {
  ShieldAlert, Key, Bug, Zap, Trash2, Radar, Clock, FileText,
  Lock, Globe, Shield, Server, FolderOpen, Flame, Copy,
  Scale, ListChecks, Network as NetworkIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { RepoHealthSummary, RepoArch, AttackSurfaceAsset } from '@lib/engine'
import type { DomainRow } from '@compounds/domains/types'

/* ── Unified Scoring Input ────────────────────────── */

export interface UnifiedScoringInput {
  // Internal code data
  repos: RepoHealthSummary[]
  scannedCount: number
  totalCount: number

  // Architecture data (for taint flows)
  archRepos?: RepoArch[]

  // Attack surface data
  domains?: DomainRow[]

  // Server authoritative scores
  serverAvgScore?: number
  serverAvgGrade?: string
}

/* ── Types ─────────────────────────────────────── */

/**
 * Sub-vector scoring mode:
 *   "scored"    → Counts toward the overall score. Weight is active.
 *   "observing" → Data collected & displayed, but excluded from score.
 *                  Can be promoted to "scored" by consultant. Shown with
 *                  dashed border + eye icon.
 *   "context"   → Informational only. Never counts toward score.
 *                  Shown grayed out with info icon. No grade circle.
 */
export type ScoringMode = 'scored' | 'observing' | 'context'

export interface SubVector {
  id: string
  label: string
  icon: LucideIcon
  weight: number            // Within category (0-1), only used when mode="scored"
  color: string
  mode: ScoringMode         // replaces impactsRating
  drillDownType: 'repo' | 'domain'
  /** Warroom section to navigate to for detailed view */
  drillDownSection?: string
  /** Org-level heuristic: 0-100 or null (N/A) */
  extract: (input: UnifiedScoringInput) => number | null
  /** Per-repo score for drill-down: 0-100 or null */
  perRepo: (repo: RepoHealthSummary) => number | null
  /** Per-repo raw value label */
  perRepoLabel: (repo: RepoHealthSummary) => string
  /** Per-domain score for drill-down: 0-100 or null */
  perDomain?: (domain: DomainRow) => number | null
  /** Per-domain raw value label */
  perDomainLabel?: (domain: DomainRow) => string
}

export interface Category {
  id: string
  label: string
  weight: number  // Global (0-1), all categories sum to 1.0
  color: string
  subVectors: SubVector[]
}

/* ── Helpers ─────────────────────────────────────── */

const clamp = (v: number) => Math.max(0, Math.min(100, v))

function parseMeta(asset?: AttackSurfaceAsset): Record<string, any> {
  if (!asset?.metadata) return {}
  try { return JSON.parse(asset.metadata) } catch { return {} }
}

/* ── Code Security heuristics ────────────────────── */

function cveOrgScore(input: UnifiedScoringInput): number | null {
  const scanned = input.repos.filter(r => r.cve_total !== undefined)
  if (scanned.length === 0) return null
  const totalSev = scanned.reduce((s, r) =>
    s + (r.cve_critical ?? 0) * 10 + (r.cve_high ?? 0) * 5 +
    Math.max(0, (r.cve_total ?? 0) - (r.cve_critical ?? 0) - (r.cve_high ?? 0)), 0)
  return clamp(100 - (totalSev / scanned.length) * 2)
}
function cveRepoScore(r: RepoHealthSummary): number | null {
  if (r.cve_total === undefined) return null
  const sev = (r.cve_critical ?? 0) * 10 + (r.cve_high ?? 0) * 5 +
    Math.max(0, (r.cve_total ?? 0) - (r.cve_critical ?? 0) - (r.cve_high ?? 0))
  return clamp(100 - sev * 2)
}

function secretsOrgScore(input: UnifiedScoringInput): number | null {
  const scanned = input.repos.filter(r => r.secret_count !== undefined)
  if (scanned.length === 0) return null
  const avg = scanned.reduce((s, r) => s + (r.secret_count ?? 0), 0) / scanned.length
  return clamp(100 - avg * 20)
}
function secretsRepoScore(r: RepoHealthSummary): number | null {
  if (r.secret_count === undefined) return null
  return clamp(100 - (r.secret_count ?? 0) * 20)
}

function sastOrgScore(input: UnifiedScoringInput): number | null {
  const scanned = input.repos.filter(r => r.security_findings !== undefined)
  if (scanned.length === 0) return null
  const avg = scanned.reduce((s, r) => {
    const sast = Math.max(0, (r.security_findings ?? 0) - (r.cve_total ?? 0))
    return s + sast
  }, 0) / scanned.length
  return clamp(100 - avg * 1.5)
}
function sastRepoScore(r: RepoHealthSummary): number | null {
  if (r.security_findings === undefined) return null
  const sast = Math.max(0, (r.security_findings ?? 0) - (r.cve_total ?? 0))
  return clamp(100 - sast * 1.5)
}

function taintOrgScore(input: UnifiedScoringInput): number | null {
  const archRepos = input.archRepos
  if (!archRepos || archRepos.length === 0) return null
  const withTaint = archRepos.filter(r => r.taint_unsanitized !== undefined)
  if (withTaint.length === 0) return null
  const avg = withTaint.reduce((s, r) => s + (r.taint_unsanitized ?? 0), 0) / withTaint.length
  return clamp(100 - avg * 8)
}

function malwareOrgScore(input: UnifiedScoringInput): number | null {
  // Malware detection: currently no dedicated scanner produces a malware_count
  // field, so we derive the score from security_findings presence. Repos that
  // have been scanned without malware alerts score 100 (clean). When a
  // dedicated malware scanner is added to the engine, this function should
  // read the per-repo malware_count and penalise accordingly.
  const scanned = input.repos.filter(r => r.security_findings !== undefined)
  if (scanned.length === 0) return null
  return 100
}

/* ── Attack Surface heuristics (per-domain) ──────── */

// ── MANDATORY: no asset = bad score, not N/A ──
// These are security basics every domain MUST have.

function sslDomainScore(d: DomainRow): number | null {
  const asset = d.assets.find(a => a.asset_type === 'ssl_cert')
  if (!asset) return 20 // No SSL at all = very bad, not N/A
  const m = parseMeta(asset)
  let score = 100
  if (m.is_expired) score -= 40
  if (m.is_self_signed) score -= 30
  if (m.tls_version && !['TLS 1.2', 'TLS 1.3'].includes(m.tls_version)) score -= 30
  if (m.cipher_suite && /RC4|DES|NULL|EXPORT/i.test(m.cipher_suite)) score -= 20
  if (m.hsts_preload === false) score -= 10
  return clamp(score)
}

function dnsDomainScore(d: DomainRow): number | null {
  const asset = d.assets.find(a => a.asset_type === 'dns_security')
  if (!asset) return 50 // No DNS security data = assume missing DNSSEC/CAA
  const m = parseMeta(asset)
  let score = 100
  if (!m.dnssec) score -= 15
  if (m.caa === false) score -= 10
  if (m.axfr_vulnerable) score -= 40
  return clamp(score)
}

function headersDomainScore(d: DomainRow): number | null {
  const asset = d.assets.find(a => a.asset_type === 'http_endpoint' && (() => {
    try { return JSON.parse(a.metadata).scheme === 'https' } catch { return false }
  })())
  if (!asset) return 30 // No headers data = assume all missing
  const m = parseMeta(asset)
  const h = (m.headers ?? {}) as Record<string, string>
  let score = 100
  if (!h['Strict-Transport-Security']) score -= 20
  if (!h['Content-Security-Policy']) score -= 25
  if (!h['X-Content-Type-Options']) score -= 15
  if (!h['X-Frame-Options'] && !h['Content-Security-Policy']?.includes('frame-ancestors')) score -= 10
  if (h['Server']) score -= 10
  if (h['X-Powered-By']) score -= 15
  return clamp(score)
}

function portsDomainScore(d: DomainRow): number | null {
  const asset = d.assets.find(a => a.asset_type === 'port_scan')
  if (!asset) return 80 // No port data = assume clean (can't penalize what we can't see)
  const m = parseMeta(asset)
  const ports = (m.open_ports ?? []) as Array<{ port: number }>
  let score = 100
  const dbPorts = [3306, 5432, 1433, 27017, 6379, 9200]
  const rdpVnc = [3389, 5900]
  const ftpTelnet = [21, 23]
  for (const p of ports) {
    if (dbPorts.includes(p.port)) score -= 20
    else if (rdpVnc.includes(p.port)) score -= 15
    else if (ftpTelnet.includes(p.port)) score -= 15
    else if (p.port === 25) score -= 10
    else if (p.port === 445) score -= 10
  }
  return clamp(score)
}

function sensitiveDomainScore(d: DomainRow): number | null {
  const asset = d.assets.find(a => a.asset_type === 'sensitive_files')
  if (!asset) return 90 // No scan = assume mostly clean
  const m = parseMeta(asset)
  const files = (m.files ?? []) as Array<{ risk: string }>
  if (files.length === 0) return 100
  let score = 100
  for (const f of files) {
    if (f.risk === 'critical') score -= 30
    else if (f.risk === 'high') score -= 15
  }
  return clamp(score)
}

function wafDomainScore(d: DomainRow): number | null {
  const asset = d.assets.find(a => a.asset_type === 'waf')
  // No WAF data + production = assume no WAF = bad
  const env = d.project?.environment ?? 'production'
  if (!asset) return env === 'production' ? 30 : 100
  const m = parseMeta(asset)
  const hasWAF = (m.detected?.length ?? 0) > 0 || m.behavior_detected
  if (env !== 'production') return 100
  return hasWAF ? 100 : 30
}

// ── OPTIONAL: no asset = null (don't penalize) ──
// These are features not every domain needs.

function apiDomainScore(d: DomainRow): number | null {
  const verifyAsset = d.assets.find(a => a.asset_type === 'api_verify')
  const gqlAsset = d.assets.find(a => a.asset_type === 'graphql')
  if (!verifyAsset && !gqlAsset) return null // API is optional
  let score = 100
  if (verifyAsset) {
    const m = parseMeta(verifyAsset)
    const routes = (m.routes ?? []) as Array<{ alive: boolean; auth_needed: boolean; method: string; security?: string[] }>
    const unauthMutating = routes.filter(r =>
      r.alive && !r.auth_needed && ['DELETE', 'PUT', 'PATCH'].includes(r.method)
    ).length
    score -= Math.min(3, unauthMutating) * 25
    const wildcardCors = routes.some(r =>
      r.security?.some(s => s.includes('wildcard origin'))
    )
    if (wildcardCors) score -= 20
  }
  if (gqlAsset) {
    const m = parseMeta(gqlAsset)
    if (m.found && m.introspection === 'enabled') score -= 20
  }
  return clamp(score)
}


/** Average domain scores with production domains weighted 2x */
function avgDomainScores(domains: DomainRow[], scoreFn: (d: DomainRow) => number | null): number | null {
  let totalWeight = 0
  let totalScore = 0
  for (const d of domains) {
    const s = scoreFn(d)
    if (s === null) continue
    const w = (d.project?.environment ?? 'production') === 'production' ? 2 : 1
    totalWeight += w
    totalScore += s * w
  }
  return totalWeight > 0 ? totalScore / totalWeight : null
}

/* ── Diligence heuristics ────────────────────────── */

function coverageOrgScore(input: UnifiedScoringInput): number | null {
  if (input.totalCount === 0) return null
  return clamp((input.scannedCount / input.totalCount) * 100)
}

/* ── New Attack Surface + Diligence heuristics ──── */

function emailDomainScore(d: DomainRow): number | null {
  // Primary: email_security asset (MTA-STS, TLS-RPT, BIMI, DANE, STARTTLS)
  const emailAsset = d.assets.find(a => a.asset_type === 'email_security')
  if (emailAsset) {
    const m = parseMeta(emailAsset)
    if (m.mx_count === 0) return null // no MX = not an email domain
    return clamp(m.email_score ?? 50)
  }
  // Fallback: derive score from dns_security asset (SPF/DMARC/DKIM)
  const dnsAsset = d.assets.find(a => a.asset_type === 'dns_security')
  if (!dnsAsset) return null
  const dm = parseMeta(dnsAsset)
  // If we have DNS security data, compute a basic email score from SPF/DMARC/DKIM
  let score = 100
  if (!dm.spf) score -= 30
  if (!dm.dmarc) score -= 30
  if (!dm.dkim) score -= 20
  return clamp(score)
}

function breachDomainScore(d: DomainRow): number | null {
  const asset = d.assets.find(a => a.asset_type === 'breach_exposure')
  if (!asset) return null
  const m = parseMeta(asset)
  const count = m.total_breaches ?? 0
  if (count === 0) return 100
  if (count >= 10) return 10
  if (count >= 5) return 30
  if (count >= 2) return 60
  return 80
}

function threatIntelDomainScore(d: DomainRow): number | null {
  const c2 = d.assets.find(a => a.asset_type === 'c2_indicators')
  const rep = d.assets.find(a => a.asset_type === 'ip_reputation')
  if (!c2 && !rep) return null
  let score = 100
  if (c2) {
    const m = parseMeta(c2)
    const indicators = m.total_indicators ?? 0
    if (indicators >= 5) score -= 60
    else if (indicators >= 3) score -= 40
    else if (indicators >= 1) score -= 20
  }
  if (rep) {
    const m = parseMeta(rep)
    const riskScore = m.risk_score ?? 0
    if (riskScore >= 60) score -= 30
    else if (riskScore >= 40) score -= 20
    else if (riskScore >= 20) score -= 10
  }
  return clamp(score)
}

function ipIntelDomainScore(d: DomainRow): number | null {
  const asset = d.assets.find(a => a.asset_type === 'ip_intel')
  if (!asset) return null
  const m = parseMeta(asset)
  const vulns = (m.vulns ?? []).length
  if (vulns === 0) return 100
  if (vulns >= 10) return 20
  if (vulns >= 5) return 50
  return clamp(100 - vulns * 8)
}

function vendorRiskDomainScore(d: DomainRow): number | null {
  const asset = d.assets.find(a => a.asset_type === 'vendor_risk')
  if (!asset) return null
  const m = parseMeta(asset)
  const avgRisk = m.avg_risk_score ?? 0
  return clamp(100 - avgRisk)
}

/* ── Category & Sub-vector Definitions ─────────── */

const noRepoDrill = { perRepo: () => null as number | null, perRepoLabel: () => '' }

export function getCategories(): Category[] {
  return [
  // ── CODE SECURITY (35%) ──
  {
    id: 'code-security',
    label: t('scoring.cat.codeSecurity'),
    weight: 0.35,
    color: '#ef4444',
    subVectors: [
      {
        id: 'vuln-cve', label: t('scoring.sv.cveFindings'), icon: ShieldAlert,
        weight: 0.45, color: '#ef4444', mode: 'scored',
        drillDownType: 'repo', drillDownSection: 'sec-overview',
        extract: cveOrgScore, perRepo: cveRepoScore,
        perRepoLabel: r => `${r.cve_total ?? 0} CVEs (${r.cve_critical ?? 0}C ${r.cve_high ?? 0}H)`,
      },
      {
        id: 'vuln-secrets', label: t('scoring.sv.exposedSecrets'), icon: Key,
        weight: 0.25, color: '#f97316', mode: 'scored',
        drillDownType: 'repo', drillDownSection: 'sec-overview',
        extract: secretsOrgScore, perRepo: secretsRepoScore,
        perRepoLabel: r => `${r.secret_count ?? 0} secrets`,
      },
      {
        id: 'vuln-taint', label: t('scoring.sv.taintFlows'), icon: Flame,
        weight: 0.15, color: '#dc2626', mode: 'scored',
        drillDownType: 'repo', drillDownSection: 'sec-reachability',
        extract: taintOrgScore,
        perRepo: () => null,
        perRepoLabel: () => '',
      },
      {
        id: 'vuln-sast', label: t('scoring.sv.codeFindings'), icon: Bug,
        weight: 0.10, color: '#fb923c', mode: 'scored',
        drillDownType: 'repo', drillDownSection: 'sec-overview',
        extract: sastOrgScore, perRepo: sastRepoScore,
        perRepoLabel: r => `${Math.max(0, (r.security_findings ?? 0) - (r.cve_total ?? 0))} findings`,
      },
      {
        id: 'vuln-malware', label: t('scoring.sv.malwarePackages'), icon: Bug,
        weight: 0.05, color: '#b91c1c', mode: 'scored',
        drillDownType: 'repo',
        extract: malwareOrgScore,
        ...noRepoDrill,
      },
    ],
  },

  // ── ATTACK SURFACE (30%) ──
  {
    id: 'attack-surface',
    label: t('scoring.cat.attackSurface'),
    weight: 0.30,
    color: '#8b5cf6',
    subVectors: [
      {
        id: 'surface-ssl', label: t('scoring.sv.sslTls'), icon: Lock,
        weight: 0.15, color: '#22c55e', mode: 'scored',
        drillDownType: 'domain',
        extract: input => avgDomainScores(input.domains ?? [], sslDomainScore),
        ...noRepoDrill,
        perDomain: sslDomainScore,
        perDomainLabel: d => {
          const m = parseMeta(d.assets.find(a => a.asset_type === 'ssl_cert'))
          return m.tls_version ? `${m.tls_version}, ${m.days_left ?? '?'}d left` : 'No cert'
        },
      },
      {
        id: 'surface-headers', label: t('scoring.sv.webHeaders'), icon: Globe,
        weight: 0.13, color: '#38bdf8', mode: 'scored',
        drillDownType: 'domain',
        extract: input => avgDomainScores(input.domains ?? [], headersDomainScore),
        ...noRepoDrill,
        perDomain: headersDomainScore,
        perDomainLabel: d => {
          const asset = d.assets.find(a => a.asset_type === 'http_endpoint')
          if (!asset) return 'No HTTP data'
          const m = parseMeta(asset)
          const h = (m.headers ?? {}) as Record<string, string>
          const missing = ['Strict-Transport-Security', 'Content-Security-Policy', 'X-Content-Type-Options']
            .filter(k => !h[k]).length
          return missing > 0 ? `${missing} headers missing` : 'All headers present'
        },
      },
      {
        id: 'surface-dns', label: t('scoring.sv.dnsSecurity'), icon: Shield,
        weight: 0.10, color: '#06b6d4', mode: 'scored',
        drillDownType: 'domain',
        extract: input => avgDomainScores(input.domains ?? [], dnsDomainScore),
        ...noRepoDrill,
        perDomain: dnsDomainScore,
        perDomainLabel: d => {
          const m = parseMeta(d.assets.find(a => a.asset_type === 'dns_security'))
          const flags = [m.spf && 'SPF', m.dmarc && 'DMARC', m.dnssec && 'DNSSEC'].filter(Boolean)
          return flags.length > 0 ? flags.join(', ') : 'No DNS security'
        },
      },
      {
        id: 'surface-ports', label: t('scoring.sv.openPorts'), icon: Server,
        weight: 0.10, color: '#f97316', mode: 'scored',
        drillDownType: 'domain',
        extract: input => avgDomainScores(input.domains ?? [], portsDomainScore),
        ...noRepoDrill,
        perDomain: portsDomainScore,
        perDomainLabel: d => {
          const m = parseMeta(d.assets.find(a => a.asset_type === 'port_scan'))
          return `${(m.open_ports ?? []).length} open ports`
        },
      },
      {
        id: 'surface-sensitive', label: t('scoring.sv.sensitiveFiles'), icon: FolderOpen,
        weight: 0.10, color: '#ef4444', mode: 'scored',
        drillDownType: 'domain',
        extract: input => avgDomainScores(input.domains ?? [], sensitiveDomainScore),
        ...noRepoDrill,
        perDomain: sensitiveDomainScore,
        perDomainLabel: d => {
          const m = parseMeta(d.assets.find(a => a.asset_type === 'sensitive_files'))
          const count = (m.files ?? []).length
          return count > 0 ? `${count} files exposed` : 'Clean'
        },
      },
      {
        id: 'surface-api', label: t('scoring.sv.apiSecurity'), icon: NetworkIcon,
        weight: 0.07, color: '#a78bfa', mode: 'scored',
        drillDownType: 'domain',
        extract: input => avgDomainScores(input.domains ?? [], apiDomainScore),
        ...noRepoDrill,
        perDomain: apiDomainScore,
        perDomainLabel: () => '',
      },
      {
        id: 'surface-waf', label: t('scoring.sv.wafProtection'), icon: Shield,
        weight: 0.05, color: '#22c55e', mode: 'scored',
        drillDownType: 'domain',
        extract: input => avgDomainScores(input.domains ?? [], wafDomainScore),
        ...noRepoDrill,
        perDomain: wafDomainScore,
        perDomainLabel: d => {
          const m = parseMeta(d.assets.find(a => a.asset_type === 'waf'))
          return (m.detected?.length ?? 0) > 0 ? 'WAF detected' : m.behavior_detected ? 'Behavior only' : 'No WAF'
        },
      },
      {
        id: 'surface-email', label: t('scoring.sv.emailSecurity'), icon: Shield,
        weight: 0.10, color: '#06b6d4', mode: 'scored',
        drillDownType: 'domain',
        extract: input => avgDomainScores(input.domains ?? [], emailDomainScore),
        ...noRepoDrill,
        perDomain: emailDomainScore,
        perDomainLabel: d => {
          const m = parseMeta(d.assets.find(a => a.asset_type === 'email_security'))
          return m.email_score !== undefined ? `Score: ${m.email_score}/100` : 'Not scanned'
        },
      },
      {
        id: 'surface-breach', label: t('scoring.sv.breachExposure'), icon: ShieldAlert,
        weight: 0.08, color: '#ef4444', mode: 'scored',
        drillDownType: 'domain',
        extract: input => avgDomainScores(input.domains ?? [], breachDomainScore),
        ...noRepoDrill,
        perDomain: breachDomainScore,
        perDomainLabel: d => {
          const m = parseMeta(d.assets.find(a => a.asset_type === 'breach_exposure'))
          const count = m.total_breaches ?? 0
          return count > 0 ? `${count} breaches found` : 'Clean'
        },
      },
      {
        id: 'surface-threat-intel', label: t('scoring.sv.threatIntel'), icon: Radar,
        weight: 0.07, color: '#dc2626', mode: 'scored',
        drillDownType: 'domain',
        extract: input => avgDomainScores(input.domains ?? [], threatIntelDomainScore),
        ...noRepoDrill,
        perDomain: threatIntelDomainScore,
        perDomainLabel: d => {
          const c2 = parseMeta(d.assets.find(a => a.asset_type === 'c2_indicators'))
          const rep = parseMeta(d.assets.find(a => a.asset_type === 'ip_reputation'))
          const indicators = (c2.total_indicators ?? 0)
          const risk = rep.risk_level ?? 'unknown'
          return indicators > 0 ? `${indicators} C2 indicators` : `IP risk: ${risk}`
        },
      },
      // ── Advisory (does not impact rating) ──
      {
        id: 'surface-ip-intel', label: t('scoring.sv.ipIntel'), icon: Radar,
        weight: 0.05, color: '#94a3b8', mode: 'scored',
        drillDownType: 'domain',
        extract: input => avgDomainScores(input.domains ?? [], ipIntelDomainScore),
        ...noRepoDrill,
        perDomain: ipIntelDomainScore,
      },
      {
        id: 'surface-whois', label: t('scoring.sv.whois'), icon: FileText,
        weight: 0.0, color: '#94a3b8', mode: 'context',
        drillDownType: 'domain',
        extract: () => null, ...noRepoDrill,
      },
      {
        id: 'surface-pagespeed', label: t('scoring.sv.pagespeed'), icon: Zap,
        weight: 0.0, color: '#94a3b8', mode: 'context',
        drillDownType: 'domain',
        extract: () => null, ...noRepoDrill,
      },
      {
        id: 'surface-tech', label: t('scoring.sv.techStack'), icon: Server,
        weight: 0.0, color: '#94a3b8', mode: 'context',
        drillDownType: 'domain',
        extract: () => null, ...noRepoDrill,
      },
      {
        id: 'surface-js-bundle', label: t('scoring.sv.jsBundle'), icon: FileText,
        weight: 0.0, color: '#94a3b8', mode: 'context',
        drillDownType: 'domain',
        extract: () => null, ...noRepoDrill,
      },
    ],
  },

  // ── DILIGENCE (20%) ──
  {
    id: 'diligence',
    label: t('scoring.cat.diligence'),
    weight: 0.20,
    color: '#06b6d4',
    subVectors: [
      {
        id: 'diligence-coverage', label: t('scoring.sv.scanCoverage'), icon: Radar,
        weight: 0.30, color: '#22c55e', mode: 'scored',
        drillDownType: 'repo',
        extract: coverageOrgScore,
        perRepo: () => null,
        perRepoLabel: () => '',
      },
      {
        id: 'diligence-license', label: t('scoring.sv.licenseCompliance'), icon: Scale,
        weight: 0.20, color: '#eab308', mode: 'scored',
        drillDownType: 'repo',
        extract: input => {
          // License compliance from scan results
          const withLicense = input.repos.filter(r => r.license_issues !== undefined)
          if (withLicense.length === 0) return null
          const avg = withLicense.reduce((s, r) => s + (r.license_issues ?? 0), 0) / withLicense.length
          return clamp(100 - avg * 5)
        },
        ...noRepoDrill,
      },
      {
        id: 'diligence-triage', label: t('scoring.sv.triageEffort'), icon: ListChecks,
        weight: 0.15, color: '#38bdf8', mode: 'scored',
        drillDownType: 'repo',
        extract: input => {
          // Triage effort: ratio of resolved/dismissed issues vs total
          const withAlerts = input.repos.filter(r => r.alert_total !== undefined && r.alert_total > 0)
          if (withAlerts.length === 0) return null
          const totalResolved = withAlerts.reduce((s, r) => s + (r.alert_resolved ?? 0), 0)
          const totalAlerts = withAlerts.reduce((s, r) => s + (r.alert_total ?? 0), 0)
          if (totalAlerts === 0) return null
          return clamp((totalResolved / totalAlerts) * 100)
        },
        ...noRepoDrill,
      },
      {
        id: 'diligence-supply-chain', label: t('scoring.sv.supplyChainRisk'), icon: NetworkIcon,
        weight: 0.20, color: '#8b5cf6', mode: 'scored',
        drillDownType: 'domain',
        extract: input => {
          const domains = input.domains ?? []
          const withVendor = domains.filter(d => d.assets.some(a => a.asset_type === 'vendor_risk'))
          if (withVendor.length === 0) return null
          return avgDomainScores(domains, vendorRiskDomainScore)
        },
        ...noRepoDrill,
        perDomain: vendorRiskDomainScore,
        perDomainLabel: d => {
          const m = parseMeta(d.assets.find(a => a.asset_type === 'vendor_risk'))
          return m.total_vendors ? `${m.total_vendors} vendors, avg risk ${m.avg_risk_score ?? '?'}` : 'Not assessed'
        },
      },
      {
        id: 'diligence-patching', label: t('scoring.sv.patchingSpeed'), icon: Clock,
        weight: 0.15, color: '#22c55e', mode: 'scored',
        drillDownType: 'repo',
        extract: input => {
          // Real MTTR: mean time to remediate critical+high alerts (hours)
          // Bitsight-class patching cadence — faster fix = higher score
          const withMttr = input.repos.filter(r => r.mttr_hours !== undefined && r.mttr_sample_size && r.mttr_sample_size > 0)
          if (withMttr.length === 0) return null
          const avgMttr = withMttr.reduce((s, r) => s + (r.mttr_hours ?? 0), 0) / withMttr.length
          // Scoring curve: <24h = 100, 72h = 80, 168h(7d) = 60, 336h(14d) = 40, 720h(30d) = 20, >720h = 5
          if (avgMttr <= 24) return 100
          if (avgMttr <= 72) return clamp(100 - (avgMttr - 24) * (20 / 48))
          if (avgMttr <= 168) return clamp(80 - (avgMttr - 72) * (20 / 96))
          if (avgMttr <= 336) return clamp(60 - (avgMttr - 168) * (20 / 168))
          if (avgMttr <= 720) return clamp(40 - (avgMttr - 336) * (20 / 384))
          return 5
        },
        perRepo: r => {
          if (r.mttr_hours === undefined || !r.mttr_sample_size || r.mttr_sample_size === 0) return null
          const h = r.mttr_hours
          if (h <= 24) return 100
          if (h <= 72) return clamp(100 - (h - 24) * (20 / 48))
          if (h <= 168) return clamp(80 - (h - 72) * (20 / 96))
          if (h <= 336) return clamp(60 - (h - 168) * (20 / 168))
          if (h <= 720) return clamp(40 - (h - 336) * (20 / 384))
          return 5
        },
        perRepoLabel: r => {
          if (r.mttr_hours === undefined || !r.mttr_sample_size) return 'No data'
          const h = r.mttr_hours
          if (h < 24) return `${Math.round(h)}h avg (${r.mttr_sample_size} resolved)`
          return `${Math.round(h / 24)}d avg (${r.mttr_sample_size} resolved)`
        },
      },
    ],
  },

  // ── CODE QUALITY (10%, all advisory) ──
  {
    id: 'code-quality',
    label: t('scoring.cat.codeQuality'),
    weight: 0.10,
    color: '#f97316',
    subVectors: [
      {
        id: 'quality-complexity', label: t('scoring.sv.complexFunctions'), icon: Zap,
        weight: 0.0, color: '#eab308', mode: 'context',
        drillDownType: 'repo', drillDownSection: 'arch-complexity',
        extract: input => {
          const scanned = input.repos.filter(r => r.complex_functions !== undefined)
          if (scanned.length === 0) return null
          const avg = scanned.reduce((s, r) => s + (r.complex_functions ?? 0), 0) / scanned.length
          return clamp(100 - avg)
        },
        perRepo: r => r.complex_functions !== undefined ? clamp(100 - (r.complex_functions ?? 0)) : null,
        perRepoLabel: r => `${r.complex_functions ?? 0} complex fns`,
      },
      {
        id: 'quality-dead-code', label: t('scoring.sv.deadCode'), icon: Trash2,
        weight: 0.0, color: '#a78bfa', mode: 'context',
        drillDownType: 'repo', drillDownSection: 'arch-dead-code',
        extract: input => {
          const scanned = input.repos.filter(r => r.dead_code_count !== undefined)
          if (scanned.length === 0) return null
          const avg = scanned.reduce((s, r) => s + (r.dead_code_count ?? 0), 0) / scanned.length
          return clamp(100 - avg * 0.2)
        },
        perRepo: r => r.dead_code_count !== undefined ? clamp(100 - (r.dead_code_count ?? 0) * 0.2) : null,
        perRepoLabel: r => `${r.dead_code_count ?? 0} dead items`,
      },
      {
        id: 'quality-duplicates', label: t('scoring.sv.duplicateCode'), icon: Copy,
        weight: 0.0, color: '#8b5cf6', mode: 'context',
        drillDownType: 'repo',
        extract: input => {
          const archRepos = input.archRepos
          if (!archRepos || archRepos.length === 0) return null
          const withData = archRepos.filter(r => r.duplicate_rate !== undefined)
          if (withData.length === 0) return null
          const avg = withData.reduce((s, r) => s + (r.duplicate_rate ?? 0), 0) / withData.length
          return clamp(100 - avg)
        },
        ...noRepoDrill,
      },
    ],
  },
]
}
