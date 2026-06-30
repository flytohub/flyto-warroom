import { request } from '../client'

// ctem.ts — TypeScript client for the CTEM prioritization endpoints
// landed in flyto-engine 2026-05-17. Mirrors the Go side
// (`api/handlers_ctem.go`) — keep the shapes 1:1 so a backend rename
// shows up in the type-checker rather than as a silent JSON mismatch.

// ── Priority list ────────────────────────────────────────────────

export type AssetTier = 'crown_jewel' | 'customer_facing' | 'internal' | 'sandbox'

export type VerificationState =
  | 'unverified'
  | 'pending_verify'
  | 'verified_fixed'
  | 'reopened'
  | 'false_positive'

export type VerificationMethod =
  | 'passive'
  | 'active_verified'
  | 'authenticated_verified'
  | 'manual_confirmed'

export interface ImpactEstimate {
  low_usd: number
  mid_usd: number
  high_usd: number
  confidence: 'low' | 'medium' | 'high'
  label: string          // "Potential financial exposure"
  methodology: string
  input_summary: string[]
  benchmark_source: string
}

export interface CTEMPriorityItem {
  kind: 'external' | 'code'
  id: string
  fingerprint: string
  title: string
  description: string
  severity: string
  effective_severity: string
  priority_score: number
  category: string
  domain?: string
  repo_id?: string
  asset_tier: AssetTier
  kev_listed: boolean
  epss_score: number
  mitigation_factor: number
  sla_hours: number
  sla_breach_at?: string // RFC3339
  breached: boolean
  assigned_to?: string
  verification_state: VerificationState
  first_seen_at: string
  // verification_method (added 2026-05-18 migration 018) —
  // distinguishes passive observation from actively-verified findings.
  // UI badges this as 4-tier trust ladder.
  verification_method?: VerificationMethod
  // impact (added 2026-05-18) — monetary impact range from
  // internal/impact. Honesty wording: range + confidence band,
  // never a single dollar value.
  impact?: ImpactEstimate
  // Operator action timestamps (populated only after mark-fixed —
  // empty for never-claimed findings).
  marked_fixed_at?: string
  marked_fixed_by?: string
  // Threat-intel attribution (external findings only — populated by
  // the threatfeed correlator when the domain has a C2 / malware hit).
  threat_actor?: string
  threat_campaign?: string
  // Step-by-step remediation guide (external findings only).
  // recommendation is the one-liner; fix_steps is the numbered list.
  // Empty for code findings — those live in the repo view.
  recommendation?: string
  fix_steps?: string[]
  /**
   * Per-component decomposition of priority_score, computed
   * server-side by internal/ctem.BuildPriorityBreakdown. Audit
   * B5: PriorityBreakdownBar should read this verbatim instead
   * of re-running the criticalityMultiplier ladder + guessing
   * the dominant exploit signal locally.
   *
   * Optional because the legacy build path (and any pre-migration
   * cached row) won't carry it; consumers must guard on
   * `priority_breakdown != null` before using the components.
   * Callsite migration (delete tierMul / exploitSignal client
   * compute) waits until staging has verified the field actually
   * lands on every row. Codex boundary 2026-05-24.
   *
   * Visual contract:
   *   base_severity_weight
   * + tier_contribution           (positive when tier > 1, negative when < 1)
   * + exploit_contribution        (always ≥ 0)
   * + mitigation_contribution     (always ≤ 0)
   * ≈ priority_score (subject to 0-100 clamp + per-component rounding)
   */
  priority_breakdown?: PriorityBreakdown
  /**
   * Number of duplicate findings that collapsed into this row
   * when the request asked for `?dedup=true`. Absent on
   * non-deduped responses (backward-compat); >= 2 means the
   * picker should render a "×N affected" chip. Audit B9.
   *
   * The dedup signature is `kind | toLowerTrim(title || description)`,
   * matching what `CTEMActionsView.benchItems` computed client-side
   * before the migration. Inside each group the surviving row is
   * the one with the highest `priority_score` (older `first_seen_at`
   * wins ties).
   */
  affected_count?: number
}

/** Per-component decomposition of priority_score. See
 *  CTEMPriorityItem.priority_breakdown for the visual contract.
 *
 *  Sum identity (modulo per-component int rounding):
 *    base + tier_contribution + exploit_contribution
 *      + mitigation_contribution + clamp_contribution
 *    === priority_score
 *
 *  clamp_contribution captures the 0-100 cap on priority_score so
 *  the additive sum never over-shoots the final score (a high
 *  finding like critical+crown_jewel+KEV pre-clamps at 135 but
 *  final is 100 → clamp_contribution = -35). Frontend renders
 *  this segment as a visual cap so the bar doesn't draw past 100%.
 */
export interface PriorityBreakdown {
  base_severity_weight: number       // 60 critical / 40 high / 20 medium / 5 low
  tier_multiplier: number            // 1.5 / 1.2 / 1.0 / 0.5
  tier_contribution: number          // base * (tier - 1)
  exploit_multiplier: number         // 1.0 = no signal
  exploit_signal: 'kev' | 'epss-high' | 'epss-low' | 'category' | 'none'
  exploit_contribution: number       // base * tier * (exploit - 1)
  mitigation_factor: number          // 0..0.85 (capped)
  mitigation_contribution: number    // -base * tier * exploit * mit
  clamp_contribution: number         // captures the 0-100 cap (≤ 0 when high score saturated)
}

export interface CTEMPriorityResponse {
  org_id: string
  count: number
  items: CTEMPriorityItem[]
  /** Echo of the canonical sort key the server applied. Always
   *  populated — empty / unknown `?sort=` values resolve to
   *  "priority" server-side, so the echo carries one of the five
   *  canonical keys verbatim. Frontend uses this to render the
   *  active selector chip without re-parsing the query string.
   *  Audit B8. */
  sort?: CTEMSortKey
  /** Echo of whether `?dedup=true` was honoured. Always present
   *  on the wire (backend emits `false` explicitly when dedup was
   *  not requested, not `undefined`) so callers can switch on the
   *  boolean directly without an existence check. Render the
   *  "×N affected" chip when this is true AND `affected_count >= 2`.
   *  Audit B9. */
  deduped: boolean
}

/** Canonical sort keys supported by /ctem/priorities. The
 *  server-side ladder for each is in flyto-engine handlers_ctem.go
 *  (`sortCTEMPriorities`). Once `CTEMActionsView` switches to
 *  passing `?sort=` and reading the response in order, its local
 *  `sortBy` can be deleted (audit B8, Codex boundary). */
export type CTEMSortKey = 'priority' | 'sla' | 'severity' | 'first_seen' | 'recent_fix'

export interface GetCTEMPrioritiesOptions {
  /** Per-team scope filter — empty / undefined = all BUs. */
  businessUnitId?: string
  /** Canonical sort key. Empty / undefined = server default ("priority"). */
  sort?: CTEMSortKey
  /**
   * Opt-in server-side dedup (audit B9). When true, response items
   * are collapsed by `(kind, title)` and each survivor carries
   * `affected_count`. Default false keeps the wire shape
   * backward-compatible for pre-B9 callers.
   */
  dedup?: boolean
}

export function getCTEMPriorities(
  orgId: string,
  opts: GetCTEMPrioritiesOptions | string = {},
): Promise<CTEMPriorityResponse> {
  // Back-compat: callers passing a bare businessUnitId string still
  // work. New callers should pass an opts object so they can also
  // request a server-side sort + dedup. Drop the legacy form after
  // the CTEMActionsView migration removes the only positional callsite.
  const options: GetCTEMPrioritiesOptions =
    typeof opts === 'string' ? { businessUnitId: opts } : opts
  const params = new URLSearchParams()
  if (options.businessUnitId) params.set('business_unit_id', options.businessUnitId)
  if (options.sort) params.set('sort', options.sort)
  if (options.dedup) params.set('dedup', 'true')
  const qs = params.toString()
  return request('GET',
    `/api/v1/code/orgs/${orgId}/ctem/priorities${qs ? `?${qs}` : ''}`)
}

// ── Verification lifecycle ───────────────────────────────────────

export interface MarkFixedReq {
  fingerprint: string
  note?: string
}

export function markExternalIssueFixed(
  orgId: string,
  req: MarkFixedReq,
): Promise<{ verification_state: VerificationState }> {
  return request('POST', `/api/v1/code/orgs/${orgId}/ctem/issues/mark-fixed`, req)
}

export function assignExternalIssue(
  orgId: string,
  fingerprint: string,
  assignee: string,
): Promise<{ assigned_to: string }> {
  return request('POST', `/api/v1/code/orgs/${orgId}/ctem/issues/assign`, {
    fingerprint,
    assignee,
  })
}

// Code-finding counterparts — write through issue_status (the real
// per-fingerprint state store for code findings). Same wire shape
// as external; different table. See backend handlers_ctem.go.
export function markCodeIssueFixed(
  orgId: string,
  fingerprint: string,
): Promise<{ verification_state: VerificationState }> {
  return request('POST', `/api/v1/code/orgs/${orgId}/ctem/code-issues/mark-fixed`, { fingerprint })
}

export function verifyCodeIssue(
  orgId: string,
  fingerprint: string,
  action: VerifyAction,
  scanId?: string,
): Promise<{ verification_state: VerificationState }> {
  return request('POST', `/api/v1/code/orgs/${orgId}/ctem/code-issues/verify`, {
    fingerprint,
    action,
    scan_id: scanId,
  })
}

export type VerifyAction =
  | 'mark_fixed'
  | 'confirm'
  | 'reopen'
  | 'timeout'
  | 'false_positive'

export function verifyExternalIssue(
  orgId: string,
  fingerprint: string,
  action: VerifyAction,
  scanId?: string,
): Promise<{ verification_state: VerificationState }> {
  return request('POST', `/api/v1/code/orgs/${orgId}/ctem/issues/verify`, {
    fingerprint,
    action,
    scan_id: scanId,
  })
}

// ── Asset tier ───────────────────────────────────────────────────

export function setRepoTier(
  orgId: string,
  repoId: string,
  tier: AssetTier,
): Promise<{ asset_tier: AssetTier }> {
  return request('PATCH', `/api/v1/code/orgs/${orgId}/repos/${repoId}/tier`, { tier })
}

export function setAssetTier(
  orgId: string,
  assetId: string,
  tier: AssetTier,
): Promise<{ asset_tier: AssetTier }> {
  return request('PATCH', `/api/v1/code/orgs/${orgId}/assets/${assetId}/tier`, { tier })
}

// ── Compliance scope ─────────────────────────────────────────────

export type ComplianceScopeTag = 'pii' | 'pci' | 'hipaa' | 'sox' | 'gdpr' | 'regulated' | string

/** Canonical scope catalog the multi-select renders. Free-form
 *  tags are still accepted by the backend (capped at 8 per asset)
 *  for org-specific compliance regimes. */
export const COMPLIANCE_SCOPE_OPTIONS: { value: ComplianceScopeTag; label: string; tone: 'critical' | 'warning' | 'brand' }[] = [
  { value: 'pii',       label: 'PII',        tone: 'critical' },
  { value: 'pci',       label: 'PCI DSS',    tone: 'critical' },
  { value: 'hipaa',     label: 'HIPAA',      tone: 'critical' },
  { value: 'sox',       label: 'SOX',        tone: 'warning'  },
  { value: 'gdpr',      label: 'GDPR',       tone: 'warning'  },
  { value: 'regulated', label: 'Regulated',  tone: 'brand'    },
]

export function setRepoComplianceScope(
  orgId: string,
  repoId: string,
  scopes: ComplianceScopeTag[],
): Promise<{ compliance_scope: ComplianceScopeTag[] }> {
  return request('PATCH', `/api/v1/code/orgs/${orgId}/repos/${repoId}/compliance-scope`, { scopes })
}

export function setAssetComplianceScope(
  orgId: string,
  assetId: string,
  scopes: ComplianceScopeTag[],
): Promise<{ compliance_scope: ComplianceScopeTag[] }> {
  return request('PATCH', `/api/v1/code/orgs/${orgId}/assets/${assetId}/compliance-scope`, { scopes })
}

// ── Attack-path status override ──────────────────────────────────

export type AttackPathStatus = 'open' | 'mitigated' | 'resolved'

export function setAttackPathStatus(
  orgId: string,
  pathId: string,
  status: AttackPathStatus,
  note?: string,
): Promise<{ id: string; status: AttackPathStatus }> {
  // Backend renamed CTEM persisted attack-paths route to /ctem-paths
  // (engine f54ade6) to avoid collision with the new convergence-layer
  // `GET /attack-paths` that returns Top-N Initial Access Candidates.
  // The CTEM feature here is the state-tracked operator-managed chain;
  // it's a different surface and uses the renamed route.
  return request('PATCH', `/api/v1/code/orgs/${orgId}/ctem-paths/${pathId}/status`, { status, note })
}

// ── Bulk operations (frontend helpers — backend takes single ids) ─

/** Fan-out helper: bulk Mark Fixed via N parallel single-finding
 *  requests. The backend doesn't expose a bulk endpoint because
 *  the verification lifecycle is per-fingerprint anyway; the UI
 *  just needs a fan-out wrapper to keep its checkbox UX. */
export async function bulkMarkExternalFixed(
  orgId: string,
  fingerprints: string[],
): Promise<{ succeeded: string[]; failed: { fingerprint: string; error: string }[] }> {
  const results = await Promise.allSettled(
    fingerprints.map(fp => markExternalIssueFixed(orgId, { fingerprint: fp })),
  )
  const succeeded: string[] = []
  const failed: { fingerprint: string; error: string }[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') succeeded.push(fingerprints[i])
    else failed.push({ fingerprint: fingerprints[i], error: String(r.reason) })
  })
  return { succeeded, failed }
}

export async function bulkAssignExternal(
  orgId: string,
  fingerprints: string[],
  assignee: string,
): Promise<{ succeeded: string[]; failed: { fingerprint: string; error: string }[] }> {
  const results = await Promise.allSettled(
    fingerprints.map(fp => assignExternalIssue(orgId, fp, assignee)),
  )
  const succeeded: string[] = []
  const failed: { fingerprint: string; error: string }[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') succeeded.push(fingerprints[i])
    else failed.push({ fingerprint: fingerprints[i], error: String(r.reason) })
  })
  return { succeeded, failed }
}

// ── Mitigations catalog ──────────────────────────────────────────

export type MitigationControlType =
  | 'waf'
  | 'edr'
  | 'patch'
  | 'segmentation'
  | 'manual'
  | 'scan'

export interface Mitigation {
  id: string
  org_id: string
  control_type: MitigationControlType
  name: string
  description?: string
  applies_to_tag: string
  severity_reduction: number // 0-1
  effective_from?: string
  effective_until?: string
  verified_at?: string
  verification_evidence?: string
  verified_by?: string
  created_by?: string
  created_at: string
  updated_at: string
  // Evidence layer (added 2026-05-17, backend mitigation_evidence
  // table + http_probe loop). The priority engine treats a
  // mitigation as aspirational (no reduction) until the most-recent
  // evidence row passes within 30 days; the ledger lets the UI show
  // operators which controls are genuinely active vs claimed-only.
  latest_evidence?: MitigationEvidenceRow
  freshness_factor?: number   // 0..1; what the priority engine actually applies
  evidence_tier?: EvidenceTier
}

export type EvidenceTier = 'verified' | 'fading' | 'stale' | 'aspirational'

export interface MitigationEvidenceRow {
  id: string
  org_id: string
  mitigation_id: string
  source: string  // 'http_probe' | 'discovery_reverify' | 'operator'
  outcome: 'pass' | 'fail' | 'inconclusive'
  details?: string
  raw_response_json?: string
  checked_at: string
}

export interface ListMitigationEvidenceResponse {
  org_id: string
  mitigation_id: string
  count: number
  items: MitigationEvidenceRow[]
}

export function listMitigationEvidence(
  orgId: string,
  mitId: string,
  limit = 50,
): Promise<ListMitigationEvidenceResponse> {
  return request(
    'GET',
    `/api/v1/code/orgs/${orgId}/mitigations/${mitId}/evidence?limit=${limit}`,
  )
}

export function verifyMitigation(
  orgId: string,
  mitId: string,
  evidence: string,
): Promise<{ id: string; verified_by: string; evidence: string }> {
  return request('POST', `/api/v1/code/orgs/${orgId}/mitigations/${mitId}/verify`, { evidence })
}

export interface ListMitigationsResponse {
  org_id: string
  count: number
  items: Mitigation[]
}

export function listMitigations(orgId: string): Promise<ListMitigationsResponse> {
  return request('GET', `/api/v1/code/orgs/${orgId}/mitigations`)
}

export interface UpsertMitigationReq {
  id?: string
  control_type: MitigationControlType
  name: string
  description?: string
  applies_to_tag: string
  severity_reduction: number
}

export function upsertMitigation(orgId: string, req: UpsertMitigationReq): Promise<Mitigation> {
  return request('POST', `/api/v1/code/orgs/${orgId}/mitigations`, req)
}

export function deleteMitigation(orgId: string, mitId: string): Promise<{ id: string }> {
  return request('DELETE', `/api/v1/code/orgs/${orgId}/mitigations/${mitId}`)
}

// ── Attack paths ─────────────────────────────────────────────────

export interface AttackPath {
  id: string
  org_id: string
  name: string
  path_type: string
  severity: string
  priority_score: number
  finding_ids: string // JSON-encoded string array
  asset_ids: string   // JSON-encoded string array
  summary: string
  status: 'open' | 'mitigated' | 'resolved'
  computed_at: string
  resolved_at?: string
  // v2 graph detector (engine 2026-05-18, migration 015).
  // detection_method = 'v1_heuristic' for the three handcrafted
  // pattern detectors; 'graph_bfs' for the bounded-BFS graph
  // detector that emits per-edge probabilities. chain_probability
  // is meaningful only for graph_bfs rows.
  chain_probability: number      // 0..1; 0 for v1_heuristic
  chain_steps_json: string       // JSON array of AttackPathStep
  detection_method: 'v1_heuristic' | 'graph_bfs' | string
}

export interface AttackPathStep {
  from: string       // node id ("finding:f1" or "asset:a1")
  to: string
  edge_kind: 'hosted_on' | 'deploys_to' | 'same_root' | 'anchored_on' | string
  weight: number     // 0..1; per-edge contribution to chain_probability
  reason: string     // short human-readable explanation
}

export function parseChainSteps(json: string | undefined | null): AttackPathStep[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export interface ListAttackPathsResponse {
  org_id: string
  count: number
  paths: AttackPath[]
}

// `/ctem-paths` after engine f54ade6 — see note on updateAttackPathStatus
// above for rationale.
export function listAttackPaths(orgId: string): Promise<ListAttackPathsResponse> {
  return request('GET', `/api/v1/code/orgs/${orgId}/ctem-paths`)
}

export function recomputeAttackPaths(
  orgId: string,
): Promise<{ org_id: string; detected: number; computed_at: string }> {
  return request('POST', `/api/v1/code/orgs/${orgId}/ctem-paths/recompute`)
}

// ── helper: parse the JSON-string arrays the backend stores ──────

export function parseIds(jsonArr: string | undefined | null): string[] {
  if (!jsonArr) return []
  try {
    const v = JSON.parse(jsonArr)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

// ── Tier multiplier (mirrors backend ctem.TierMultiplier) ─────────
// Used by the UI to show "WHY is this priority X?" without round-tripping.

export function tierMultiplier(tier: AssetTier | string | undefined): number {
  switch ((tier ?? '').toLowerCase()) {
    case 'crown_jewel': return 1.5
    case 'customer_facing': return 1.2
    case 'sandbox': return 0.5
    default: return 1.0
  }
}

export function tierLabel(tier: AssetTier | string | undefined): string {
  switch ((tier ?? '').toLowerCase()) {
    case 'crown_jewel': return 'Crown Jewel'
    case 'customer_facing': return 'Customer-facing'
    case 'sandbox': return 'Sandbox'
    default: return 'Internal'
  }
}

export function tierColor(tier: AssetTier | string | undefined): string {
  switch ((tier ?? '').toLowerCase()) {
    case 'crown_jewel': return '#fbbf24'      // amber — "this is the prize"
    case 'customer_facing': return '#06b6d4'  // cyan — "user-visible"
    case 'sandbox': return '#94a3b8'          // grey — "low stakes"
    default: return '#a78bfa'                 // brand violet — "internal default"
  }
}
