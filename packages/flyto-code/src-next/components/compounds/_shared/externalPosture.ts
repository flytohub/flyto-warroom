/**
 * externalPosture — neutral external-surface read model.
 *
 * Historically lived in `exposure/shared.ts`, but several of these
 * types / API fns / pure helpers are consumed by NON-exposure surfaces
 * (domains, dashboard). To avoid cross-surface god-file imports they now
 * live in the neutral `_shared` layer; `exposure/shared.ts` keeps a
 * re-export so exposure-internal callers are unchanged.
 */

import { request } from '@lib/engine'

export interface ActionItem {
  priority: number
  domain: string
  category: string
  title: string
  description: string
  impact: string
  effort: string
  fix_steps: string[]
  severity: string
}

export interface SLAViolation {
  domain: string
  category: string
  description: string
  severity: string
  detected_at: string
  sla_hours: number
  overdue_by: string
  fix_guide: string
}

export interface RiskSummary {
  critical_count: number
  high_count: number
  medium_count: number
  low_count: number
  sla_breaches: number
  score_change_7d: number
  score_change_30d: number
  top_risk_domain: string
  top_risk_score: number
}

export interface VendorRisk {
  name: string
  category: string
  criticality: string
  risk_score: number
  domain: string
}

export interface SupplyChainRisk {
  total_vendors: number
  critical_vendors: number
  avg_risk_score: number
  risk_level: string
  top_risks: VendorRisk[]
}

export interface ExternalPosture {
  org_id: string
  domain_count: number
  // ── A3 envelope (P1-F PR4 trigger #4) — emitted by the engine
  //    via api/handlers_external_posture.go. `score_available =
  //    false` ⇒ avg_score / avg_display are null and avg_grade is
  //    "". `undefined` is tolerated as truthy during the rollout
  //    window for older engine revisions. ──
  score_available?: boolean
  message?: string | null
  /** A3: nullable when score_available=false. Was non-null in
   *  the pre-A3 wire — readers MUST gate on score_available. */
  avg_score: number | null
  avg_display?: number | null
  avg_grade: string
  score_trend: { date: string; score: number; grade: string; domain?: string }[]
  domains: {
    domain: string; project_id: string; score: number; grade: string
    last_scanned?: string; environment: string; asset_count: number
    issue_count: number; changes_since_last: number
    /** Quarantined score waiting for confirmation. When present, the
     *  decision engine has seen a tier-2 delta and is waiting for a
     *  2nd matching observation. UI shows "🔄 verifying" badge. */
    pending_score?: number
    pending_grade?: string
    pending_observed_at?: string
    pending_consecutive?: number
  }[]
  improvements: { domain: string; category: string; description: string; detected_at: string; impact: string }[]
  open_issues: {
    domain: string; category: string; severity: string; description: string
    est_fix_time: string; recommendation: string
  }[]
  next_scan_at?: string
  last_scan_at?: string
  scan_cadence: string
  // New actionable fields
  sla_violations: SLAViolation[]
  action_plan: ActionItem[]
  risk_summary: RiskSummary
  supply_chain?: SupplyChainRisk
}

export function getExternalPosture(orgId: string): Promise<ExternalPosture> {
  return request<ExternalPosture>('GET', `/api/v1/code/orgs/${orgId}/external-posture`)
}

// ── Kernel-backed external posture (audit B3) ────────────────────
//
// Reader-convergence target per
// flyto-engine/docs/DOMAINS_VIEW_KERNEL_SPEC.md +
// frontend-backend-truth-handoff. The kernel endpoint groups
// kernel_resources + projects attack_surface metadata into
// findings server-side, so DomainsView's local generate*Issues
// generators stop drifting from the scanner output.
//
// Boundary contract 2026-05-24 (per Codex on B5/B6/B7 lessons):
// declaring the types DOES NOT mean buildDomainRows starts
// consuming KernelAsset.findings yet. The migration must wait
// until staging confirms findings[] lands on every resource —
// half-fallback that runs both client + server projectors would
// re-introduce double-truth. The frontend cutover follows in a
// separate sweep.

/** Server-projected finding from attack_surface metadata. Frontend
 *  resolves the i18n keys via tOr(); evidence carries scanner
 *  specifics (server header value, port number, file paths). */
export interface ExternalFinding {
  id: string
  category: 'frontend' | 'attack_surface' | 'rest_api' | 'graphql' | 'dns'
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  title_key: string
  desc_key: string
  evidence?: Record<string, unknown>
}

/** One row of the kernel-backed external surface. Identity from
 *  kernel_resources; score/grade/last_scanned joined from
 *  score_state; findings projected from attack_surface metadata. */
export interface KernelAsset {
  resource_id: string
  type: 'subdomain' | 'domain' | 'ip'
  canonical_value: string
  display_name?: string
  sources: string[]
  score?: number
  grade?: string
  last_scanned?: string // RFC3339
  confidence: number   // 0..100
  current_tier?: string
  first_seen_at?: string
  /** Server-projected findings (audit B3). Empty / absent when no
   *  attack_surface metadata for this resource has triggered any
   *  finding. Frontend's buildDomainRows.generate*Issues() is the
   *  legacy client-side equivalent — slated for deletion after
   *  staging verify. */
  findings?: ExternalFinding[]
}

export interface KernelExternalPosture {
  org_id: string
  asset_count: number
  scored_count: number
  avg_score: number
  avg_grade: string
  assets: KernelAsset[]
}

export function getExternalPostureKernel(orgId: string): Promise<KernelExternalPosture> {
  return request<KernelExternalPosture>(
    'GET', `/api/v1/code/orgs/${orgId}/external-posture/kernel`,
  )
}

/** A single open issue from `external_issue_tracker` — the CTEM
 *  Actions page reads these so that customers WITHOUT connected repos
 *  (i.e. empty `code_alerts`) still see "what's urgent" instead of
 *  an empty bench. Resolved rows are filtered server-side. */
export interface OpenExternalIssue {
  id: string
  org_id: string
  domain: string
  category: string
  description: string
  severity: string
  fingerprint: string
  first_seen_at: string
  resolved_at?: string | null
  mttr_hours?: number | null
}

export function getOpenExternalIssues(orgId: string): Promise<{ org_id: string; count: number; issues: OpenExternalIssue[] }> {
  return request('GET', `/api/v1/code/orgs/${orgId}/external-issues`)
}

export const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
export const SEV_COLORS: Record<string, string> = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#64748b' } // low: canonical SEVERITY_TONE.low (slate) — was #22c55e green

/** Extracts the bare hostname from any external asset's value or
 *  `KernelAsset.canonical_value`. Both attack_surface scanners and
 *  the kernel projector emit a handful of shapes — without a single
 *  normalize step, `Map<domain>` lookups across the two sources
 *  silently miss whenever scheme / case / suffix differs.
 *
 *  Shapes handled:
 *    http_endpoint   → "https://blog.flyto2.com"   → "blog.flyto2.com"
 *    ssl_cert        → "flyto2.com — TLS 1.3..."   → "flyto2.com"
 *    waf             → "flyto2.com — Cloudflare"   → "flyto2.com"
 *    port_scan       → "flyto2.com (1.2.3.4) ..."  → "flyto2.com"
 *    breach_exposure → "blog.flyto2.com — 0..."    → "blog.flyto2.com"
 *    dns_security    → "flyto2.com"                → "flyto2.com"
 *    subdomain       → "blog.flyto2.com"           → "blog.flyto2.com"
 *    kernel domain   → "Example.COM"               → "example.com"
 *  Falls back to the raw value (lowered, trimmed) when none of the
 *  delimiter shapes match. Empty string in → empty string out. */
export function extractHostFromAssetValue(raw: string): string {
  if (!raw) return ''
  const v = raw.trim()
  if (v.startsWith('http://') || v.startsWith('https://')) {
    try {
      return new URL(v).hostname.toLowerCase()
    } catch {
      // fall through to suffix-strip
    }
  }
  // Cut at the EARLIEST descriptive delimiter by POSITION (not array order),
  // so "flyto2.com (104.21.93.111) — 4 open ports" cuts at " (" (pos 10) and
  // returns "flyto2.com", not "flyto2.com (104.21.93.111)" (the old array-order
  // break stopped at " —" first). Ported from chore/domain-detail-surface.
  let cut = v.length
  for (const sep of [' (', ' —', ' -', ' →', ' ']) {
    const i = v.indexOf(sep)
    if (i > 0 && i < cut) {
      cut = i
    }
  }
  return v.slice(0, cut).toLowerCase().trim()
}
