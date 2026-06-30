/**
 * Closed-loop verification API — trigger + poll workflow executions.
 */

import { request } from '../client'

export interface VerifyFindingResponse {
  execution_id: string
  live_view_url?: string
  yaml?: string
  status: 'queued' | 'running' | 'passed' | 'failed' | 'error'
  /** Static mode returns an immediate verdict — `reachable` for now.
   *  Dynamic mode returns the terminal verdict once the runner finishes. */
  verdict?: VerifyVerdict
  /** Echoed back so the UI can label the result correctly. */
  mode?: VerifyMode
  note?: string
  /** Confidence in the verdict. `low` is the default for anything
   *  observational / pattern-based; `high` reserved for deterministic
   *  results (e.g. `unreachable` means dead dep). */
  confidence?: VerifyConfidence
  /** Plain-English explanation of HOW the verdict was produced —
   *  "we did X to decide this, so Y is why it could still be wrong".
   *  Rendered under the verdict badge so users never take the word
   *  at face value. */
  verification_method?: string
  /** Structured signals that fed the static verdict. Present only in
   *  static mode. The engine serializes `verdictEvidence` (api/
   *  verify_verdict.go) WITHOUT json tags, so the wire keys are the
   *  exact capitalized Go field names. Rendered honestly in
   *  StaticResultView — no prose, just the raw signals. */
  evidence?: VerdictEvidence
}

/** Static-verdict evidence signals, mirroring the engine's
 *  `verdictEvidence` struct (api/verify_verdict.go). That struct has
 *  NO json tags and is emitted via `"evidence": v.Evidence`, so Go's
 *  encoding/json defaults to the exact Go field names — hence the
 *  capitalized keys here (verified against the backend wire shape).
 *  CVEMetaConfidence is a 0..1 float (0.85 GHSA-derived, 0.45 AI
 *  fallback, 0 when no metadata). */
export interface VerdictEvidence {
  /** Upstream-source confidence for this CVE, 0..1. */
  CVEMetaConfidence: number
  /** Layer 1 saw the package imported. */
  L1Imported: boolean
  /** cvemeta has function-level metadata for this CVE. */
  L2HasVulnFunctions: boolean
  /** Count of CVE vuln_functions whose FQN appears in call sites. */
  L3DirectMatchCount: number
  /** Count of user functions whose transitive closure reaches a vuln_function. */
  L3IndirectMatchCount: number
  /** An importing file uses dynamic dispatch — invalidates downgrade claims. */
  L3ReflectionGuard: boolean
  /** Every matched vuln_function is internal/test scope (non-public). */
  L3AllNonPublic: boolean
}

export type VerifyMode = 'static' | 'dynamic'

/** Verdict vocabulary — hedged wherever we can't prove a definitive
 *  answer. `suspected_exploitable` / `likely_sanitized` were
 *  introduced 2026-04-23 after Chester pushed back on bare
 *  "exploitable" readings from generic-payload probes: those are
 *  pattern matches, not proofs, and the UI must not claim more than
 *  it observed. Keep the hedged variants and plain ones both
 *  accepted — older rows still carry the plain forms. */
export type VerifyVerdict =
  | 'exploitable'               // dynamic probe + CVE-specific payload matched (future)
  | 'suspected_exploitable'     // dynamic probe observed no input-validation — pattern match only
  | 'sanitized'
  | 'likely_sanitized'          // dynamic probe observed blocked payload — one-request sample
  | 'unreachable'
  | 'reachable'
  | 'inconclusive'

export type VerifyConfidence = 'high' | 'medium' | 'low'

export interface WorkflowExecution {
  id: string
  orgId: string
  repoId?: string
  findingFp: string
  executionId: string
  status: 'queued' | 'running' | 'passed' | 'failed' | 'error'
  verdict?: VerifyVerdict
  yaml: string
  liveViewUrl?: string
  evidenceUrl?: string
  errorMessage?: string
  createdAt: string
  updatedAt: string
}

export interface VerifyRequestOptions {
  mode: VerifyMode
  /** Required only in dynamic mode. */
  targetUrl?: string
  /** Required for dynamic mode on a cloud deployment — the UI must
   *  gather explicit user consent because dynamic probing sends
   *  synthetic attack payloads (SQLi-style fuzz strings) to
   *  target_url. Rejected by the engine with 403 when missing. */
  acknowledged?: boolean
}

export function verifyFinding(
  repoId: string,
  fingerprint: string,
  opts: VerifyRequestOptions,
) {
  return request<VerifyFindingResponse>(
    'POST',
    `/api/v1/code/repos/${repoId}/findings/${fingerprint}/verify`,
    {
      mode: opts.mode,
      target_url: opts.targetUrl || '',
      acknowledged: !!opts.acknowledged,
    },
  )
}

export function getWorkflowExecution(executionId: string) {
  return request<WorkflowExecution>(
    'GET',
    `/api/v1/code/workflow-executions/${executionId}`,
  )
}

// ── Per-repo dynamic-probe target allowlist ──
//
// Empty list means "no restriction" — cloud mode still requires the
// per-call consent checkbox. A non-empty list narrows which URLs
// can be submitted (prefix match). Enforced by the engine in both
// cloud and enterprise deployments because an explicit allowlist
// should not be bypassable.

export interface VerifyTargets {
  targets: string[]
}

export function getVerifyTargets(repoId: string) {
  return request<VerifyTargets>(
    'GET',
    `/api/v1/code/repos/${repoId}/verify-targets`,
  )
}

export function updateVerifyTargets(repoId: string, targets: string[]) {
  return request<VerifyTargets>(
    'PUT',
    `/api/v1/code/repos/${repoId}/verify-targets`,
    { targets },
  )
}

// ── AI verdict explanation ──
//
// Turns the raw verdict (`exploitable` / `sanitized` / etc.) into a
// plain-English 3-4 sentence summary the developer can actually act
// on. Lazy-fetched after a verify completes so the verdict badge
// appears instantly and the explanation fills in as it loads.

export interface VerifyExplainResponse {
  explanation: string
  cached: boolean
}

export function explainExecution(executionId: string) {
  return request<VerifyExplainResponse>(
    'GET',
    `/api/v1/code/workflow-executions/${executionId}/explain`,
  )
}
