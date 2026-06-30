import { request } from '../client'
import { api } from '../typed-client'

// upstreamData.ts — clients for the upstream-data-strategy endpoints
// (engine 2026-05-18, migration 016). Backs the SLA-budget / peer-
// baseline / MTTR-history / score-forecast features that push
// ScoreTrends + SLAMonitor + PostureOverview from 7 → 9.

// ── SLA policy CRUD ───────────────────────────────────────────────

export type SLASeverity = 'critical' | 'high' | 'medium' | 'low'

export interface SLAPolicy {
  org_id: string
  // Per-team scope (migration 017). Empty = org-wide policy.
  business_unit_id?: string
  severity: SLASeverity
  allowed_breaches: number
  window_days: number
  alert_at_percent: number
  is_active: boolean
  created_by?: string
  created_at: string
  updated_at: string
}

export interface ListSLAPoliciesResponse {
  org_id: string
  count: number
  items: SLAPolicy[]
}

export function listSLAPolicies(orgId: string): Promise<ListSLAPoliciesResponse> {
  return request('GET', `/api/v1/code/orgs/${orgId}/sla-policies`)
}

export interface UpsertSLAPolicyReq {
  severity: SLASeverity
  allowed_breaches: number
  window_days?: number
  alert_at_percent?: number
  is_active?: boolean
  // Per-team scope (migration 017). Empty / missing = org-wide
  // policy (the default). Set to a BU id to declare a tighter
  // (or looser) budget for that BU only.
  business_unit_id?: string
}

export function upsertSLAPolicy(orgId: string, req: UpsertSLAPolicyReq): Promise<SLAPolicy> {
  return request('POST', `/api/v1/code/orgs/${orgId}/sla-policies`, req)
}

export function deleteSLAPolicy(orgId: string, severity: SLASeverity): Promise<{ severity: string }> {
  return request('DELETE', `/api/v1/code/orgs/${orgId}/sla-policies/${severity}`)
}

// ── SLA budget (computed) ─────────────────────────────────────────

export type BudgetStatus = 'healthy' | 'warning' | 'exhausted' | 'inactive' | 'no_policy'

export interface BudgetUsage {
  severity: SLASeverity | string
  allowed_breaches: number
  used_breaches: number
  remaining_breaches: number
  used_percent: number
  window_start: string
  window_end: string
  alert_at_percent: number
  status: BudgetStatus
}

export interface SLABudgetResponse {
  org_id: string
  count: number
  items: BudgetUsage[]
}

export function getSLABudget(orgId: string, businessUnitId?: string): Promise<SLABudgetResponse> {
  const qs = businessUnitId ? `?business_unit_id=${encodeURIComponent(businessUnitId)}` : ''
  return request('GET', `/api/v1/code/orgs/${orgId}/sla-budget${qs}`)
}

// ── Peer baseline ─────────────────────────────────────────────────

export type PeerSector =
  | 'finance' | 'saas' | 'retail' | 'healthcare'
  | 'gov' | 'energy' | 'education' | string

export interface PeerBaselineSnapshot {
  sector: string
  metric: string
  percentile: number
  value: number
  snapshot_date: string
  corpus_size: number
  corpus_version: string
  source: string
  created_at: string
}

export interface PeerBaselineResponse {
  org_id: string
  sector: string
  metric: string
  latest: Record<number, PeerBaselineSnapshot> // percentile → snapshot
  history: PeerBaselineSnapshot[]
}

/** First endpoint migrated to the typed openapi-fetch client. Pattern
 *  to copy for new endpoints / next migrations:
 *    - call `api.GET('/openapi/path/with/{params}', { params: { ... } })`
 *    - destructure `{ data, error }` — both are typed per the schema
 *    - cast to the local interface only at the boundary so callers
 *      keep the existing public shape (PeerBaselineResponse stays
 *      published from this module, schema-derived shape is internal). */
export async function getPeerBaseline(
  orgId: string,
  sector: PeerSector,
  opts: { metric?: string; days?: number } = {},
): Promise<PeerBaselineResponse> {
  const { data, error } = await api.GET('/api/v1/code/orgs/{id}/peer-baseline', {
    params: {
      path: { id: orgId },
      query: { sector, metric: opts.metric, days: opts.days },
    },
  })
  if (error || !data) {
    throw new Error(`peer-baseline fetch failed${error ? `: ${JSON.stringify(error)}` : ''}`)
  }
  return data as PeerBaselineResponse
}

// ── Peer corpus coverage ──────────────────────────────────────────
//
// Sector-level coverage table: which industries the platform crawls,
// the sample size per sector, and the latest P50/P75/P90 numbers.
// Engine never exposes any individual peer domain (legal-safe per
// the /explore lockdown precedent — same reason ScoreTrends shows
// org-level history only).

export interface PeerCorpusSectorEntry {
  key: string
  label: string
  domain_count: number
  p50?: number
  p75?: number
  p90?: number
  corpus_version?: string
  snapshot_date?: string
}

export interface PeerCorpusResponse {
  metric: string
  sectors: PeerCorpusSectorEntry[]
}

export function listPeerCorpus(metric?: string): Promise<PeerCorpusResponse> {
  const qs = metric ? `?metric=${encodeURIComponent(metric)}` : ''
  return request('GET', `/api/v1/code/peer-corpus${qs}`)
}

// ── MTTR history ──────────────────────────────────────────────────

export interface MTTRHistoryRow {
  org_id: string
  severity: string
  week_start: string
  p50_hours: number
  p75_hours: number
  p90_hours: number
  count_resolved: number
  backfilled: boolean
  computed_at: string
}

export interface MTTRHistoryResponse {
  org_id: string
  severity: string
  count: number
  items: MTTRHistoryRow[]
}

export function getMTTRHistory(
  orgId: string,
  opts: { severity?: string; weeks?: number } = {},
): Promise<MTTRHistoryResponse> {
  const params = new URLSearchParams()
  if (opts.severity) params.set('severity', opts.severity)
  if (opts.weeks) params.set('weeks', String(opts.weeks))
  const qs = params.toString()
  return request('GET',
    `/api/v1/code/orgs/${orgId}/mttr-history${qs ? '?' + qs : ''}`)
}

// ── Score forecast ────────────────────────────────────────────────

export interface ForecastPoint {
  t: string
  value: number
  lower: number
  upper: number
}

export interface ScoreForecastResponse {
  org_id: string
  history_points: number
  horizon_days: number
  forecast: ForecastPoint[] | null
}

export function getScoreForecast(
  orgId: string,
  days = 30,
): Promise<ScoreForecastResponse> {
  return request('GET',
    `/api/v1/code/orgs/${orgId}/score-forecast?days=${days}`)
}
