import { t } from '@lib/i18n'
import type {
  WarroomArtifactCompleteness,
  WarroomAutomationTestModel,
  WarroomCampaignExecution,
  WarroomEvidenceArtifact,
  WarroomEvidenceFinding,
  WarroomEvidencePack,
  WarroomEvidenceScoreBreakdownItem,
  WarroomVerificationEvidenceResponse,
} from '@lib/engine'

export const deterministicRuleOrder = [
  'false_empty',
  'false_locked',
  'hidden_error',
  'ghost_api_type_a',
  'ghost_api_type_b',
  'ghost_api_type_c',
  'state_contradiction',
  'rbac_fail_open',
] as const

export type EvidenceGateSummary = {
  verdict?: string
  score?: number
  scoreBreakdown: Record<string, WarroomEvidenceScoreBreakdownItem>
  artifactCompleteness?: WarroomArtifactCompleteness
  blockers: string[]
  hasGateMetadata: boolean
}

export type DeterministicRuleSummary = {
  total: number
  rows: Array<{
    code: string
    label: string
    count: number
    status: string
  }>
}

export function normalizeAutomationModel(
  pack: WarroomEvidencePack | null,
  artifacts: WarroomEvidenceArtifact[],
  gate: EvidenceGateSummary,
): WarroomAutomationTestModel {
  if (pack?.automation_test_model) return pack.automation_test_model
  const graph = pack?.site_graph
  const scores = pack?.scores ?? graph?.scores ?? {}
  const replaySummary = pack?.run?.evaluation?.summary ?? pack?.run_evaluation?.summary ?? {}
  const replaySteps = pack?.run?.results ?? []
  const findings = normalizeEvidenceFindings(pack)
  const stateFindings = findings.filter((finding) => (finding.code ?? finding.type) === 'state_contradiction')
  const artifactCompleteness = gate.artifactCompleteness
  const artifactKinds = new Set(artifacts.map((artifact) => artifact.kind))
  const required = artifactCompleteness?.required ?? ['screenshot', 'dom_snapshot', 'network_log']
  const present = artifactCompleteness?.present ?? required.filter((kind) => artifactKinds.has(kind))
  return {
    schema_version: 'flyto.core.deterministic_verification.v1',
    legacy_schema_version: 'warroom.automation_test_model.fallback.v1',
    product_contract: 'flyto2.automated_product_testing.v1',
    product_surface: 'warroom',
    capability: 'automated_product_testing',
    engine_mode: {
      name: t('hardcoded.deterministic.verification.runtime.84242c34'),
      execution_mode: 'deterministic_evidence_first',
      llm_required: false,
      llm_role: 'optional_evidence_reviewer',
      fact_source: 'browser_dom_network_screenshot_sse',
      gate_authority: 'deterministic_evidence_gate',
      human_editable_yaml: true,
    },
    deterministic_contract: {
      inputs: ['site_graph', 'intent_graph', 'state_graph', 'api_graph', 'yaml_replay', 'browser_artifacts', 'event_stream'],
      outputs: ['evidence_pack', 'gate_verdict', 'readiness_score', 'state_contradictions', 'ghost_api_findings', 'replay_evidence'],
      llm_can_create_facts: false,
      llm_can_gate: false,
    },
    readiness_score: gate.score,
    coverage: {
      observed_paths: graph?.observed_paths ?? [],
      reachable_paths: graph?.reachable_paths ?? graph?.observed_paths ?? [],
      expected_paths: graph?.reachable_paths ?? graph?.observed_paths ?? [],
      blocked_paths: [],
      observed_coverage: readNumber(scores, 'observed_coverage') ?? 0,
      reachable_coverage: readNumber(scores, 'reachable_coverage') ?? 0,
      expected_coverage: readNumber(scores, 'reachable_coverage') ?? 0,
    },
    intent_graph: {
      count: graph?.intents?.length ?? 0,
      intents: graph?.intents ?? [],
    },
    scenario_synthesis: {
      schema_version: pack?.scenarios?.schema_version,
      name: pack?.scenarios?.name,
      step_count: pack?.scenarios?.steps?.length ?? 0,
      replayable_steps: pack?.scenarios?.steps?.filter((step) => step.module).length ?? 0,
      generated_from: pack?.scenarios?.generated_from,
    },
    replay: {
      ok: pack?.run?.replay_ok ?? pack?.run?.evaluation?.passed,
      total: readNumber(replaySummary, 'total') ?? replaySteps.length,
      passed: readNumber(replaySummary, 'passed') ?? replaySteps.filter((step) => step.status === 'passed').length,
      failed: readNumber(replaySummary, 'failed') ?? replaySteps.filter((step) => step.status === 'failed').length,
      reliability: readNumber(replaySummary, 'replay_reliability') ?? readNumber(scores, 'replay_reliability') ?? 0,
      steps: replaySteps,
    },
    ghost_api: {
      type_a_count: findings.filter((finding) => finding.code === 'ghost_api_type_a').length,
      type_b_count: findings.filter((finding) => finding.code === 'ghost_api_type_b').length,
      type_c_count: findings.filter((finding) => finding.code === 'ghost_api_type_c').length,
      type_a: [],
      type_b: [],
      type_c: [],
      has_findings: findings.some((finding) => String(finding.code ?? '').startsWith('ghost_api')),
    },
    deterministic_rules: {
      required: [...deterministicRuleOrder],
      counts: Object.fromEntries(deterministicRuleOrder.map((code) => [
        code,
        findings.filter((finding) => (finding.code ?? finding.type) === code).length,
      ])),
      samples: Object.fromEntries(deterministicRuleOrder.map((code) => [
        code,
        findings.filter((finding) => (finding.code ?? finding.type) === code).slice(0, 8),
      ])),
      has_blockers: deterministicRuleOrder.some((code) => findings.some((finding) => (finding.code ?? finding.type) === code)),
    },
    business_invariants: {
      state_contradictions: stateFindings.length,
      p0: readNumber(scores, 'p0') ?? 0,
      p1: readNumber(scores, 'p1') ?? 0,
      findings: stateFindings,
    },
    rbac_matrix: {
      status: 'not_provided',
      authority: 'flyto-engine',
      source: 'flyto-engine.requireOrgAccess+requireCommercialAction+verified_scope',
      action: 'scan:trigger',
      roles_required: ['owner', 'admin', 'member', 'viewer'],
      role_expectations: {
        owner: 'allow',
        admin: 'allow',
        member: 'allow',
        viewer: 'deny',
      },
      roles_tested: [],
      tenant_pairs_tested: 0,
      tenant_isolation: 'not_captured',
      fail_closed: false,
      fail_open_disallowed: false,
      frontend_authority: false,
      violations: [],
    },
    authorization_gate: {
      status: 'not_provided',
      authority: 'flyto-engine',
      org_gate: 'requireOrgAccess',
      commercial_gate: 'requireCommercialAction',
      scope_gate: 'verified_repo_or_domain',
      capability_gate: 'automated_product_testing',
      frontend_authority: false,
      fail_closed: false,
    },
    event_stream: {
      status: 'not_provided',
      transport: '',
      endpoint: '',
      expected_events: [],
      expected_payload_fields: [],
      observed_events: [],
      observed_count: 0,
      fail_closed: false,
      source: '',
    },
    scheduler_loop: {
      status: 'not_provided',
      scanner_id: '',
      authority: '',
      enabled: null,
      dispatch_source: '',
      manual_run_endpoint: '',
      scheduler_control_endpoint: '',
      durable_job: false,
      last_run_status: '',
      run_count: 0,
      fail_count: 0,
    },
    evidence_chain: {
      artifact_completeness: artifactCompleteness ?? {
        required,
        present,
        missing: required.filter((kind) => !present.includes(kind)),
        complete: required.every((kind) => present.includes(kind)),
        score: required.length ? present.length / required.length : 0,
      },
      has_screenshot: present.includes('screenshot'),
      has_dom_snapshot: present.includes('dom_snapshot'),
      has_network_log: present.includes('network_log'),
      evidence_signature_expected: true,
    },
    gate: {
      verdict: gate.verdict,
      score: gate.score,
      blockers: gate.blockers,
    },
  }
}

export function summarizeRuns(runs: WarroomCampaignExecution[]) {
  return {
    active: runs.filter((run) => run.status === 'dispatched' || run.status === 'running').length,
    withEvidence: runs.filter((run) => !!run.evidenceSig).length,
  }
}

export function targetHost(value?: string | null) {
  if (!value) return ''
  try {
    return new URL(value).host
  } catch {
    return value
  }
}

export function compactScope(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(', ')
}

export function formatVerificationDate(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export function ghostApiCount(pack: WarroomEvidencePack | null) {
  const ghost = pack?.automation_test_model?.ghost_api
  if (ghost) {
    return (ghost.type_a_count ?? 0) + (ghost.type_b_count ?? 0) + (ghost.type_c_count ?? 0)
  }
  return normalizeEvidenceFindings(pack).filter((finding) => String(finding.code ?? finding.type ?? '').startsWith('ghost_api')).length
}

export function normalizeEvidenceFindings(pack: WarroomEvidencePack | null): WarroomEvidenceFinding[] {
  if (!pack) return []
  if (Array.isArray(pack.findings)) return pack.findings
  if (Array.isArray(pack.site_graph?.findings)) return pack.site_graph.findings
  return []
}

export function normalizeEvidenceGate(
  data: WarroomVerificationEvidenceResponse | undefined,
  pack: WarroomEvidencePack | null,
): EvidenceGateSummary {
  const scoreBreakdown = data?.scoreBreakdown ?? pack?.score_breakdown ?? {}
  const artifactCompleteness = data?.artifactCompleteness ?? pack?.artifact_completeness
  const blockers = data?.gateBlockers ?? pack?.gate_blockers ?? []
  const verdict = data?.gateVerdict ?? pack?.gate_verdict
  const score = data?.gateScore ?? pack?.gate_score
  return {
    verdict,
    score,
    scoreBreakdown,
    artifactCompleteness,
    blockers,
    hasGateMetadata: Boolean(
      verdict ||
      typeof score === 'number' ||
      Object.keys(scoreBreakdown).length > 0 ||
      artifactCompleteness ||
      blockers.length > 0
    ),
  }
}

export function summarizeDeterministicRules(
  pack: WarroomEvidencePack | null,
  model: WarroomAutomationTestModel | undefined = pack?.automation_test_model,
): DeterministicRuleSummary {
  const findings = normalizeEvidenceFindings(pack)
  const counts = model?.deterministic_rules?.counts ?? {}
  const ghost = model?.ghost_api
  const rbac = model?.rbac_matrix
  const fallbackCounts = new Map<string, number>()
  for (const code of deterministicRuleOrder) {
    fallbackCounts.set(code, findings.filter((finding) => (finding.code ?? finding.type) === code).length)
  }
  if (ghost) {
    fallbackCounts.set('ghost_api_type_a', Math.max(fallbackCounts.get('ghost_api_type_a') ?? 0, ghost.type_a_count ?? 0))
    fallbackCounts.set('ghost_api_type_b', Math.max(fallbackCounts.get('ghost_api_type_b') ?? 0, ghost.type_b_count ?? 0))
    fallbackCounts.set('ghost_api_type_c', Math.max(fallbackCounts.get('ghost_api_type_c') ?? 0, ghost.type_c_count ?? 0))
  }
  if (rbac?.status && rbac.status !== 'not_provided' && rbac.fail_closed === false) {
    fallbackCounts.set('rbac_fail_open', Math.max(fallbackCounts.get('rbac_fail_open') ?? 0, 1))
  }

  const rows = deterministicRuleOrder.map((code) => {
    const count = typeof counts[code] === 'number' ? counts[code] : fallbackCounts.get(code) ?? 0
    return {
      code,
      label: formatScoreKey(code),
      count,
      status: count > 0 ? 'blocked' : 'clear',
    }
  })
  return {
    rows,
    total: rows.reduce((sum, row) => sum + row.count, 0),
  }
}

export function formatScore(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'n/a'
  if (value <= 1) return `${Math.round(value * 100)}%`
  return String(value)
}

export function formatGateScore(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'n/a'
  return `${Number.isInteger(value) ? value : value.toFixed(1)} / 100`
}

export function formatScoreBreakdownValue(value: WarroomEvidenceScoreBreakdownItem) {
  const parts: string[] = []
  if (typeof value.points === 'number' || typeof value.max === 'number') {
    parts.push(`${formatNumberValue(value.points)} / ${formatNumberValue(value.max)} pts`)
  }
  if (typeof value.value === 'number') {
    parts.push(`value ${formatScore(value.value)}`)
  }
  if (typeof value.threshold === 'number') {
    parts.push(`threshold ${formatScore(value.threshold)}`)
  }
  if (typeof value.complete === 'boolean') {
    parts.push(value.complete ? 'complete' : 'incomplete')
  }
  if (value.label) {
    parts.push(value.label)
  }
  return parts.join(' · ') || 'n/a'
}

export function formatNumberValue(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '0'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function formatScoreKey(value: string) {
  return value
    .split('_')
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : part)
    .join(' ')
}

export function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export function readJSONNumber(value: unknown, key: string) {
  if (!value || typeof value !== 'object') return undefined
  const candidate = (value as Record<string, unknown>)[key]
  return typeof candidate === 'number' ? candidate : undefined
}

export function readNumber(value: unknown, key: string) {
  if (!value || typeof value !== 'object') return undefined
  const candidate = (value as Record<string, unknown>)[key]
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : undefined
}

export function jsonPreview(value: unknown) {
  try {
    const text = JSON.stringify(value, null, 2)
    return text.length > 12_000 ? `${text.slice(0, 12_000)}\n... truncated ...` : text
  } catch {
    return String(value ?? 'not available')
  }
}

export function artifactPreview(artifact: WarroomEvidenceArtifact | undefined) {
  if (!artifact) return 'artifact: not captured'
  if (artifact.json !== undefined) return jsonPreview(artifact.json)
  if (artifact.previewDataUrl) return `${artifact.name}\n${artifact.mimeType}\npreview: inline image`
  if (artifact.url) return `${artifact.name}\n${artifact.mimeType}\nblob: ${artifact.url}`
  return `${artifact.name}\n${artifact.mimeType}\n${formatBytes(artifact.sizeBytes)}`
}

export function scenarioPreview(scenario: WarroomEvidencePack['scenarios'] | undefined) {
  if (!scenario) return 'scenario: pending'
  const lines = [
    `name: ${scenario.name ?? t('hardcoded.warroom.generated.regression.5446bc83')}`,
    `schema_version: ${scenario.schema_version ?? 'unknown'}`,
    `target: ${scenario.target ?? 'unknown'}`,
    `generated_from: ${scenario.generated_from ?? 'unknown'}`,
    'steps:',
  ]
  const steps = scenario.steps ?? []
  steps.slice(0, 16).forEach((step, index) => {
    lines.push(`  - id: ${step.id ?? `step_${index + 1}`}`)
    lines.push(`    module: ${step.module ?? 'unknown'}`)
    const params = summarizeScenarioParams(step.params)
    if (params) lines.push(`    params: ${params}`)
    if (step.assertions?.length) lines.push(`    assertions: ${step.assertions.length}`)
  })
  if (steps.length > 16) lines.push(`  # ${steps.length - 16} more steps`)
  return lines.join('\n')
}

export function summarizeScenarioParams(params: Record<string, unknown> | undefined) {
  if (!params) return ''
  if (typeof params.url === 'string') return `{ url: ${params.url} }`
  if (typeof params.selector === 'string') return `{ selector: ${params.selector} }`
  if (typeof params.duration_ms === 'number') return `{ duration_ms: ${params.duration_ms} }`
  if (typeof params.script === 'string') return '{ script: browser assertion }'
  const keys = Object.keys(params).slice(0, 3)
  return keys.length > 0 ? `{ ${keys.join(', ')} }` : ''
}
