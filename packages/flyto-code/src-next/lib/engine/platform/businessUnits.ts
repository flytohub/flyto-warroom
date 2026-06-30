import { request } from '../client'
import type { ComplianceScopeTag } from '../ctem/ctem'

// businessUnits.ts — per-org BU CRUD client. Matches the
// migration-017 backend surface (api/handlers_business_units.go).
// BUs let enterprise customers carve their posture / SLA /
// dashboards along the org chart. Empty business_unit_id
// everywhere = org-wide (default for legacy deployments).

export interface BusinessUnit {
  id: string
  org_id: string
  key: string
  label: string
  owner_email?: string
  compliance_scope: string   // JSON-encoded ComplianceScopeTag[]
  description?: string
  archived_at?: string | null
  created_by?: string
  created_at: string
  updated_at: string
}

export interface UpsertBusinessUnitReq {
  key: string
  label: string
  owner_email?: string
  compliance_scope?: ComplianceScopeTag[]
  description?: string
}

export interface ListBusinessUnitsResponse {
  org_id: string
  count: number
  items: BusinessUnit[]
}

export function listBusinessUnits(orgId: string, includeArchived = false): Promise<ListBusinessUnitsResponse> {
  const qs = includeArchived ? '?include_archived=true' : ''
  return request('GET', `/api/v1/code/orgs/${orgId}/business-units${qs}`)
}

export function createBusinessUnit(orgId: string, req: UpsertBusinessUnitReq): Promise<BusinessUnit> {
  return request('POST', `/api/v1/code/orgs/${orgId}/business-units`, req)
}

export function patchBusinessUnit(orgId: string, buId: string, req: Partial<UpsertBusinessUnitReq>): Promise<BusinessUnit> {
  return request('PATCH', `/api/v1/code/orgs/${orgId}/business-units/${buId}`, req)
}

export function archiveBusinessUnit(orgId: string, buId: string): Promise<{ id: string; status: string }> {
  return request('POST', `/api/v1/code/orgs/${orgId}/business-units/${buId}/archive`)
}

export interface BUAssignReq {
  asset_id: string
  asset_kind: 'repo' | 'attack_surface'
}

export function assignAssetToBU(orgId: string, buId: string, req: BUAssignReq): Promise<{ asset_id: string; business_unit_id: string }> {
  return request('POST', `/api/v1/code/orgs/${orgId}/business-units/${buId}/assign`, req)
}

export function unassignAssetFromBU(orgId: string, req: BUAssignReq): Promise<{ asset_id: string; business_unit_id: string }> {
  return request('POST', `/api/v1/code/orgs/${orgId}/business-units/unassign`, req)
}

// Helper — parse the JSON-encoded compliance_scope into an array.
// Empty / malformed returns [].
export function parseComplianceScope(raw: string | undefined | null): ComplianceScopeTag[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
