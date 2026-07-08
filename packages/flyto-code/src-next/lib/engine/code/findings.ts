/**
 * Findings — Bitsight-parity vendor-detail finding list. Reads from
 * external_issue_tracker (engine migration 475 extended this table
 * to match Bitsight's 19-column shape) joined with its 1:N child
 * tables (assets, comments).
 *
 * Backend: `GET /api/v1/code/orgs/{orgId}/findings` (handler at
 * `flyto-engine/api/handlers_findings.go`).
 *
 * Keep the type in sync with `store.ExternalIssueTracker` —
 * everything below has a column in the table. New columns added
 * server-side appear here so the table can render them without
 * a wire-format change.
 */
import { request } from '../client'

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low'
export type FindingGrade = 'good' | 'fair' | 'neutral' | 'warn' | 'bad' | ''
export type AssetImportance = 'critical' | 'high' | 'medium' | 'low' | ''
export type ThreatActivityLabel = 'accelerating' | 'declining' | 'steady' | ''
export type FindingSourceCoverageStatus = 'confirmed' | 'corroborated' | 'candidate' | 'conflict' | 'not_collected' | ''
export type FindingLifecycleStatus =
  | 'current_bad'
  | 'current_good'
  | 'historical_resolved'
  | 'verified_fixed'
  | 'pending_verify'
  | 'reopened'
  | 'open_unknown'
  | ''

export interface FindingSourceQualitySummary {
  coverage_status: FindingSourceCoverageStatus
  confidence: number
  source_count: number
  distinct_source_count: number
  evidence_count: number
  corroboration_count: number
  conflict_count: number
  missing_evidence_count: number
  latest_decision_state?: string
  notes?: string[]
}

export interface FindingLifecycleSummary {
  status: FindingLifecycleStatus
  status_label: string
  observation_state: string
  is_current: boolean
  is_historical: boolean
  state_family_key?: string
  state_version_count?: number
  first_seen_at?: string | null
  last_seen_at?: string | null
  resolved_at?: string | null
  recorded_event_count: number
  reconfirmed_count: number
  last_recorded_event_type?: string
  last_recorded_event_at?: string | null
}

export interface Finding {
  id: string
  org_id: string
  resource_id?: string
  domain: string
  category: string                   // risk vector slug (dmarc, spf, tls, web_appsec, ...)
  description: string
  severity: FindingSeverity
  fingerprint: string
  first_seen_at: string              // ISO 8601
  resolved_at?: string | null
  mttr_hours?: number | null

  // Bitsight-parity extension fields (migration 475). Optional —
  // rows that pre-date the migration carry empty / null values.
  tags?: string                      // JSON-encoded string array
  last_seen_at?: string | null
  grade?: FindingGrade
  affects_rating?: boolean
  impact_end_date?: string | null
  remaining_lifetime_days?: number | null
  no_impact_end_date?: string | null
  has_threat_insights?: boolean
  threat_groups?: string             // JSON-encoded string array
  threat_activity_label?: ThreatActivityLabel
  asset_importance?: AssetImportance
  country?: string
  source?: string                    // bitsight | cyble | internal_scanner
  assigned_to?: string
  verification_state?: 'unverified' | 'pending_verify' | 'verified_fixed' | 'reopened' | 'false_positive' | 'verified' | ''
  verification_method?: string
  verified_at?: string | null
  marked_fixed_at?: string | null
  marked_fixed_by?: string

  // Migration 476 additions:
  external_id?: string               // Bitsight temporary_id / Cyble alert id / scanner uuid
  details_text?: string              // source's diagnostic narrative
  web_app_test?: string              // Web App Security subcategory

  // Read-side enrichment from the Findings API. These fields are derived
  // from append-only finding events and the Footprint/resource kernel;
  // missing values mean not linked/collected, not clean.
  lifecycle_summary?: FindingLifecycleSummary
  state_family_key?: string
  state_version_count?: number
  owner_resource_id?: string
  owner_display_name?: string
  owner_relation_type?: string
  source_quality?: FindingSourceQualitySummary
}

export interface FindingHistoryEvent {
  id: string
  issue_id?: string
  fingerprint?: string
  resource_id?: string
  event_type?: string
  title?: string
  summary?: string
  field?: string                     // severity / grade / asset_importance / ...
  old_value?: string
  new_value?: string
  source?: string                    // bitsight_ingest / operator / scanner_internal
  source_module?: string
  actor_type?: string
  actor_id?: string
  occurred_at?: string
  observed_at?: string               // legacy external_issue_history timestamp
  payload?: Record<string, unknown>
  synthetic?: boolean
  synthetic_reason?: string
}

export interface FacetCounts {
  counts_by_category: Record<string, number>
}

export interface FindingsListResponse {
  findings: Finding[]
  count: number
  limit: number
  offset: number
}

export interface FindingsFilter {
  category?: string
  severity?: FindingSeverity
  grade?: FindingGrade
  asset_importance?: AssetImportance
  affects_rating?: boolean
  threat_only?: boolean
  has_threat_insights?: boolean
  threat_group?: string
  threat_activity_label?: ThreatActivityLabel
  tag?: string
  web_app_test?: string
  source?: string
  first_seen_from?: string
  first_seen_to?: string
  last_seen_from?: string
  last_seen_to?: string
  impact_end_date_from?: string
  impact_end_date_to?: string
  no_impact_end_date_from?: string
  no_impact_end_date_to?: string
  remaining_lifetime_min?: number
  remaining_lifetime_max?: number
  assets?: string
  vulnerability?: string
  include_resolved?: boolean
  q?: string                         // free-text search (migration 476)
  limit?: number
  offset?: number
}

export function listFindings(orgId: string, filter: FindingsFilter = {}) {
  const qs = new URLSearchParams()
  if (filter.category) qs.set('category', filter.category)
  if (filter.severity) qs.set('severity', filter.severity)
  if (filter.grade) qs.set('grade', filter.grade)
  if (filter.asset_importance) qs.set('asset_importance', filter.asset_importance)
  if (filter.affects_rating != null) qs.set('affects_rating', filter.affects_rating ? '1' : '0')
  if (filter.threat_only) qs.set('threat_only', '1')
  if (filter.has_threat_insights != null) qs.set('has_threat_insights', filter.has_threat_insights ? '1' : '0')
  if (filter.threat_group) qs.set('threat_group', filter.threat_group)
  if (filter.threat_activity_label) qs.set('threat_activity_label', filter.threat_activity_label)
  if (filter.tag) qs.set('tag', filter.tag)
  if (filter.web_app_test) qs.set('web_app_test', filter.web_app_test)
  if (filter.source) qs.set('source', filter.source)
  if (filter.first_seen_from) qs.set('first_seen_from', filter.first_seen_from)
  if (filter.first_seen_to) qs.set('first_seen_to', filter.first_seen_to)
  if (filter.last_seen_from) qs.set('last_seen_from', filter.last_seen_from)
  if (filter.last_seen_to) qs.set('last_seen_to', filter.last_seen_to)
  if (filter.impact_end_date_from) qs.set('impact_end_date_from', filter.impact_end_date_from)
  if (filter.impact_end_date_to) qs.set('impact_end_date_to', filter.impact_end_date_to)
  if (filter.no_impact_end_date_from) qs.set('no_impact_end_date_from', filter.no_impact_end_date_from)
  if (filter.no_impact_end_date_to) qs.set('no_impact_end_date_to', filter.no_impact_end_date_to)
  if (filter.remaining_lifetime_min != null) qs.set('remaining_lifetime_min', String(filter.remaining_lifetime_min))
  if (filter.remaining_lifetime_max != null) qs.set('remaining_lifetime_max', String(filter.remaining_lifetime_max))
  if (filter.assets) qs.set('assets', filter.assets)
  if (filter.vulnerability) qs.set('vulnerability', filter.vulnerability)
  if (filter.include_resolved) qs.set('include_resolved', '1')
  if (filter.q) qs.set('q', filter.q)
  if (filter.limit != null) qs.set('limit', String(filter.limit))
  if (filter.offset != null) qs.set('offset', String(filter.offset))
  const q = qs.toString()
  return request<FindingsListResponse>('GET',
    `/api/v1/code/orgs/${orgId}/findings${q ? `?${q}` : ''}`,
  )
}

/** Per-risk-vector counts for the facet sidebar. Bitsight's
 *  "Customize Columns" panel uses this shape — categories with
 *  a count of zero still appear (so the operator can toggle them
 *  on for future findings). */
export function listFindingFacets(orgId: string, includeResolved = false) {
  const qs = includeResolved ? '?include_resolved=1' : ''
  return request<FacetCounts>('GET',
    `/api/v1/code/orgs/${orgId}/findings/facets${qs}`,
  )
}

/** Append-only timeline for one finding. Newest-first. Surfaces in
 *  the right-side drawer. */
export function listFindingHistory(orgId: string, findingId: string, limit = 100) {
  return request<{ finding?: Finding; events: FindingHistoryEvent[]; count: number }>('GET',
    `/api/v1/code/orgs/${orgId}/findings/${findingId}/history?limit=${limit}`,
  )
}

// ── Multi-asset expansion ───────────────────────────────────────────

export interface FindingAsset {
  id: string
  issue_id: string
  asset: string
  importance: string
  is_ip: boolean
  country: string
  added_at: string
}

export function listFindingAssets(orgId: string, findingId: string) {
  return request<{ assets: FindingAsset[]; count: number }>('GET',
    `/api/v1/code/orgs/${orgId}/findings/${findingId}/assets`,
  )
}

// ── Comments (operator notes) ───────────────────────────────────────

export interface FindingComment {
  id: string
  issue_id: string
  user_id: string
  text: string
  created_at: string
}

export function listFindingComments(orgId: string, findingId: string) {
  return request<{ comments: FindingComment[]; count: number }>('GET',
    `/api/v1/code/orgs/${orgId}/findings/${findingId}/comments`,
  )
}

export function postFindingComment(orgId: string, findingId: string, text: string) {
  return request<FindingComment>('POST',
    `/api/v1/code/orgs/${orgId}/findings/${findingId}/comments`,
    { text },
  )
}

// ── Per-domain overlay (Footprint Graph 3D nodes) ──────────────────

export interface DomainFindingSummary {
  domain: string
  total: number
  critical: number
  high: number
  medium: number
  low: number
  worst_grade: string          // bad|warn|fair|neutral|good|''
  has_threat_insight: boolean
}

/** Per-domain rollup used by the Footprint Graph's 3D node overlay.
 *  Each row = one asset with ≥1 open finding. Graph nodes look
 *  themselves up by canonical_name. Excludes resolved findings. */
export function listFindingsOverlay(orgId: string) {
  return request<{ domains: DomainFindingSummary[]; count: number }>('GET',
    `/api/v1/code/orgs/${orgId}/findings/overlay`,
  )
}

// ── Bulk action ─────────────────────────────────────────────────────

export interface BulkActionResult {
  action: 'resolve' | 'comment'
  resolved?: number
  applied_to?: number
}

export function bulkFindingsAction(
  orgId: string,
  action: 'resolve' | 'comment',
  ids: string[],
  comment?: string,
) {
  return request<BulkActionResult>('POST',
    `/api/v1/code/orgs/${orgId}/findings/bulk-action`,
    { action, ids, ...(comment ? { comment } : {}) },
  )
}

/** parseJSONArray — safe parse of a JSON-encoded string array column.
 *  Returns [] for null/undefined/invalid. The wire format keeps these
 *  as strings (not TEXT[]) so the column type is portable across PG +
 *  SQLite test fixtures. */
export function parseJSONArray(s?: string): string[] {
  if (!s) return []
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []
  } catch {
    return []
  }
}
