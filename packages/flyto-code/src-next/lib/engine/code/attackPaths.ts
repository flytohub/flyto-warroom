/**
 * Attack Paths — convergence layer that surfaces Top N Initial Access
 * Candidates. Read-only, derived from existing recon signals
 * (attack_surface, dns_security, code_alerts, pentest_projects,
 * scan_approvals, external_issue_tracker, repo_pr_cache).
 *
 * Backend: `flyto-engine/internal/correlate/attack_paths/`.
 * Design doc: `flyto-engine/docs/ATTACK_PATHS_DESIGN.md`.
 *
 * Keep these types in sync with `candidate.go` — the API ships the
 * Go struct verbatim, so a rename either side breaks the wire
 * contract.
 */
import { request } from '../client'

/** Discriminator for a candidate's evidence row. Mirrors the
 *  Source constants in the engine package; the v2-reserved values
 *  (`freshness`, `social_intel`) appear in the type but never in
 *  v1 responses. */
export type AttackPathEvidenceSource =
  | 'attack_surface'
  | 'dns_security'
  | 'code_alert'
  | 'repo_pr_cache'
  | 'github_exposure'
  | 'breach_exposure'
  | 'threat_intel'
  | 'external_issue_tracker'
  | 'freshness'    // v2 reserved
  | 'social_intel' // v2 reserved

export type AttackPathCategory =
  | 'initial_access'
  | 'web_app'
  | 'information_exposure'
  | 'email_spoofing'
  | 'supply_chain'

export type AttackPathLabel = 'low' | 'medium' | 'high'

export type AttackPathTargetKind =
  | 'domain'
  | 'subdomain'
  | 'ip'
  | 'repo'
  | 'email_domain'
  | 'vendor'

export type WhyNowKind =
  | 'policy_regression'
  | 'new_asset'
  | 'leak_recent'
  | 'freshness_drop'
  | 'advisory_recent'

export interface AttackPathTarget {
  kind: AttackPathTargetKind
  value: string
  note?: string
}

export interface AttackPathEvidence {
  source: AttackPathEvidenceSource
  kind: string
  detail: string
  detail_key?: string
  asset_ref?: string
  observed_at?: string
  meta?: Record<string, unknown>
  /** 0..1 — feeds the candidate's Correlation sub-score. */
  weight: number
}

export interface WhyNowSignal {
  kind: WhyNowKind
  detail: string
  detail_key?: string
  observed_at: string
  days_ago: number
}

export interface AttackPathCandidate {
  id: string
  org_id: string
  rule_id: string
  category: AttackPathCategory

  title: string
  title_key: string
  description: string
  desc_key: string

  risk_logic: string
  risk_logic_key: string

  targets: AttackPathTarget[]
  evidence: AttackPathEvidence[]
  why_now?: WhyNowSignal[]

  // Two independent axes — render as separate chips, never combine.
  exposure: number               // 0..40
  correlation: number            // 0..60
  confidence_score: number       // exposure + correlation, 0..100
  confidence: AttackPathLabel
  validation_readiness_score: number  // 0..100
  validation_readiness: AttackPathLabel

  red_team_validation: string[]
  restrictions: string[]

  generated_at: string
  first_seen_at: string
}

export interface AttackPathSignalsSummary {
  external_assets: number
  leak_signals: number
  dmarc_status: string
  spf_status: string
  dkim_status: string
  tech_fingerprints: number
  pentest_projects: number
  why_now_signals_last_30d: number
}

export interface AttackPathsResponse {
  candidates: AttackPathCandidate[]
  total: number
  generated_at: string
  signals_summary: AttackPathSignalsSummary
}

export interface GetAttackPathsOptions {
  limit?: number
  /** Backend default is 'low'; UI executive view should pass 'medium'. */
  minConfidence?: AttackPathLabel
  minValidationReadiness?: AttackPathLabel
  categories?: AttackPathCategory[]
  sort?: 'confidence' | 'readiness' | 'why_now'
}

/**
 * Fetch the Top-N attack-path candidates for an org. Backend caches
 * 15 min in-memory; the response carries `Cache-Control: max-age=900`
 * so React Query's default staleTime still works correctly.
 */
export function getAttackPaths(orgId: string, opts: GetAttackPathsOptions = {}) {
  const params = new URLSearchParams()
  if (opts.limit && opts.limit > 0) params.set('limit', String(opts.limit))
  if (opts.minConfidence) params.set('min_confidence', opts.minConfidence)
  if (opts.minValidationReadiness) {
    params.set('min_validation_readiness', opts.minValidationReadiness)
  }
  if (opts.categories && opts.categories.length > 0) {
    params.set('category', opts.categories.join(','))
  }
  if (opts.sort) params.set('sort', opts.sort)

  const qs = params.toString()
  const suffix = qs ? `?${qs}` : ''
  return request<AttackPathsResponse>(
    'GET',
    `/api/v1/code/orgs/${orgId}/attack-paths${suffix}`,
  )
}
