// findingUnified.ts — TypeScript client for the cross-source unified
// finding view + triage noise-reduction stats. Mirrors the Go side
// (`api/handlers_finding_unified.go` UnifiedFinding +
// `api/handlers_aikido.go` handleTriageStats) — keep the shapes 1:1.
//
// Imported by DIRECT FILE PATH (decoupling rule) — NOT via @lib/engine.
//
// Endpoints:
//   GET /api/v1/code/orgs/{id}/findings/{fingerprint}  — unified per-finding
//   GET /api/v1/code/orgs/{id}/triage-stats            — reachability noise stats

import { request } from '../client'

// ── Unified finding (GET /findings/{fingerprint}) ─────────────────

export interface FindingLocation {
  repo_id?: string
  repo_name?: string
  file_path?: string
  line?: number
}

export interface AutofixPatchInfo {
  finding_id: string
  rule_id: string
  patch_status: string
  verify_passed: boolean
  pr_url?: string
  pr_number?: number
}

export interface VerificationInfo {
  execution_id: string
  status: string
  verdict?: string
  evidence_url?: string
  created_at: string
}

export interface PRInfo {
  number: number
  title: string
  url: string
  is_draft: boolean
  author: string
}

export interface UnifiedFinding {
  id: string                 // fingerprint (dedup key)
  title: string
  description: string
  severity: string
  category: string
  locations: FindingLocation[]
  autofix_available: boolean
  autofix_patches?: AutofixPatchInfo[]
  verifications?: VerificationInfo[]
  latest_verdict?: string    // exploitable / sanitized / unreachable
  open_prs?: PRInfo[]
  blast_radius?: number
  status: string             // open / snoozed / ignored / solved
  alert_status?: string      // open / resolved / dismissed
}

/** Cross-source unified view of a single finding by its fingerprint.
 *  Aggregates code_alerts locations, autofix patches, verification
 *  verdicts, open PRs touching the finding files, and blast radius.
 *  404 (Error) when the fingerprint matches nothing. */
export function getUnifiedFinding(orgId: string, fingerprint: string) {
  return request<UnifiedFinding>('GET',
    `/api/v1/code/orgs/${orgId}/findings/${encodeURIComponent(fingerprint)}`)
}

// ── Triage stats (GET /triage-stats) ──────────────────────────────

export interface TriageStats {
  total_issues: number
  reachable_issues: number
  noise_filtered: number
  noise_reduction_pct: number
}

/** Reachability-based noise-reduction stats aggregated across all
 *  connected repos. noise_filtered = total - reachable (issues the
 *  reachability analysis proved unreachable, i.e. suppressed noise). */
export function getTriageStats(orgId: string) {
  return request<TriageStats>('GET', `/api/v1/code/orgs/${orgId}/triage-stats`)
}
