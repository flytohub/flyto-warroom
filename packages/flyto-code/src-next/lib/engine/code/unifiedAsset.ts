/**
 * unifiedAsset.ts — typed client for the cross-dim asset
 * endpoint (engine /unified-asset). Returns ONE domain joined
 * across Footprint × CTEM × Pentest × Code × AutoFix.
 *
 * The UI uses this to prove the platform is one product:
 * click any domain, see what every dimension knows about it.
 */
import { request } from '../client'

export interface UnifiedFootprint {
  total_entities: number
  subdomains: string[]
  lookalikes: string[]
  actionable_count: number
  informational_count: number
}

export interface UnifiedCTEM {
  open_issues: number
  severities: Record<string, number>
  categories: string[]
}

export interface UnifiedPentest {
  has_project: boolean
  project_id?: string
  criticality?: string
  last_scan_at?: string
  has_findings: boolean
}

/**
 * Per-repo open-alert breakdown for the code dimension. Wave-1 superset
 * field on GET /unified-asset's code block — lets the UI deep-link each
 * contributing repo's alerts instead of only showing an aggregate count.
 * Honest: a repo only appears here when it actually has open alerts.
 */
export interface UnifiedCodeAlertEvidence {
  repo_id: string
  repo_name: string
  open_alerts: number
}

export interface UnifiedCode {
  linked_repo_count: number
  linked_repo_names: string[]
  open_alerts: number
  /** Per-repo open-alert evidence (Wave-1 superset; may be absent on old payloads). */
  alert_evidence?: UnifiedCodeAlertEvidence[]
}

export interface UnifiedAutofix {
  eligible_findings: number
  ready_patches: number
  open_prs: number
}

export interface UnifiedAssetSummary {
  cross_dim_depth: number          // 0-5
  active_dimensions: string[]      // ['footprint', 'ctem', 'pentest', 'code', 'autofix']
  lineage: string[]                // human-readable trail
}

export interface UnifiedAsset {
  domain: string
  org_id: string
  footprint: UnifiedFootprint
  ctem: UnifiedCTEM
  pentest: UnifiedPentest
  code: UnifiedCode
  autofix: UnifiedAutofix
  summary: UnifiedAssetSummary
}

export function getUnifiedAsset(orgId: string, domain: string) {
  const qs = new URLSearchParams({ domain })
  return request<UnifiedAsset>(
    'GET',
    `/api/v1/code/orgs/${orgId}/unified-asset?${qs.toString()}`,
  )
}
