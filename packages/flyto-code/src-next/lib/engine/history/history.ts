import { request } from '../client'

// history.ts — TypeScript client for the three audit-trail endpoints
// landed in flyto-engine 2026-05 (HISTORY-AUDIT.md).
//
//   GET /api/v1/code/alerts/{id}/history
//   GET /api/v1/code/attack-surface/{id}/history
//   GET /api/v1/code/repos/{repoId}/verify-history?cve=&package=
//
// Each returns events newest-first with `?limit=` (default 100, max 500).

export interface AlertHistoryEvent {
  id: string
  alertId: string
  orgId: string
  repoId: string
  eventType: 'created' | 'status_changed' | 'resolved' | 'reopened' | 'assigned' | 'unassigned' | 'snoozed' | 'note'
  oldStatus?: string
  newStatus?: string
  oldAssignee?: string
  newAssignee?: string
  actor?: string
  note: string
  snapshot: string // raw JSON; caller parses via JSON.parse
  recordedAt: string
}

export interface AssetHistoryEvent {
  id: string
  assetId: string
  orgId: string
  projectId?: string
  assetType: string
  value: string
  metadata: string
  status?: string
  validationStatus?: string
  changeType: 'created' | 'status_changed' | 'metadata_changed' | 'rediscovered' | 'validated' | 'removed'
  previousMetadata?: string
  actor?: string
  recordedAt: string
}

export interface VerifyHistoryEvent {
  id: string
  repoId: string
  cveId: string
  packageName: string
  verdict: 'exploitable' | 'sanitized' | 'unreachable' | 'unknown'
  confidence: number
  method: string
  evidence: string
  executionId?: string
  actor?: string
  recordedAt: string
}

interface AlertHistoryResponse {
  alert_id: string
  events: AlertHistoryEvent[]
  count: number
}

interface AssetHistoryResponse {
  asset_id: string
  events: AssetHistoryEvent[]
  count: number
}

interface VerifyHistoryResponse {
  repo_id: string
  cve_id: string
  package_name: string
  events: VerifyHistoryEvent[]
  count: number
}

export function getAlertHistory(alertId: string, limit = 100) {
  return request<AlertHistoryResponse>(
    'GET',
    `/api/v1/code/alerts/${encodeURIComponent(alertId)}/history?limit=${limit}`,
  )
}

export function getAttackSurfaceHistory(assetId: string, limit = 100) {
  return request<AssetHistoryResponse>(
    'GET',
    `/api/v1/code/attack-surface/${encodeURIComponent(assetId)}/history?limit=${limit}`,
  )
}

export function getVerifyHistory(
  repoId: string,
  cveId: string,
  packageName: string,
  limit = 100,
) {
  const qs = new URLSearchParams({
    cve: cveId,
    package: packageName,
    limit: String(limit),
  })
  return request<VerifyHistoryResponse>(
    'GET',
    `/api/v1/code/repos/${encodeURIComponent(repoId)}/verify-history?${qs.toString()}`,
  )
}
