import { request, requestBlob } from '../client'

// compliance.ts — governance / compliance admin endpoints.
// Backend: api/handlers_compliance_audit_export.go + api/handlers_data_residency.go.
// All platform-admin gated (requirePlatformAdmin, system:compliance:read /
// system:residency:write).
//
//   GET  /api/v1/system/compliance/audit-export            — downloadable artifact
//   GET  /api/v1/system/compliance/data-residency          — list configs
//   POST /api/v1/system/compliance/data-residency          — set region
//   GET  /api/v1/system/compliance/legal-holds             — list holds
//   POST /api/v1/system/compliance/legal-holds             — create hold
//   POST /api/v1/system/compliance/legal-holds/{id}/release — release hold

// ── Audit export ────────────────────────────────────────────────────────────

export type AuditExportFormat = 'json' | 'csv'

export interface AuditExportParams {
  from?: string // RFC3339
  to?: string // RFC3339
  sources?: string // csv: operator_actions,authz_decisions,api_calls,job_runs
  org?: string
  format?: AuditExportFormat
}

// downloadAuditExport returns the raw artifact as a Blob (JSON or CSV). The
// endpoint streams a downloadable file with a Content-Disposition header.
export function downloadAuditExport(params?: AuditExportParams): Promise<Blob> {
  const qs = new URLSearchParams()
  if (params?.from) qs.set('from', params.from)
  if (params?.to) qs.set('to', params.to)
  if (params?.sources) qs.set('sources', params.sources)
  if (params?.org) qs.set('org', params.org)
  if (params?.format) qs.set('format', params.format)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return requestBlob('GET', `/api/v1/system/compliance/audit-export${suffix}`)
}

// ── Data residency ──────────────────────────────────────────────────────────

export interface DataResidencyItem {
  org_id: string
  region: string
  notes?: string
  created_at?: string
  updated_at?: string
}

export interface ListDataResidencyResponse {
  configs: DataResidencyItem[]
  count: number
  note?: string
}

export interface SetDataResidencyResponse {
  ok: boolean
  org_id: string
  region: string
  config?: DataResidencyItem
}

export function listDataResidency(org?: string): Promise<ListDataResidencyResponse> {
  const suffix = org ? `?org=${encodeURIComponent(org)}` : ''
  return request('GET', `/api/v1/system/compliance/data-residency${suffix}`)
}

export function setDataResidency(req: { org_id: string; region: string; notes?: string }): Promise<SetDataResidencyResponse> {
  return request('POST', '/api/v1/system/compliance/data-residency', req)
}

// ── Legal holds ─────────────────────────────────────────────────────────────

export interface LegalHoldItem {
  id: string
  org_id: string
  scope: string
  reason?: string
  active: boolean
  created_by?: string
  created_at?: string
  released_at?: string
}

export interface ListLegalHoldsResponse {
  count: number
  holds: LegalHoldItem[]
  note?: string
}

export function listLegalHolds(org?: string): Promise<ListLegalHoldsResponse> {
  const suffix = org ? `?org=${encodeURIComponent(org)}` : ''
  return request('GET', `/api/v1/system/compliance/legal-holds${suffix}`)
}

export function createLegalHold(req: { org_id: string; scope?: string; reason?: string }): Promise<{ ok: boolean; hold: LegalHoldItem }> {
  return request('POST', '/api/v1/system/compliance/legal-holds', req)
}

export function releaseLegalHold(id: string): Promise<{ ok: boolean; hold_id: string; released: boolean }> {
  return request('POST', `/api/v1/system/compliance/legal-holds/${encodeURIComponent(id)}/release`)
}
