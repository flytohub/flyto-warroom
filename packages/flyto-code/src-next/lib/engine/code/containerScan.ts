import { request } from '../client'

export interface ContainerScanRun {
  id: string
  org_id: string
  repo_id?: string
  connection_id?: string
  source_type: 'repo_scan' | 'repo_manual' | 'container_connection' | 'finding_verify' | string
  source_ref?: string
  status: 'queued' | 'running' | 'complete' | 'failed' | string
  image_refs?: string[]
  images_requested: number
  images_scanned: number
  findings_created: number
  critical_count: number
  high_count: number
  medium_count: number
  evidence_json?: string
  evidence_signature?: string
  error?: string
  started_at?: string
  completed_at?: string
  created_at: string
  updated_at: string
}

export interface ContainerConnection {
  id: string
  org_id: string
  kind: 'registry' | 'kubernetes' | string
  provider: string
  name: string
  endpoint?: string
  region?: string
  image_refs?: string[]
  credential_kind?: string
  has_credential: boolean
  key_id?: string
  status: 'active' | 'disabled' | string
  last_scan_at?: string
  last_error?: string
  created_at: string
  updated_at: string
}

export interface ContainerConnectionInput {
  kind?: 'registry' | 'kubernetes'
  provider?: string
  name: string
  endpoint?: string
  region?: string
  image_refs?: string[]
  credential_kind?: string
  credential?: string
  status?: 'active' | 'disabled'
}

export interface ContainerRunEvidence {
  run_id: string
  evidence_json: string
  evidence_signature: string
}

export interface ContainerFindingLifecycleResult {
  id: string
  status: string
  resolution?: string
}

export interface ContainerVerifyResult {
  run: ContainerScanRun
  still_present: boolean
  status: string
}

export function triggerContainerScan(repoId: string, imageRef: string) {
  return request<{ run: ContainerScanRun }>(
    'POST',
    `/api/v1/code/repos/${repoId}/container-scan`,
    { image_ref: imageRef },
  )
}

export function listContainerConnections(orgId: string) {
  return request<{ connections: ContainerConnection[]; count: number }>(
    'GET',
    `/api/v1/code/orgs/${orgId}/container/connections`,
  )
}

export function upsertContainerConnection(orgId: string, input: ContainerConnectionInput) {
  return request<ContainerConnection>(
    'POST',
    `/api/v1/code/orgs/${orgId}/container/connections`,
    input,
  )
}

export function patchContainerConnection(orgId: string, connectionId: string, input: Partial<ContainerConnectionInput>) {
  return request<ContainerConnection>(
    'PATCH',
    `/api/v1/code/orgs/${orgId}/container/connections/${connectionId}`,
    input,
  )
}

export function runContainerConnectionScan(orgId: string, connectionId: string) {
  return request<{ run: ContainerScanRun }>(
    'POST',
    `/api/v1/code/orgs/${orgId}/container/connections/${connectionId}/scan`,
    {},
  )
}

export function listContainerScanRuns(orgId: string) {
  return request<{ runs: ContainerScanRun[]; count: number }>(
    'GET',
    `/api/v1/code/orgs/${orgId}/container/scan-runs`,
  )
}

export function getContainerScanRunEvidence(orgId: string, runId: string) {
  return request<ContainerRunEvidence>(
    'GET',
    `/api/v1/code/orgs/${orgId}/container/scan-runs/${runId}/evidence`,
  )
}

export function verifyContainerFinding(orgId: string, findingId: string) {
  return request<ContainerVerifyResult>(
    'POST',
    `/api/v1/code/orgs/${orgId}/container-findings/${findingId}/verify`,
    {},
  )
}

export function reopenContainerFinding(orgId: string, findingId: string) {
  return request<ContainerFindingLifecycleResult>(
    'POST',
    `/api/v1/code/orgs/${orgId}/container-findings/${findingId}/reopen`,
    {},
  )
}

export function falsePositiveContainerFinding(orgId: string, findingId: string) {
  return request<ContainerFindingLifecycleResult>(
    'POST',
    `/api/v1/code/orgs/${orgId}/container-findings/${findingId}/false-positive`,
    {},
  )
}
