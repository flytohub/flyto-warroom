/**
 * surfaces.ts — typed clients for the identity + MCP surface APIs. Identity is
 * a read-only posture rollup; MCP includes read rollups plus a dashboard-safe
 * diagnostic write that records one synthetic event through the same guardian
 * decision pipeline as external ingest.
 */
import { BASE, request } from '../client'

// ── Identity posture (GET /orgs/{id}/identity/posture) ───────────────

export interface IdentityAtRiskRow {
  resourceId: string
  mfaEnrolled: boolean
  status?: string
  reason: string
}

export interface IdentityPosture {
  /** Any identity claim ingested at all (false → no IdP wired). */
  configured: boolean
  totalIdentities: number
  mfaEnrolled: number
  mfaMissing: number
  /** 0..1 over identities that carry an MFA claim. */
  mfaCoverage: number
  statusCounts: Record<string, number>
  atRisk: IdentityAtRiskRow[]
  sources: string[]
}

export function getIdentityPosture(orgId: string): Promise<IdentityPosture> {
  return request<IdentityPosture>('GET', `/api/v1/code/orgs/${orgId}/identity/posture`)
}

// ── MCP overview (GET /orgs/{id}/mcp/overview) ───────────────────────

export interface MCPServerRow {
  id: string
  name: string
  transport: string
  deploymentKind: string
  status: string
  toolCount: number
  unclassifiedTools: number
  /** Non-read-only / mutating verbs. */
  writeTools: number
}

export interface MCPDecisionRow {
  toolName: string
  verb?: string
  verdict?: string
  effective?: string
  stateChange: boolean
  externalSideEffect: boolean
}

export interface MCPOverview {
  /** Any MCP server registered (false → guardian not wired). */
  configured: boolean
  servers: MCPServerRow[]
  serverStatusCounts: Record<string, number>
  toolTotal: number
  unclassifiedTools: number
  recentDecisions: MCPDecisionRow[]
  decisionCounts: Record<string, number>
}

export function getMcpOverview(orgId: string): Promise<MCPOverview> {
  return request<MCPOverview>('GET', `/api/v1/code/orgs/${orgId}/mcp/overview`)
}

export interface MCPTestConnectionResponse {
  eventId: string
  verdict: string
  effective: string
  rollout: string
  source: string
  floorRule?: string
  evidence?: string[]
  blocked: boolean
}

export function mcpIngestEndpoint(_orgId?: string): string {
  return `${BASE}/api/v1/agent-firewall/ingest`
}

export function runtimeEventsEndpoint(): string {
  return `${BASE}/api/v1/runtime/events`
}

export function ciCheckEndpoint(repoId = '{REPO_ID}'): string {
  return `${BASE}/api/v1/code/repos/${repoId}/ci-check`
}

export function scanUploadEndpoint(repoId = '{REPO_ID}'): string {
  return `${BASE}/api/v1/code/repos/${repoId}/scan-upload`
}

export function testMcpConnection(orgId: string): Promise<MCPTestConnectionResponse> {
  return request<MCPTestConnectionResponse>('POST', `/api/v1/code/orgs/${orgId}/mcp/test-connection`)
}

export interface AIGovernanceScoreDimension {
  id: string
  label: string
  description: string
  score: number
  weight: number
  status: 'strong' | 'managed' | 'partial' | 'gap' | string
  evidence: string[]
  signals: Record<string, number>
}

export interface AIGovernanceScore {
  orgId: string
  generatedAt: string
  overall: number
  grade: string
  enterpriseOverall?: number
  enterpriseGrade?: string
  dimensions: AIGovernanceScoreDimension[]
  enterpriseReadiness?: AIGovernanceScoreDimension[]
  summary: Record<string, unknown>
}

export function getAIGovernanceScore(orgId: string): Promise<AIGovernanceScore> {
  return request<AIGovernanceScore>('GET', `/api/v1/code/orgs/${orgId}/ai-governance/score`)
}

export interface AIGovernanceEvent {
  id: string
  orgId: string
  useCaseId?: string
  runtimeEventId?: string
  eventType: 'created' | 'updated' | 'approval_requested' | 'approved' | 'rejected' | 'expired' | 'retired' | 'runtime_gap' | 'action_gap' | 'enforcement_hold' | 'enforcement_block' | string
  actorId?: string
  fromStatus?: string
  toStatus?: string
  fromApprovalStatus?: string
  toApprovalStatus?: string
  fromPolicyMode?: string
  toPolicyMode?: string
  riskLevel?: string
  reason?: string
  metadataJson: string
  createdAt: string
}

export function listAIGovernanceEvents(orgId: string): Promise<AIGovernanceEvent[]> {
  return request<AIGovernanceEvent[]>('GET', `/api/v1/code/orgs/${orgId}/ai-governance/events`)
}

export interface AIGovernanceUseCase {
  id: string
  orgId: string
  name: string
  department: string
  businessOwner: string
  technicalOwner: string
  modelProvider: string
  modelName: string
  appName: string
  appCategory: string
  purpose: string
  dataClasses: string[]
  frameworks: string[]
  riskLevel: 'critical' | 'high' | 'medium' | 'low' | string
  status: 'draft' | 'pending_approval' | 'approved' | 'denied' | 'expired' | 'retired' | string
  policyMode: MCPRolloutMode | string
  approvalStatus: 'not_requested' | 'pending' | 'approved' | 'rejected' | 'expired' | 'revoked' | string
  approvalRequestedBy?: string
  approvedBy?: string
  approvedAt?: string
  expiresAt?: string
  lastReviewedAt?: string
  evidenceJson: string
  notes: string
  createdAt: string
  updatedAt: string
}

export type AIGovernanceUseCaseInput = Partial<Omit<AIGovernanceUseCase, 'id' | 'orgId' | 'createdAt' | 'updatedAt'>>

export function listAIGovernanceUseCases(orgId: string): Promise<AIGovernanceUseCase[]> {
  return request<AIGovernanceUseCase[]>('GET', `/api/v1/code/orgs/${orgId}/ai-governance/use-cases`)
}

export function createAIGovernanceUseCase(orgId: string, body: AIGovernanceUseCaseInput): Promise<AIGovernanceUseCase> {
  return request<AIGovernanceUseCase>('POST', `/api/v1/code/orgs/${orgId}/ai-governance/use-cases`, body)
}

export function updateAIGovernanceUseCase(useCaseId: string, body: AIGovernanceUseCaseInput): Promise<AIGovernanceUseCase> {
  return request<AIGovernanceUseCase>('PATCH', `/api/v1/code/ai-governance/use-cases/${useCaseId}`, body)
}

export function requestAIGovernanceUseCaseApproval(useCaseId: string): Promise<AIGovernanceUseCase> {
  return request<AIGovernanceUseCase>('POST', `/api/v1/code/ai-governance/use-cases/${useCaseId}/request-approval`)
}

export function approveAIGovernanceUseCase(useCaseId: string, body: { expiresAt?: string; notes?: string } = {}): Promise<AIGovernanceUseCase> {
  return request<AIGovernanceUseCase>('POST', `/api/v1/code/ai-governance/use-cases/${useCaseId}/approve`, body)
}

export function rejectAIGovernanceUseCase(useCaseId: string, body: { notes?: string } = {}): Promise<AIGovernanceUseCase> {
  return request<AIGovernanceUseCase>('POST', `/api/v1/code/ai-governance/use-cases/${useCaseId}/reject`, body)
}

// ── MCP Guardian control plane + insights (flyto-engine PR #209) ──────
//
// The decision engine (internal/mcpguard) is the policy authority. These
// endpoints expose its control plane (policy + rollout mode) and product
// insights (decision explanation, egress risk, policy simulation, session
// timeline). All org-scoped; the PUT requires the `mcp:configure` action.

/** Rollout modes — mirrors store.ValidMCPRolloutModes / mcpguard.RolloutMode.
 *  observe (log only) → shadow (compute verdict, never block) →
 *  soft_enforce (block writes/egress only) → enforce (block everything). */
export type MCPRolloutMode = 'observe' | 'shadow' | 'soft_enforce' | 'enforce'

export const MCP_ROLLOUT_MODES: MCPRolloutMode[] = ['observe', 'shadow', 'soft_enforce', 'enforce']

export interface MCPPolicy {
  /** Present (false) only when no policy row exists yet. */
  configured?: boolean
  orgId?: string
  defaultMode: MCPRolloutMode
  /** Serialized internal/mcpguard.Policy; "{}" = engine defaults. */
  policyJson?: string
  updatedBy?: string
  createdAt?: string
  updatedAt?: string
}

export function getMcpPolicy(orgId: string): Promise<MCPPolicy> {
  return request<MCPPolicy>('GET', `/api/v1/code/orgs/${orgId}/mcp/policy`)
}

/** Save the org's default rollout mode (+ optional serialized policy). */
export function putMcpPolicy(
  orgId: string,
  body: { defaultMode: MCPRolloutMode; policy?: unknown },
): Promise<MCPPolicy> {
  return request<MCPPolicy>('PUT', `/api/v1/code/orgs/${orgId}/mcp/policy`, body)
}

export interface MCPFlip {
  eventId: string
  toolName: string
  verb: string
  wasBlocked: boolean
  nowBlocked: boolean
  verdict: string
  floorRule?: string
}

export interface MCPSimulateResponse {
  evaluated: number
  wouldBlock: number
  /** Proceeded at ingest, would block under the candidate policy. */
  newlyBlocked: number
  /** Blocked at ingest, would proceed under the candidate policy. */
  newlyAllowed: number
  byVerdict: Record<string, number>
  sampleFlips: MCPFlip[]
}

/** Replay recent events under a candidate policy — "can I safely enforce?". */
export function simulateMcpPolicy(
  orgId: string,
  body: { defaultMode: MCPRolloutMode; policy?: unknown; limit?: number },
): Promise<MCPSimulateResponse> {
  return request<MCPSimulateResponse>('POST', `/api/v1/code/orgs/${orgId}/mcp/policy/simulate`, body)
}

export interface MCPEgressRow {
  eventId: string
  toolName: string
  verb?: string
  dataClass: string
  targetTrust: string
  externalSideEffect: boolean
  effective?: string
  occurredAt: string
}

export interface MCPEgressResponse {
  total: number
  byDataClass: Record<string, number>
  byTargetTrust: Record<string, number>
  /** Egress the guardian actually blocked/held. */
  blocked: number
  rows: MCPEgressRow[]
}

export function getMcpEgress(orgId: string): Promise<MCPEgressResponse> {
  return request<MCPEgressResponse>('GET', `/api/v1/code/orgs/${orgId}/mcp/risk/egress`)
}

export interface MCPEvidenceSummary {
  totalEvents: number
  blockedOrHeld: number
  sensitiveEvents: number
  outboundSensitive: number
  stateChanging: number
  externalSideEffects: number
  tokenizationEligible: number
  identityAttributed: number
  appAttributed: number
  deviceAttributed: number
  byEffective: Record<string, number>
  byDataClass: Record<string, number>
  byAppCategory: Record<string, number>
}

export interface MCPEvidenceRow {
  eventId: string
  projectHash?: string
  sessionId?: string
  userId?: string
  agentId?: string
  deviceId?: string
  appName?: string
  appCategory?: string
  actionType?: string
  serverId?: string
  toolName: string
  verb: string
  dataClass?: string
  contentClass?: string
  dataDirection?: string
  targetTrust?: string
  environment?: string
  credentialScope?: string
  permissionScope?: string
  stateChange: boolean
  externalSideEffect: boolean
  requiresAuth: boolean
  hasInputDigest: boolean
  hasOutputDigest: boolean
  verdict?: string
  effective?: string
  rollout?: string
  transformSuggestion?: string
  occurredAt: string
}

export interface MCPEvidenceReport {
  generatedAt: string
  windowLimit: number
  summary: MCPEvidenceSummary
  rows: MCPEvidenceRow[]
  privacy: { persisted: string[]; neverPersisted: string[]; exportSafe: boolean }
}

export function getMcpEvidenceReport(orgId: string, limit = 500): Promise<MCPEvidenceReport> {
  return request<MCPEvidenceReport>('GET', `/api/v1/code/orgs/${orgId}/mcp/reports/evidence?limit=${limit}`)
}

export function mcpEvidenceReportUrl(orgId: string, format: 'csv' | 'json' = 'csv'): string {
  return `${BASE}/api/v1/code/orgs/${orgId}/mcp/reports/evidence?format=${format}`
}

export interface MCPDecisionExplanation {
  eventId: string
  /** Present when the event belongs to a session — lets the UI open its timeline. */
  sessionId?: string
  toolName: string
  verb: string
  targetTrust: string
  dataClass?: string
  dataDirection?: string
  stateChange: boolean
  externalSideEffect: boolean
  verdict: string
  effective: string
  rollout: string
  source: string
  floorRule?: string
  evidence?: string[]
  lenses?: Record<string, number>
  recordedAtIngest: { verdict: string; effective: string; rollout: string }
}

export function getMcpEventExplanation(orgId: string, eventId: string): Promise<MCPDecisionExplanation> {
  return request<MCPDecisionExplanation>(
    'GET', `/api/v1/code/orgs/${orgId}/mcp/events/${eventId}/explanation`,
  )
}

export interface MCPTimelineEntry {
  eventId: string
  toolName: string
  verb: string
  targetTrust: string
  dataDirection?: string
  stateChange: boolean
  externalSideEffect: boolean
  verdict?: string
  effective?: string
  occurredAt: string
}

export interface MCPSessionTimeline {
  sessionId: string
  agentId: string
  userId: string
  status: string
  calls: MCPTimelineEntry[]
}

export function getMcpSessionTimeline(orgId: string, sessionId: string): Promise<MCPSessionTimeline> {
  return request<MCPSessionTimeline>(
    'GET', `/api/v1/code/orgs/${orgId}/mcp/sessions/${sessionId}/timeline`,
  )
}
