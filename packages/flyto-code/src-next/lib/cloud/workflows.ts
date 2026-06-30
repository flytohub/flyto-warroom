/**
 * Workflow API — dispatches flyto-core YAML to the engine's runner backend.
 *
 * Architecture: Frontend → Engine (localhost:8080) → Runner (flyto-core)
 */

import { auth } from '@lib/firebase'
import { env } from '@lib/env'
import { cloudWsUrl } from './client'

export interface WorkflowRunRequest {
  workflowYaml: string
  params?: Record<string, unknown>
  /** Scope selector — engine requires exactly one of these so it can
   *  compute an allowed_targets list from the caller's stored data.
   *  pentest_id is the canonical choice for red team campaigns. */
  repo_id?: string
  pentest_id?: string
  org_id?: string
  /** Optional campaign linkage — surfaces in the engine's campaign_executions
   *  audit row so the war room can join a dispatch back to its campaign. */
  campaign_id?: string
  playbook_id?: string
  /** When true the runner plans steps + targets without executing.
   *  Response `.dry_run` is true and `.execution_id` is still pollable
   *  (output.steps lists planned modules + urls). */
  dry_run?: boolean
}

export interface WorkflowRunResponse {
  ok: boolean
  execution_id: string
  message?: string
  dry_run?: boolean
}

/** Dry-run-only view of `WorkflowExecution.output` — matches runner/dryrun.py.
 *  On `status: 'invalid'` the other fields are empty and the caller should
 *  surface a generic "couldn't plan" error. */
export interface WorkflowDryRunPlan {
  status: 'planned' | 'invalid'
  steps: Array<{
    id: string
    module: string
    urls: string[]
    param_keys: string[]
  }>
  targets: string[]
  stealth: {
    user_agent: string | null
    delay_ms: number | null
    jitter_ms: number | null
  }
}

export interface WorkflowStep {
  id: string
  module_id?: string
  status: string
  started_at?: string | null
  completed_at?: string | null
  output?: unknown
  error?: string | null
  screenshot_url?: string | null
}

export interface WorkflowExecution {
  execution_id: string
  workflow_id: string
  status: string
  started_at?: string | null
  completed_at?: string | null
  steps?: WorkflowStep[]
  output?: Record<string, unknown> | null
  error?: string | null
}

/** Get a Firebase ID token, or null if not signed in. */
async function getTokenSafe(): Promise<string | null> {
  try {
    const user = auth.currentUser
    if (!user) return null
    return await user.getIdToken()
  } catch {
    return null
  }
}

/** Direct fetch to engine — simpler than going through the engine client
 *  which throws on missing auth. Workflow endpoints should work with or
 *  without a token (engine proxies to runner which has no auth). */
async function engineFetch<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await getTokenSafe()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const url = `${env.engineUrl}${path}`
  if (import.meta.env.DEV) console.log(`[workflow] ${method} ${url}`)

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    if (import.meta.env.DEV) console.error(`[workflow] ${res.status} ${res.statusText}`, text)
    throw new Error(`${res.status}: ${text.slice(0, 120)}`)
  }
  return res.json()
}

/** Fire a workflow YAML via the engine → runner pipeline. */
export function runWorkflow(req: WorkflowRunRequest): Promise<WorkflowRunResponse> {
  return engineFetch<WorkflowRunResponse>('POST', '/api/v1/code/workflows/run', req)
}

/** Plan-only dispatch. Engine + runner validate scope + auth exactly like
 *  a real run; the executor is never invoked. Response's execution_id can
 *  be polled to inspect the planned steps + targets. */
export function previewWorkflow(req: Omit<WorkflowRunRequest, 'dry_run'>): Promise<WorkflowRunResponse> {
  return runWorkflow({ ...req, dry_run: true })
}

/** Poll execution status via the engine. */
export function getExecution(executionId: string): Promise<WorkflowExecution> {
  return engineFetch<WorkflowExecution>('GET', `/api/v1/code/workflow-executions/${executionId}`)
}

export function executionLiveViewUrl(executionId: string): string {
  return cloudWsUrl(`/ws/browser/${executionId}`)
}

export function executionEventsUrl(executionId: string): string {
  return cloudWsUrl(`/ws/executions/${executionId}`)
}

export function isTerminalStatus(status: string): boolean {
  return ['passed', 'failed', 'error', 'completed', 'done', 'complete'].includes(status)
}
