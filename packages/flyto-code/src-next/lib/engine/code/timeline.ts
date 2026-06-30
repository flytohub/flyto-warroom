/**
 * Layered audit timeline + verdict clients — the FE substrate for the
 * Flyto2 Code war-room "verdict homepage" + the L1–L4 audit timeline.
 *
 * Six read-only endpoints (engine main, Wave A):
 *
 *   GET /orgs/{id}/timeline?since=&from=&to=&layers=&subject_id=
 *   GET /paths/{id}/history?org_id=                 (org_id REQUIRED)
 *   GET /findings/{fp}/confidence-timeline?org_id=  (org_id REQUIRED)
 *   GET /findings/{fp}/decision-timeline?org_id=    (org_id REQUIRED)
 *   GET /orgs/{id}/verdict-dashboard
 *   GET /orgs/{id}/risk-matrix
 *
 * Route shapes — note the two families:
 *   - org-scoped:  /api/v1/code/orgs/{orgId}/...     (org in the path)
 *   - subject:     /api/v1/code/paths/{id}/...  +  ?org_id=  (org as a
 *                  REQUIRED query param, NOT in the path)
 *
 * PRODUCT HONESTY CONTRACT (mirrors the engine):
 *   - `verified_attack_paths` counts ONLY paths at RedTeamConfirmed via
 *     empirical_pentest / live_probe. A 'mitigated' operator claim never
 *     counts. Never inflate it on the client.
 *   - `good_count` on a risk-matrix cell is EVIDENCE-GATED
 *     (resolved | empirical-verified | feedback-suppressed). The 5×4=20
 *     cells are ALWAYS emitted (honest zeros) — render the zero verbatim.
 *   - 'unclassified' importance is never folded into a grade.
 *   - L4 (operator decision) items carry NO provenance/verified — that's
 *     the point: an operator claim is not evidence. Don't synthesize one.
 *
 * Types mirror the Go response structs field-for-field (json tags).
 */
import { request } from '../client'

// ── Shared layer enum ───────────────────────────────────────────────
//
// L1 raw events | L2 confidence | L3 path status | L4 operator decision.
export type TimelineLayer = 'L1' | 'L2' | 'L3' | 'L4'

/** L1 raw-event kinds (scan/pentest/score/alert/asset) + the per-layer
 *  synthetic kinds the engine emits for L2/L3/L4 rows. */
export type TimelineKind =
  | 'scan'
  | 'pentest'
  | 'score'
  | 'alert'
  | 'asset'
  | 'confidence'
  | 'path_status'
  | 'decision'

/** Provenance of an L2/L3 signal — where the confidence/verdict came from. */
export interface TimelineProvenance {
  source: string
  source_type: string
}

/**
 * Optional per-item payload. L2/L3 items carry confidence + provenance +
 * verified/verified_method; L4 (operator decision) carries NONE of these
 * (an operator action is not evidence). Everything is optional so a single
 * `TimelineItem` shape covers all four layers — branch on `layer`/`kind`.
 */
export interface TimelineItemPayload {
  confidence?: number
  provenance?: TimelineProvenance
  verified?: boolean
  verified_method?: string
  /** Layers thread arbitrary extra fields; keep them addressable without `any`. */
  [k: string]: unknown
}

/**
 * One row in the layered audit timeline. Aligns the engine `FeedItem`
 * shape (kind ∈ scan|pentest|score|alert|asset (L1) | confidence (L2) |
 * path_status (L3) | decision (L4)) with the optional evidence payload.
 *
 * NOTE: named `TimelineItem` (NOT `FeedItem`) to avoid colliding with the
 * existing `history/history-feed` `FeedItem` re-exported from index.ts.
 */
export interface TimelineItem {
  id: string
  layer: TimelineLayer
  kind: TimelineKind
  /** RFC3339 timestamp the event was observed at. */
  ts: string
  title?: string
  summary?: string
  /** Path id (L3) or finding fingerprint (L2/L4) this row belongs to. */
  subject_id?: string
  actor?: string
  payload?: TimelineItemPayload
}

/** GET /orgs/{id}/timeline response envelope. */
export interface OrgTimeline {
  org_id: string
  from: string
  to: string
  layers: TimelineLayer[]
  subject_id: string
  items: TimelineItem[]
  count: number
}

/** Options for `getOrgTimeline`. `layers` is serialized as `L1,L2,...`. */
export interface GetOrgTimelineOptions {
  /** Relative window (e.g. "24h", "7d"). Mutually exclusive with from/to. */
  since?: string
  /** Absolute window start (RFC3339). */
  from?: string
  /** Absolute window end (RFC3339). */
  to?: string
  /** Restrict to specific layers; serialized to `layers=L1,L2`. */
  layers?: TimelineLayer[]
  /** Narrow to one path id (L3) or finding fingerprint (L2/L4). */
  subjectId?: string
}

export function getOrgTimeline(
  orgId: string,
  opts: GetOrgTimelineOptions = {},
): Promise<OrgTimeline> {
  const params = new URLSearchParams()
  if (opts.since) params.set('since', opts.since)
  if (opts.from) params.set('from', opts.from)
  if (opts.to) params.set('to', opts.to)
  if (opts.layers && opts.layers.length > 0) params.set('layers', opts.layers.join(','))
  if (opts.subjectId) params.set('subject_id', opts.subjectId)
  const qs = params.toString()
  return request<OrgTimeline>(
    'GET',
    `/api/v1/code/orgs/${orgId}/timeline${qs ? `?${qs}` : ''}`,
  )
}

// ── L3: attack-path status history ──────────────────────────────────

export type PathStatusEventType =
  | 'path.created'
  | 'status_changed'
  | 'finding_added'
  | 'finding_removed'
  | 'pentest_confirmed'
  | 'regression_detected'

export interface PathStatusEvent {
  attack_path_id: string
  from_status: string
  to_status: string
  event_type: PathStatusEventType
  actor: string
  reason: string
  source: string
  verified: boolean
  verified_method: string
  /** Chain probability captured at the moment of the event (0..1). */
  chain_probability_snapshot: number
  observed_at: string
}

/** GET /paths/{id}/history response envelope. */
export interface PathHistory {
  path_id: string
  org_id: string
  events: PathStatusEvent[]
  count: number
}

/**
 * NOTE the route shape: the path id is in the URL but `org_id` is a
 * REQUIRED query param (not a path segment).
 */
export function getPathHistory(orgId: string, pathId: string): Promise<PathHistory> {
  const qs = new URLSearchParams({ org_id: orgId }).toString()
  return request<PathHistory>(
    'GET',
    `/api/v1/code/paths/${pathId}/history?${qs}`,
  )
}

// ── L2: finding confidence timeline ─────────────────────────────────

export type ConfidenceMethod = 'api_aggregation' | 'empirical_test' | 'analyst_feedback'

export interface ConfidenceEvent {
  finding_fingerprint: string
  ts: string
  confidence: number
  source: string
  source_type: string
  method: ConfidenceMethod
  verified: boolean
  verified_method: string
  evidence_cites: string[]
  upgraded_from_row_id: string
  actor: string
}

/** GET /findings/{fp}/confidence-timeline response envelope. */
export interface ConfidenceTimeline {
  finding_fingerprint: string
  org_id: string
  events: ConfidenceEvent[]
  count: number
}

/** `org_id` is a REQUIRED query param; the fingerprint is in the URL. */
export function getConfidenceTimeline(orgId: string, fp: string): Promise<ConfidenceTimeline> {
  const qs = new URLSearchParams({ org_id: orgId }).toString()
  return request<ConfidenceTimeline>(
    'GET',
    `/api/v1/code/findings/${encodeURIComponent(fp)}/confidence-timeline?${qs}`,
  )
}

// ── L4: finding decision (assignment) timeline ──────────────────────

export type AssignmentEventType = 'assigned' | 'accepted' | 'marked_fixed' | 'verified' | 'reopened'

export interface AssignmentEvent {
  finding_fingerprint: string
  ts: string
  from_assigned_to: string
  to_assigned_to: string
  assigned_by: string
  event_type: AssignmentEventType
  reason: string
}

/** GET /findings/{fp}/decision-timeline response envelope. */
export interface DecisionTimeline {
  finding_fingerprint: string
  org_id: string
  events: AssignmentEvent[]
  count: number
}

/** `org_id` is a REQUIRED query param; the fingerprint is in the URL. */
export function getDecisionTimeline(orgId: string, fp: string): Promise<DecisionTimeline> {
  const qs = new URLSearchParams({ org_id: orgId }).toString()
  return request<DecisionTimeline>(
    'GET',
    `/api/v1/code/findings/${encodeURIComponent(fp)}/decision-timeline?${qs}`,
  )
}

// ── Verdict dashboard (homepage hero) ───────────────────────────────
//
// `verified_attack_paths` counts ONLY RedTeamConfirmed paths via
// empirical_pentest/live_probe — a 'mitigated' operator claim never
// counts. `mttv_hours`/`mttr_hours` are float hours.
export interface VerdictDashboard {
  /** RedTeamConfirmed (empirical) attack paths. Evidence-gated count. */
  verified_attack_paths: number
  critical: number
  under_validation: number
  fixed_this_month: number
  /** Findings proven safe to the SAME evidence bar as a red. */
  verified_safe: number
  /** Mean time-to-verify, float hours. */
  mttv_hours: number
  /** Mean time-to-remediate, float hours. */
  mttr_hours: number
}

export function getVerdictDashboard(orgId: string): Promise<VerdictDashboard> {
  return request<VerdictDashboard>(
    'GET',
    `/api/v1/code/orgs/${orgId}/verdict-dashboard`,
  )
}

// ── Risk matrix (5 importance × 4 severity = 20 cells, honest zeros) ─

export type RiskImportance = 'critical' | 'high' | 'medium' | 'low' | 'unclassified'
export type RiskSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
/** Cell grade. 'unclassified' importance is never folded into a grade. */
export type RiskGrade = 'none' | 'good' | 'fair' | 'neutral' | 'warn' | 'bad'

export interface RiskMatrixCell {
  importance: RiskImportance
  severity: RiskSeverity
  bad_count: number
  /** EVIDENCE-GATED good (resolved | empirical-verified | feedback-suppressed). */
  good_count: number
  grade: RiskGrade
}

/** GET /risk-matrix response. Always emits all 20 cells (honest zeros). */
export interface RiskMatrix {
  org_id: string
  importance: RiskImportance[]
  severity: RiskSeverity[]
  cells: RiskMatrixCell[]
  count: number
}

export function getRiskMatrix(orgId: string): Promise<RiskMatrix> {
  return request<RiskMatrix>(
    'GET',
    `/api/v1/code/orgs/${orgId}/risk-matrix`,
  )
}
