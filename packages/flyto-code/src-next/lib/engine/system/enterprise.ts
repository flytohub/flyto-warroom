import { request, requestBlob } from '../client'

export interface EnterpriseEditionProviders {
  auth?: string
  billing?: string
  storage?: string
  ai?: string
  threat_intel?: string
}

export interface EnterpriseProfile {
  edition: string
  deploy_mode: string
  license_class: string
  providers: EnterpriseEditionProviders
  enterprise_enabled: boolean
  control_plane: string
  separated_from_saas: boolean
}

export type EnterpriseReadinessStatus = 'pass' | 'warn' | 'fail' | string

export interface EnterpriseReadinessControl {
  id: string
  status: EnterpriseReadinessStatus
  capability?: string
  evidence: string[]
  operator_action?: string
}

export interface EnterpriseReadinessDomain {
  id: string
  status: EnterpriseReadinessStatus
  controls: EnterpriseReadinessControl[]
}

export interface EnterpriseReadinessSummary {
  status: 'ready' | 'operator_action_required' | 'blocked' | string
  pass: number
  warn: number
  fail: number
  total: number
}

export interface EnterpriseReadinessResponse {
  schema_version: string
  org_id: string
  profile: Omit<EnterpriseProfile, 'enterprise_enabled'>
  generated_at: string
  summary: EnterpriseReadinessSummary
  domains: EnterpriseReadinessDomain[]
  verification: EnterpriseAuditChainVerification
}

export interface EnterpriseAuditEvent {
  id: string
  org_id: string
  actor_type: string
  actor_id?: string
  action: string
  surface?: string
  resource_type?: string
  resource_id?: string
  outcome: 'success' | 'failure' | 'denied' | string
  reason?: string
  edition: string
  deploy_mode: string
  source: string
  request_id?: string
  evidence_id?: string
  metadata_json: string
  prev_hash?: string
  entry_hash: string
  created_at: string
}

export interface EnterpriseAuditChainVerification {
  org_id: string
  intact: boolean
  count: number
  last_hash?: string
  broken_at_id?: string
  error?: string
}

export interface EnterpriseAuditEventsResponse {
  schema_version: string
  profile: Omit<EnterpriseProfile, 'enterprise_enabled'>
  count: number
  events: EnterpriseAuditEvent[]
  verification: EnterpriseAuditChainVerification
}

export interface EnterpriseAuditQuery {
  org: string
  actor_id?: string
  action?: string
  surface?: string
  outcome?: string
  from?: string
  to?: string
  limit?: number
}

export type EnterpriseAuditExportFormat = 'json' | 'ndjson'

function auditQueryString(params: EnterpriseAuditQuery): string {
  const qs = new URLSearchParams()
  qs.set('org', params.org)
  if (params.actor_id) qs.set('actor_id', params.actor_id)
  if (params.action) qs.set('action', params.action)
  if (params.surface) qs.set('surface', params.surface)
  if (params.outcome) qs.set('outcome', params.outcome)
  if (params.from) qs.set('from', params.from)
  if (params.to) qs.set('to', params.to)
  if (params.limit) qs.set('limit', String(params.limit))
  return qs.toString()
}

export function getEnterpriseProfile(): Promise<EnterpriseProfile> {
  return request('GET', '/api/v1/system/enterprise/profile')
}

export function getEnterpriseReadiness(org: string): Promise<EnterpriseReadinessResponse> {
  const qs = new URLSearchParams()
  qs.set('org', org)
  return request('GET', `/api/v1/system/enterprise/readiness?${qs.toString()}`)
}

export function listEnterpriseAuditEvents(params: EnterpriseAuditQuery): Promise<EnterpriseAuditEventsResponse> {
  return request('GET', `/api/v1/system/enterprise/audit/events?${auditQueryString(params)}`)
}

export function downloadEnterpriseAuditExport(
  params: EnterpriseAuditQuery & { format?: EnterpriseAuditExportFormat },
): Promise<Blob> {
  const qs = new URLSearchParams(auditQueryString(params))
  qs.set('format', params.format ?? 'json')
  return requestBlob('GET', `/api/v1/system/enterprise/audit/export?${qs.toString()}`)
}
