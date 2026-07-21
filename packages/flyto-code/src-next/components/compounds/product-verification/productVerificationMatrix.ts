import { t } from '@lib/i18n'
import type {
  WarroomCampaignExecution,
  WarroomEvidenceArtifact,
  WarroomEvidencePack,
} from '@lib/engine'
import {
  formatGateScore,
  formatScore,
  normalizeAutomationModel,
  type EvidenceGateSummary,
} from './productVerificationModel'

export type VerificationMatrixStatus = 'passed' | 'captured' | 'blocked' | 'missing' | 'pending'

export type VerificationMatrixRowModel = {
  id: string
  title: string
  detail: string
  status: VerificationMatrixStatus
  evidence: string
  owner: string
}
export function buildVerificationMatrix(
  run: WarroomCampaignExecution | undefined,
  pack: WarroomEvidencePack | null,
  artifacts: WarroomEvidenceArtifact[],
  gate: EvidenceGateSummary,
): VerificationMatrixRowModel[] {
  const model = normalizeAutomationModel(pack, artifacts, gate)
  const artifactCompleteness = model.evidence_chain?.artifact_completeness ?? gate.artifactCompleteness
  const replayTotal = model.replay?.total ?? pack?.run?.results?.length ?? 0
  const replayFailed = model.replay?.failed ?? pack?.run?.results?.filter((step) => step.status === 'failed').length ?? 0
  const scenarioSteps = model.scenario_synthesis?.step_count ?? pack?.scenarios?.steps?.length ?? 0
  const graph = pack?.site_graph
  const stateCount = graph?.state_graph?.allowed_states?.length ?? graph?.pages?.flatMap((page) => page.states ?? []).length ?? 0
  const hasScreenshot = artifacts.some((artifact) => artifact.kind === 'screenshot' || artifact.mimeType?.startsWith('image/')) || !!model.evidence_chain?.has_screenshot
  const hasDom = artifacts.some((artifact) => artifact.kind === 'dom_snapshot') || !!model.evidence_chain?.has_dom_snapshot
  const hasNetwork = artifacts.some((artifact) => artifact.kind === 'network_log') || !!model.evidence_chain?.has_network_log
  const hasRunner = !!run?.runnerExecutionId
  const rbac = model.rbac_matrix
  const auth = model.authorization_gate
  const eventStream = model.event_stream
  const scheduler = model.scheduler_loop

  return [
    {
      id: 'backend',
      title: t('productVerification.matrixBackendTitle'),
      detail: t('productVerification.matrixBackendDetail'),
      status: auth?.fail_closed ? 'passed' : auth?.status && auth.status !== 'not_provided' ? 'captured' : 'pending',
      evidence: `${auth?.authority ?? 'flyto-engine'} · ${auth?.org_gate ?? 'requireOrgAccess'} · ${auth?.commercial_gate ?? 'requireCommercialAction'}`,
      owner: 'flyto-engine',
    },
    {
      id: 'api',
      title: t('productVerification.matrixApiTitle'),
      detail: t('productVerification.matrixApiDetail'),
      status: gate.verdict === 'blocked' ? 'blocked' : gate.hasGateMetadata ? 'captured' : 'pending',
      evidence: `${gate.verdict ?? t('common.notAvailable')} · ${formatGateScore(gate.score)}`,
      owner: 'flyto-engine',
    },
    {
      id: 'ui',
      title: t('productVerification.matrixUiTitle'),
      detail: t('productVerification.matrixUiDetail'),
      status: scenarioSteps > 0 && stateCount > 0 ? 'captured' : scenarioSteps > 0 ? 'pending' : 'missing',
      evidence: t('productVerification.matrixUiEvidence', { steps: scenarioSteps, states: stateCount }),
      owner: 'flyto-code',
    },
    {
      id: 'browser',
      title: t('productVerification.matrixBrowserTitle'),
      detail: t('productVerification.matrixBrowserDetail'),
      status: replayTotal === 0 ? 'pending' : replayFailed > 0 ? 'blocked' : 'passed',
      evidence: t('productVerification.matrixReplayEvidence', { passed: model.replay?.passed ?? 0, total: replayTotal, reliability: formatScore(model.replay?.reliability) }),
      owner: 'flyto-core',
    },
    {
      id: 'evidence',
      title: t('productVerification.matrixEvidenceTitle'),
      detail: t('productVerification.matrixEvidenceDetail'),
      status: artifactCompleteness?.complete ? 'passed' : artifactCompleteness ? 'missing' : hasScreenshot || hasDom || hasNetwork ? 'captured' : 'pending',
      evidence: t('productVerification.matrixArtifactEvidence', {
        screenshot: hasScreenshot ? t('productVerification.matrixArtifactScreenshot') : t('productVerification.matrixArtifactNoScreenshot'),
        dom: hasDom ? t('productVerification.matrixArtifactDom') : t('productVerification.matrixArtifactNoDom'),
        network: hasNetwork ? t('productVerification.matrixArtifactNetwork') : t('productVerification.matrixArtifactNoNetwork'),
        signature: run?.evidenceSig ?? t('common.notAvailable'),
      }),
      owner: 'flyto-engine / flyto-core',
    },
    {
      id: 'rbac',
      title: t('productVerification.matrixRbacTitle'),
      detail: t('productVerification.matrixRbacDetail'),
      status: rbac?.fail_open_disallowed && rbac?.fail_closed ? 'passed' : rbac?.status && rbac.status !== 'not_provided' ? 'blocked' : 'pending',
      evidence: t('productVerification.matrixRbacEvidence', { roles: rbac?.roles_tested?.length ?? 0, tenants: rbac?.tenant_pairs_tested ?? 0, isolation: rbac?.tenant_isolation ?? t('common.notAvailable') }),
      owner: 'flyto-engine',
    },
    {
      id: 'events',
      title: t('productVerification.matrixSseTitle'),
      detail: t('productVerification.matrixSseDetail'),
      status: eventStream?.fail_closed ? 'passed' : eventStream?.status && eventStream.status !== 'not_provided' ? 'captured' : 'pending',
      evidence: t('productVerification.matrixSseEvidence', { transport: eventStream?.transport || 'SSE', events: eventStream?.expected_events?.join(', ') || t('common.notAvailable'), observed: eventStream?.observed_count ?? 0 }),
      owner: 'flyto-engine / flyto-code',
    },
    {
      id: 'scheduler',
      title: t('productVerification.matrixSchedulerTitle'),
      detail: t('productVerification.matrixSchedulerDetail'),
      status: scheduler?.durable_job && hasRunner ? 'passed' : scheduler?.durable_job ? 'captured' : 'pending',
      evidence: t('productVerification.matrixSchedulerEvidence', { scanner: scheduler?.scanner_id || 'product_verification', runs: scheduler?.run_count ?? 0, failures: scheduler?.fail_count ?? 0 }),
      owner: 'flyto-engine',
    },
    {
      id: 'i18n',
      title: t('productVerification.matrixI18nTitle'),
      detail: t('productVerification.matrixI18nDetail'),
      status: 'captured',
      evidence: t('productVerification.matrixI18nEvidence'),
      owner: 'flyto-i18n / flyto-code',
    },
  ]
}

export function matrixStatusColor(status: VerificationMatrixStatus): 'default' | 'primary' | 'success' | 'error' | 'warning' {
  if (status === 'passed') return 'success'
  if (status === 'captured') return 'primary'
  if (status === 'blocked') return 'error'
  if (status === 'missing') return 'warning'
  return 'default'
}

export function matrixStatusTone(status: VerificationMatrixStatus) {
  if (status === 'passed') return 'success.main'
  if (status === 'captured') return 'primary.main'
  if (status === 'blocked') return 'error.main'
  if (status === 'missing') return 'warning.main'
  return 'text.secondary'
}

export function matrixStatusLabel(status: VerificationMatrixStatus) {
  if (status === 'passed') return t('productVerification.matrixStatusPassed')
  if (status === 'captured') return t('productVerification.matrixStatusCaptured')
  if (status === 'blocked') return t('productVerification.matrixStatusBlocked')
  if (status === 'missing') return t('productVerification.matrixStatusMissing')
  return t('productVerification.matrixStatusPending')
}
