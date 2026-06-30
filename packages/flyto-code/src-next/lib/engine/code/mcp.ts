import { BASE, request } from '../client'

// mcp.ts — MCP Guardian (PR#209) org-scoped read + policy control plane.
// Backend: api/handlers_mcp_overview.go + api/handlers_mcp_guardian.go.
//
//   GET /api/v1/code/orgs/{id}/mcp/overview — server/tool inventory + decisions
//   POST /api/v1/code/orgs/{id}/mcp/test-connection — dashboard-safe diagnostic probe
//   GET /api/v1/code/orgs/{id}/mcp/policy   — current guardian policy
//   PUT /api/v1/code/orgs/{id}/mcp/policy   — upsert policy (cap mcp:configure)
//
// Digest-only: the backend never surfaces raw payloads or secrets.
//
// DEPRECATED — this module is the earlier, settings-tab-scoped MCP client.
// The shipped dedicated MCP product page consumes the canonical client at
// `lib/engine/code/surfaces.ts` (getMcpOverview / putMcpPolicy / simulateMcpPolicy
// / getMcpEgress / getMcpEventExplanation / getMcpSessionTimeline + all types),
// which is the one re-exported from `lib/engine/index.ts`. This module is kept
// only because `components/compounds/settings/MCPGuardianTab.tsx` and the legacy
// `components/compounds/mcp/*` panels still import it directly. Consolidation
// onto surfaces.ts (and retiring the duplicate panels) is tracked as an FLYA
// follow-up — do NOT add `export * from './code/mcp'` to index.ts, it collides
// with surfaces.ts on MCPOverview/MCPServerRow/MCPRolloutMode/etc.

export interface MCPServerRow {
  id: string
  name: string
  transport: string
  deploymentKind: string
  status: string
  toolCount: number
  unclassifiedTools: number
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
  configured: boolean
  servers: MCPServerRow[]
  serverStatusCounts: Record<string, number>
  toolTotal: number
  unclassifiedTools: number
  recentDecisions: MCPDecisionRow[]
  decisionCounts: Record<string, number>
}

export function getMCPOverview(orgId: string): Promise<MCPOverview> {
  return request('GET', `/api/v1/code/orgs/${orgId}/mcp/overview`)
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

export function getMCPIngestEndpoint(_orgId?: string): string {
  return `${BASE}/api/v1/agent-firewall/ingest`
}

export function testMCPConnection(orgId: string): Promise<MCPTestConnectionResponse> {
  return request('POST', `/api/v1/code/orgs/${orgId}/mcp/test-connection`)
}

export type MCPRolloutMode = 'observe' | 'shadow' | 'soft_enforce' | 'enforce'

// Closed rollout-mode set, mirroring store.ValidMCPRolloutModes /
// mcpguard.RolloutMode (and surfaces.ts MCP_ROLLOUT_MODES) so this duplicate
// client cannot drift from the canonical one.
export const MCP_ROLLOUT_MODES: MCPRolloutMode[] = ['observe', 'shadow', 'soft_enforce', 'enforce']

// The policy GET returns either {configured:false, defaultMode} when none is
// stored, or the persisted store.MCPPolicy row. We model both with a permissive
// shape so the policy editor can render before a PUT.
//
// NOTE: the backend JSON tag is `policyJson` (store/models_mcpguard_policy.go
// `PolicyJSON string \`json:"policyJson"\``) — the previous `policyJSON` field
// here never matched the wire, so any consumer hydrating from it (e.g. the
// settings policy editor) silently never loaded the persisted raw policy.
// `policyJson` is now the real, wire-matching field. `policyJSON` is kept as a
// deprecated optional alias only so existing callers still typecheck; it is
// never populated by the backend — read `policyJson`.
export interface MCPPolicy {
  configured?: boolean
  orgId?: string
  defaultMode?: MCPRolloutMode | string
  /** Serialized internal/mcpguard.Policy ("{}" = engine defaults). Wire key. */
  policyJson?: string
  /** @deprecated never populated by the backend — use `policyJson`. */
  policyJSON?: string
  updatedBy?: string
  createdAt?: string
  updatedAt?: string
  [k: string]: unknown
}

export function getMCPPolicy(orgId: string): Promise<MCPPolicy> {
  return request('GET', `/api/v1/code/orgs/${orgId}/mcp/policy`)
}

export interface PutMCPPolicyReq {
  defaultMode: MCPRolloutMode
  policy?: unknown // serialized internal/mcpguard.Policy; optional
}

export function putMCPPolicy(orgId: string, req: PutMCPPolicyReq): Promise<MCPPolicy> {
  return request('PUT', `/api/v1/code/orgs/${orgId}/mcp/policy`, req)
}

// ── Egress risk (#41) ────────────────────────────────────────────────────────
// GET /api/v1/code/orgs/{id}/mcp/risk/egress — the "what sensitive data left the
// building" view: outbound calls carrying secret/credential/pii/customer/source
// data. Digest-only (handlers_mcp_egress.go).

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

export interface MCPEgressRisk {
  total: number
  byDataClass: Record<string, number>
  byTargetTrust: Record<string, number>
  blocked: number
  rows: MCPEgressRow[]
}

export function getMCPEgressRisk(orgId: string): Promise<MCPEgressRisk> {
  return request('GET', `/api/v1/code/orgs/${orgId}/mcp/risk/egress`)
}

// ── Event explanation (#41) ──────────────────────────────────────────────────
// GET /api/v1/code/orgs/{id}/mcp/events/{eventId}/explanation — replays the
// decision engine over a stored event under the org's current policy, exposing
// the floor rule / evidence / lens scores: "why was this allowed/blocked".
// handlers_mcp_insights.go (handleMCPEventExplanation).

export interface MCPRecordedVerdict {
  verdict: string
  effective: string
  rollout: string
}

export interface MCPEventExplanation {
  eventId: string
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
  recordedAtIngest: MCPRecordedVerdict
}

export function getMCPEventExplanation(orgId: string, eventId: string): Promise<MCPEventExplanation> {
  return request('GET', `/api/v1/code/orgs/${orgId}/mcp/events/${eventId}/explanation`)
}

// ── Policy simulate (#41) ────────────────────────────────────────────────────
// POST /api/v1/code/orgs/{id}/mcp/policy/simulate — replays a CANDIDATE policy
// over recent stored events and reports what would change vs what was recorded
// at ingest: the "is it safe to move to enforce" planning tool. Persists nothing.
// handlers_mcp_insights.go (handleMCPPolicySimulate).

export interface MCPSimulateReq {
  defaultMode?: MCPRolloutMode | string
  policy?: unknown // serialized internal/mcpguard.Policy; optional
  limit?: number
}

export interface MCPPolicyFlip {
  eventId: string
  toolName: string
  verb: string
  wasBlocked: boolean
  nowBlocked: boolean
  verdict: string
  floorRule?: string
}

export interface MCPSimulateResult {
  evaluated: number
  wouldBlock: number
  newlyBlocked: number
  newlyAllowed: number
  byVerdict: Record<string, number>
  sampleFlips: MCPPolicyFlip[]
}

/** Name alias matching surfaces.ts `MCPSimulateResponse` to keep the two MCP
 *  clients nominally aligned. Identical shape to {@link MCPSimulateResult}. */
export type MCPSimulateResponse = MCPSimulateResult

export function simulateMCPPolicy(orgId: string, req: MCPSimulateReq): Promise<MCPSimulateResult> {
  return request('POST', `/api/v1/code/orgs/${orgId}/mcp/policy/simulate`, req)
}

// ── Session timeline (#41) ───────────────────────────────────────────────────
// GET /api/v1/code/orgs/{id}/mcp/sessions/{sessionId}/timeline — the ordered
// call sequence + guardian decisions for one agent session.
// handlers_mcp_insights.go (handleMCPSessionTimeline).

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

export function getMCPSessionTimeline(orgId: string, sessionId: string): Promise<MCPSessionTimeline> {
  return request('GET', `/api/v1/code/orgs/${orgId}/mcp/sessions/${sessionId}/timeline`)
}
