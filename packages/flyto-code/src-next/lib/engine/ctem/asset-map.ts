import { request } from '../client'

// ── Asset Identity Mapping ──────────────────────────
// Domain ↔ repo correlation — the spine of cross-correlation.

export interface AssetMapping {
  id: string
  org_id: string
  domain: string
  repo_id?: string
  repo_name?: string
  container_image?: string
  confidence: 'manual' | 'ai_suggested' | 'auto_detected'
  confirmed: boolean
  evidence: string // JSON
  created_by?: string
  created_at: string
  updated_at: string
}

export interface MappingSuggestion {
  domain: string
  repo_id: string
  repo_name: string
  confidence: number  // 0-1
  reason: string
}

export interface CVEExposure {
  cve_id: string
  severity: string
  package?: string
  repo_name?: string
  repo_id?: string
  domain?: string
  epss: number
  in_kev: boolean
  risk_score: number
}

export interface CVEExposureReport {
  exposed_cves: CVEExposure[]
  total_internal: number
  total_external: number
  intersection: number
  kev_count: number
  epss_high_count: number
}

// ── API Calls ──────────────────────────

export interface KernelAssetScore {
  surface: string
  score: number
  display_score: number
  grade: string
}

export interface KernelAssetMapNode {
  resource_id: string
  category: string
  type: string
  canonical_value: string
  display_name?: string
  status: string
  review_status: string
  confidence: number
  current_tier?: string
  source_count?: number
  evidence_count?: number
  dimensions: string[]
  legacy_sources: string[]
  last_seen_at?: string
  surface: string
  asset_score?: number
  asset_display_score?: number
  asset_grade?: string
  asset_surface?: string
  asset_scores?: KernelAssetScore[]
  finding_count?: number
  // Cross-surface code↔asset join (engine convergence 2026-06-10): open
  // code_alerts attributable to this node (via the repo legacy link), and the
  // repo IDs whose alerts contribute (deep-link target). Hidden when 0.
  code_alert_count?: number
  code_alert_repo_ids?: string[]
}

export interface KernelAssetMapEdge {
  id: string
  source_resource_id: string
  target_resource_id: string
  relation_type: string
  confidence: number
  evidence_count: number
  last_seen_at: string
  confidence_label?: string
  confirmation_kind?: string
  from_surface?: string
  // discovery_pool vs confirmed_asset_graph: "confirmed" for corroborated/
  // confirmed edges, "lead" for candidate edges. In the default
  // confirmed_asset_graph a "lead" edge only appears under
  // show_discovery_leads — render it dashed/faded.
  edge_class?: 'confirmed' | 'lead'
}

export interface KernelAssetMapSummary {
  by_category: Record<string, number>
  by_type: Record<string, number>
  by_tier: Record<string, number>
  by_dimension: Record<string, number>
  by_surface: Record<string, number>
}

export interface KernelAssetMapResponse {
  org_id: string
  generated_at: string
  resource_limit: number
  truncated: boolean
  node_count: number
  edge_count: number
  nodes: KernelAssetMapNode[]
  edges: KernelAssetMapEdge[]
  summary: KernelAssetMapSummary
}

export function getKernelAssetMap(
  orgId: string,
  opts: { limit?: number; showDiscoveryLeads?: boolean } = {},
) {
  const limit = opts.limit ?? 50000
  const leads = opts.showDiscoveryLeads ? '&show_discovery_leads=true' : ''
  return request<KernelAssetMapResponse>(
    'GET', `/api/v1/code/orgs/${orgId}/asset-map/kernel?limit=${limit}${leads}`,
  )
}

export function listAssetMappings(orgId: string) {
  return request<{ mappings: AssetMapping[]; total: number }>(
    'GET', `/api/v1/code/orgs/${orgId}/asset-mappings`,
  )
}

export function createAssetMapping(orgId: string, data: {
  domain: string
  repo_id?: string
  container_image?: string
  confidence?: string
  confirmed?: boolean
  evidence?: string
}) {
  return request<AssetMapping>('POST', `/api/v1/code/orgs/${orgId}/asset-mappings`, data)
}

export function deleteAssetMapping(orgId: string, mapId: string) {
  return request<{ deleted: string }>('DELETE', `/api/v1/code/orgs/${orgId}/asset-mappings/${mapId}`)
}

export function suggestMappings(orgId: string) {
  return request<{ suggestions: MappingSuggestion[]; total: number }>(
    'POST', `/api/v1/code/orgs/${orgId}/suggest-mappings`,
  )
}

export function getCVEExposureReport(orgId: string) {
  return request<CVEExposureReport>(
    'GET', `/api/v1/code/orgs/${orgId}/cve-exposure`,
  )
}
