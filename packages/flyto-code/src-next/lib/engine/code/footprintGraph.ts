/**
 * Footprint Expander — TypeScript client for the Go engine's
 * progressive OSINT graph endpoints. See
 * `flyto-engine/internal/footprint/` and
 * `flyto-engine/api/handlers_footprint.go`.
 *
 * Three endpoints:
 *   GET /api/v1/code/orgs/{id}/footprint/graph
 *   GET /api/v1/code/orgs/{id}/footprint/timeseries
 *   GET /api/v1/code/orgs/{id}/footprint/path/{entityId}
 *
 * Wire shapes mirror the Go structs verbatim; renaming either side
 * breaks the contract. Keep this in sync with
 * `internal/store/models.go.FootprintEntity` / `FootprintRelTimeseries`
 * and `internal/footprint/path_score.go.PathScoreResult`.
 */
import { authHeader, request } from '../client'

export type FootprintEntityType =
  | 'organization'
  | 'domain'
  | 'subdomain'
  | 'ip'
  | 'asn'
  | 'repo'
  | 'handle'
  | 'email_domain'
  | 'vendor'
  | 'app'
  | 'document'
  | 'news_mention'
  | 'technology'

export type FootprintEntityStatus =
  | 'active'       // confirmed tier
  | 'pending'      // candidate tier
  | 'weak'         // weak tier
  | 'suppressed'
  | 'not_relevant'

export interface FootprintEntity {
  id: string
  type: FootprintEntityType | string
  canonical_name: string
  source: string
  confidence: number
  depth: number
  parent_entity_id: string
  first_seen_at: string
  last_seen_at: string
  metadata: unknown   // JSON — usually { evidence_claims, relationship_score, promotion_tier, ... }
  evidence_refs: unknown
  // Lifecycle marker: active / candidate / weak / suppressed /
  // rejected. Set by the queue's promotion gate + suppression
  // endpoint. Optional on the wire because pre-classifier rows
  // ship without it.
  status?: string
}

export interface FootprintRelationship {
  id: string
  from_entity: string
  to_entity: string
  kind: string
  source: string
  confidence: number
  observed_at: string
}

export interface FootprintGraphResponse {
  entities: FootprintEntity[]
  relationships: FootprintRelationship[]
}

export interface FootprintTimeseriesEdge {
  from_entity: string
  to_entity: string
  kind: string
  first_seen_at: string
  last_seen_at: string
  observation_count: number
  distinct_source_count: number
  max_confidence: number
}

export type FootprintSignalKind = 'newly_exposed' | 'recently_changed' | 'stale'

export interface FootprintTimeseriesSignal {
  entity_id: string
  type: string
  signal: FootprintSignalKind
  first_seen_at: string
  last_seen_at: string
}

export interface FootprintTimeseriesResponse {
  edges: FootprintTimeseriesEdge[]
  signals: FootprintTimeseriesSignal[]
}

export interface PathScoreResult {
  score: number
  average_relationship_score: number
  diversity_factor: number
  recency_factor: number
  confidence_factor: number
  chain: string[]
  distinct_sources: number
  oldest_last_seen_at: string
  weakest_link_id: string
}

export interface FootprintRunRequest {
  org_name?: string
  domain?: string
  // Advanced TargetProfile fields — engine has supported these
  // since v3 but the dialog now lets operators set them. Each is
  // optional; empty arrays are equivalent to omission.
  legal_name?: string
  english_name?: string
  brand_names?: string[]
  short_names?: string[]
  candidate_aliases?: string[]
  negative_keywords?: string[]
  industry?: string
  country?: string
}

export interface FootprintRunResponse {
  id: string
  org_id: string
  status: string
  stop_reason: string
  entities_created: number
  relationships_created: number
  connectors_called: number
}

export function runFootprintExpansion(orgId: string, body: FootprintRunRequest) {
  // Backend returns 202 Accepted immediately and runs the expansion
  // asynchronously (2026-05-23 — sync runs were timing out at the
  // browser's 5-min fetch limit, surfacing as fake CORS errors).
  // Caller should poll /footprint/latest-run for status.
  return request<{ status?: string; message?: string } | FootprintRunResponse>(
    'POST',
    `/api/v1/code/orgs/${orgId}/footprint/runs`,
    body,
  )
}

export async function getFootprintGraph(orgId: string): Promise<FootprintGraphResponse> {
  // Defensive normalization — backend MAY return null for entities /
  // relationships when an org has no footprint data yet. Without
  // this, every component accessing `.length` crashes with
  // "Cannot read properties of null (reading 'length')".
  const r = await request<FootprintGraphResponse>(
    'GET',
    `/api/v1/code/orgs/${orgId}/footprint/graph`,
  )
  return {
    ...r,
    entities: r.entities ?? [],
    relationships: r.relationships ?? [],
  }
}

export async function getFootprintTimeseries(orgId: string): Promise<FootprintTimeseriesResponse> {
  const r = await request<FootprintTimeseriesResponse>(
    'GET',
    `/api/v1/code/orgs/${orgId}/footprint/timeseries`,
  )
  return {
    ...r,
    signals: r.signals ?? [],
  }
}

export function getFootprintPathScore(orgId: string, entityId: string) {
  return request<PathScoreResult>(
    'GET',
    `/api/v1/code/orgs/${orgId}/footprint/path/${entityId}`,
  )
}

export interface FootprintRunRow {
  id: string
  org_id: string
  status: 'running' | 'complete' | 'aborted' | 'error' | string
  stop_reason: string
  started_at: string
  finished_at?: string | null
  max_depth: number
  max_runtime_secs?: number
  entities_created: number
  relationships_created: number
  connectors_called: number
  cost_used_usd: number
  depth_reached: number
  rounds_completed: number
  tokens_harvested: number
  error_message?: string
}

// getFootprintLatestRun returns the most-recent run row (any status)
// or null when no run has ever happened. Used by the frontend
// polling loop during an in-flight expansion.
export function getFootprintLatestRun(orgId: string) {
  return request<FootprintRunRow | null>(
    'GET',
    `/api/v1/code/orgs/${orgId}/footprint/latest-run`,
  )
}

/** Helper — extracts the promotion tier from an entity's metadata
 *  blob without forcing callers to know the JSON shape. Returns
 *  `'unknown'` when the field is absent (v1 entities). */
export function promotionTier(e: FootprintEntity): 'confirmed' | 'candidate' | 'weak' | 'rejected' | 'unknown' {
  const meta = e.metadata as { promotion_tier?: string } | null
  const tier = meta?.promotion_tier
  if (tier === 'confirmed' || tier === 'candidate' || tier === 'weak' || tier === 'rejected') {
    return tier
  }
  // Fallback inferred from status — keeps v1 rows renderable.
  if (e.confidence >= 0.8) return 'confirmed'
  if (e.confidence >= 0.5) return 'candidate'
  return 'weak'
}

/** Helper — extracts the relationship_score from metadata. Falls
 *  back to confidence × 100 so the UI always has a number to render. */
export function relationshipScore(e: FootprintEntity): number {
  const meta = e.metadata as { relationship_score?: number } | null
  if (typeof meta?.relationship_score === 'number') return meta.relationship_score
  return Math.round(e.confidence * 100)
}

// ─── Actionability classifier output ───────────────────────────────

export type ActionabilityTier =
  | 'red_team_actionable'
  | 'needs_more_evidence'
  | 'informational'
  | 'rejected'

export interface ActionabilityClassification {
  tier: ActionabilityTier
  pre_cap_tier?: ActionabilityTier
  relationship_score: number
  attack_surface_score: number
  validation_signal_score: number
  negative_score?: number
  reason_codes: string[]
  required_authorization?: string[]
  recon_restrictions?: string[]
  rule_pack_version: string
  profile: string
  confidence_cap: 'none' | 'medium' | 'low'
}

/** Pull the classifier blob out of an entity's metadata. Returns
 *  null when no classifier has run (v1 rows or classifier disabled). */
export function actionability(e: FootprintEntity): ActionabilityClassification | null {
  const meta = e.metadata as { classification?: ActionabilityClassification } | null
  return meta?.classification ?? null
}

export interface ActionableFinding {
  entity_id: string
  type: string
  canonical_name: string
  source: string
  depth: number
  tier: ActionabilityTier
  relationship_score: number
  attack_surface_score: number
  validation_signal_score: number
  reason_codes: string[]
  required_authorization?: string[]
  recon_restrictions?: string[]
  rule_pack_version?: string
  profile?: string
  confidence_cap?: 'none' | 'medium' | 'low'
}

export interface ActionableResponse {
  org_id: string
  tier_filter: string
  count: number
  findings: ActionableFinding[]
}

export function getFootprintActionable(orgId: string, tier: ActionabilityTier | 'any' = 'red_team_actionable', limit = 20) {
  const qs = `?tier=${encodeURIComponent(tier)}&limit=${limit}`
  return request<ActionableResponse>(
    'GET',
    `/api/v1/code/orgs/${orgId}/footprint/actionable${qs}`,
  )
}

// Narrative — LLM-generated attacker-perspective brief.
// Classifier feedback — operator 👍/👎 votes on a verdict.
export type FeedbackVote = 'up' | 'down' | 'unsure'

export interface FootprintFeedback {
  id: string
  org_id: string
  entity_id: string
  user_id: string
  vote: FeedbackVote
  expected_tier?: string
  comment?: string
  created_at: string
  rule_pack_version: string
}

// Per-org classifier rule weight overrides — admin operation.
export interface FootprintRuleOverride {
  org_id: string
  claim_kind: string
  weight_delta: number
  reason: string
  created_at: string
  updated_at: string
  set_by?: string
}

export function listFootprintRuleOverrides(orgId: string): Promise<{ overrides: FootprintRuleOverride[] }> {
  return request('GET', `/api/v1/code/orgs/${orgId}/footprint/rule-overrides`)
}

export function upsertFootprintRuleOverride(orgId: string, body: { claim_kind: string; weight_delta: number; reason?: string }): Promise<{ ok: boolean }> {
  return request('POST', `/api/v1/code/orgs/${orgId}/footprint/rule-overrides`, body)
}

export function deleteFootprintRuleOverride(orgId: string, claimKind: string): Promise<{ ok: boolean }> {
  return request('DELETE', `/api/v1/code/orgs/${orgId}/footprint/rule-overrides/${encodeURIComponent(claimKind)}`)
}

export function submitFootprintFeedback(
  orgId: string,
  body: { entity_id: string; vote: FeedbackVote; expected_tier?: string; comment?: string; rule_pack_version?: string },
): Promise<{ ok: boolean; id: string }> {
  return request(
    'POST',
    `/api/v1/code/orgs/${orgId}/footprint/feedback`,
    body,
  )
}

export function listFootprintFeedback(orgId: string, entityId: string, limit = 20): Promise<{ feedback: FootprintFeedback[] }> {
  return request(
    'GET',
    `/api/v1/code/orgs/${orgId}/footprint/feedback?entity_id=${encodeURIComponent(entityId)}&limit=${limit}`,
  )
}

export interface FootprintNarrative {
  narrative: string
  generated_at: string
  cached: boolean
  provider?: string
  locale?: string
}

export function getFootprintNarrative(orgId: string, force?: boolean): Promise<FootprintNarrative> {
  const qs = force ? '?force=1' : ''
  return request<FootprintNarrative>(
    'GET',
    `/api/v1/code/orgs/${orgId}/footprint/narrative${qs}`,
  )
}

// Evidence Pack — opens server-rendered HTML in a new tab so the
// operator can browser-save-as-PDF. Bearer-token auth means we
// can't just window.open(url); fetch + blob → window.open(blobURL)
// keeps the auth header. The opened tab CAN be Cmd+P'd to PDF.
export async function openFootprintEvidencePack(orgId: string, tier: ActionabilityTier | 'any' = 'red_team_actionable', limit = 20) {
  const qs = `?tier=${encodeURIComponent(tier)}&limit=${limit}`
  const { BASE } = await import('../client')
  const bearer = await authHeader()
  if (!bearer) throw new Error('Not authenticated')
  const resp = await fetch(`${BASE}/api/v1/code/orgs/${orgId}/footprint/evidence-pack${qs}`, {
    headers: { Authorization: bearer },
  })
  if (!resp.ok) {
    throw new Error(`Evidence pack fetch failed: ${resp.status}`)
  }
  const html = await resp.text()
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  // Revoke after a delay so the opened tab has time to load.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

// ─── Platform Pipeline (cross-phase orchestrator) ─────────────

export interface PipelinePhase {
  phase: string
  status: 'queued' | 'skipped' | 'error' | 'suggested'
  message?: string
  count?: number
}

export interface PlatformPipelineResponse {
  org_id: string
  started_at: string
  phases: PipelinePhase[]
}

export function runPlatformPipeline(orgId: string): Promise<PlatformPipelineResponse> {
  return request('POST', `/api/v1/code/orgs/${orgId}/platform-pipeline/run`)
}

// "Phase 2 補了 Phase 1 漏掉的什麼" 視圖。
export interface FootprintDelta {
  phase1_only: Array<{ asset_type: string; value: string; source?: string }>
  phase2_added: Array<{ asset_type: string; value: string; source?: string }>
  both: Array<{ asset_type: string; value: string; source?: string }>
  summary: { phase1_count: number; phase2_count: number; both_count: number }
}

export async function getFootprintDelta(orgId: string): Promise<FootprintDelta> {
  const r = await request<FootprintDelta>(
    'GET',
    `/api/v1/code/orgs/${orgId}/footprint/delta`,
  )
  return {
    phase1_only:  r.phase1_only  ?? [],
    phase2_added: r.phase2_added ?? [],
    both:         r.both         ?? [],
    summary:      r.summary      ?? { phase1_count: 0, phase2_count: 0, both_count: 0 },
  }
}

// Pentest target picker — sources actionable Footprint findings.
export interface PentestSuggestedTarget {
  entity_id: string
  type: string
  value: string
  tier: string
  relationship_score: number
  source: string
  rationale?: string
}

export interface PentestSuggestedTargetsResponse {
  targets: PentestSuggestedTarget[]
  consent_note: string
}

export function getPentestSuggestedTargets(orgId: string): Promise<PentestSuggestedTargetsResponse> {
  return request('GET', `/api/v1/code/orgs/${orgId}/pentest/suggested-targets`)
}

// Threat-intel → Footprint seed alias suggestions (Phase 1 → Phase 2 feed).
export interface ThreatSeedSuggestion {
  value: string
  source: string
  rationale: string
}

export interface ThreatSeedResponse {
  suggestions: ThreatSeedSuggestion[]
  note: string
}

export async function getThreatSeedSuggestions(orgId: string): Promise<ThreatSeedResponse> {
  const r = await request<ThreatSeedResponse>(
    'GET',
    `/api/v1/code/orgs/${orgId}/footprint/threat-seed-suggestions`,
  )
  // Defensive: backend may return null when no suggestions exist.
  return { ...r, suggestions: r.suggestions ?? [] }
}

// ─── Posture Distribution (好 + 壞 平衡視圖) ──────────────────
// 不模仿 Bitsight 的 criticality × severity 4x4 grid (專利)。
// 用 Flyto2 自己的 tier 分類: healthy / watching / acting。

export interface PostureBucket {
  bucket: 'healthy' | 'watching' | 'acting'
  count: number
  sources: Record<string, number>
}

export interface PostureDistribution {
  buckets: PostureBucket[]
  total: number
  health_ratio: number
  note: string
}

export function getPostureDistribution(orgId: string): Promise<PostureDistribution> {
  return request('GET', `/api/v1/code/orgs/${orgId}/posture-distribution`)
}

export interface PostureHeadline {
  healthy_count: number
  watching_count: number
  acting_count: number
  health_ratio: number
  health_ratio_label: string
  note: string
}

export function getPostureHeadline(orgId: string): Promise<PostureHeadline> {
  return request('GET', `/api/v1/code/orgs/${orgId}/posture-headline`)
}
