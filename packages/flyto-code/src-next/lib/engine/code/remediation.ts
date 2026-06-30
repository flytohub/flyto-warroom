import { request } from '../client'

export type RemediationSurface = 'code' | 'container' | 'cloud' | 'runtime' | 'external'
export type RemediationMode = 'auto' | 'code_pr' | 'live_apply' | 'agent_task' | 'external_workflow' | 'manual'
export type RemediationStatus =
  | 'open'
  | 'planned'
  | 'approval_pending'
  | 'approved'
  | 'applying'
  | 'applied'
  | 'blocked'
  | 'verified_fixed'
  | 'still_present'
  | 'rolled_back'
  | 'failed'

export interface RemediationProviderCapability {
  provider: string
  surfaces: RemediationSurface[]
  modes: RemediationMode[]
  live_collector: boolean
  live_apply: boolean
  code_pr: boolean
  agent_task: boolean
  external_workflow: boolean
  credential_required: boolean
  status: string
  reason?: string
}

export interface RemediationTarget {
  id: string
  org_id: string
  surface: RemediationSurface
  source_type: string
  source_id: string
  provider?: string
  project_id?: string
  repo_id?: string
  connection_id?: string
  resource_id?: string
  title: string
  severity?: string
  status: RemediationStatus
  capability?: string
  current_state_json?: string
  desired_state_json?: string
  evidence_digest?: string
  last_verification_run_id?: string
  created_at: string
  updated_at: string
}

export interface RemediationPlan {
  id: string
  org_id: string
  target_id: string
  surface: RemediationSurface
  provider?: string
  mode: Exclude<RemediationMode, 'auto'>
  status: RemediationStatus
  summary: string
  apply_supported: boolean
  approval_required: boolean
  rollback_supported: boolean
  verify_supported: boolean
  blocked_reason?: string
  actions_json?: string
  evidence_json?: string
  requested_by?: string
  approved_by?: string
  approved_at?: string
  created_at: string
  updated_at: string
}

export interface RemediationRun {
  id: string
  org_id: string
  plan_id: string
  target_id: string
  action: 'apply' | 'verify' | 'rollback'
  status: RemediationStatus
  mode: Exclude<RemediationMode, 'auto'>
  provider?: string
  actor_id?: string
  result_json?: string
  error?: string
  evidence_signature?: string
  started_at: string
  completed_at?: string
}

export interface RemediationArtifact {
  id: string
  org_id: string
  run_id?: string
  plan_id?: string
  target_id?: string
  kind: string
  name: string
  mime_type: string
  payload_json: string
  cas_hash?: string
  created_at: string
}

export interface RemediationTargetInput {
  surface: RemediationSurface
  source_type: string
  source_id: string
  provider?: string
  project_id?: string
  repo_id?: string
  connection_id?: string
  resource_id?: string
  title?: string
  severity?: string
  capability?: string
  current_state?: Record<string, unknown>
  desired_state?: Record<string, unknown>
  allow_generic?: boolean
  requested_mode?: RemediationMode
}

export interface CreateRemediationPlanInput extends RemediationTargetInput {
  target_id?: string
}

export function listRemediationCatalog(orgId: string) {
  return request<{ providers: RemediationProviderCapability[]; modes: RemediationMode[] }>(
    'GET',
    `/api/v1/code/orgs/${orgId}/remediation/catalog`,
  )
}

export function listRemediationTargets(orgId: string, params: { surface?: string; status?: string } = {}) {
  const qs = new URLSearchParams()
  if (params.surface) qs.set('surface', params.surface)
  if (params.status) qs.set('status', params.status)
  const suffix = qs.toString() ? `?${qs}` : ''
  return request<{ targets: RemediationTarget[]; count: number }>(
    'GET',
    `/api/v1/code/orgs/${orgId}/remediation/targets${suffix}`,
  )
}

export function createRemediationTarget(orgId: string, body: RemediationTargetInput) {
  return request<RemediationTarget>('POST', `/api/v1/code/orgs/${orgId}/remediation/targets`, body)
}

export function createRemediationPlan(orgId: string, body: CreateRemediationPlanInput) {
  return request<{ target: RemediationTarget; plan: RemediationPlan }>(
    'POST',
    `/api/v1/code/orgs/${orgId}/remediation/plans`,
    body,
  )
}

export function listRemediationPlans(orgId: string, params: { target_id?: string; status?: string } = {}) {
  const qs = new URLSearchParams()
  if (params.target_id) qs.set('target_id', params.target_id)
  if (params.status) qs.set('status', params.status)
  const suffix = qs.toString() ? `?${qs}` : ''
  return request<{ plans: RemediationPlan[]; count: number }>(
    'GET',
    `/api/v1/code/orgs/${orgId}/remediation/plans${suffix}`,
  )
}

export function approveRemediationPlan(orgId: string, planId: string) {
  return request<{ plan: RemediationPlan }>(
    'POST',
    `/api/v1/code/orgs/${orgId}/remediation/plans/${planId}/approve`,
  )
}

export function applyRemediationPlan(orgId: string, planId: string) {
  return request<{ run: RemediationRun; status: RemediationStatus; result: Record<string, unknown>; error?: string }>(
    'POST',
    `/api/v1/code/orgs/${orgId}/remediation/plans/${planId}/apply`,
  )
}

export function verifyRemediationPlan(orgId: string, planId: string) {
  return request<{ run: RemediationRun; status: RemediationStatus; result: Record<string, unknown>; error?: string }>(
    'POST',
    `/api/v1/code/orgs/${orgId}/remediation/plans/${planId}/verify`,
  )
}

export function rollbackRemediationPlan(orgId: string, planId: string) {
  return request<{ run: RemediationRun; status: RemediationStatus; result: Record<string, unknown>; error?: string }>(
    'POST',
    `/api/v1/code/orgs/${orgId}/remediation/plans/${planId}/rollback`,
  )
}

export function listRemediationRuns(orgId: string, params: { target_id?: string; plan_id?: string; action?: string } = {}) {
  const qs = new URLSearchParams()
  if (params.target_id) qs.set('target_id', params.target_id)
  if (params.plan_id) qs.set('plan_id', params.plan_id)
  if (params.action) qs.set('action', params.action)
  const suffix = qs.toString() ? `?${qs}` : ''
  return request<{ runs: RemediationRun[]; count: number }>(
    'GET',
    `/api/v1/code/orgs/${orgId}/remediation/runs${suffix}`,
  )
}

export function listRemediationArtifacts(orgId: string, params: { target_id?: string; plan_id?: string; run_id?: string } = {}) {
  const qs = new URLSearchParams()
  if (params.target_id) qs.set('target_id', params.target_id)
  if (params.plan_id) qs.set('plan_id', params.plan_id)
  if (params.run_id) qs.set('run_id', params.run_id)
  const suffix = qs.toString() ? `?${qs}` : ''
  return request<{ artifacts: RemediationArtifact[]; count: number }>(
    'GET',
    `/api/v1/code/orgs/${orgId}/remediation/artifacts${suffix}`,
  )
}
