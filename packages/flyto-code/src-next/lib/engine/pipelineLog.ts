/**
 * Pipeline log client — POSTs phase + evidence rows to the engine so
 * the server has a complete persistent audit trail of every red-team
 * 5-phase run.
 *
 * Phase A of the orchestrator migration: the frontend still drives
 * the loop but every state transition is mirrored here. Phase C will
 * flip the orchestrator inside-out and these endpoints become a
 * (still-supported) ingestion path for external clients.
 *
 * All calls are intentionally fire-and-forget from the hook's
 * perspective — a network blip on the log path must NOT stall a
 * pipeline that's actively probing the target. Errors are logged
 * to console.warn so dev can still see them.
 */
import { authHeader, request } from './client'

export interface PipelineRunHandle {
  ok: boolean
  run_id: string
  resumed: boolean
  started_at: string
}

export interface RedTeamPreflightResponse {
  ok: boolean
  ready: boolean
  blocking_reason?: string
  blocking_reasons: string[]
  warnings?: string[]
  message?: string
  ai_provider_configured: boolean
  execution_backend_reachable: boolean
  target_attributed: boolean
  permission_ok: boolean
  active_run_id?: string
}

export interface PipelinePhaseLogBody {
  phase: 'baseline' | 'probe' | 'verify' | 'recheck' | 'report'
  status: 'pending' | 'running' | 'done' | 'skipped' | 'error'
  summary?: string
  intel_json?: string
  next_action?: 'continue' | 'stop' | 'escalate' | 'report'
  confidence?: number
  input_tokens?: number
  output_tokens?: number
  duration_ms?: number
  error_message?: string
}

export interface PipelineEvidenceLogBody {
  phase: 'baseline' | 'probe' | 'verify' | 'recheck' | 'report'
  url: string
  method?: string
  status_code?: number
  timing_ms?: number
  snippet?: string
  payload?: string
  execution_id?: string
}

export interface PipelineFinalizeBody {
  status: 'complete' | 'stopped' | 'error'
  risk_level?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'CLEAN'
  proven_count?: number
  flaky_count?: number
  total_input_tokens?: number
  total_output_tokens?: number
  error_message?: string
}

export interface PipelineSnapshot {
  ok: boolean
  run: null | {
    id: string
    orgId: string
    campaignId: string
    pentestId?: string | null
    targetUrl: string
    status: string
    currentPhase?: string | null
    totalInputTokens: number
    totalOutputTokens: number
    riskLevel?: string | null
    provenCount: number
    flakyCount: number
    errorMessage?: string | null
    startedAt: string
    completedAt?: string | null
    updatedAt: string
  }
  phases: Array<{
    id: string
    runId: string
    phase: string
    status: string
    summary: string
    intelJson: string
    nextAction?: string | null
    confidence: number
    inputTokens: number
    outputTokens: number
    durationMs: number
    errorMessage?: string | null
    startedAt?: string | null
    completedAt?: string | null
  }>
  evidence: Array<{
    id: string
    runId: string
    phase: string
    url: string
    method: string
    statusCode?: number | null
    timingMs?: number | null
    snippet?: string | null
    payload?: string | null
    executionId?: string | null
    createdAt: string
  }>
}

/** Create or resume an active pipeline run for a campaign. */
export function createPipelineRun(body: {
  org_id: string
  campaign_id: string
  pentest_id?: string
  target_url: string
}): Promise<PipelineRunHandle> {
  return request<PipelineRunHandle>('POST', '/api/v1/code/pipeline/runs', body)
}

export function getRedTeamPreflight(
  orgId: string,
  params: { campaignId?: string; targetUrl?: string } = {},
): Promise<RedTeamPreflightResponse> {
  const qs = new URLSearchParams()
  if (params.campaignId) qs.set('campaign_id', params.campaignId)
  if (params.targetUrl) qs.set('target_url', params.targetUrl)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return request<RedTeamPreflightResponse>(
    'GET',
    `/api/v1/code/orgs/${encodeURIComponent(orgId)}/redteam/preflight${suffix}`,
  )
}

export function logPipelinePhase(runId: string, body: PipelinePhaseLogBody): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    'POST',
    `/api/v1/code/pipeline/runs/${encodeURIComponent(runId)}/phase`,
    body,
  )
}

export function logPipelineEvidence(runId: string, body: PipelineEvidenceLogBody): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    'POST',
    `/api/v1/code/pipeline/runs/${encodeURIComponent(runId)}/evidence`,
    body,
  )
}

export function finalizePipelineRun(runId: string, body: PipelineFinalizeBody): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    'POST',
    `/api/v1/code/pipeline/runs/${encodeURIComponent(runId)}/finalize`,
    body,
  )
}

/** Soft-cancel an in-flight engine-side orchestrator run. */
export function stopPipelineRun(runId: string): Promise<{ ok: boolean; cancelled: boolean }> {
  return request<{ ok: boolean; cancelled: boolean }>(
    'POST',
    `/api/v1/code/pipeline/runs/${encodeURIComponent(runId)}/stop`,
  )
}

/** Re-fire a completed run's proven findings — used after a fix has
 *  shipped to produce a Before/After deliverable. Engine spawns a
 *  variant orchestrator that skips baseline+probe. */
export function retestPipelineRun(runId: string): Promise<{
  ok: boolean
  run_id: string
  parent_run_id: string
  proven_to_test: number
  started_at: string
}> {
  return request(
    'POST',
    `/api/v1/code/pipeline/runs/${encodeURIComponent(runId)}/retest`,
  )
}

/** Open the customer-facing HTML report in a new tab. The endpoint
 *  requires Firebase auth, which window.open() can't provide — so we
 *  fetch via authenticated XHR, blob-URL the response, and open that.
 *  The blob URL is revoked on tab close.
 *
 *  The opened page hosts a "Print → save as PDF" button; users hit
 *  Cmd/Ctrl+P from there to produce the SI deliverable. */
export async function openPipelineReportInNewTab(runId: string): Promise<void> {
  const { env } = await import('@lib/env')
  const bearer = await authHeader()
  if (!bearer) throw new Error('not signed in')
  const res = await fetch(
    `${env.engineUrl}/api/v1/code/pipeline/runs/${encodeURIComponent(runId)}/report.html`,
    { headers: { Authorization: bearer } },
  )
  if (!res.ok) {
    throw new Error(`report fetch failed: ${res.status}`)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (!win) {
    throw new Error('popup blocked — allow popups to view the report')
  }
  // Revoke after a generous delay so the browser has time to render.
  // The blob URL stays in memory until the new tab closes anyway.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function getPipelineRun(runId: string): Promise<PipelineSnapshot> {
  return request<PipelineSnapshot>(
    'GET',
    `/api/v1/code/pipeline/runs/${encodeURIComponent(runId)}`,
  )
}

export function getActivePipelineForCampaign(campaignId: string): Promise<PipelineSnapshot> {
  return request<PipelineSnapshot>(
    'GET',
    `/api/v1/code/campaigns/${encodeURIComponent(campaignId)}/pipeline`,
  )
}

/** AI-generated executive markdown for a campaign.
 *
 *  Endpoint: POST /api/v1/code/campaigns/{id}/report
 *
 *  The pipeline finalize step already bakes a summary into the snapshot
 *  (PipelineSnapshot.report.executiveSummary), but operators sometimes
 *  need a fresh take after threat context shifts or after the original
 *  summary was generated with a smaller model. This helper triggers a
 *  fresh AI re-generate against the latest execution data.
 *
 *  Checks AI quota server-side — returns { ok: false, error } when the
 *  org has exceeded its monthly token budget. */
export interface CampaignReportResponse {
  ok: boolean
  markdown: string
  risk_level?: string
  generated_at: string
  error?: string
}

export function regenerateCampaignReport(campaignId: string): Promise<CampaignReportResponse> {
  return request<CampaignReportResponse>(
    'POST',
    `/api/v1/code/campaigns/${encodeURIComponent(campaignId)}/report`,
  )
}

/**
 * Fire-and-forget helper. Logs to console on failure but never throws —
 * intended for paths where the audit trail is best-effort and a network
 * hiccup must not stall the live pipeline driver.
 */
export function fireAndForget<T>(label: string, p: Promise<T>): void {
  p.catch(err => {
     
    if (import.meta.env.DEV) console.warn(`[pipeline-log] ${label} failed:`, err)
  })
}
