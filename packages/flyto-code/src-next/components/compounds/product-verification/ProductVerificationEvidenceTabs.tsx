import { Alert, Box, Paper, Stack, Typography } from '@mui/material'
import { Activity, AlertTriangle, Play, ScrollText, ShieldCheck } from 'lucide-react'

import { InlineErrorNotice } from '@atoms/InlineErrorNotice'
import { t } from '@lib/i18n'
import type {
  WarroomCampaignExecution,
  WarroomEvidenceArtifact,
  WarroomEvidencePack,
} from '@lib/engine'
import {
  formatScore,
  compactScope,
  normalizeAutomationModel,
  normalizeEvidenceFindings,
  scenarioPreview,
  targetHost,
  type EvidenceGateSummary,
} from './productVerificationModel'
import { GhostApiSampleList, ReplayStepRow } from './AutomationTestPanel'
import {
  CodePreview,
  ContractRow,
  EvidenceField,
  FindingList,
  SectionHeader,
} from './productVerificationPrimitives'

function TargetVerifierSummary({
  run,
  inputTargetUrl,
  inputRepoId,
  contract,
}: {
  run?: WarroomCampaignExecution
  inputTargetUrl?: string
  inputRepoId?: string
  contract: string
}) {
  const activeTarget = run?.targetUrl || inputTargetUrl?.trim() || ''
  const activeRepo = run?.repoId || inputRepoId?.trim() || ''
  const verifiedScope = run?.allowedTargets
    ? compactScope(run.allowedTargets)
    : activeTarget
      ? targetHost(activeTarget)
      : 'verified customer repo or domain required'

  return (
    <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden', flex: 1, minWidth: 0 }}>
        <SectionHeader icon={<Activity size={16} />} title={t('productVerification.targetUnderVerification')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
          <EvidenceField label={t('hardcoded.customer.target.url.1d5eb39d')} value={activeTarget || t('productVerification.infoEnterCustomerUrl')} />
          <EvidenceField label={t('hardcoded.target.host.5e52ec50')} value={targetHost(activeTarget) || t('productVerification.infoNotSelected')} />
          <EvidenceField label={t('hardcoded.connected.repo.43d86abc')} value={activeRepo || t('productVerification.infoRepoOptional')} />
          <EvidenceField label={t('hardcoded.verified.scope.e78a5a72')} value={verifiedScope} />
          <EvidenceField label={t('hardcoded.target.owner.d87266ba')} value="customer-owned URL/domain/repo" />
          <EvidenceField label={t('hardcoded.current.run.af8c332e')} value={run?.id ?? t('productVerification.infoNotSelected')} />
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden', flex: 1, minWidth: 0 }}>
        <SectionHeader icon={<ShieldCheck size={16} />} title={t('productVerification.verifierProvenance')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
          <EvidenceField label={t('hardcoded.control.plane.38f00e1f')} value="flyto-engine" />
          <EvidenceField label="Runner" value="flyto-core verification runner" />
          <EvidenceField label="Contract" value={contract} />
          <EvidenceField label={t('productVerification.evidenceSig')} value={run?.evidenceSig ?? t('productVerification.infoPending')} />
          <EvidenceField label={t('productVerification.runnerExecution')} value={run?.runnerExecutionId ?? t('productVerification.infoNoRunner')} />
          <EvidenceField label={t('hardcoded.gate.boundary.f75aed45')} value="server-side verifier; customer target remains external" />
        </Box>
      </Paper>
    </Stack>
  )
}


export function YamlScenariosPanel({
  run,
  pack,
}: {
  run: WarroomCampaignExecution | undefined
  pack: WarroomEvidencePack | null
}) {
  const scenario = pack?.scenarios
  const scenarioSteps = scenario?.steps ?? []

  if (!run) {
    return (
      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<ScrollText size={16} />} title={t('productVerification.yamlScenarios')} />
        <Alert severity="info" sx={{ m: 2 }}>
          {t('productVerification.noYamlRun')}
        </Alert>
      </Paper>
    )
  }

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<ScrollText size={16} />} title={t('productVerification.yamlScenarios')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
          <EvidenceField label={t('hardcoded.scenario.name.38b40843')} value={scenario?.name ?? 'unavailable'} />
          <EvidenceField label="Schema" value={scenario?.schema_version ?? 'unavailable'} />
          <EvidenceField label={t('hardcoded.generated.from.3a6df392')} value={scenario?.generated_from ?? 'unavailable'} />
          <EvidenceField label={t('hardcoded.step.count.719237f6')} value={String(scenarioSteps.length)} />
        </Box>
        {!scenario ? (
          <Alert severity="info" sx={{ mx: 2, mb: 2 }}>
            {t('productVerification.yamlUnavailable')}
          </Alert>
        ) : (
          <Box sx={{ px: 2, pb: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 0.68fr) minmax(320px, 0.32fr)' }, gap: 1.25 }}>
            <CodePreview value={scenarioPreview(scenario)} />
            <Stack spacing={0.75}>
              {scenarioSteps.map((step, index) => (
                <ContractRow
                  key={step.id ?? index}
                  label={step.id ?? `step_${index + 1}`}
                  value={`${step.module ?? 'module unavailable'} · ${(step.assertions ?? []).length} assertions`}
                />
              ))}
              {scenarioSteps.length === 0 && <EvidenceField label="Steps" value="empty" />}
            </Stack>
          </Box>
        )}
      </Paper>
    </Stack>
  )
}

export function ReplayTimelinePanel({
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
  const model = normalizeAutomationModel(pack, artifacts, gate)
  const replayResults = model.replay?.steps ?? pack?.run?.results ?? []

  if (!run) {
    return (
      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<Play size={16} />} title={t('productVerification.replayTimeline')} />
        <Alert severity="info" sx={{ m: 2 }}>
          {t('productVerification.noReplayRun')}
        </Alert>
      </Paper>
    )
  }

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<Play size={16} />} title={t('productVerification.replayTimeline')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
          <EvidenceField label={t('productVerification.runnerExecution')} value={run.runnerExecutionId ?? t('productVerification.infoNoRunner')} />
          <EvidenceField label={t('hardcoded.replay.ok.fa567137')} value={model.replay?.ok == null ? t('productVerification.infoUnknown') : model.replay.ok ? t('productVerification.infoYes') : t('productVerification.infoNo')} />
          <EvidenceField label={t('hardcoded.passed.total.dd49952d')} value={`${model.replay?.passed ?? 0} / ${model.replay?.total ?? replayResults.length}`} />
          <EvidenceField label="Reliability" value={formatScore(model.replay?.reliability)} />
        </Box>
        {replayResults.length === 0 ? (
          <Alert severity="info" sx={{ mx: 2, mb: 2 }}>
            {t('productVerification.noReplayResults')}
          </Alert>
        ) : (
          <Box sx={{ px: 2, pb: 2, display: 'grid', gap: 1 }}>
            {replayResults.map((step, index) => (
              <ReplayStepRow key={`${step.id ?? step.name ?? index}-${index}`} step={step} index={index} />
            ))}
          </Box>
        )}
      </Paper>
    </Stack>
  )
}

export function GhostApisPanel({
  pack,
  artifacts,
  gate,
}: {
  pack: WarroomEvidencePack | null
  artifacts: WarroomEvidenceArtifact[]
  gate: EvidenceGateSummary
}) {
  const model = normalizeAutomationModel(pack, artifacts, gate)
  const ghostFindings = normalizeEvidenceFindings(pack).filter((finding) => String(finding.code ?? finding.type ?? '').startsWith('ghost_api'))

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<AlertTriangle size={16} />} title={t('productVerification.ghostApis')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
          <EvidenceField label="Status" value={pack ? 'captured' : 'unavailable'} />
          <EvidenceField label="Type A UI -> API no effect" value={String(model.ghost_api?.type_a_count ?? 0)} />
          <EvidenceField label={t('hardcoded.type.b.api.no.ui.path.3daafadb')} value={String(model.ghost_api?.type_b_count ?? 0)} />
          <EvidenceField label={t('hardcoded.type.c.swallowed.api.error.567a15a6')} value={String(model.ghost_api?.type_c_count ?? 0)} />
        </Box>
        {!pack && (
          <Alert severity="info" sx={{ mx: 2, mb: 2 }}>
            {t('productVerification.ghostUnavailable')}
          </Alert>
        )}
        <Box sx={{ px: 2, pb: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 0.55fr) minmax(0, 0.45fr)' }, gap: 1.25 }}>
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={850}>{t('hardcoded.ghost.api.samples.4c58686f')}</Typography>
            <GhostApiSampleList model={model} />
          </Box>
          <FindingList findings={ghostFindings} />
        </Box>
      </Paper>
    </Stack>
  )
}

export function RbacEntitlementPanel({
  run,
  pack,
  artifacts,
  gate,
}: {
  run?: WarroomCampaignExecution
  pack: WarroomEvidencePack | null
  artifacts: WarroomEvidenceArtifact[]
  gate: EvidenceGateSummary
}) {
  const model = normalizeAutomationModel(pack, artifacts, gate)
  const rbac = model.rbac_matrix
  const expectedRoles = (rbac?.roles_required?.length ? rbac.roles_required : ['owner', 'admin', 'member', 'viewer'])
  const rolesTested = new Set((rbac?.roles_tested ?? []).map((role) => role.toLowerCase()))
  const roleExpectations: Record<string, string> = rbac?.role_expectations ?? { owner: 'allow', admin: 'allow', member: 'allow', viewer: 'deny' }

  return (
    <Stack spacing={2}>
      <TargetVerifierSummary
        run={run}
        inputTargetUrl={run?.targetUrl ?? ''}
        inputRepoId={run?.repoId ?? ''}
        contract="warroom.product_verification.v1"
      />

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<ShieldCheck size={16} />} title={t('productVerification.rbacEntitlement')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))', xl: 'repeat(5, minmax(0, 1fr))' }, gap: 1.25 }}>
          <EvidenceField label="Status" value={rbac?.status ?? 'unavailable'} />
          <EvidenceField label={t('hardcoded.verifier.authority.34f923ad')} value={rbac?.authority ?? 'flyto-engine'} />
          <EvidenceField label={t('hardcoded.roles.required.c88eeb73')} value={expectedRoles.join(', ')} />
          <EvidenceField label={t('hardcoded.roles.tested.4cdbf869')} value={(rbac?.roles_tested ?? []).join(', ') || 'none'} />
          <EvidenceField label={t('hardcoded.action.gate.72a07a1b')} value={rbac?.action ?? 'scan:trigger'} />
          <EvidenceField label={t('hardcoded.tenant.pairs.tested.01e6377d')} value={String(rbac?.tenant_pairs_tested ?? 0)} />
          <EvidenceField label={t('hardcoded.tenant.isolation.f9d078cc')} value={rbac?.tenant_isolation ?? 'not captured'} />
          <EvidenceField label={t('hardcoded.fail.closed.9f590049')} value={rbac?.fail_closed ? 'yes' : 'no'} />
          <EvidenceField label={t('hardcoded.open.gate.disallowed.fa66f691')} value={rbac?.fail_open_disallowed ? 'yes' : 'no'} />
          <EvidenceField label={t('hardcoded.frontend.authority.730d6a6d')} value={rbac?.frontend_authority ? 'yes' : 'no'} />
        </Box>
        {!pack && (
          <Alert severity="info" sx={{ mx: 2, mb: 2 }}>
            {t('productVerification.rbacUnavailable')}
          </Alert>
        )}
        <Box sx={{ px: 2, pb: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={850} sx={{ mb: 1 }}>{t('hardcoded.role.coverage.715160c9')}</Typography>
            <Stack spacing={0.75}>
              {expectedRoles.map((role) => (
                <ContractRow key={role} label={role} value={`${rolesTested.has(role.toLowerCase()) ? 'captured' : 'not captured'} · expected ${roleExpectations[role] ?? 'not specified'}`} />
              ))}
            </Stack>
          </Box>
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={850} sx={{ mb: 1 }}>{t('hardcoded.tenant.isolation.f9d078cc')}</Typography>
            <Stack spacing={0.75}>
              <ContractRow label="Org A -> Org B read" value={(rbac?.tenant_pairs_tested ?? 0) > 0 ? 'blocked or verified by matrix' : 'not captured'} />
              <ContractRow label={t('hardcoded.verifier.gate.c82db099')} value="server authorization gate" />
              <ContractRow label="Capability" value={model.capability ?? 'automated_product_testing'} />
              <ContractRow label={t('hardcoded.open.gate.ec518b63')} value={rbac?.fail_open_disallowed ? 'disallowed' : 'not captured'} />
            </Stack>
          </Box>
        </Box>
        {rbac?.violations && rbac.violations.length > 0 && (
          <Box sx={{ mx: 2, mb: 2 }}>
            <InlineErrorNotice error={rbac.violations.map(String).join(', ')} />
          </Box>
        )}
      </Paper>
    </Stack>
  )
}
