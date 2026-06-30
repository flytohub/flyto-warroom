/**
 * footprintSurface.ts — EASM / Attack-Surface client functions that the
 * Footprint compound needs but that weren't covered by footprintGraph.ts.
 *
 * Wire shapes mirror the Go handlers verbatim — keep in sync with:
 *   - api/handlers_footprint_candidate_paths.go  (candidatePath / candidatePathNode)
 *   - api/handlers_footprint_surface.go          (surface list + evidence)
 *   - internal/surface/resolver.go               (SurfaceItem / ResourceEvidence)
 *   - api/handlers_footprint_confirm.go          (confirm / reject)
 *   - api/handlers_attack_surface.go             (validate / scan)
 *   - api/handlers_domain_import.go              (domains/import)
 *
 * DECOUPLING: import these by DIRECT FILE PATH
 *   import { getCandidatePaths } from '@lib/engine/code/footprintSurface'
 * Report datasource metadata is exported from this module and imported by the
 * report registry directly; view-layer consumers should still use this path.
 */
import { request } from '../client'
import type { ReportSourceMeta } from '../reports/report-sources'
import type { ExternalAssessmentIntent, ExternalTargetScopeBucket, PentestProject } from './pentest'

// ─── GET /footprint/candidate-paths ─────────────────────────────────

export interface CandidatePathNode {
  entityId: string
  value: string
  type: string
  source: string
}

export interface CandidatePath {
  leafEntityId: string
  value: string
  type: string
  score: number
  distinctSources: number
  weakestLinkId: string
  oldestLastSeen: string
  hops: number
  chain: CandidatePathNode[]
  pool: string
}

export interface CandidatePathsResponse {
  org_id: string
  pool: string
  count: number
  paths: CandidatePath[]
}

export async function getCandidatePaths(orgId: string, limit = 50): Promise<CandidatePathsResponse> {
  const r = await request<CandidatePathsResponse>(
    'GET',
    `/api/v1/code/orgs/${orgId}/footprint/candidate-paths?limit=${limit}`,
  )
  return { ...r, paths: r.paths ?? [] }
}

// ─── GET /footprint/surface ─────────────────────────────────────────
// SurfaceItem fields without a Go json tag serialize as their PascalCase
// Go field names; the json-tagged ones are snake_case. Both shapes are
// mapped here so callers see one consistent camel/snake surface.

export type SurfacePool = 'main' | 'candidate' | 'noise' | 'confirmed' | 'all'

export interface SourceQualitySummary {
  coverage_status: 'confirmed' | 'corroborated' | 'candidate' | 'conflict' | 'not_collected' | string
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

export interface SurfaceItem {
  // PascalCase (no json tag on the Go field)
  ResourceID: string
  OrgID: string
  Category: string
  Type: string
  CanonicalValue: string
  DisplayName: string
  Sources: string[] | null
  LegacyRefs: Record<string, string> | null
  FirstSeenAt: string
  LastSeenAt: string
  Confidence: number
  // snake_case (json-tagged Go fields)
  current_status?: string
  current_tier?: string
  distinct_source_count?: number
  evidence_count?: number
  source_quality?: SourceQualitySummary
  owner_resource_id?: string
  owner_display_name?: string
  owner_relation_type?: string
  attribution_pool?: string
  attribution_reasons?: string[]
}

export interface SurfaceListResponse {
  org_id: string
  pool: string
  items: SurfaceItem[]
  count: number
}

export async function getFootprintSurface(orgId: string, pool: SurfacePool = 'main'): Promise<SurfaceListResponse> {
  const r = await request<SurfaceListResponse>(
    'GET',
    `/api/v1/code/orgs/${orgId}/footprint/surface?pool=${encodeURIComponent(pool)}`,
  )
  return { ...r, items: r.items ?? [] }
}

// ─── POST /targets ─────────────────────────────────────────────────

export type TargetRelationship = 'owned' | 'vendor' | 'external_context' | 'candidate'

export interface CreateExternalTargetBody {
  name?: string
  target?: string
  target_url?: string
  domain?: string
  relationship?: TargetRelationship | string
  assessment_intent?: ExternalAssessmentIntent
  project_type?: string
  environment?: string
  role?: string
  display_name?: string
  tags?: string
  criticality?: string
  criticality_label?: string
}

export interface ExternalTargetDecision {
  target_url: string
  host: string
  registrable_root: string
  scope_bucket: ExternalTargetScopeBucket
  scope_reason: string
  assessment_intent: ExternalAssessmentIntent
  active_gate_status: string
  required_action?: string
  requires_dns: boolean
  passive_allowed: boolean
  active_allowed: boolean
}

export interface CreateExternalTargetResponse {
  ok: boolean
  created: boolean
  message: string
  footprint_entity_id?: string
  project?: PentestProject
  target: ExternalTargetDecision
}

export function createExternalTarget(orgId: string, body: CreateExternalTargetBody): Promise<CreateExternalTargetResponse> {
  return request('POST', `/api/v1/code/orgs/${orgId}/targets`, body)
}

// ─── GET /footprint/surface/{resourceID}/evidence ───────────────────

export interface EvidenceStep {
  kind: string
  description: string
  source: string
  observed_at?: string
  effect: string // supports | refutes | neutral
  weight: number
}

export interface ResourceEvidence {
  resource_id: string
  canonical_value?: string
  type?: string
  owner_resource_id?: string
  owner_display_name?: string
  attribution_pool: string
  owned: boolean
  confidence: number
  source_quality?: SourceQualitySummary
  chain: EvidenceStep[]
}

export async function getSurfaceEvidence(orgId: string, resourceId: string): Promise<ResourceEvidence> {
  const r = await request<ResourceEvidence>(
    'GET',
    `/api/v1/code/orgs/${orgId}/footprint/surface/${encodeURIComponent(resourceId)}/evidence`,
  )
  return { ...r, chain: r.chain ?? [] }
}

// ─── GET/POST /footprint/company-scope ──────────────────────────────

export interface CompanyScopeNode {
  resource_id: string
  category: string
  type: string
  canonical_value: string
  display_name: string
  legal_name?: string
  aliases?: string[]
  seed_domains?: string[]
  required: boolean
  status: string
  review_status: string
  confidence_score: number
  source?: string
  source_ref?: string
  source_quality: SourceQualitySummary
  first_seen_at: string
  last_seen_at: string
}

export interface CompanyScopeEdge {
  id: string
  source_resource_id: string
  target_resource_id: string
  relation_type: string
  confidence: string
  confidence_score: number
  confirmation_kind?: string
  evidence_count: number
  first_seen_at: string
  last_seen_at: string
  source_quality: SourceQualitySummary
}

export interface CompanyScopeGap {
  id: string
  severity: string
  kind: string
  resource_id?: string
  message: string
}

export interface CompanyScopeSummary {
  business_entities: number
  owned_assets: number
  confirmed: number
  corroborated: number
  candidate: number
  conflict: number
  not_collected: number
  gap_count: number
}

export interface CompanyScopeGraphResponse {
  org_id: string
  generated_at: string
  nodes: CompanyScopeNode[]
  edges: CompanyScopeEdge[]
  gaps: CompanyScopeGap[]
  summary: CompanyScopeSummary
  source_status: SourceQualitySummary
}

export interface CompanyScopeSeedRequest {
  source_id?: string
  source_ref?: string
  entities: Array<{
    key?: string
    type?: string
    canonical_name: string
    display_name?: string
    legal_name?: string
    aliases?: string[]
    seed_domains?: string[]
    required?: boolean
    verification?: 'confirmed' | 'candidate' | 'rejected' | string
    confidence?: number
    source_id?: string
    source_ref?: string
    parent_key?: string
    relationship?: string
    relationship_id?: string
    assets?: Array<{
      key?: string
      category?: string
      type?: string
      value: string
      display_name?: string
      relation_type?: string
      verification?: 'confirmed' | 'candidate' | 'rejected' | string
      confidence?: number
      source_id?: string
      source_ref?: string
    }>
  }>
}

export async function getCompanyScopeGraph(orgId: string): Promise<CompanyScopeGraphResponse> {
  const r = await request<CompanyScopeGraphResponse>('GET', `/api/v1/code/orgs/${orgId}/footprint/company-scope`)
  return {
    ...r,
    nodes: r.nodes ?? [],
    edges: r.edges ?? [],
    gaps: r.gaps ?? [],
    summary: r.summary ?? {
      business_entities: 0,
      owned_assets: 0,
      confirmed: 0,
      corroborated: 0,
      candidate: 0,
      conflict: 0,
      not_collected: 0,
      gap_count: 0,
    },
  }
}

export function seedCompanyScope(orgId: string, body: CompanyScopeSeedRequest) {
  return request('POST', `/api/v1/code/orgs/${orgId}/footprint/company-scope`, body)
}

// ─── POST /footprint/entities/{entityId}/confirm | /reject ──────────
// Ownership gate. Confirm mirrors the candidate into /domains + CTEM.

export interface ConfirmEntityResponse {
  ok: boolean
  entity_id: string
  status: string // "owned"
  mirrored: boolean
}

export interface RejectEntityResponse {
  ok: boolean
  entity_id: string
  status: string // "rejected"
}

export function confirmFootprintEntity(orgId: string, entityId: string): Promise<ConfirmEntityResponse> {
  return request('POST', `/api/v1/code/orgs/${orgId}/footprint/entities/${encodeURIComponent(entityId)}/confirm`)
}

export function rejectFootprintEntity(orgId: string, entityId: string): Promise<RejectEntityResponse> {
  return request('POST', `/api/v1/code/orgs/${orgId}/footprint/entities/${encodeURIComponent(entityId)}/reject`)
}

// ─── BOY evidence-core breakthrough candidates ─────────────────────
// These are evidence-derived attack-path hypotheses. They are NOT the
// legacy footprint ownership candidates above: a hypothesis only moves
// to validated/dead_end/remediated/accepted_risk through validation tasks.

export type BOYHypothesisState =
  | 'needs_validation'
  | 'validated'
  | 'dead_end'
  | 'remediated'
  | 'accepted_risk'
  | string

export interface BOYAttackPathCandidate {
  id: string
  kind: string
  title: string
  description: string
  state: BOYHypothesisState
  subject_type: string
  subject_value: string
  priority_score: number
  dimensions: Record<string, number>
  evidence_ids: string[]
  relation_ids: string[]
  evidence_count?: number
  relation_count?: number
  recommended_verifier: string
  latest_task?: BOYValidationTask | null
  validation_playbook?: BOYValidationPlaybook
  confidence_explanation?: string[]
  why_now?: string[]
  updated_at: string
}

export interface BOYAttackPathCandidatesResponse {
  org_id: string
  count: number
  candidates: BOYAttackPathCandidate[]
}

export async function getBOYAttackPathCandidates(orgId: string, limit = 100): Promise<BOYAttackPathCandidatesResponse> {
  const r = await request<BOYAttackPathCandidatesResponse>(
    'GET',
    `/api/v1/code/orgs/${orgId}/attack-paths/candidates?limit=${limit}`,
  )
  return { ...r, candidates: r.candidates ?? [] }
}

export interface BOYValidationPlaybook {
  verifier: string
  steps: string[]
  required_evidence: string[]
  allowed_results: string[]
  restrictions: string[]
}

export interface BOYEvidenceObservation {
  id: string
  org_id: string
  source_type: string
  source_name: string
  source_reliability: number
  subject_type: string
  subject_value: string
  observation_type: string
  confidence: number
  severity: string
  business_impact: number
  validation_status: string
  raw_ref: string
  raw_payload: string
  metadata: string
  first_seen_at: string
  last_seen_at: string
  created_at: string
  updated_at: string
}

export interface BOYEvidenceRelation {
  id: string
  org_id: string
  from_observation_id: string
  to_observation_id: string
  relation_kind: string
  confidence: number
  metadata: string
  observed_at: string
}

export interface BOYAttackPathCandidateDetailResponse {
  org_id: string
  candidate: BOYAttackPathCandidate
  observations: BOYEvidenceObservation[]
  relations: BOYEvidenceRelation[]
  validation_tasks: BOYValidationTask[]
}

export async function getBOYAttackPathCandidateDetail(
  orgId: string,
  hypothesisId: string,
): Promise<BOYAttackPathCandidateDetailResponse> {
  const r = await request<BOYAttackPathCandidateDetailResponse>(
    'GET',
    `/api/v1/code/orgs/${orgId}/attack-paths/candidates/${encodeURIComponent(hypothesisId)}`,
  )
  return {
    ...r,
    observations: r.observations ?? [],
    relations: r.relations ?? [],
    validation_tasks: r.validation_tasks ?? [],
  }
}

export interface BOYRecompileResponse {
  org_id: string
  compiled: number
  auto_queued: number
  bridged_attack_paths: number
  bridged_fusion_evidence?: number
  bridged_fusion_relations?: number
  paths?: number
  missing_evidence?: number
  gap_tasks_queued?: number
  hypotheses: string[]
}

export function recompileBOYEvidence(orgId: string): Promise<BOYRecompileResponse> {
  return request('POST', `/api/v1/code/orgs/${orgId}/evidence/recompile`)
}

export type BOYValidationStatus =
  | 'queued_for_validation'
  | 'validated_exploitable'
  | 'validated_not_exploitable'
  | 'remediated'
  | 'accepted_risk'
  | string

export interface BOYValidationTask {
  id: string
  org_id: string
  hypothesis_id: string
  linked_gap_id?: string
  status: BOYValidationStatus
  verifier: string
  result: string
  requested_by: string
  completed_by: string
  notes: string
  evidence_ids_json: string
  created_at: string
  updated_at: string
  completed_at?: string | null
}

export interface BOYValidationTasksResponse {
  org_id: string
  count: number
  tasks: BOYValidationTask[]
}

export async function getBOYValidationTasks(orgId: string, limit = 100): Promise<BOYValidationTasksResponse> {
  const r = await request<BOYValidationTasksResponse>(
    'GET',
    `/api/v1/code/orgs/${orgId}/validation-tasks?limit=${limit}`,
  )
  return { ...r, tasks: r.tasks ?? [] }
}

export interface BOYValidationTaskResponse {
  task: BOYValidationTask
  candidate?: BOYAttackPathCandidate
  path?: BOYBreakthroughPath
  gap?: BOYMissingEvidenceItem
}

export function createBOYValidationTask(
  orgId: string,
  body: { hypothesis_id: string; verifier?: string; notes?: string },
): Promise<BOYValidationTaskResponse> {
  return request('POST', `/api/v1/code/orgs/${orgId}/validation-tasks`, body)
}

export function completeBOYValidationTask(
  orgId: string,
  taskId: string,
  body: { status: 'validated_exploitable' | 'validated_not_exploitable' | 'remediated' | 'accepted_risk'; result?: string; notes?: string },
): Promise<BOYValidationTaskResponse> {
  return request('POST', `/api/v1/code/orgs/${orgId}/validation-tasks/${encodeURIComponent(taskId)}/complete`, body)
}

export interface BOYAttachPentestEvidenceResponse {
  task: BOYValidationTask
  candidate?: BOYAttackPathCandidate
  observation_ids: string[]
  research_footprint_selector?: { hypothesis_id?: string; path_id?: string }
}

export function attachPentestEvidenceToValidationTask(
  orgId: string,
  taskId: string,
  body: { project_id: string; scan_id: string; finding_ids: string[] },
): Promise<BOYAttachPentestEvidenceResponse> {
  return request(
    'POST',
    `/api/v1/code/orgs/${orgId}/validation-tasks/${encodeURIComponent(taskId)}/pentest-evidence`,
    body,
  )
}

// ─── BOY v3 breakthrough paths + missing evidence ──────────────────

export type BOYBreakthroughPathState = BOYHypothesisState

export interface BOYBreakthroughPath {
  id: string
  org_id: string
  hypothesis_id: string
  kind: string
  title: string
  description: string
  state: BOYBreakthroughPathState
  subject_type: string
  subject_value: string
  priority_score: number
  confidence_score: number
  impact_score: number
  exploitability_score: number
  validation_readiness: number
  missing_evidence: number
  dimensions_json: string
  evidence_ids_json: string
  relation_ids_json: string
  why_now_json: string
  recommended_verifier: string
  created_at: string
  updated_at: string
  missing_evidence_items?: BOYMissingEvidenceItem[]
}

export interface BOYBreakthroughPathNode {
  id: string
  org_id: string
  path_id: string
  node_order: number
  node_type: string
  label: string
  value: string
  evidence_id: string
  metadata: string
}

export interface BOYBreakthroughPathEdge {
  id: string
  org_id: string
  path_id: string
  edge_order: number
  from_node_id: string
  to_node_id: string
  relation_id: string
  relation_kind: string
  confidence: number
  metadata: string
}

export type BOYMissingEvidenceStatus = 'missing' | 'task_queued' | 'satisfied' | 'refuted' | string

export interface BOYMissingEvidenceItem {
  id: string
  org_id: string
  path_id: string
  hypothesis_id: string
  gap_kind: string
  title: string
  description: string
  verifier: string
  status: BOYMissingEvidenceStatus
  priority: number
  evidence_source: string
  recommended_action: string
  task_id: string
  created_at: string
  updated_at: string
}

export interface BOYBreakthroughPathsResponse {
  org_id: string
  count: number
  paths: BOYBreakthroughPath[]
}

export async function getBOYBreakthroughPaths(orgId: string, limit = 100): Promise<BOYBreakthroughPathsResponse> {
  const r = await request<BOYBreakthroughPathsResponse>(
    'GET',
    `/api/v1/code/orgs/${orgId}/breakthrough-paths?limit=${limit}`,
  )
  return { ...r, paths: r.paths ?? [] }
}

export interface BOYBreakthroughPathDetailResponse {
  org_id: string
  path: BOYBreakthroughPath
  candidate?: BOYAttackPathCandidate
  nodes: BOYBreakthroughPathNode[]
  edges: BOYBreakthroughPathEdge[]
  missing_evidence: BOYMissingEvidenceItem[]
  observations: BOYEvidenceObservation[]
  relations: BOYEvidenceRelation[]
  validation_tasks: BOYValidationTask[]
}

export async function getBOYBreakthroughPathDetail(
  orgId: string,
  pathId: string,
): Promise<BOYBreakthroughPathDetailResponse> {
  const r = await request<BOYBreakthroughPathDetailResponse>(
    'GET',
    `/api/v1/code/orgs/${orgId}/breakthrough-paths/${encodeURIComponent(pathId)}`,
  )
  return {
    ...r,
    nodes: r.nodes ?? [],
    edges: r.edges ?? [],
    missing_evidence: r.missing_evidence ?? [],
    observations: r.observations ?? [],
    relations: r.relations ?? [],
    validation_tasks: r.validation_tasks ?? [],
  }
}

export function recompileBOYBreakthroughPaths(orgId: string): Promise<BOYRecompileResponse> {
  return request('POST', `/api/v1/code/orgs/${orgId}/breakthrough-paths/recompile`)
}

export function createBOYMissingEvidenceTask(
  orgId: string,
  gapId: string,
): Promise<BOYValidationTaskResponse> {
  return request('POST', `/api/v1/code/orgs/${orgId}/missing-evidence/${encodeURIComponent(gapId)}/tasks`)
}

// ─── Research Footprint / cited evidence trail ─────────────────────

export type ResearchFootprintSelector =
  | { path_id: string }
  | { hypothesis_id: string }
  | { subject_type: string; subject_value: string }

export interface ResearchFootprintSubject {
  selector_type: string
  type: string
  value: string
  path_id?: string
  hypothesis_id?: string
  state?: string
}

export interface ResearchFootprintSummary {
  title: string
  description: string
  kind: string
  state: string
  priority_score: number
  confidence_score: number
  impact_score: number
  exploitability_score: number
  validation_readiness: number
  recommended_verifier: string
  observation_count: number
  relation_count: number
  missing_evidence_count: number
  validation_task_count: number
  source_count: number
  dimensions: Record<string, number>
  why_now: string[]
  positioning: string
}

export interface ResearchFootprintPath {
  id: string
  hypothesis_id: string
  kind: string
  title: string
  description: string
  state: string
  subject_type: string
  subject_value: string
  priority_score: number
  confidence_score: number
  impact_score: number
  exploitability_score: number
  validation_readiness: number
  missing_evidence: number
  dimensions: Record<string, number>
  evidence_ids: string[]
  relation_ids: string[]
  why_now: string[]
  recommended_verifier: string
  updated_at: string
}

export interface ResearchFootprintCandidate {
  id: string
  kind: string
  title: string
  description: string
  state: string
  subject_type: string
  subject_value: string
  priority_score: number
  dimensions: Record<string, number>
  evidence_ids: string[]
  relation_ids: string[]
  recommended_verifier: string
  updated_at: string
}

export interface ResearchFootprintObservation {
  id: string
  source_type: string
  source_name: string
  source_reliability: number
  subject_type: string
  subject_value: string
  observation_type: string
  confidence: number
  severity: string
  business_impact: number
  validation_status: string
  raw_ref: string
  metadata_summary: Record<string, unknown>
  first_seen_at: string
  last_seen_at: string
}

export interface ResearchFootprintRelation {
  id: string
  from_observation_id: string
  to_observation_id: string
  relation_kind: string
  confidence: number
  metadata_summary: Record<string, unknown>
  observed_at: string
}

export interface ResearchFootprintSourceLedgerItem {
  id: string
  source_type: string
  source_name: string
  observation_count: number
  source_reliability: number
  max_confidence: number
  max_business_impact: number
  max_severity: string
  first_seen_at: string
  last_seen_at: string
  observation_ids: string[]
}

export interface ResearchFootprintTimelineItem {
  id: string
  kind: string
  title: string
  detail: string
  timestamp: string
  citations: string[]
}

export interface ResearchFootprintRouteNode {
  id: string
  node_order: number
  node_type: string
  label: string
  value: string
  evidence_id: string
  metadata_summary: Record<string, unknown>
  citations: string[]
}

export interface ResearchFootprintRouteEdge {
  id: string
  edge_order: number
  from_node_id: string
  to_node_id: string
  relation_id: string
  relation_kind: string
  confidence: number
  metadata_summary: Record<string, unknown>
  citations: string[]
}

export interface ResearchFootprintMissingEvidence {
  id: string
  path_id: string
  hypothesis_id: string
  gap_kind: string
  title: string
  description: string
  verifier: string
  status: string
  priority: number
  evidence_source: string
  recommended_action: string
  task_id: string
  updated_at: string
}

export interface ResearchFootprintValidationTask {
  id: string
  hypothesis_id: string
  linked_gap_id: string
  status: string
  verifier: string
  result: string
  notes: string
  requested_by?: string
  completed_by?: string
  evidence_ids: string[]
  created_at: string
  updated_at: string
  completed_at?: string | null
}

export interface ResearchFootprintDecisionStates {
  current_state: string
  validation_status: string
  task_counts: Record<string, number>
  missing_evidence_counts: Record<string, number>
  open_task_ids: string[]
  completed_task_ids: string[]
}

export interface ResearchFootprintNarrativeClaim {
  id: string
  kind: string
  text: string
  citations: string[]
}

export interface ResearchFootprintDecisionEntry {
  id: string
  kind: string
  state: string
  title: string
  detail: string
  actor?: string
  result?: string
  notes?: string
  timestamp: string
  citations: string[]
}

export interface ResearchFootprintEvidenceQuality {
  weighted_confidence: number
  reliability_band: string
  corroboration_count: number
  conflict_count: number
  stale_source_count: number
  top_source_ids: string[]
  support_relation_ids: string[]
  conflict_relation_ids: string[]
}

export interface ResearchFootprintAuditIntegrity {
  generated_at: string
  bundle_sha256: string
  hash_recipe: string
  citation_count: number
  resolved_citation_count?: number
  unresolved_citation_count?: number
  uncited_claim_count: number
  redaction_applied: boolean
  integrity_warnings: string[]
}

export type ResearchFootprintVerificationLevel =
  | 'unverified'
  | 'indirectly_supported'
  | 'empirically_observed'
  | 'validated_exploitable'
  | 'accepted_risk'
  | 'remediated'

export interface ResearchFootprintVerificationSummary {
  level: ResearchFootprintVerificationLevel
  status: string
  pentest_observation_count: number
  pentest_finding_count: number
  redteam_observation_count?: number
  redteam_campaign_count?: number
  linked_validation_task_ids: string[]
  last_empirical_validation_at?: string | null
}

export interface ResearchFootprintCitationIndexItem {
  id: string
  kind: string
  title: string
  description?: string
  source_type?: string
  source_name?: string
  source_reliability?: number
  subject_type?: string
  subject_value?: string
  confidence?: number
  severity?: string
  business_impact?: number
  validation_status?: string
  raw_ref?: string
  observed_at?: string
  related_ids: string[]
  metadata_summary: Record<string, unknown>
}

export interface ResearchFootprintEvidenceBundle {
  generated_at: string
  subject: ResearchFootprintSubject
  claims: ResearchFootprintNarrativeClaim[]
  source_ledger: ResearchFootprintSourceLedgerItem[]
  evidence_quality?: ResearchFootprintEvidenceQuality
  verification_summary?: ResearchFootprintVerificationSummary
  citation_index?: ResearchFootprintCitationIndexItem[]
  bundle_sha256?: string
  hash_recipe?: string
  integrity_warnings?: string[]
  observation_ids: string[]
  relation_ids: string[]
  validation_task_ids: string[]
  missing_evidence_ids: string[]
  decision_log_ids?: string[]
  route_node_ids: string[]
  route_edge_ids: string[]
  export_name: string
}

export interface ResearchFootprintResponse {
  org_id: string
  generated_at: string
  subject: ResearchFootprintSubject
  summary: ResearchFootprintSummary
  path?: ResearchFootprintPath
  candidate?: ResearchFootprintCandidate
  observations: ResearchFootprintObservation[]
  relations: ResearchFootprintRelation[]
  source_ledger: ResearchFootprintSourceLedgerItem[]
  evidence_timeline: ResearchFootprintTimelineItem[]
  route_nodes: ResearchFootprintRouteNode[]
  route_edges: ResearchFootprintRouteEdge[]
  missing_evidence: ResearchFootprintMissingEvidence[]
  validation_tasks: ResearchFootprintValidationTask[]
  decision_states: ResearchFootprintDecisionStates
  decision_log: ResearchFootprintDecisionEntry[]
  evidence_quality: ResearchFootprintEvidenceQuality
  verification_summary: ResearchFootprintVerificationSummary
  citation_index: ResearchFootprintCitationIndexItem[]
  audit_integrity: ResearchFootprintAuditIntegrity
  narrative: { claims: ResearchFootprintNarrativeClaim[] }
  evidence_bundle: ResearchFootprintEvidenceBundle
}

export interface ResearchFootprintExportResponse {
  schema_version: string
  org_id: string
  generated_at: string
  bundle_sha256: string
  hash_recipe: string
  audit_integrity: ResearchFootprintAuditIntegrity
  research_footprint: ResearchFootprintResponse
}

export interface ResearchFootprintReportRow {
  path_id: string
  hypothesis_id: string
  subject_type: string
  subject_value: string
  kind: string
  state: string
  priority_score: number
  confidence_score: number
  impact_score: number
  exploitability_score: number
  validation_readiness: number
  missing_evidence_count: number
  validation_task_count: number
  open_task_count: number
  completed_task_count: number
  weighted_confidence: number
  reliability_band: string
  corroboration_count: number
  conflict_count: number
  stale_source_count: number
  source_count: number
  observation_count: number
  relation_count: number
  latest_decision_state: string
  latest_decision_title: string
  latest_decision_at: string
  top_source_ids: string[]
  bundle_sha256: string
  export_name: string
  updated_at: string
}

export function researchFootprintSelectorKey(selector?: ResearchFootprintSelector | null): string {
  if (!selector) return 'none'
  if ('path_id' in selector) return `path:${selector.path_id}`
  if ('hypothesis_id' in selector) return `hypothesis:${selector.hypothesis_id}`
  return `subject:${selector.subject_type}:${selector.subject_value}`
}

export function researchFootprintPathSelector(path?: Pick<BOYBreakthroughPath, 'id'> | null): ResearchFootprintSelector | null {
  return path?.id ? { path_id: path.id } : null
}

export function researchFootprintCandidateSelector(candidate?: Pick<BOYAttackPathCandidate, 'id'> | null): ResearchFootprintSelector | null {
  return candidate?.id ? { hypothesis_id: candidate.id } : null
}

export function researchFootprintSubjectSelector(subjectType?: string, subjectValue?: string): ResearchFootprintSelector | null {
  const st = (subjectType || '').trim()
  const sv = (subjectValue || '').trim()
  return st && sv ? { subject_type: st, subject_value: sv } : null
}

function researchFootprintQuery(selector: ResearchFootprintSelector): string {
  const params = new URLSearchParams()
  if ('path_id' in selector) params.set('path_id', selector.path_id)
  else if ('hypothesis_id' in selector) params.set('hypothesis_id', selector.hypothesis_id)
  else {
    params.set('subject_type', selector.subject_type)
    params.set('subject_value', selector.subject_value)
  }
  return params.toString()
}

export async function getResearchFootprint(
  orgId: string,
  selector: ResearchFootprintSelector,
): Promise<ResearchFootprintResponse> {
  const r = await request<ResearchFootprintResponse>(
    'GET',
    `/api/v1/code/orgs/${orgId}/research-footprint?${researchFootprintQuery(selector)}`,
  )
  return {
    ...r,
    observations: r.observations ?? [],
    relations: r.relations ?? [],
    source_ledger: r.source_ledger ?? [],
    evidence_timeline: r.evidence_timeline ?? [],
    route_nodes: r.route_nodes ?? [],
    route_edges: r.route_edges ?? [],
    missing_evidence: r.missing_evidence ?? [],
    validation_tasks: r.validation_tasks ?? [],
    decision_log: r.decision_log ?? [],
    evidence_quality: r.evidence_quality ?? {
      weighted_confidence: 0,
      reliability_band: 'insufficient',
      corroboration_count: 0,
      conflict_count: 0,
      stale_source_count: 0,
      top_source_ids: [],
      support_relation_ids: [],
      conflict_relation_ids: [],
    },
    audit_integrity: r.audit_integrity ?? {
      generated_at: r.generated_at,
      bundle_sha256: r.evidence_bundle?.bundle_sha256 ?? '',
      hash_recipe: r.evidence_bundle?.hash_recipe ?? '',
      citation_count: 0,
      resolved_citation_count: 0,
      unresolved_citation_count: 0,
      uncited_claim_count: 0,
      redaction_applied: true,
      integrity_warnings: r.evidence_bundle?.integrity_warnings ?? [],
    },
    verification_summary: r.verification_summary ?? r.evidence_bundle?.verification_summary ?? {
      level: 'unverified',
      status: r.decision_states?.validation_status ?? r.summary?.state ?? 'unverified',
      pentest_observation_count: 0,
      pentest_finding_count: 0,
      linked_validation_task_ids: [],
      last_empirical_validation_at: null,
    },
    citation_index: r.citation_index ?? [],
    narrative: { claims: r.narrative?.claims ?? [] },
  }
}

export async function exportResearchFootprintBundle(
  orgId: string,
  selector: ResearchFootprintSelector,
): Promise<{ filename: string; bytes: number; bundleHash: string; response: ResearchFootprintExportResponse }> {
  const response = await request<ResearchFootprintExportResponse>(
    'GET',
    `/api/v1/code/orgs/${orgId}/research-footprint/export?${researchFootprintQuery(selector)}`,
  )
  const exportName = response.research_footprint?.evidence_bundle?.export_name || 'research-footprint'
  const filename = `${exportName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'research-footprint'}.json`
  const json = JSON.stringify(response, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return { filename, bytes: blob.size, bundleHash: response.bundle_sha256, response }
}

function latestResearchDecision(data: ResearchFootprintResponse): ResearchFootprintDecisionEntry | undefined {
  return [...(data.decision_log ?? [])].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))[0]
}

export async function listResearchFootprintsForReports(orgId: string, limit = 50): Promise<{ rows: ResearchFootprintReportRow[]; count: number; generated_at: string }> {
  const pathResp = await getBOYBreakthroughPaths(orgId, limit)
  const footprints = await Promise.all(
    (pathResp.paths ?? []).slice(0, limit).map(path => getResearchFootprint(orgId, { path_id: path.id })),
  )
  const rows = footprints.map(data => {
    const latest = latestResearchDecision(data)
    return {
      path_id: data.path?.id ?? data.subject.path_id ?? '',
      hypothesis_id: data.candidate?.id ?? data.path?.hypothesis_id ?? data.subject.hypothesis_id ?? '',
      subject_type: data.subject.type,
      subject_value: data.subject.value,
      kind: data.summary.kind,
      state: data.summary.state || data.subject.state || 'uncorrelated',
      priority_score: data.summary.priority_score,
      confidence_score: data.summary.confidence_score,
      impact_score: data.summary.impact_score,
      exploitability_score: data.summary.exploitability_score,
      validation_readiness: data.summary.validation_readiness,
      missing_evidence_count: data.summary.missing_evidence_count,
      validation_task_count: data.summary.validation_task_count,
      open_task_count: data.decision_states.open_task_ids.length,
      completed_task_count: data.decision_states.completed_task_ids.length,
      weighted_confidence: data.evidence_quality.weighted_confidence,
      reliability_band: data.evidence_quality.reliability_band,
      corroboration_count: data.evidence_quality.corroboration_count,
      conflict_count: data.evidence_quality.conflict_count,
      stale_source_count: data.evidence_quality.stale_source_count,
      source_count: data.summary.source_count,
      observation_count: data.summary.observation_count,
      relation_count: data.summary.relation_count,
      latest_decision_state: latest?.state ?? data.decision_states.current_state,
      latest_decision_title: latest?.title ?? '',
      latest_decision_at: latest?.timestamp ?? data.generated_at,
      top_source_ids: data.evidence_quality.top_source_ids,
      bundle_sha256: data.audit_integrity.bundle_sha256,
      export_name: data.evidence_bundle.export_name,
      updated_at: data.path?.updated_at ?? data.candidate?.updated_at ?? data.generated_at,
    }
  })
  return { rows, count: rows.length, generated_at: new Date().toISOString() }
}

export const FOOTPRINT_REPORT_SOURCES: ReportSourceMeta[] = [
  {
    id: 'research-footprints',
    name: 'Research Footprints',
    nameKey: 'reports.ds.researchFootprints',
    category: 'external',
    requiredPage: 'domains',
    fetcher: (orgId) => listResearchFootprintsForReports(orgId),
    rowsPath: 'rows',
    joinableOn: ['subject_value', 'path_id', 'hypothesis_id'],
    fields: [
      { key: 'subject_value', label: 'Subject', type: 'string' },
      { key: 'subject_type', label: 'Subject Type', type: 'string' },
      { key: 'kind', label: 'Kind', type: 'string' },
      { key: 'state', label: 'State', type: 'string' },
      { key: 'priority_score', label: 'Priority', type: 'number', aggregate: 'avg' },
      { key: 'weighted_confidence', label: 'Weighted Confidence', type: 'number', aggregate: 'avg' },
      { key: 'reliability_band', label: 'Reliability', type: 'string' },
      { key: 'corroboration_count', label: 'Corroboration', type: 'number', aggregate: 'sum' },
      { key: 'conflict_count', label: 'Conflicts', type: 'number', aggregate: 'sum' },
      { key: 'missing_evidence_count', label: 'Missing Evidence', type: 'number', aggregate: 'sum' },
      { key: 'validation_task_count', label: 'Validation Tasks', type: 'number', aggregate: 'sum' },
      { key: 'latest_decision_state', label: 'Latest Decision', type: 'string' },
      { key: 'latest_decision_at', label: 'Latest Decision At', type: 'date' },
      { key: 'bundle_sha256', label: 'Bundle SHA-256', type: 'string' },
      { key: 'updated_at', label: 'Updated At', type: 'date' },
    ],
  },
]

// ─── Domains inventory lifecycle ────────────────────────────────────
// PATCH attack-surface validate · POST attack-surface scan · POST domains/import

export interface ValidateAssetResponse {
  id: string
  validation_status: string
  validated_by: string
}

/**
 * Validate (mark verified / false_positive) an attack-surface asset.
 *
 * Contract: `assetOrResourceId` carries a kernel `resource_id` preferred —
 * the backend resolves GetKernelResource first, then falls back to a legacy
 * `attack_surface.id` lookup. Callers (e.g. AssetMapView) pass `node.resource_id`.
 * The path segment name `attack-surface/{id}` is historical; either id shape works.
 */
export function validateAttackSurfaceAsset(
  orgId: string,
  assetOrResourceId: string,
  status: 'verified' | 'false_positive',
  validatedBy?: string,
): Promise<ValidateAssetResponse> {
  return request(
    'PATCH',
    `/api/v1/code/orgs/${orgId}/attack-surface/${encodeURIComponent(assetOrResourceId)}/validate`,
    { status, validated_by: validatedBy ?? '' },
  )
}

/**
 * Trigger a scan of an attack-surface asset.
 *
 * Contract: `assetOrResourceId` carries a kernel `resource_id` preferred —
 * the backend resolves GetKernelResource first, then falls back to a legacy
 * `attack_surface.id` lookup. Callers (e.g. AssetMapView) pass `node.resource_id`.
 * The path segment name `attack-surface/{id}` is historical; either id shape works.
 */
export function scanAttackSurfaceAsset(orgId: string, assetOrResourceId: string): Promise<unknown> {
  return request('POST', `/api/v1/code/orgs/${orgId}/attack-surface/${encodeURIComponent(assetOrResourceId)}/scan`)
}

export interface DomainImportResult {
  domain: string
  project_id?: string
  subdomains?: string[]
  status: string // created | exists | error
}

export interface DomainImportResponse {
  imported: number
  created: number
  already_exist: number
  subdomains: number
  results: DomainImportResult[]
}

export function importDomains(
  orgId: string,
  domains: string[],
  opts?: { environment?: string; role?: string },
): Promise<DomainImportResponse> {
  return request(
    'POST',
    `/api/v1/code/orgs/${orgId}/domains/import`,
    { domains, environment: opts?.environment, role: opts?.role },
  )
}

export interface DomainVerification {
  id: string
  orgId: string
  domain: string
  recordName: string
  recordValue: string
  status: 'pending' | 'verified' | 'failed' | 'expired' | string
  failureReason?: string
  expiresAt?: string
  verifiedAt?: string
  lastCheckedAt?: string
}

export function createDomainVerification(orgId: string, domain: string): Promise<DomainVerification> {
  return request('POST', `/api/v1/code/orgs/${orgId}/domain-verifications`, { domain })
}

export function verifyDomainVerification(orgId: string, domain: string): Promise<DomainVerification> {
  return request('POST', `/api/v1/code/orgs/${orgId}/domain-verifications/${encodeURIComponent(domain)}/verify`)
}

export function listDomainVerifications(orgId: string): Promise<{ verifications: DomainVerification[] }> {
  return request('GET', `/api/v1/code/orgs/${orgId}/domain-verifications`)
}

// ─── GET /external-posture/kernel ───────────────────────────────────
// Domain inventory + per-asset score/grade for the manager dashboard.
// Mirrors compounds/exposure/shared.ts KernelExternalPosture; declared
// here so the easm-footprint domain is self-contained (decoupling rule).

export interface DomainKernelAsset {
  resource_id: string
  type: 'subdomain' | 'domain' | 'ip' | string
  canonical_value: string
  display_name?: string
  sources?: string[]
  score?: number
  grade?: string
  last_scanned?: string
  confidence: number
  current_tier?: string
  first_seen_at?: string
  findings?: { severity?: string }[]
}

export interface DomainKernelPosture {
  org_id: string
  asset_count: number
  scored_count: number
  avg_score: number
  avg_grade: string
  assets: DomainKernelAsset[]
}

export async function getDomainPostureKernel(orgId: string): Promise<DomainKernelPosture> {
  const r = await request<DomainKernelPosture>(
    'GET',
    `/api/v1/code/orgs/${orgId}/external-posture/kernel`,
  )
  return { ...r, assets: r.assets ?? [] }
}
