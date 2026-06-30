import { request } from '../client'
import type { ReportSourceMeta } from '../reports/report-sources'

// ── AutoFix v2 (Tier 1/2/3 pipeline) ──

export interface AutofixRule {
  id: string
  version: string
  title: string
  severity: string
  description: string
  // The /autofix/rules handler returns ruleWithCfg = RuleSummary + per-org
  // config; these were missing here, forcing an `as unknown as` cast at the
  // call site (AutofixView) that hid the real shape from the type checker.
  category: string
  enabled: boolean
  auto_merge: boolean
  daily_quota: number
}

export interface AutofixGateResult {
  name: string
  status: 'pass' | 'fail' | 'skipped' | 'error'
  message?: string
  took_ms?: number
}

export interface AutofixVerifyResult {
  passed: boolean
  gates: AutofixGateResult[]
  duration_ms?: number
}

export interface AutofixFinding {
  rule_id: string
  repo_id: string
  file_path?: string
  line?: number
  severity: string
  title: string
  description?: string
}

export interface AutofixProcessedPatch {
  finding: AutofixFinding
  patch: {
    rule_id: string
    tier: string
    title: string
    description: string
    changes: Array<{ path: string; status: string }>
    verify_hints?: string[]
  }
  verify: AutofixVerifyResult
}

export interface AutofixRuleResult {
  rule_id: string
  findings: AutofixFinding[]
  patches: AutofixProcessedPatch[]
  took_ms?: number
  error?: string
}

export interface AutofixRunSummary {
  repo_id: string
  started_at: string
  took_ms?: number
  rules: AutofixRuleResult[]
  total_passes: number
  total_fails: number
}

export function listAutofixRules(orgId: string) {
  return request<{ rules: AutofixRule[] }>('GET', `/api/v1/code/orgs/${orgId}/autofix/rules`)
}

export interface AutofixPROpened {
  rule_id: string
  pr_url: string
  pr_number: number
  branch: string
  findings: number
}

export interface AutofixPRError {
  rule_id: string
  error: string
}

export interface AutofixRunResponse {
  summary: AutofixRunSummary
  prs?: AutofixPROpened[]
  pr_errors?: AutofixPRError[]
}

export function runAutofix(repoId: string, openPR = false) {
  const qs = openPR ? '?open_pr=1' : ''
  return request<AutofixRunResponse>('POST', `/api/v1/code/repos/${repoId}/autofix/run${qs}`)
}

// Promotion candidates (Tier 3)
export interface AutofixPromotionCandidate {
  ShapeHash: string
  FindingType: string
  OccurrenceCount: number
  DistinctRepos: number
  Suggested: string
  Examples: Array<{ ID: string; RepoID: string; FilePath: string; PRURL: string; MergedAt: string }>
}

export interface AutofixPromotionCandidateWithStatus extends AutofixPromotionCandidate {
  status: '' | 'approved' | 'rejected'
}

export function listAutofixPromotions(orgId: string) {
  return request<{
    candidates: AutofixPromotionCandidateWithStatus[] | null
    approved: AutofixPromotionCandidateWithStatus[] | null
  }>('GET', `/api/v1/code/orgs/${orgId}/autofix/promotions`)
}

export interface AutofixPromotionDecision {
  org_id: string
  shape_hash: string
  status: 'approved' | 'rejected' | 'pending'
  finding_type: string
  note: string
  decided_by: string
  decided_at: string
}

// POST decision on a Tier 3 candidate. status: 'approved' tags the
// shape for engineers to author a Tier 1 rule; 'rejected' filters
// it out of the queue.
export function decideAutofixPromotion(
  orgId: string,
  shapeHash: string,
  body: { status: 'approved' | 'rejected' | 'pending'; note?: string; finding_type?: string },
) {
  return request<AutofixPromotionDecision>(
    'POST',
    `/api/v1/code/orgs/${orgId}/autofix/promotions/${shapeHash}/decision`,
    body,
  )
}

// ── AutoFix findings inventory (Aikido-parity per-repo grouped list) ─

export type AutofixPatchStatus =
  | 'no_preview'
  | 'preview'
  | 'outdated'
  | 'pr_opened'
  // permanently_no_preview = preview gen exhausted retry cap (3
  // attempts) and the engine stopped auto-retrying. Operator can
  // force one more attempt via the Retry button (which calls
  // generateAutofixPreview with force=true). Wire format value is
  // emitted by the engine after migration 470910d.
  | 'permanently_no_preview'

export type AutofixPatchStatusReason =
  | 'not_generated'
  | 'patch_ready'
  | 'pr_opened'
  | 'cached_no_change'
  | 'finding_resolved'
  | 'clone_failed'
  | 'detect_failed'
  | 'transform_failed'
  | 'rule_unavailable'
  | 'ambiguous_match'
  | 'retry_cap'
  | 'empty_patch'
  | string

// Findings inventory row — distinct from `AutofixFinding` above (which
// is the orchestrator's per-rule detect output). The inventory row is
// the persisted, UI-facing view including patch state, PR linkage,
// and rule metadata joined in by the engine.
export interface AutofixFindingRow {
  id: string
  repo_id: string
  repo_name: string
  rule_id: string
  rule_title: string
  rule_category: string
  file_path: string
  line_number: number
  severity: string
  title: string
  description?: string
  patch_status: AutofixPatchStatus
  patch_status_reason?: AutofixPatchStatusReason
  patch_status_message?: string
  patch_title?: string
  verify_passed: boolean
  pr_url?: string
  pr_number?: number
  fingerprint?: string
  detected_at: string
  patched_at?: string
  /**
   * Server-canonical confidence verdict (audit B6/B7). Same
   * shape as `AutofixFindingDetail.confidence`. Populated only
   * when the cached row has gate output to evaluate — absent
   * for fresh derive-only rows and no_preview /
   * permanently_no_preview cached rows.
   *
   * `AutofixFindingsView`'s group chip should derive group
   * confidence from this field instead of counting
   * `verify_passed`. Migration intentionally deferred until
   * staging confirms (Codex boundary 2026-05-24).
   */
  confidence?: AutofixConfidence
}

export interface AutofixFileChange {
  path: string
  status: 'added' | 'modified' | 'removed'
  before?: string
  after?: string
}

export interface AutofixGate {
  name: string
  status: 'pass' | 'fail' | 'skipped' | 'error'
  message?: string
  took_ms?: number
}

export interface AutofixFindingDetail extends AutofixFindingRow {
  patch_changes: AutofixFileChange[]
  verify_gates: AutofixGate[]
  patch_description?: string
  // Retry tracking (migration 022). retry_count = N → "we've
  // tried this finding N times". When patch_status is
  // 'permanently_no_preview', the cap (3) has been hit and the
  // operator must click "Try once more" to override.
  retry_count?: number
  last_retry?: string
  // cached=true on a no_preview response means the SHA-based
  // invalidator decided to skip the LLM call this time (file
  // hasn't changed since the previous attempt). UI surfaces a
  // hint so the operator knows the response wasn't "fresh fail".
  cached?: boolean
  // `confidence` is inherited from AutofixFindingRow (audit B6/B7).
  // Both the list endpoint and the detail endpoint populate the
  // same shape; the field is absent on either when there are no
  // gates to evaluate (no_preview / permanently_no_preview).
}

/** Server-side autofix confidence verdict — see
 *  AutofixFindingDetail.confidence for the visual contract. */
export interface AutofixConfidence {
  level: 'high' | 'medium' | 'low'
  tier: 1 | 2
  /** i18n key, e.g. "autofix.confidenceReasonTier1". Frontend
   *  passes reason_gates into the matching {n}/{gate}/{list}
   *  placeholders when rendering. */
  reason_key: string
  /** Names of gates the reason text interpolates (failed names,
   *  skipped names, or passed names depending on which reason
   *  fired). Empty array when not applicable. */
  reason_gates?: string[]
}

/** Org-wide autofix-eligible findings (Tier 1 deterministic + Tier 2 AI). Drives the AutoFix queue view. */
export function listAutofixFindings(orgId: string) {
  return request<{ findings: AutofixFindingRow[] | null }>(
    'GET', `/api/v1/code/orgs/${orgId}/autofix/findings`,
  )
}

export function getAutofixFinding(orgId: string, findingId: string) {
  return request<AutofixFindingDetail>(
    'GET', `/api/v1/code/orgs/${orgId}/autofix/findings/${findingId}`,
  )
}

export interface AutofixPreviewResponse {
  status: AutofixPatchStatus
  patch_status_reason?: AutofixPatchStatusReason
  patch_status_message?: string
  verify_passed: boolean
  changes: AutofixFileChange[]
  gates: AutofixGate[]
  title?: string
  description?: string
  cached?: boolean
  retry_count?: number
  last_retry?: string
}

export function generateAutofixPreview(orgId: string, findingId: string, force = false) {
  // force=true overrides:
  //   - the cached "preview" short-circuit (regenerates fresh)
  //   - the SHA-based "file unchanged, return cached miss" path
  //   - the permanently_no_preview retry-cap gate (lets operator
  //     manually try once more after 3 prior fails)
  const qs = force ? '?force=1' : ''
  return request<AutofixPreviewResponse>(
    'POST', `/api/v1/code/orgs/${orgId}/autofix/findings/${findingId}/preview${qs}`,
  )
}

export interface AutofixOpenPRResponse {
  status: 'pr_opened'
  pr_url: string
  pr_number: number
  warning?: string
}

export function openAutofixFindingPR(orgId: string, findingId: string) {
  return request<AutofixOpenPRResponse>(
    'POST', `/api/v1/code/orgs/${orgId}/autofix/findings/${findingId}/pr`,
  )
}

// Audit ledger
export interface AutofixRunLogRow {
  ID: string
  OrgID: string
  RepoID: string
  TriggeredBy: string
  Actor: string
  StartedAt: string
  FinishedAt: string
  DurationMs: number
  FindingsCount: number
  PatchesPassed: number
  PatchesFailed: number
  PRsOpened: number
  Error: string
}

export interface AutofixGateLogRow {
  ID: string
  RunID: string
  RuleID: string
  FilePath: string
  LineNumber: number
  FindingTitle: string
  GateName: string
  GateStatus: string
  GateMessage: string
  TookMs: number
  PRURL: string
  CreatedAt: string
}

export function listAutofixRuns(orgId: string) {
  return request<{ runs: AutofixRunLogRow[] | null }>(
    'GET', `/api/v1/code/orgs/${orgId}/autofix/runs`,
  )
}

export function getAutofixRunGates(orgId: string, runId: string) {
  return request<{ gates: AutofixGateLogRow[] | null }>(
    'GET', `/api/v1/code/orgs/${orgId}/autofix/runs/${runId}/gates`,
  )
}

// ── Report datasource definitions ──

export const AUTOFIX_REPORT_SOURCES: ReportSourceMeta[] = [
  {
    id: 'autofix',
    name: 'AutoFix Findings',
    nameKey: 'reports.ds.autofix',
    category: 'security',
    fetcher: (orgId) => listAutofixFindings(orgId),
    rowsPath: 'findings',
    joinableOn: ['repo_id'],
    fields: [
      { key: 'repo_name', label: 'Repo', type: 'string' },
      { key: 'severity', label: 'Severity', type: 'severity' },
      { key: 'title', label: 'Title', type: 'string' },
      { key: 'rule_category', label: 'Category', type: 'string' },
      { key: 'patch_status', label: 'Patch Status', type: 'string' },
      { key: 'verify_passed', label: 'Verified', type: 'boolean' },
      { key: 'pr_url', label: 'PR URL', type: 'string' },
      { key: 'detected_at', label: 'Detected', type: 'date' },
    ],
  },
  {
    id: 'autofix-runs',
    name: 'AutoFix Runs',
    nameKey: 'reports.ds.autofixRuns',
    category: 'security',
    fetcher: (orgId) => listAutofixRuns(orgId),
    rowsPath: 'runs',
    joinableOn: ['repo_id'],
    fields: [
      { key: 'triggered_by', label: 'Trigger', type: 'string' },
      { key: 'findings_count', label: 'Findings', type: 'number', aggregate: 'sum' },
      { key: 'patches_passed', label: 'Passed', type: 'number', aggregate: 'sum' },
      { key: 'patches_failed', label: 'Failed', type: 'number', aggregate: 'sum' },
      { key: 'prs_opened', label: 'PRs', type: 'number', aggregate: 'sum' },
      { key: 'duration_ms', label: 'Duration (ms)', type: 'number' },
      { key: 'started_at', label: 'Started', type: 'date' },
    ],
  },
]
