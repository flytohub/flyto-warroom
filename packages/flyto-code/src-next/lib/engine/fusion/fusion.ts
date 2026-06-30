/**
 * Evidence Fusion (CAASM) client — the multi-source fused-posture surface.
 *
 * Wires the flyto-engine fusion endpoints that previously had ZERO frontend
 * callers, so the platform's headline multi-source rollup, its source-health
 * control plane, and the human-in-the-loop reconciliation queue are reachable
 * from the UI.
 *
 * Imported by DIRECT FILE PATH (decoupling rule — NOT re-exported from
 * lib/engine/index.ts). Response shapes mirror the Go structs in
 *   flyto-engine/internal/fusion/{summary,posture,coverage,independence,
 *     corroboration,resolve}.go
 *   flyto-engine/internal/store/{org_integrations,reconciliation_findings}.go
 *   flyto-engine/internal/importmap/drift.go
 * Every field is the JSON tag the engine emits.
 */

import { request } from '../client'

// ── Shared fusion sub-models ────────────────────────────────────────────────

/** Org/entity-level coverage rollup. DebtPercent = share of cells NOT present. */
export interface CoverageDebt {
  totalCells: number
  presentCells: number
  staleCells: number
  errorCells: number
  emptyCells: number
  notCollectedCells: number
  notApplicableCells: number
  debtPercent: number
}

/** Vendor-concentration / independence over the present claims. */
export interface Independence {
  providerCount: number
  dominantProvider: string
  dominantSharePercent: number
  independencePercent: number
  fieldCount: number
  singleSourceFields: string[] | null
}

/** Certified-external-agrees-with-native corroboration rollup. */
export interface Corroboration {
  certifiedSourceCount: number
  corroboratingFields: number
  independentAgreements: number
}

/** Source-health control-plane counts for an org. */
export interface SourceHealthCounts {
  total: number
  healthy: number
  degraded: number
  down: number
  unknown: number
  stale: number
}

// ── GET /fusion/summary ─────────────────────────────────────────────────────

/** Org-level fused posture — the CISO rollup across every integrated source. */
export interface OrgFusionSummary {
  entities: number
  claims: number
  openDisagreements: number
  disagreementsBySeverity: Record<string, number> | null
  coverage: CoverageDebt
  independence: Independence
  corroboration: Corroboration
  sourceHealth: SourceHealthCounts
  truncated: boolean
}

export function getOrgFusionSummary(orgId: string): Promise<OrgFusionSummary> {
  return request('GET', `/api/v1/code/orgs/${orgId}/fusion/summary`)
}

// ── GET /fusion/unified-posture ─────────────────────────────────────────────

/** The existing engine org_score row (shape is engine-internal + may be null
 *  until the first scan computes one). Kept opaque-but-indexable on purpose:
 *  the fusion UI only reads a handful of common fields and never depends on
 *  the scoring engine's exact schema. */
export interface UnifiedPostureScore {
  overall?: number
  grade?: string
  scoreType?: string
  computedAt?: string
  [k: string]: unknown
}

/** Unified posture — the engine score with its fusion qualifiers attached in a
 *  single read, so a score never travels naked (engine invariant #6). */
export interface UnifiedPosture {
  scoreType: string
  score: UnifiedPostureScore | null
  fusion: OrgFusionSummary
}

export function getUnifiedPosture(
  orgId: string,
  scoreType = 'overall',
): Promise<UnifiedPosture> {
  const q = scoreType ? `?scoreType=${encodeURIComponent(scoreType)}` : ''
  return request('GET', `/api/v1/code/orgs/${orgId}/fusion/unified-posture${q}`)
}

// ── Integrations (fusion connectors) ────────────────────────────────────────

/** One wired fusion data source + its source-health status. */
export interface FusionIntegration {
  integrationId: string
  orgId: string
  providerId: string
  mappingId: string
  alias: string
  credentialRef: string
  sourceSystemType: string
  trustTier: string
  enabled: boolean
  status: string
  lastSuccessAt?: string
  lastAttemptAt?: string
  lastErrorClass?: string
  recordsIngested: number
  claimsWritten: number
  driftFieldsMissing: number
  driftSeverityFallback: number
  driftKeyMissing: number
  freshnessSlaHours: number
  createdAt: string
  updatedAt: string
}

export interface ListIntegrationsResponse {
  integrations: FusionIntegration[] | null
}

/** GET /fusion/integrations — every wired source + its status. Optional status
 *  filter (e.g. "degraded") narrows the list. */
export function listFusionIntegrations(
  orgId: string,
  status?: string,
): Promise<ListIntegrationsResponse> {
  const q = status ? `?status=${encodeURIComponent(status)}` : ''
  return request('GET', `/api/v1/code/orgs/${orgId}/fusion/integrations${q}`)
}

/** Body for POST /fusion/integrations. trustTier is intentionally NOT sent —
 *  the engine derives the displayed tier from the resolved mapping so a source
 *  can never out-claim its mapping. */
export interface UpsertIntegrationRequest {
  integrationId: string
  providerId: string
  mappingId: string
  alias?: string
  credentialRef?: string
  sourceSystemType?: string
  enabled: boolean
  freshnessSlaHours?: number
}

/** POST /fusion/integrations — create/upsert a fusion connector. Returns the
 *  stored OrgIntegration (with the engine-resolved trustTier). */
export function upsertFusionIntegration(
  orgId: string,
  body: UpsertIntegrationRequest,
): Promise<FusionIntegration> {
  return request('POST', `/api/v1/code/orgs/${orgId}/fusion/integrations`, body)
}

// ── Endpoint probe (EF-20) — test-call → return the observed API shape ───────

/** One observed leaf path in the probed JSON response. */
export interface ProbeFieldInfo {
  path: string   // e.g. "$.findings[*].severity"
  type: string   // string | number | bool | null
  sample: string // short example value
}

/** Response of POST /fusion/probe — the live test-call result. */
export interface ProbeResult {
  status: number              // upstream HTTP status
  fields: ProbeFieldInfo[] | null
  sampleRaw: string           // truncated raw body (≤4096 chars)
}

export interface ProbeRequest {
  url: string
  method?: string       // GET (default) | HEAD — engine forbids side-effecting verbs
  token?: string        // inline only — never sealed (anti-exfiltration)
  tokenHeader?: string  // header name for the token (default Authorization: Bearer)
}

/** POST /fusion/probe — SSRF-hardened live test-call against the operator's
 *  endpoint. Returns the observed field paths + a sample so the source can be
 *  mapped. The token is sent inline ONLY and is never persisted by this call. */
export function probeFusionEndpoint(
  orgId: string,
  body: ProbeRequest,
): Promise<ProbeResult> {
  return request('POST', `/api/v1/code/orgs/${orgId}/fusion/probe`, body)
}

// ── Custom (org-scoped) mappings (EF-11) ─────────────────────────────────────

/** A stored org-authored mapping. */
export interface OrgCustomMapping {
  mappingId: string
  orgId: string
  providerId: string
  sourceSystemType: string
  yamlBody: string
  schemaHash: string
  enabled: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface ListCustomMappingsResponse {
  mappings: OrgCustomMapping[] | null
}

/** GET /fusion/mappings — this org's custom mappings. */
export function listCustomMappings(
  orgId: string,
): Promise<ListCustomMappingsResponse> {
  return request('GET', `/api/v1/code/orgs/${orgId}/fusion/mappings`)
}

export interface UpsertCustomMappingRequest {
  /** "<provider>.v<version>" — must equal the YAML's provider+version. */
  mappingId: string
  /** "custom:<orgId>:<name>" — must equal the YAML's `provider`. */
  providerId: string
  sourceSystemType: string
  yaml: string
  enabled: boolean
}

/** POST /fusion/mappings — store a customer-authored mapping (strictly
 *  validated server-side; trust is forced to org_custom). */
export function upsertCustomMapping(
  orgId: string,
  body: UpsertCustomMappingRequest,
): Promise<OrgCustomMapping> {
  return request('POST', `/api/v1/code/orgs/${orgId}/fusion/mappings`, body)
}

/** One previewed claim from a dry-run (resource_id not yet assigned). */
export interface MappingClaimDraft {
  Category: string
  Type: string
  CanonicalKey: string
  DisplayValue: string
  Field: string
  Value: string
  ValueKind: string
  Confidence: number
  CoverageState: string
  ObservedAt: string
}

export interface MappingDriftReport {
  recordsMatched: number
  claimsEmitted: number
  expectedFieldsMissing?: string[]
  severityFallbackUsed: number
  canonicalKeyMissing: number
}

export interface DryRunResult {
  drafts: MappingClaimDraft[] | null
  drift: MappingDriftReport
}

export interface DryRunRequest {
  yaml: string
  /** A sample vendor payload (raw JSON) the mapping is previewed against. */
  samplePayload: unknown
}

/** POST /fusion/mappings/dry-run — preview what a candidate mapping WOULD
 *  produce from a sample payload. Writes nothing; the honest gate before
 *  enabling a custom source. */
export function dryRunCustomMapping(
  orgId: string,
  body: DryRunRequest,
): Promise<DryRunResult> {
  return request('POST', `/api/v1/code/orgs/${orgId}/fusion/mappings/dry-run`, body)
}

// ── Org-level module policy (source routing / allowed_sources gate) ──────────

/** One source in an org-module allowlist (read shape). */
export interface ModuleSourceRef {
  sourceKind: 'flyto' | 'integration' | string
  integrationId?: string
}

/** Org-wide policy for one capability module. `allowedSources` empty/absent =
 *  "any source ok" (plain on/off); a non-empty list restricts which sources may
 *  feed the module across the org — e.g. [integration:tenable] suppresses
 *  Flyto's own scan so only the BYO source counts. */
export interface OrgModule {
  id?: string
  orgId?: string
  module: string
  enabled: boolean
  allowedSources?: ModuleSourceRef[] | null
  createdAt?: string
  updatedAt?: string
}

export interface ListOrgModulesResponse {
  modules: OrgModule[] | null
}

/** GET /fusion/modules — the org-wide module policy. */
export function listOrgModules(orgId: string): Promise<ListOrgModulesResponse> {
  return request('GET', `/api/v1/code/orgs/${orgId}/fusion/modules`)
}

/** Write shape — note the engine takes `kind` (not `sourceKind`) on input. */
export interface PutOrgModuleInput {
  module: string
  enabled: boolean
  allowedSources?: { kind: 'flyto' | 'integration' | string; integrationId?: string }[]
}

export interface PutOrgModulesRequest {
  modules: PutOrgModuleInput[]
}

/** PUT /fusion/modules — upsert the org-wide module policy + source allowlist. */
export function putOrgModules(
  orgId: string,
  body: PutOrgModulesRequest,
): Promise<ListOrgModulesResponse> {
  return request('PUT', `/api/v1/code/orgs/${orgId}/fusion/modules`, body)
}

// ── BYO credential sealing (EF-18) ───────────────────────────────────────────

export interface SealCredentialRequest {
  plaintext: string
  label?: string
}

/** POST /fusion/integrations/{id}/credential — seal a vendor API token into the
 *  KMS-backed credential store. The plaintext is never persisted in the clear;
 *  the integration keeps only an opaque credentialRef. */
export function sealIntegrationCredential(
  orgId: string,
  integrationId: string,
  body: SealCredentialRequest,
): Promise<{ credentialRef: string } | Record<string, unknown>> {
  return request(
    'POST',
    `/api/v1/code/orgs/${orgId}/fusion/integrations/${encodeURIComponent(integrationId)}/credential`,
    body,
  )
}

export interface FusionPollRunbookOperation {
  id: string
  method?: 'GET'
  urlTemplate: string
  authHeader?: string
  authPrefix?: string
  pageKind?: 'none' | 'offset' | 'cursor' | string
  pageParam?: string
  pageSize?: number
  cursorPath?: string
  forEach?: string
  collect?: Record<string, string>
  condition?: { var: string; exists?: boolean; equals?: string; notEquals?: string }
  ingest?: boolean
}

export interface FusionPollRunbook {
  version: number
  operations: FusionPollRunbookOperation[]
}

export interface FusionPollConfig {
  integrationId: string
  orgId: string
  enabled: boolean
  url?: string
  authHeader?: string
  authPrefix?: string
  pageKind?: 'none' | 'offset' | 'cursor' | string
  pageParam?: string
  pageSize?: number
  cursorPath?: string
  runbookJson?: string
  variablesJson?: string
}

export interface PutFusionPollConfigRequest {
  enabled: boolean
  url?: string
  endpointUrl?: string
  method?: 'GET'
  authHeader?: string
  authPrefix?: string
  pageKind?: 'none' | 'offset' | 'cursor' | string
  pageParam?: string
  pageSize?: number
  cursorPath?: string
  runbook?: FusionPollRunbook
  runbookJson?: string
  variables?: Record<string, string>
  variablesJson?: string
}

export function putFusionPollConfig(
  orgId: string,
  integrationId: string,
  body: PutFusionPollConfigRequest,
): Promise<FusionPollConfig> {
  return request(
    'PUT',
    `/api/v1/code/orgs/${orgId}/fusion/integrations/${encodeURIComponent(integrationId)}/poll-config`,
    body,
  )
}

export function getFusionPollConfig(
  orgId: string,
  integrationId: string,
): Promise<FusionPollConfig | { configured: false }> {
  return request(
    'GET',
    `/api/v1/code/orgs/${orgId}/fusion/integrations/${encodeURIComponent(integrationId)}/poll-config`,
  )
}

/** Mapping-drift verdict for one integration. */
export type MappingDriftLevel = 'ok' | 'warn' | 'drift' | string
export interface MappingDriftAssessment {
  level: MappingDriftLevel
  reasons: string[] | null
  fieldsMissing: number
  severityFallback: number
  keyMissing: number
  recordsIngested: number
}

export interface IntegrationHealthResponse {
  integration: FusionIntegration
  drift: MappingDriftAssessment
}

/** GET /fusion/integrations/{integrationId}/health — per-connector status +
 *  explainable mapping-drift assessment. */
export function getFusionIntegrationHealth(
  orgId: string,
  integrationId: string,
): Promise<IntegrationHealthResponse> {
  return request(
    'GET',
    `/api/v1/code/orgs/${orgId}/fusion/integrations/${encodeURIComponent(integrationId)}/health`,
  )
}

// ── GET /fusion/resources/{resourceId}/posture ──────────────────────────────

/** One source's contribution to a resolved field. */
export interface FusionContributor {
  sourceProviderId: string
  sourceIntegrationId: string
  sourceLabel: string
  value: string
  confidence: number
  trustTier: string
  coverageState: string
  observedAt: string
  selected: boolean
}

/** The single explainable answer for one field across sources. */
export interface FusionResolved {
  field: string
  valueKind: string
  value: string
  policy: unknown
  confidence: number
  coverageState: string
  diverged: boolean
  divergentValues?: string[]
  contributors: FusionContributor[] | null
  winningTrustTier?: string
  presentSourceCount: number
}

export interface FieldResolution {
  field: string
  resolved: FusionResolved
}

export interface CoverageCell {
  integrationId: string
  providerId: string
  state: string
}
export interface FieldCoverage {
  field: string
  cells: CoverageCell[] | null
  presentCount: number
  bestState: string
}

/** The always-attached confidence/coverage/caveats context. */
export interface EvidenceEnvelope {
  coveragePercent: number
  confidence: string
  confidenceScore: number
  dominantProvider: string
  independencePercent: number
  openDisagreements: number
  provenance: string[] | null
  caveats: string[] | null
}

/** Per-resource fused evidence view across every source. */
export interface ResourcePosture {
  resourceId: string
  resolutions: FieldResolution[] | null
  coverage: FieldCoverage[] | null
  debt: CoverageDebt
  independence: Independence
  disagreements: ReconciliationFinding[] | null
  envelope: EvidenceEnvelope
}

export function getResourcePosture(
  orgId: string,
  resourceId: string,
): Promise<ResourcePosture> {
  return request(
    'GET',
    `/api/v1/code/orgs/${orgId}/fusion/resources/${encodeURIComponent(resourceId)}/posture`,
  )
}

// ── Reconciliations (cross-source disagreement queue) ───────────────────────

export type ReconStatus =
  | 'open'
  | 'acknowledged'
  | 'resolved'
  | 'suppressed'

/** One cross-source disagreement / dedupe candidate. */
export interface ReconciliationFinding {
  id: string
  orgId: string
  resourceId: string
  field: string
  severity: string
  status: ReconStatus | string
  confidence: number
  summary: string
  divergentValues: string
  contributors: string
  resolutionNote?: string
  suppressedReason?: string
  firstSeenAt: string
  lastSeenAt: string
  createdAt: string
  updatedAt: string
}

export interface ListReconciliationsResponse {
  reconciliations: ReconciliationFinding[] | null
}

export interface ListReconciliationsParams {
  status?: string
  resourceId?: string
  severity?: string
}

/** GET /fusion/reconciliations — the cross-source disagreement triage queue. */
export function listReconciliations(
  orgId: string,
  params?: ListReconciliationsParams,
): Promise<ListReconciliationsResponse> {
  const sp = new URLSearchParams()
  if (params?.status) sp.set('status', params.status)
  if (params?.resourceId) sp.set('resourceId', params.resourceId)
  if (params?.severity) sp.set('severity', params.severity)
  const q = sp.toString()
  return request(
    'GET',
    `/api/v1/code/orgs/${orgId}/fusion/reconciliations${q ? `?${q}` : ''}`,
  )
}

export interface PatchReconciliationRequest {
  status: ReconStatus | string
  note?: string
}

/** PATCH /fusion/reconciliations/{reconId} — resolve/acknowledge/suppress one
 *  disagreement. Engine returns { ok: true }. */
export function patchReconciliation(
  orgId: string,
  reconId: string,
  body: PatchReconciliationRequest,
): Promise<{ ok: boolean }> {
  return request(
    'PATCH',
    `/api/v1/code/orgs/${orgId}/fusion/reconciliations/${encodeURIComponent(reconId)}`,
    body,
  )
}
