import { request } from '../client'

const PRODUCT_VERIFICATION_SCANNER_ID = 'product_verification'

export interface WarroomCampaignExecution {
  id: string
  orgId: string
  userId?: string | null
  campaignId?: string | null
  repoId?: string | null
  pentestId?: string | null
  runnerExecutionId?: string | null
  targetUrl: string
  playbookId?: string | null
  allowedTargets: string
  dryRun: boolean
  status: 'dispatched' | 'running' | 'complete' | 'failed' | string
  verdict?: string | null
  findingsCount: number
  criticalCount: number
  errorMessage?: string | null
  evidenceSig?: string | null
  createdAt: string
  updatedAt: string
}

export interface WarroomVerificationListResponse {
  ok: boolean
  graph_contract: string
  runs: WarroomCampaignExecution[]
}

export interface WarroomVerificationRunRequest {
  target_url: string
  repo_id?: string
  pentest_id?: string
  dry_run?: boolean
}

export interface WarroomVerificationRunResponse {
  ok: boolean
  run: WarroomCampaignExecution
  graph_contract: string
  scope_source: string
  target_host: string
  workflow: {
    playbook_id: string
    campaign_id: string
    runner?: string
  }
}

export interface WarroomEvidenceFinding {
  code?: string
  type?: string
  severity?: string
  message?: string
  evidence?: Record<string, unknown>
  details?: Record<string, unknown>
}

export interface WarroomEvidenceScoreBreakdownItem {
  points?: number
  max?: number
  value?: number
  threshold?: number
  complete?: boolean
  label?: string
}

export interface WarroomArtifactCompleteness {
  required?: string[]
  present?: string[]
  missing?: string[]
  complete?: boolean
  score?: number
}

export interface WarroomEvidencePack {
  schema_version?: string
  verdict?: string
  automation_test_model?: WarroomAutomationTestModel
  run?: {
    total?: number
    passed?: number
    failed?: number
    replay_ok?: boolean
    results?: Array<{
      id?: string
      name?: string
      step?: number
      module?: string
      status?: string
      severity?: string
      duration_ms?: number
      error?: string
      assertions?: Array<{
        path?: string
        operator?: string
        expected?: unknown
        actual?: unknown
        passed?: boolean
        severity?: string
      }>
    }>
    evaluation?: {
      passed?: boolean
      summary?: Record<string, unknown>
    }
  }
  run_evaluation?: {
    passed?: boolean
    summary?: Record<string, unknown>
    findings?: WarroomEvidenceFinding[]
  }
  scenarios?: {
    name?: string
    schema_version?: string
    generated_from?: string
    target?: string
    steps?: Array<{
      id?: string
      module?: string
      params?: Record<string, unknown>
      assertions?: Array<Record<string, unknown>>
    }>
  }
  gate_verdict?: string
  gate_score?: number
  score_breakdown?: Record<string, WarroomEvidenceScoreBreakdownItem>
  artifact_completeness?: WarroomArtifactCompleteness
  gate_blockers?: string[]
  scores?: Record<string, number>
  findings?: WarroomEvidenceFinding[]
  site_graph?: {
    findings?: WarroomEvidenceFinding[]
    scores?: Record<string, number>
    intents?: Array<Record<string, unknown>>
    actions?: Array<{
      id?: string
      page_id?: string
      url?: string
      label?: string
      kind?: string
      selector?: string
      disabled?: boolean
      href?: string
      expected_state?: string
      intent_id?: string
    }>
    apis?: Array<{
      id?: string
      page_id?: string
      method?: string
      url?: string
      status?: number
      resource_type?: string
      trigger?: string
      ghost_api_type?: string
    }>
    pages?: Array<{
      id?: string
      url?: string
      title?: string
      body_chars?: number
      states?: string[]
      control_count?: number
      api_count?: number
      screenshot?: string
    }>
    state_graph?: {
      states?: Array<Record<string, unknown>>
      allowed_states?: string[]
    }
    reachable_paths?: string[]
    observed_paths?: string[]
  }
  artifacts?: Record<string, unknown>
}

export interface WarroomAutomationTestModel {
  schema_version?: string
  legacy_schema_version?: string
  product_contract?: string
  product_surface?: string
  capability?: string
  engine_mode?: {
    name?: string
    execution_mode?: string
    llm_required?: boolean
    llm_role?: string
    fact_source?: string
    gate_authority?: string
    human_editable_yaml?: boolean
  }
  deterministic_contract?: {
    inputs?: string[]
    outputs?: string[]
    llm_can_create_facts?: boolean
    llm_can_gate?: boolean
  }
  readiness_score?: number
  coverage?: {
    observed_paths?: string[]
    reachable_paths?: string[]
    expected_paths?: string[]
    blocked_paths?: string[]
    observed_coverage?: number
    reachable_coverage?: number
    expected_coverage?: number
  }
  intent_graph?: {
    count?: number
    intents?: Array<Record<string, unknown>>
  }
  scenario_synthesis?: {
    schema_version?: string
    name?: string
    step_count?: number
    replayable_steps?: number
    generated_from?: string
  }
  replay?: {
    ok?: boolean
    total?: number
    passed?: number
    failed?: number
    reliability?: number
    steps?: NonNullable<WarroomEvidencePack['run']>['results']
  }
  ghost_api?: {
    type_a_count?: number
    type_b_count?: number
    type_c_count?: number
    type_a?: Array<Record<string, unknown>>
    type_b?: Array<Record<string, unknown>>
    type_c?: Array<Record<string, unknown>>
    has_findings?: boolean
  }
  deterministic_rules?: {
    required?: string[]
    counts?: Record<string, number>
    samples?: Record<string, WarroomEvidenceFinding[]>
    has_blockers?: boolean
  }
  business_invariants?: {
    state_contradictions?: number
    p0?: number
    p1?: number
    findings?: WarroomEvidenceFinding[]
  }
  rbac_matrix?: {
    status?: string
    authority?: string
    source?: string
    action?: string
    roles_required?: string[]
    role_expectations?: Record<string, string>
    roles_tested?: string[]
    tenant_pairs_tested?: number
    tenant_isolation?: string
    fail_closed?: boolean
    fail_open_disallowed?: boolean
    frontend_authority?: boolean
    violations?: unknown[]
  }
  authorization_gate?: {
    status?: string
    authority?: string
    org_gate?: string
    commercial_gate?: string
    scope_gate?: string
    capability_gate?: string
    frontend_authority?: boolean
    fail_closed?: boolean
  }
  event_stream?: {
    status?: string
    transport?: string
    endpoint?: string
    expected_events?: string[]
    expected_payload_fields?: string[]
    observed_events?: Array<Record<string, unknown> | string>
    observed_count?: number
    fail_closed?: boolean
    source?: string
  }
  scheduler_loop?: {
    status?: string
    scanner_id?: string
    authority?: string
    enabled?: boolean | null
    dispatch_source?: string
    manual_run_endpoint?: string
    scheduler_control_endpoint?: string
    durable_job?: boolean
    last_run_status?: string
    run_count?: number
    fail_count?: number
  }
  evidence_chain?: {
    artifact_completeness?: WarroomArtifactCompleteness
    has_screenshot?: boolean
    has_dom_snapshot?: boolean
    has_network_log?: boolean
    evidence_signature_expected?: boolean
  }
  gate?: {
    verdict?: string
    score?: number
    blockers?: string[]
  }
}

export interface WarroomEvidenceArtifact {
  id: string
  kind: string
  name: string
  mimeType: string
  sizeBytes: number
  url?: string
  previewDataUrl?: string
  json?: unknown
  createdAt: string
}

export interface WarroomVerificationEvidenceResponse {
  ok: boolean
  graphContract: string
  runId: string
  runnerExecutionId?: string | null
  evidenceSig?: string | null
  gateVerdict?: string
  gateScore?: number
  scoreBreakdown?: Record<string, WarroomEvidenceScoreBreakdownItem>
  artifactCompleteness?: WarroomArtifactCompleteness
  gateBlockers?: string[]
  evidencePack?: WarroomEvidencePack | null
  artifacts: WarroomEvidenceArtifact[]
}

export interface SystemScanner {
  id: string
  name: string
  description: string
  category: string
  scope: string
  asset_types?: string[]
  env_keys?: string[]
  critical_for_platform: boolean
  enabled: boolean
  interval: string
  run_count: number
  fail_count: number
  last_run_start?: string
  last_run_end?: string
  last_error?: string
  currently_running: boolean
  notes?: string
}

export interface ProductVerificationScannerResponse {
  scanners: SystemScanner[]
  scanner: SystemScanner | null
  note?: string
}

export function listWarroomVerificationRuns(orgId: string) {
  return request<WarroomVerificationListResponse>(
    'GET',
    `/api/v1/code/orgs/${orgId}/warroom-verification/runs`,
  )
}

export function createWarroomVerificationRun(orgId: string, body: WarroomVerificationRunRequest) {
  return request<WarroomVerificationRunResponse>(
    'POST',
    `/api/v1/code/orgs/${orgId}/warroom-verification/runs`,
    body,
  )
}

export function getWarroomVerificationEvidence(orgId: string, runId: string) {
  return request<WarroomVerificationEvidenceResponse>(
    'GET',
    `/api/v1/code/orgs/${orgId}/warroom-verification/runs/${runId}/evidence`,
  )
}

export async function listProductVerificationScanner(): Promise<ProductVerificationScannerResponse> {
  const data = await request<{ scanners: SystemScanner[]; note?: string }>(
    'GET',
    '/api/v1/system/scanners',
  )
  return {
    ...data,
    scanner: (data.scanners ?? []).find((scanner) => scanner.id === PRODUCT_VERIFICATION_SCANNER_ID) ?? null,
  }
}

export function patchProductVerificationScanner(body: Partial<{ enabled: boolean; interval: string; notes: string }>) {
  return request<SystemScanner>(
    'PATCH',
    `/api/v1/system/scanners/${PRODUCT_VERIFICATION_SCANNER_ID}`,
    body,
  )
}

export function runProductVerificationScannerNow() {
  return request<{ ok: boolean; scanner: string }>(
    'POST',
    `/api/v1/system/scanners/${PRODUCT_VERIFICATION_SCANNER_ID}/run-now`,
  )
}
