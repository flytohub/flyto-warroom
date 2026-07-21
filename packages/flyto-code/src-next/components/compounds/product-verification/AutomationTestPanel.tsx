import type { ReactNode } from 'react'
import { Alert, Box, Chip, Paper, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { Activity, AlertTriangle, Clock, FileJson, GitBranch, Network, Play, ScrollText, ShieldCheck } from 'lucide-react'

import { InlineErrorNotice } from '@atoms/InlineErrorNotice'
import { useExperience } from '@/contexts/ExperienceContext'
import { t } from '@lib/i18n'
import type {
  WarroomArtifactCompleteness,
  WarroomAutomationTestModel,
  WarroomCampaignExecution,
  WarroomEvidenceArtifact,
  WarroomEvidencePack,
} from '@lib/engine'
import {
  formatGateScore,
  formatScore,
  formatScoreKey,
  normalizeAutomationModel,
  readNumber,
  scenarioPreview,
  summarizeDeterministicRules,
  targetHost,
  type DeterministicRuleSummary,
  type EvidenceGateSummary,
} from './productVerificationModel'
import {
  buildVerificationMatrix,
  matrixStatusLabel,
  matrixStatusTone,
  type VerificationMatrixRowModel,
} from './productVerificationMatrix'
import { VerificationMatrixRow } from './VerificationMatrixRow'
import {
  CodePreview,
  ContractRow,
  EvidenceField,
  FindingList,
  SectionHeader,
  TechCorners,
} from './productVerificationPrimitives'
import {
  resolveVerificationToneColor as resolveToneColor,
  verificationStatusColor as statusColor,
} from './productVerificationPresentation'

export function AutomationTestPanel({
  run,
  pack,
  artifacts,
  gate,
}: {
  run: WarroomCampaignExecution | undefined
  pack: WarroomEvidencePack | null
  artifacts: WarroomEvidenceArtifact[]
  gate: EvidenceGateSummary
}) {
  const { mode } = useExperience()
  const scenario = pack?.scenarios
  const model = normalizeAutomationModel(pack, artifacts, gate)
  const scenarioSteps = scenario?.steps ?? []
  const replayResults = model.replay?.steps ?? pack?.run?.results ?? []
  const replaySummary = pack?.run?.evaluation?.summary ?? pack?.run_evaluation?.summary ?? {}
  const replayReliability = model.replay?.reliability ?? readNumber(replaySummary, 'replay_reliability') ?? pack?.scores?.replay_reliability
  const p0 = model.business_invariants?.p0 ?? readNumber(replaySummary, 'p0') ?? readNumber(pack?.scores, 'p0') ?? 0
  const p1 = model.business_invariants?.p1 ?? readNumber(replaySummary, 'p1') ?? readNumber(pack?.scores, 'p1') ?? 0
  const artifactCompleteness = model.evidence_chain?.artifact_completeness ?? gate.artifactCompleteness
  const artifactKinds = new Set(artifacts.map((artifact) => artifact.kind))
  const requiredArtifacts = artifactCompleteness?.required ?? ['screenshot', 'dom_snapshot', 'network_log']
  const coverage = model.coverage
  const ghostApi = model.ghost_api
  const invariants = model.business_invariants
  const deterministicRules = summarizeDeterministicRules(pack, model)
  const rbac = model.rbac_matrix
  const eventStream = model.event_stream
  const schedulerLoop = model.scheduler_loop
  const scenarioModel = model.scenario_synthesis
  const engineMode = model.engine_mode
  const deterministicContract = model.deterministic_contract
  const authorizationGate = model.authorization_gate
  const matrixRows = buildVerificationMatrix(run, pack, artifacts, gate)

  if (!run) {
    if (mode === 'manager') {
      return <AutomationManagerEmptyState />
    }

    return (
      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<Play size={16} />} title={t('productVerification.automationTests')} />
        <Alert severity="info" sx={{ m: 2 }}>
          {t('productVerification.noAutomationRun')}
        </Alert>
      </Paper>
    )
  }

  if (mode === 'manager') {
    return (
      <AutomationManagerTestPanel
        run={run}
        model={model}
        artifacts={artifacts}
        gate={gate}
        matrixRows={matrixRows}
        artifactCompleteness={artifactCompleteness}
        requiredArtifacts={requiredArtifacts}
        replayReliability={replayReliability}
        p0={p0}
        p1={p1}
        deterministicRules={deterministicRules}
      />
    )
  }

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<ShieldCheck size={16} />} title={t('productVerification.testingMatrixTitle')} />
        <Box sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, lineHeight: 1.55 }}>
            {t('productVerification.testingMatrixSubtitle')}
          </Typography>
          <Box sx={{ display: 'grid', gap: 1 }}>
            {matrixRows.map((row) => (
              <VerificationMatrixRow key={row.id} row={row} />
            ))}
          </Box>
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<Play size={16} />} title={t('productVerification.automationTests')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
          <EvidenceField label={t('hardcoded.automation.verdict.a8812f61')} value={gate.verdict ?? pack?.verdict ?? run.verdict ?? run.status} />
          <EvidenceField label={t('hardcoded.automation.readiness.ed06a24e')} value={typeof model.readiness_score === 'number' ? `${model.readiness_score} / 100` : 'n/a'} />
          <EvidenceField label={t('hardcoded.replay.reliability.0d427d49')} value={formatScore(replayReliability)} />
          <EvidenceField label={t('hardcoded.replay.steps.73b44ac4')} value={`${model.replay?.passed ?? pack?.run?.passed ?? 0}/${model.replay?.total ?? pack?.run?.total ?? scenarioSteps.length} passed`} />
          <EvidenceField label="P0/P1 findings" value={`${p0} / ${p1}`} />
          <EvidenceField label={t('hardcoded.scenario.contract.b9a30319')} value={scenarioModel?.schema_version ?? scenario?.schema_version ?? t('productVerification.infoPending')} />
          <EvidenceField label={t('productVerification.runnerExecution')} value={run.runnerExecutionId ?? t('productVerification.infoNoRunner')} />
          <EvidenceField label={t('productVerification.evidenceSig')} value={run.evidenceSig ?? t('productVerification.infoPending')} />
          <EvidenceField label="Artifacts" value={`${artifactCompleteness?.present?.length ?? artifacts.length}/${requiredArtifacts.length} ${artifactCompleteness?.complete ? 'complete' : 'captured'}`} />
        </Box>
        {gate.blockers.length > 0 && (
          <Box sx={{ mx: 2, mb: 2 }}>
            <InlineErrorNotice error={gate.blockers.join(', ')} />
          </Box>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<ShieldCheck size={16} />} title={t('productVerification.deterministicTestingContract')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
          <EvidenceField label={t('hardcoded.core.schema.8a8cd36b')} value={model.schema_version ?? 'n/a'} />
          <EvidenceField label={t('hardcoded.product.contract.6ff23173')} value={model.product_contract ?? 'n/a'} />
          <EvidenceField label={t('hardcoded.legacy.schema.f3f2c44d')} value={model.legacy_schema_version ?? 'n/a'} />
          <EvidenceField label={t('hardcoded.product.surface.0e539245')} value={model.product_surface ?? 'warroom'} />
          <EvidenceField label="Capability" value={model.capability ?? 'automated_product_testing'} />
          <EvidenceField label={t('hardcoded.execution.mode.cb9e185b')} value={engineMode?.execution_mode ?? 'deterministic_evidence_first'} />
          <EvidenceField label={t('hardcoded.llm.required.f5c8ae77')} value={engineMode?.llm_required ? 'yes' : 'no'} />
          <EvidenceField label={t('hardcoded.llm.role.5234f133')} value={engineMode?.llm_role ?? 'optional_evidence_reviewer'} />
          <EvidenceField label={t('hardcoded.fact.source.83fc2c0d')} value={engineMode?.fact_source ?? 'browser_dom_network_screenshot_sse'} />
          <EvidenceField label={t('hardcoded.evidence.gate.authority.5c079bb2')} value={engineMode?.gate_authority ?? 'deterministic_evidence_gate'} />
          <EvidenceField label={t('hardcoded.authorization.gate.40b62298')} value={authorizationGate?.status ?? 'not_provided'} />
          <EvidenceField label={t('hardcoded.org.gate.0cfb8640')} value={authorizationGate?.org_gate ?? 'requireOrgAccess'} />
          <EvidenceField label={t('hardcoded.scope.gate.f4208e7f')} value={authorizationGate?.scope_gate ?? 'verified_repo_or_domain'} />
          <EvidenceField label={t('hardcoded.commercial.gate.00d07aec')} value={authorizationGate?.commercial_gate ?? 'requireCommercialAction'} />
          <EvidenceField label={t('hardcoded.frontend.authority.730d6a6d')} value={authorizationGate?.frontend_authority ? 'yes' : 'no'} />
          <EvidenceField label={t('hardcoded.human.editable.yaml.29ee68c2')} value={engineMode?.human_editable_yaml === false ? 'no' : 'yes'} />
          <EvidenceField label="Inputs" value={(deterministicContract?.inputs ?? []).slice(0, 5).join(', ') || 'site_graph, intent_graph, state_graph'} />
          <EvidenceField label="Outputs" value={(deterministicContract?.outputs ?? []).slice(0, 5).join(', ') || 'evidence_pack, gate_verdict'} />
          <EvidenceField label={t('hardcoded.llm.can.gate.9378ad6b')} value={deterministicContract?.llm_can_gate ? 'yes' : 'no'} />
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<GitBranch size={16} />} title={t('productVerification.coverageModel')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
          <EvidenceField label={t('hardcoded.observed.coverage.cbdbdf95')} value={formatScore(coverage?.observed_coverage)} />
          <EvidenceField label={t('hardcoded.reachable.coverage.e4e2178c')} value={formatScore(coverage?.reachable_coverage)} />
          <EvidenceField label={t('hardcoded.expected.coverage.3af2c1d5')} value={formatScore(coverage?.expected_coverage)} />
          <EvidenceField label={t('hardcoded.observed.paths.bb13018a')} value={String(coverage?.observed_paths?.length ?? pack?.site_graph?.observed_paths?.length ?? 0)} />
          <EvidenceField label={t('hardcoded.reachable.paths.c3733d97')} value={String(coverage?.reachable_paths?.length ?? pack?.site_graph?.reachable_paths?.length ?? 0)} />
          <EvidenceField label={t('hardcoded.blocked.paths.46af395f')} value={(coverage?.blocked_paths ?? []).slice(0, 4).join(', ') || 'none'} />
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<AlertTriangle size={16} />} title={t('productVerification.deterministicRules')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
          {deterministicRules.rows.map((row) => (
            <EvidenceField key={row.code} label={row.label} value={`${row.count} ${row.status}`} />
          ))}
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<AlertTriangle size={16} />} title={t('productVerification.ghostApiAndInvariants')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={850}>{t('hardcoded.ghost.api.195c6b9a')}</Typography>
            <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}>
              <EvidenceField label={t('hardcoded.type.a.b930ca67')} value={String(ghostApi?.type_a_count ?? 0)} />
              <EvidenceField label={t('hardcoded.type.b.08e68397')} value={String(ghostApi?.type_b_count ?? 0)} />
              <EvidenceField label={t('hardcoded.type.c.7d87900e')} value={String(ghostApi?.type_c_count ?? 0)} />
            </Box>
            <GhostApiSampleList model={model} />
          </Box>
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={850}>{t('hardcoded.business.invariants.2f08c7f7')}</Typography>
            <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1 }}>
              <EvidenceField label="Contradictions" value={String(invariants?.state_contradictions ?? 0)} />
              <EvidenceField label="P0" value={String(invariants?.p0 ?? 0)} />
              <EvidenceField label="P1" value={String(invariants?.p1 ?? 0)} />
            </Box>
            <FindingList findings={invariants?.findings ?? []} />
          </Box>
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<ShieldCheck size={16} />} title={t('productVerification.rbacMatrix')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))', xl: 'repeat(5, minmax(0, 1fr))' }, gap: 1.25 }}>
          <EvidenceField label="Status" value={rbac?.status ?? 'not_provided'} />
          <EvidenceField label={t('hardcoded.roles.required.c88eeb73')} value={(rbac?.roles_required ?? ['owner', 'admin', 'member', 'viewer']).join(', ')} />
          <EvidenceField label={t('hardcoded.roles.tested.4cdbf869')} value={(rbac?.roles_tested ?? []).join(', ') || 'none'} />
          <EvidenceField label={t('hardcoded.role.expectations.a3b96fd9')} value={Object.entries(rbac?.role_expectations ?? {}).map(([role, verdict]) => `${role}:${verdict}`).join(', ') || 'not_provided'} />
          <EvidenceField label={t('hardcoded.tenant.pairs.36477260')} value={String(rbac?.tenant_pairs_tested ?? 0)} />
          <EvidenceField label={t('hardcoded.tenant.isolation.f9d078cc')} value={rbac?.tenant_isolation ?? 'not_provided'} />
          <EvidenceField label={t('hardcoded.fail.closed.9f590049')} value={rbac?.fail_closed ? 'yes' : 'no'} />
          <EvidenceField label={t('hardcoded.open.gate.disallowed.fa66f691')} value={rbac?.fail_open_disallowed ? 'yes' : 'no'} />
          <EvidenceField label={t('hardcoded.frontend.authority.730d6a6d')} value={rbac?.frontend_authority ? 'yes' : 'no'} />
        </Box>
        {rbac?.violations && rbac.violations.length > 0 && (
          <Box sx={{ mx: 2, mb: 2 }}>
            <InlineErrorNotice error={rbac.violations.map(String).join(', ')} />
          </Box>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<Network size={16} />} title={t('productVerification.eventStreamModel')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
          <EvidenceField label="Status" value={eventStream?.status ?? 'not_provided'} />
          <EvidenceField label="Transport" value={eventStream?.transport ?? 'n/a'} />
          <EvidenceField label={t('hardcoded.expected.events.fc58c39b')} value={(eventStream?.expected_events ?? []).join(', ') || 'none'} />
          <EvidenceField label={t('hardcoded.payload.fields.2ee6dcc5')} value={(eventStream?.expected_payload_fields ?? []).join(', ') || 'none'} />
          <EvidenceField label="Endpoint" value={eventStream?.endpoint ?? 'n/a'} />
          <EvidenceField label={t('hardcoded.observed.events.d38e740b')} value={String(eventStream?.observed_count ?? eventStream?.observed_events?.length ?? 0)} />
          <EvidenceField label={t('hardcoded.fail.closed.9f590049')} value={eventStream?.fail_closed ? 'yes' : 'no'} />
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<Clock size={16} />} title={t('productVerification.schedulerLoopModel')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
          <EvidenceField label="Status" value={schedulerLoop?.status ?? 'not_provided'} />
          <EvidenceField label="Scanner" value={schedulerLoop?.scanner_id ?? 'n/a'} />
          <EvidenceField label={t('hardcoded.verifier.authority.34f923ad')} value={schedulerLoop?.authority ?? 'n/a'} />
          <EvidenceField label={t('hardcoded.dispatch.source.66865c0c')} value={schedulerLoop?.dispatch_source ?? 'n/a'} />
          <EvidenceField label={t('hardcoded.durable.job.94c5dfed')} value={schedulerLoop?.durable_job ? 'yes' : 'no'} />
          <EvidenceField label="Enabled" value={schedulerLoop?.enabled == null ? 'unknown' : schedulerLoop.enabled ? 'yes' : 'no'} />
          <EvidenceField label={t('hardcoded.run.count.c0f5ec35')} value={String(schedulerLoop?.run_count ?? 0)} />
          <EvidenceField label={t('hardcoded.fail.count.b2b54226')} value={String(schedulerLoop?.fail_count ?? 0)} />
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<ScrollText size={16} />} title={t('productVerification.yamlReplayContract')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 0.72fr) minmax(320px, 0.28fr)' }, gap: 1.25 }}>
          <Box sx={{ minWidth: 0 }}>
            <CodePreview value={scenarioPreview(scenario)} />
          </Box>
          <Stack spacing={1}>
            <EvidenceField label={t('hardcoded.scenario.name.38b40843')} value={scenario?.name ?? 'pending'} />
            <EvidenceField label="Target" value={scenario?.target ?? run.targetUrl} />
            <EvidenceField label={t('hardcoded.generated.from.3a6df392')} value={scenario?.generated_from ?? 'pending'} />
            <EvidenceField label={t('hardcoded.step.count.719237f6')} value={String(scenarioSteps.length)} />
          </Stack>
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<Activity size={16} />} title={t('productVerification.replayTimeline')} />
        {replayResults.length === 0 ? (
          <Alert severity="info" sx={{ m: 2 }}>
            {t('productVerification.noReplayResults')}
          </Alert>
        ) : (
          <Box sx={{ p: 2, display: 'grid', gap: 1 }}>
            {replayResults.map((step, index) => (
              <ReplayStepRow key={`${step.id ?? step.name ?? index}-${index}`} step={step} index={index} />
            ))}
          </Box>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<Network size={16} />} title={t('productVerification.automationEvidenceChain')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
          {requiredArtifacts.map((kind) => (
            <EvidenceField
              key={kind}
              label={formatScoreKey(kind)}
              value={artifactKinds.has(kind) || artifactCompleteness?.present?.includes(kind) ? 'captured' : 'missing'}
            />
          ))}
        </Box>
      </Paper>
    </Stack>
  )
}

function AutomationManagerEmptyState() {
  const waitingRows = [
    {
      icon: <Network size={15} />,
      title: t('productVerification.targetUrl'),
      detail: t('productVerification.infoEnterCustomerUrl'),
      tone: 'info.main',
    },
    {
      icon: <Activity size={15} />,
      title: t('productVerification.runnerExecution'),
      detail: t('productVerification.infoNoRunner'),
      tone: 'primary.main',
    },
    {
      icon: <FileJson size={15} />,
      title: t('productVerification.tabEvidencePack'),
      detail: t('productVerification.evidenceWaitingForRunner'),
      tone: 'success.main',
    },
    {
      icon: <ShieldCheck size={15} />,
      title: t('productVerification.gateVerdict'),
      detail: t('productVerification.infoPending'),
      tone: 'warning.main',
    },
  ]

  return (
    <Stack spacing={1.35} sx={{ minHeight: '100%', pb: 0.5 }}>
      <Paper
        variant="outlined"
        sx={{
          borderRadius: 1,
          overflow: 'hidden',
          position: 'relative',
          borderColor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.4 : 0.28),
          bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.78 : 0.95),
          backgroundImage: (theme) =>
            `linear-gradient(90deg, ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.18 : 0.08)}, transparent 42%),
             linear-gradient(${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.07 : 0.035)} 1px, transparent 1px),
             linear-gradient(90deg, ${alpha(theme.palette.info.main, theme.palette.mode === 'dark' ? 0.055 : 0.03)} 1px, transparent 1px)`,
          backgroundSize: 'auto, 28px 28px, 28px 28px',
        }}
      >
        <TechCorners tone="primary.main" />
        <Box sx={{ position: 'relative', zIndex: 2, p: { xs: 1.5, md: 2 } }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', lg: 'center' }}>
            <Box sx={{ minWidth: 0 }}>
              <Chip size="small" icon={<ShieldCheck size={14} />} label={t('productVerification.automationTests')} sx={{ height: 24, fontWeight: 900 }} />
              <Typography variant="h5" sx={{ mt: 0.8, fontWeight: 950, lineHeight: 1.12, letterSpacing: 0 }}>
                {t('productVerification.testingMatrixTitle')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.45, maxWidth: 820, lineHeight: 1.55 }}>
                {t('productVerification.noAutomationRun')}
              </Typography>
            </Box>
            <Box
              sx={{
                minWidth: { xs: 0, lg: 260 },
                border: 1,
                borderColor: (theme) => alpha(theme.palette.warning.main, theme.palette.mode === 'dark' ? 0.34 : 0.24),
                borderRadius: 1,
                p: 1.25,
                bgcolor: (theme) => alpha(theme.palette.warning.main, theme.palette.mode === 'dark' ? 0.09 : 0.06),
              }}
            >
              <Typography variant="caption" color="text.secondary" fontWeight={850}>
                {t('productVerification.overviewNextAction')}
              </Typography>
              <Typography variant="body1" sx={{ mt: 0.25, fontWeight: 950, color: 'warning.main' }}>
                {t('productVerification.infoEnterCustomerUrl')}
              </Typography>
            </Box>
          </Stack>
        </Box>
      </Paper>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 0.64fr) minmax(320px, 0.36fr)' }, gap: 1.25, flex: 1, minHeight: 0 }}>
        <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden', minWidth: 0 }}>
          <SectionHeader icon={<GitBranch size={16} />} title={t('productVerification.evidencePipeline')} />
          <Box sx={{ p: 1.5, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 0.85 }}>
            {waitingRows.map((row) => (
              <Box
                key={row.title}
                sx={{
                  border: 1,
                  borderColor: (theme) => alpha(resolveToneColor(theme, row.tone), theme.palette.mode === 'dark' ? 0.28 : 0.2),
                  borderRadius: 1,
                  p: 1,
                  minHeight: 118,
                  display: 'grid',
                  gridTemplateRows: 'auto minmax(0, 1fr)',
                  gap: 1,
                  bgcolor: (theme) => alpha(resolveToneColor(theme, row.tone), theme.palette.mode === 'dark' ? 0.075 : 0.045),
                }}
              >
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <Box sx={{ color: row.tone, display: 'flex' }}>{row.icon}</Box>
                  <Typography variant="body2" fontWeight={950} noWrap title={row.title}>
                    {row.title}
                  </Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.55, alignSelf: 'end' }}>
                  {row.detail}
                </Typography>
              </Box>
            ))}
          </Box>
        </Paper>

        <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden', minWidth: 0 }}>
          <SectionHeader icon={<AlertTriangle size={16} />} title={t('productVerification.overviewNextAction')} />
          <Box sx={{ p: 1.5, display: 'grid', gap: 0.85 }}>
            {[
              t('productVerification.targetUrl'),
              t('productVerification.runnerExecution'),
              t('productVerification.tabEvidencePack'),
              t('productVerification.gateVerdict'),
            ].map((label) => (
              <Box
                key={label}
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 1,
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  gap: 1,
                  alignItems: 'center',
                }}
              >
                <Typography variant="body2" fontWeight={850} noWrap title={label}>
                  {label}
                </Typography>
                <Chip size="small" label={t('productVerification.infoPending')} sx={{ height: 22, fontWeight: 900 }} />
              </Box>
            ))}
          </Box>
        </Paper>
      </Box>
    </Stack>
  )
}

function AutomationManagerTestPanel({
  run,
  model,
  artifacts,
  gate,
  matrixRows,
  artifactCompleteness,
  requiredArtifacts,
  replayReliability,
  p0,
  p1,
  deterministicRules,
}: {
  run: WarroomCampaignExecution
  model: WarroomAutomationTestModel
  artifacts: WarroomEvidenceArtifact[]
  gate: EvidenceGateSummary
  matrixRows: VerificationMatrixRowModel[]
  artifactCompleteness: WarroomArtifactCompleteness | undefined
  requiredArtifacts: string[]
  replayReliability: number | undefined
  p0: number
  p1: number
  deterministicRules: DeterministicRuleSummary
}) {
  const blockedRows = matrixRows.filter((row) => row.status === 'blocked' || row.status === 'missing')
  const readyRows = matrixRows.filter((row) => row.status === 'passed' || row.status === 'captured')
  const pendingRows = matrixRows.filter((row) => row.status === 'pending')
  const artifactPresent = artifactCompleteness?.present?.length ?? artifacts.length
  const artifactTotal = requiredArtifacts.length || Math.max(artifactPresent, 1)
  const artifactPercent = Math.min(100, Math.round((artifactPresent / artifactTotal) * 100))
  const readinessScore = typeof model.readiness_score === 'number'
    ? Math.round(model.readiness_score)
    : typeof gate.score === 'number'
      ? Math.round(gate.score)
      : undefined
  const replayPassed = model.replay?.passed ?? 0
  const replayTotal = model.replay?.total ?? 0
  const replayPercent = replayTotal > 0 ? Math.round((replayPassed / replayTotal) * 100) : undefined
  const gateBlocked = (gate.verdict ?? run.verdict ?? run.status).toLowerCase().includes('block') || blockedRows.length > 0 || gate.blockers.length > 0
  const decisionTone = gateBlocked ? 'error.main' : pendingRows.length > 0 ? 'warning.main' : 'success.main'
  const nextAction = gateBlocked
    ? t('productVerification.overviewResolveBlockers')
    : artifactCompleteness && !artifactCompleteness.complete
      ? t('hardcoded.missing.artifacts.d17dd24b')
      : t('productVerification.overviewReviewEvidence')
  const coverage = model.coverage
  const coverageSignals = [
    {
      label: t('hardcoded.observed.coverage.cbdbdf95'),
      value: coverage?.observed_coverage,
      tone: 'info.main',
    },
    {
      label: t('hardcoded.reachable.coverage.e4e2178c'),
      value: coverage?.reachable_coverage,
      tone: gateBlocked ? 'warning.main' : 'success.main',
    },
    {
      label: t('hardcoded.expected.coverage.3af2c1d5'),
      value: coverage?.expected_coverage,
      tone: 'primary.main',
    },
  ]
  const assuranceRows = [
    {
      icon: <ShieldCheck size={15} />,
      title: t('productVerification.gateVerdict'),
      value: gate.verdict ?? run.verdict ?? run.status,
      detail: formatGateScore(gate.score),
      tone: decisionTone,
      progress: readinessScore,
    },
    {
      icon: <Activity size={15} />,
      title: t('hardcoded.replay.reliability.0d427d49'),
      value: formatScore(replayReliability),
      detail: `${replayPassed}/${replayTotal || matrixRows.length} ${t('productVerification.matrixStatusPassed')}`,
      tone: replayReliability == null ? 'text.secondary' : replayReliability >= 0.95 ? 'success.main' : 'warning.main',
      progress: replayReliability == null ? replayPercent : Math.round((replayReliability <= 1 ? replayReliability * 100 : replayReliability)),
    },
    {
      icon: <FileJson size={15} />,
      title: t('productVerification.tabEvidencePack'),
      value: `${artifactPresent}/${artifactTotal}`,
      detail: artifactCompleteness?.complete ? t('productVerification.infoEvidenceComplete') : (artifactCompleteness?.missing ?? []).join(', ') || t('productVerification.infoPending'),
      tone: artifactCompleteness?.complete ? 'success.main' : 'warning.main',
      progress: artifactPercent,
    },
    {
      icon: <Network size={15} />,
      title: t('productVerification.eventStreamModel'),
      value: model.event_stream?.status ?? t('productVerification.infoPending'),
      detail: `${model.event_stream?.observed_count ?? model.event_stream?.observed_events?.length ?? 0} ${t('hardcoded.observed.events.d38e740b')}`,
      tone: model.event_stream?.fail_closed ? 'success.main' : model.event_stream?.status ? 'primary.main' : 'text.secondary',
      progress: model.event_stream?.fail_closed ? 100 : model.event_stream?.status ? 64 : 24,
    },
    {
      icon: <Clock size={15} />,
      title: t('productVerification.schedulerLoopModel'),
      value: model.scheduler_loop?.durable_job ? t('productVerification.matrixStatusCaptured') : t('productVerification.infoPending'),
      detail: t('productVerification.matrixSchedulerEvidence', {
        scanner: model.scheduler_loop?.scanner_id || 'product_verification',
        runs: model.scheduler_loop?.run_count ?? 0,
        failures: model.scheduler_loop?.fail_count ?? 0,
      }),
      tone: model.scheduler_loop?.durable_job ? 'success.main' : 'warning.main',
      progress: model.scheduler_loop?.durable_job ? 88 : 36,
    },
  ]
  const visibleBlockers = gate.blockers.length > 0
    ? gate.blockers.slice(0, 4)
    : blockedRows.slice(0, 4).map((row) => `${row.title}: ${matrixStatusLabel(row.status)}`)

  return (
    <Stack spacing={1.35} sx={{ minHeight: '100%', pb: 0.5 }}>
      <Paper
        variant="outlined"
        sx={{
          borderRadius: 1,
          overflow: 'hidden',
          position: 'relative',
          borderColor: (theme) => alpha(resolveToneColor(theme, decisionTone), theme.palette.mode === 'dark' ? 0.42 : 0.32),
          bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.78 : 0.94),
          backgroundImage: (theme) =>
            `linear-gradient(90deg, ${alpha(resolveToneColor(theme, decisionTone), theme.palette.mode === 'dark' ? 0.16 : 0.08)}, transparent 38%),
             linear-gradient(${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.07 : 0.035)} 1px, transparent 1px),
             linear-gradient(90deg, ${alpha(theme.palette.info.main, theme.palette.mode === 'dark' ? 0.055 : 0.03)} 1px, transparent 1px)`,
          backgroundSize: 'auto, 28px 28px, 28px 28px',
        }}
      >
        <TechCorners tone={decisionTone} />
        <Box sx={{ position: 'relative', zIndex: 2, p: { xs: 1.5, md: 2 } }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', lg: 'center' }}>
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Chip size="small" icon={<ShieldCheck size={14} />} label={t('productVerification.automationTests')} sx={{ height: 24, fontWeight: 900 }} />
                <Chip
                  size="small"
                  label={`${readyRows.length}/${matrixRows.length} ${t('productVerification.matrixStatusCaptured')}`}
                  sx={{
                    height: 24,
                    fontWeight: 900,
                    color: decisionTone,
                    bgcolor: (theme) => alpha(resolveToneColor(theme, decisionTone), theme.palette.mode === 'dark' ? 0.16 : 0.1),
                  }}
                />
              </Stack>
              <Typography variant="h5" sx={{ mt: 0.8, fontWeight: 950, lineHeight: 1.12, letterSpacing: 0 }}>
                {t('productVerification.testingMatrixTitle')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.45, maxWidth: 840, lineHeight: 1.55 }}>
                {t('productVerification.testingMatrixSubtitle')}
              </Typography>
            </Box>
            <Box
              sx={{
                minWidth: { xs: 0, lg: 280 },
                border: 1,
                borderColor: (theme) => alpha(resolveToneColor(theme, decisionTone), theme.palette.mode === 'dark' ? 0.38 : 0.26),
                borderRadius: 1,
                p: 1.25,
                bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.56 : 0.8),
              }}
            >
              <Typography variant="caption" color="text.secondary" fontWeight={850}>
                {t('productVerification.overviewNextAction')}
              </Typography>
              <Typography variant="body1" sx={{ mt: 0.25, fontWeight: 950, color: decisionTone }}>
                {nextAction}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.35 }} noWrap title={run.targetUrl}>
                {targetHost(run.targetUrl) || run.repoId || run.id}
              </Typography>
            </Box>
          </Stack>

          <Box sx={{ mt: 1.35, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1 }}>
            <AutomationDecisionMetric
              label={t('productVerification.gateScore')}
              value={readinessScore == null ? formatGateScore(gate.score) : `${readinessScore}`}
              detail={gate.verdict ?? run.verdict ?? run.status}
              tone={decisionTone}
            />
            <AutomationDecisionMetric
              label={t('hardcoded.replay.reliability.0d427d49')}
              value={formatScore(replayReliability)}
              detail={`${replayPassed}/${replayTotal || matrixRows.length} ${t('productVerification.replayTimeline')}`}
              tone={replayReliability == null ? 'text.secondary' : replayReliability >= 0.95 ? 'success.main' : 'warning.main'}
            />
            <AutomationDecisionMetric
              label={t('productVerification.tabEvidencePack')}
              value={`${artifactPercent}%`}
              detail={`${artifactPresent}/${artifactTotal} ${t('productVerification.tabEvidencePack')}`}
              tone={artifactCompleteness?.complete ? 'success.main' : 'warning.main'}
            />
            <AutomationDecisionMetric
              label="P0 / P1"
              value={`${p0} / ${p1}`}
              detail={`${deterministicRules.total} ${t('productVerification.deterministicRules')}`}
              tone={p0 > 0 ? 'error.main' : p1 > 0 || deterministicRules.total > 0 ? 'warning.main' : 'success.main'}
            />
          </Box>
        </Box>
      </Paper>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 0.62fr) minmax(320px, 0.38fr)' }, gap: 1.25, minHeight: 0 }}>
        <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden', minWidth: 0 }}>
          <SectionHeader icon={<GitBranch size={16} />} title={t('productVerification.evidencePipeline')} />
          <Box sx={{ p: 1.5, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(5, minmax(0, 1fr))' }, gap: 0.85 }}>
            {assuranceRows.map((row) => (
              <AutomationAssuranceTile key={row.title} {...row} />
            ))}
          </Box>
          <Box sx={{ px: 1.5, pb: 1.5, display: 'grid', gap: 0.85 }}>
            {coverageSignals.map((item) => (
              <AutomationCoverageRail key={item.label} label={item.label} value={item.value} tone={item.tone} />
            ))}
          </Box>
        </Paper>

        <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden', minWidth: 0 }}>
          <SectionHeader icon={<AlertTriangle size={16} />} title={t('productVerification.overviewNextAction')} />
          <Box sx={{ p: 1.5 }}>
            {visibleBlockers.length > 0 ? (
              <Stack spacing={0.85}>
                {visibleBlockers.map((blocker, index) => (
                  <Box
                    key={`${blocker}-${index}`}
                    sx={{
                      border: 1,
                      borderColor: (theme) => alpha(theme.palette.warning.main, theme.palette.mode === 'dark' ? 0.36 : 0.28),
                      borderRadius: 1,
                      p: 1,
                      display: 'grid',
                      gridTemplateColumns: 'auto minmax(0, 1fr)',
                      gap: 0.85,
                      bgcolor: (theme) => alpha(theme.palette.warning.main, theme.palette.mode === 'dark' ? 0.1 : 0.07),
                    }}
                  >
                    <Box sx={{ color: 'warning.main', display: 'flex', mt: 0.25 }}>
                      <AlertTriangle size={15} />
                    </Box>
                    <Typography variant="body2" fontWeight={850} sx={{ overflowWrap: 'anywhere', lineHeight: 1.45 }}>
                      {blocker}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            ) : (
              <Box
                sx={{
                  border: 1,
                  borderColor: (theme) => alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.34 : 0.25),
                  borderRadius: 1,
                  p: 1.25,
                  bgcolor: (theme) => alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.09 : 0.06),
                }}
              >
                <Typography variant="body2" fontWeight={950} color="success.main">
                  {t('productVerification.overviewReviewEvidence')}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.4, lineHeight: 1.55 }}>
                  {run.evidenceSig ?? t('productVerification.infoEvidenceComplete')}
                </Typography>
              </Box>
            )}
            {(artifactCompleteness?.missing ?? []).length > 0 && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={850}>
                  {t('hardcoded.missing.artifacts.d17dd24b')}
                </Typography>
                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
                  {(artifactCompleteness?.missing ?? []).map((kind) => (
                    <Chip key={kind} size="small" variant="outlined" color="warning" label={formatScoreKey(kind)} />
                  ))}
                </Stack>
              </Box>
            )}
          </Box>
        </Paper>
      </Box>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden', flex: 1, minHeight: 0 }}>
        <SectionHeader icon={<ShieldCheck size={16} />} title={t('hardcoded.evidence.matrix.7adfb5df')} />
        <Box sx={{ p: 1.5, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' }, gap: 0.85 }}>
          {matrixRows.map((row) => (
            <AutomationMatrixTile key={row.id} row={row} />
          ))}
        </Box>
      </Paper>
    </Stack>
  )
}

function AutomationDecisionMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: string
  detail: string
  tone: string
}) {
  return (
    <Box
      sx={{
        minWidth: 0,
        border: 1,
        borderColor: (theme) => alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.32 : 0.24),
        borderRadius: 1,
        p: 1.1,
        bgcolor: (theme) => alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.1 : 0.055),
      }}
    >
      <Typography variant="caption" color="text.secondary" fontWeight={850} noWrap>
        {label}
      </Typography>
      <Typography sx={{ mt: 0.25, fontSize: 26, lineHeight: 1, fontWeight: 950, color: tone }} noWrap>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.45 }} noWrap title={detail}>
        {detail}
      </Typography>
    </Box>
  )
}

function AutomationAssuranceTile({
  icon,
  title,
  value,
  detail,
  tone,
  progress,
}: {
  icon: ReactNode
  title: string
  value: string
  detail: string
  tone: string
  progress?: number
}) {
  const normalized = typeof progress === 'number' && Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0

  return (
    <Box
      sx={{
        minWidth: 0,
        border: 1,
        borderColor: (theme) => alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.26 : 0.2),
        borderRadius: 1,
        p: 1,
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr) auto',
        gap: 0.75,
        bgcolor: (theme) => alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.075 : 0.045),
      }}
    >
      <Stack direction="row" spacing={0.7} alignItems="center" sx={{ minWidth: 0 }}>
        <Box sx={{ color: tone, display: 'flex' }}>{icon}</Box>
        <Typography variant="caption" color="text.secondary" fontWeight={850} noWrap>
          {title}
        </Typography>
      </Stack>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={950} sx={{ color: tone, lineHeight: 1.15 }} noWrap title={value}>
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.35 }} noWrap title={detail}>
          {detail}
        </Typography>
      </Box>
      <Box sx={{ height: 5, borderRadius: 999, overflow: 'hidden', bgcolor: (theme) => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.16 : 0.08) }}>
        <Box
          sx={{
            height: '100%',
            width: `${normalized}%`,
            borderRadius: 999,
            bgcolor: tone,
          }}
        />
      </Box>
    </Box>
  )
}

function AutomationCoverageRail({ label, value, tone }: { label: string; value: number | undefined; tone: string }) {
  const normalized = typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(100, value <= 1 ? value * 100 : value))
    : 0

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '190px minmax(0, 1fr) auto' }, gap: 1, alignItems: 'center' }}>
      <Typography variant="caption" fontWeight={850} color="text.secondary" noWrap>
        {label}
      </Typography>
      <Box sx={{ height: 7, borderRadius: 999, overflow: 'hidden', bgcolor: (theme) => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.14 : 0.07) }}>
        <Box sx={{ height: '100%', width: `${normalized}%`, borderRadius: 999, bgcolor: tone }} />
      </Box>
      <Typography variant="caption" fontWeight={900} sx={{ color: tone }}>
        {formatScore(value)}
      </Typography>
    </Box>
  )
}

function AutomationMatrixTile({ row }: { row: VerificationMatrixRowModel }) {
  const tone = matrixStatusTone(row.status)

  return (
    <Box
      sx={{
        minWidth: 0,
        border: 1,
        borderColor: (theme) => alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.32 : 0.22),
        borderRadius: 1,
        p: 1,
        bgcolor: (theme) => alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.075 : 0.04),
      }}
    >
      <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="space-between" sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={950} noWrap title={row.title}>
          {row.title}
        </Typography>
        <Chip
          size="small"
          label={matrixStatusLabel(row.status)}
          sx={{
            height: 22,
            flexShrink: 0,
            color: tone,
            bgcolor: (theme) => alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.15 : 0.09),
            fontWeight: 900,
          }}
        />
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.45, lineHeight: 1.45 }} noWrap title={row.evidence}>
        {row.evidence}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.35 }} noWrap title={row.owner}>
        {t('productVerification.matrixOwner')}: {row.owner}
      </Typography>
    </Box>
  )
}

export function ReplayStepRow({
  step,
  index,
}: {
  step: NonNullable<NonNullable<WarroomEvidencePack['run']>['results']>[number]
  index: number
}) {
  const status = step.status ?? 'unknown'
  const assertionSummary = step.assertions && step.assertions.length > 0
    ? `${step.assertions.filter((assertion) => assertion.passed).length}/${step.assertions.length} assertions`
    : 'no assertions'

  return (
    <Box sx={{ p: 1.5, border: 1, borderColor: status === 'failed' ? 'error.main' : 'divider', borderRadius: 1, minWidth: 0 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Chip size="small" color={statusColor[status] ?? 'default'} label={status} />
            <Typography variant="body2" fontWeight={850} sx={{ overflowWrap: 'anywhere' }}>{step.id ?? step.name ?? `step_${index + 1}`}</Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, overflowWrap: 'anywhere' }}>
            {step.module ?? 'unknown module'} · {assertionSummary}
          </Typography>
          {step.error && (
            <Typography variant="body2" color="error.main" sx={{ mt: 0.75, overflowWrap: 'anywhere' }}>
              {step.error}
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent={{ xs: 'flex-start', md: 'flex-end' }}>
          {step.severity && <Chip size="small" variant="outlined" label={step.severity} />}
          {typeof step.duration_ms === 'number' && <Chip size="small" variant="outlined" label={`${Math.round(step.duration_ms)} ms`} />}
        </Stack>
      </Stack>
    </Box>
  )
}

export function GhostApiSampleList({ model }: { model: WarroomAutomationTestModel }) {
  const samples: Array<Record<string, unknown> & { type: string }> = [
    ...(model.ghost_api?.type_a ?? []).map((item) => ({ ...item, type: 'Type A' })),
    ...(model.ghost_api?.type_b ?? []).map((item) => ({ ...item, type: 'Type B' })),
    ...(model.ghost_api?.type_c ?? []).map((item) => ({ ...item, type: 'Type C' })),
  ].slice(0, 6)

  if (samples.length === 0) {
    return (
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        {t('productVerification.noGhostApiFindings')}
      </Typography>
    )
  }

  return (
    <Stack spacing={0.75} sx={{ mt: 1 }}>
      {samples.map((sample, index) => (
        <ContractRow
          key={`${sample.type}-${String(sample.id ?? index)}`}
          label={sample.type}
          value={`${String(sample.method ?? 'GET')} ${String(sample.url ?? 'unknown')} ${sample.status ? `(${String(sample.status)})` : ''}`}
        />
      ))}
    </Stack>
  )
}
