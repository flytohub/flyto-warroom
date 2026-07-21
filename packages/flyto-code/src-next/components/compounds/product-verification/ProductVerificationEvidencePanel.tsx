import type { ReactNode } from 'react'
import { Alert, Box, Chip, LinearProgress, Paper, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { Activity, AlertTriangle, FileJson, GitBranch, Network, Play, ScrollText, ShieldCheck } from 'lucide-react'

import { InlineErrorNotice } from '@atoms/InlineErrorNotice'
import { QueryError } from '@atoms/QueryError'
import { t } from '@lib/i18n'
import type {
  WarroomCampaignExecution,
  WarroomEvidenceArtifact,
  WarroomEvidenceFinding,
  WarroomEvidencePack,
} from '@lib/engine'
import {
  artifactPreview,
  formatBytes,
  formatGateScore,
  formatScore,
  formatScoreBreakdownValue,
  formatScoreKey,
  formatVerificationDate as formatDate,
  jsonPreview,
  normalizeAutomationModel,
  readJSONNumber,
  type DeterministicRuleSummary,
  type EvidenceGateSummary,
} from './productVerificationModel'
import {
  matrixStatusLabel,
  matrixStatusTone,
  type VerificationMatrixStatus,
} from './productVerificationMatrix'
import {
  CodePreview,
  ContractRow,
  EvidenceField,
  FindingList,
  SectionHeader,
} from './productVerificationPrimitives'
import { resolveVerificationToneColor as resolveToneColor } from './productVerificationPresentation'

export function ProductVerificationEvidencePanel({
  selectedRun,
  evidencePack,
  artifacts,
  evidenceSig,
  gate,
  findings,
  loading,
  error,
  success,
  onRetry,
}: {
  selectedRun?: WarroomCampaignExecution
  evidencePack: WarroomEvidencePack | null
  artifacts: WarroomEvidenceArtifact[]
  evidenceSig?: string
  gate: EvidenceGateSummary
  findings: WarroomEvidenceFinding[]
  loading: boolean
  error: unknown
  success: boolean
  onRetry: () => void
}) {
  const model = normalizeAutomationModel(evidencePack, artifacts, gate)
  const graph = evidencePack?.site_graph
  const pages = graph?.pages?.length ?? 0
  const intents = graph?.intents?.length ?? 0
  const observedStates = Array.from(new Set((graph?.pages ?? []).flatMap((page) => page.states ?? []))).length
  const replaySteps = model.replay?.total ?? model.replay?.steps?.length ?? evidencePack?.run?.results?.length ?? 0
  const scoreRows = Object.keys(gate.scoreBreakdown).length
  const artifactCompleteness = gate.artifactCompleteness
  const artifactTotal = artifactCompleteness?.required?.length ?? 3
  const artifactPresent = artifactCompleteness?.present?.length ?? artifacts.length
  const missingArtifacts = artifactCompleteness?.missing ?? []
  const hasRunner = Boolean(selectedRun?.runnerExecutionId)
  const hasEvidence = Boolean(evidencePack || evidenceSig || selectedRun?.evidenceSig || artifactPresent > 0)
  const evidenceGapCount = gate.blockers.length + missingArtifacts.length + (success && artifacts.length === 0 ? 1 : 0)
  const gateStatus: VerificationMatrixStatus = gate.blockers.length > 0 ? 'blocked' : gate.verdict ? 'passed' : hasEvidence ? 'captured' : 'pending'
  const runnerStatus: VerificationMatrixStatus = hasRunner ? 'captured' : selectedRun ? 'pending' : 'missing'
  const artifactStatus: VerificationMatrixStatus = artifactPresent > 0 ? 'captured' : hasRunner || success ? 'missing' : 'pending'
  const gapStatus: VerificationMatrixStatus = evidenceGapCount > 0 ? 'blocked' : hasEvidence ? 'passed' : 'pending'
  const stageStatus = (count: number): VerificationMatrixStatus => (count > 0 ? 'captured' : hasEvidence ? 'missing' : 'pending')
  const selectedRunLabel = selectedRun?.id ?? t('productVerification.infoNone')
  const evidenceSignature = selectedRun?.evidenceSig ?? evidenceSig ?? t('productVerification.infoPending')
  const nextActionValue = evidenceGapCount > 0 ? String(evidenceGapCount) : hasEvidence ? t('productVerification.matrixStatusPassed') : t('productVerification.infoNeedsTarget')
  const nextActionDetail = evidenceGapCount > 0
    ? t('productVerification.overviewResolveBlockers')
    : hasEvidence
      ? t('productVerification.overviewReviewEvidence')
      : t('productVerification.commandSubtitle')

  const pipelineSteps = [
    {
      icon: <Network size={16} />,
      title: t('productVerification.discoveryEvidence'),
      detail: t('productVerification.pipelineDiscoveryDetail'),
      value: String(pages),
      status: stageStatus(pages),
    },
    {
      icon: <GitBranch size={16} />,
      title: t('productVerification.intentGraph'),
      detail: t('productVerification.pipelineIntentDetail'),
      value: String(intents),
      status: stageStatus(intents),
    },
    {
      icon: <Activity size={16} />,
      title: t('productVerification.stateApiGraph'),
      detail: t('productVerification.pipelineStateDetail'),
      value: String(observedStates),
      status: stageStatus(observedStates),
    },
    {
      icon: <Play size={16} />,
      title: t('productVerification.replayTimeline'),
      detail: t('productVerification.pipelineReplayDetail'),
      value: String(replaySteps),
      status: stageStatus(replaySteps),
    },
    {
      icon: <FileJson size={16} />,
      title: t('productVerification.rawEvidencePack'),
      detail: t('productVerification.pipelineEvidenceDetail'),
      value: `${artifactPresent}/${artifactTotal}`,
      status: artifactStatus,
    },
    {
      icon: <ShieldCheck size={16} />,
      title: t('productVerification.deterministicRules'),
      detail: t('productVerification.pipelineGateDetail'),
      value: gate.hasGateMetadata ? formatGateScore(gate.score) : String(scoreRows),
      status: gateStatus,
    },
  ] satisfies Array<{ icon: ReactNode; title: string; detail: string; value: string; status: VerificationMatrixStatus }>

  return (
    <Box sx={{ height: '100%', minHeight: 0, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: 1.25, overflow: 'hidden' }}>
      <Paper
        variant="outlined"
        sx={{
          borderRadius: 1,
          overflow: 'hidden',
          borderColor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.28 : 0.18),
          bgcolor: (theme) => (theme.palette.mode === 'dark' ? alpha(theme.palette.background.paper, 0.84) : alpha(theme.palette.background.paper, 0.98)),
        }}
      >
        <Box sx={{ p: 1.25, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1 }}>
          <EvidenceSignalCard
            icon={<ShieldCheck size={17} />}
            label={t('productVerification.gateVerdict')}
            value={gate.verdict ?? t('productVerification.infoUnknown')}
            detail={formatGateScore(gate.score)}
            status={gateStatus}
          />
          <EvidenceSignalCard
            icon={<FileJson size={17} />}
            label={t('productVerification.matrixEvidence')}
            value={`${artifactPresent}/${artifactTotal}`}
            detail={missingArtifacts.length > 0 ? missingArtifacts.join(', ') : t('productVerification.overviewReviewEvidence')}
            status={artifactStatus}
          />
          <EvidenceSignalCard
            icon={<Activity size={17} />}
            label={t('productVerification.runnerExecution')}
            value={hasRunner ? t('productVerification.infoRunnerLinked') : t('productVerification.infoNoRunner')}
            detail={selectedRunLabel}
            status={runnerStatus}
          />
          <EvidenceSignalCard
            icon={<AlertTriangle size={17} />}
            label={t('productVerification.overviewNextAction')}
            value={nextActionValue}
            detail={nextActionDetail}
            status={gapStatus}
          />
        </Box>
      </Paper>

      <Box
        sx={{
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 0.92fr) minmax(340px, 0.58fr)' },
          gridTemplateRows: { xs: 'minmax(280px, 0.8fr) minmax(320px, 1fr)', xl: 'minmax(0, 1fr)' },
          gap: 1.25,
          overflow: 'hidden',
        }}
      >
        <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <SectionHeader icon={<GitBranch size={16} />} title={t('productVerification.evidencePipeline')} />
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ px: 1.25, py: 1, borderBottom: 1, borderColor: 'divider' }}>
            {pipelineSteps.map((step) => (
              <Chip
                key={step.title}
                size="small"
                label={`${step.title} ${step.value}`}
                sx={{
                  height: 24,
                  fontWeight: 850,
                  color: matrixStatusTone(step.status),
                  bgcolor: (theme) => alpha(resolveToneColor(theme, matrixStatusTone(step.status)), theme.palette.mode === 'dark' ? 0.14 : 0.08),
                }}
              />
            ))}
          </Stack>
          <Box
            sx={{
              minHeight: 0,
              overflowY: 'auto',
              p: 1.25,
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' },
              alignContent: 'start',
              gap: 1,
            }}
          >
            {pipelineSteps.map((step) => (
              <PipelineStep key={step.title} {...step} />
            ))}
          </Box>
        </Paper>

        <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <SectionHeader icon={<FileJson size={16} />} title={t('productVerification.latestEvidence')} />
          <Box sx={{ minHeight: 0, overflowY: 'auto', p: 1.25, display: 'grid', gap: 1.1, alignContent: 'start' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 0.85 }}>
              <EvidenceDatum label={t('productVerification.selectedRun')} value={selectedRunLabel} />
              <EvidenceDatum label={t('productVerification.evidenceSig')} value={evidenceSignature} tone={hasEvidence ? 'success.main' : 'text.secondary'} />
              <EvidenceDatum label={t('productVerification.runnerExecution')} value={selectedRun?.runnerExecutionId ?? t('productVerification.infoNoRunner')} tone={hasRunner ? 'success.main' : 'warning.main'} />
              <EvidenceDatum label={t('productVerification.updatedAt')} value={formatDate(selectedRun?.updatedAt) || t('productVerification.infoNone')} />
            </Box>

            {selectedRun && !selectedRun.runnerExecutionId && (
              <Alert severity="info">
                {t('productVerification.evidenceWaitingForRunner')}
              </Alert>
            )}
            {loading && <LinearProgress />}
            {error != null && <QueryError compact error={error} onRetry={onRetry} label={t('productVerification.latestEvidence')} />}
            {success && artifacts.length === 0 && (
              <Alert severity="warning">
                {t('productVerification.noEvidenceArtifacts')}
              </Alert>
            )}
            {(findings.length > 0 || evidencePack?.scores || gate.hasGateMetadata) && (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr)' }, gap: 1 }}>
                <FindingList findings={findings} />
                <ScorePanel pack={evidencePack} artifacts={artifacts} gate={gate} />
              </Box>
            )}
            {evidencePack && <EvidencePackPreview pack={evidencePack} />}
          </Box>
        </Paper>
      </Box>
    </Box>
  )
}

function EvidenceSignalCard({
  icon,
  label,
  value,
  detail,
  status,
}: {
  icon: ReactNode
  label: string
  value: string
  detail: string
  status: VerificationMatrixStatus
}) {
  const tone = matrixStatusTone(status)
  return (
    <Box
      sx={{
        minWidth: 0,
        border: 1,
        borderColor: (theme) => alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.34 : 0.22),
        borderRadius: 1,
        p: 1,
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr)',
        gap: 0.85,
        alignItems: 'center',
        bgcolor: (theme) => alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.1 : 0.045),
      }}
    >
      <Box
        sx={{
          width: 34,
          height: 34,
          borderRadius: 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: tone,
          bgcolor: (theme) => alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.15 : 0.08),
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={0.6} alignItems="center" sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={850} noWrap>
            {label}
          </Typography>
          <Chip size="small" label={matrixStatusLabel(status)} sx={{ height: 20, fontSize: 12, fontWeight: 850, color: tone }} />
        </Stack>
        <Typography sx={{ mt: 0.35, fontSize: 20, lineHeight: 1, fontWeight: 950, color: tone }} noWrap title={value}>
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.35 }} noWrap title={detail}>
          {detail}
        </Typography>
      </Box>
    </Box>
  )
}

function PipelineStep({
  icon,
  title,
  detail,
  value,
  status,
}: {
  icon: ReactNode
  title: string
  detail: string
  value: string
  status: VerificationMatrixStatus
}) {
  const tone = matrixStatusTone(status)
  return (
    <Box
      sx={{
        p: 1.2,
        border: 1,
        borderColor: (theme) => alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.28 : 0.2),
        borderRadius: 1,
        minWidth: 0,
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr) auto',
        gap: 0.9,
        alignItems: 'start',
        bgcolor: (theme) => alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.075 : 0.035),
      }}
    >
      <Box
        sx={{
          width: 32,
          height: 32,
          borderRadius: 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: tone,
          bgcolor: (theme) => alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.13 : 0.075),
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={900} noWrap title={title}>{title}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.45, lineHeight: 1.5 }}>{detail}</Typography>
      </Box>
      <Stack spacing={0.6} alignItems="flex-end" sx={{ minWidth: 56 }}>
        <Typography sx={{ fontSize: 20, lineHeight: 1, fontWeight: 950, color: tone }} noWrap>{value}</Typography>
        <Chip size="small" label={matrixStatusLabel(status)} sx={{ height: 20, fontSize: 12, fontWeight: 850, color: tone }} />
      </Stack>
    </Box>
  )
}

function EvidenceDatum({ label, value, tone = 'text.primary' }: { label: string; value: string; tone?: string }) {
  return (
    <Box sx={{ p: 1, border: 1, borderColor: 'divider', borderRadius: 1, minWidth: 0, bgcolor: 'background.paper' }}>
      <Typography variant="caption" color="text.secondary" fontWeight={850}>{label}</Typography>
      <Typography variant="body2" sx={{ mt: 0.45, fontWeight: 950, color: tone, overflowWrap: 'anywhere' }}>{value}</Typography>
    </Box>
  )
}

export function EvidenceImage({ artifact }: { artifact: WarroomEvidenceArtifact }) {
  const src = artifact.previewDataUrl || artifact.url || ''
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden', minWidth: 0, bgcolor: 'background.default' }}>
      {src ? (
        <Box
          component="img"
          src={src}
          alt={artifact.name}
          sx={{ display: 'block', width: '100%', height: { xs: 220, md: 260 }, objectFit: 'contain', bgcolor: 'common.black' }}
        />
      ) : (
        <Box sx={{ height: { xs: 220, md: 260 }, display: 'grid', placeItems: 'center' }}>
          <Typography variant="caption" color="text.secondary">{t('productVerification.imageUnavailable')}</Typography>
        </Box>
      )}
      <Box sx={{ px: 1.25, py: 1, display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="caption" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{artifact.name}</Typography>
        <Chip size="small" variant="outlined" label={formatBytes(artifact.sizeBytes)} />
      </Box>
    </Box>
  )
}

function ScorePanel({ pack, artifacts, gate }: { pack: WarroomEvidencePack | null; artifacts: WarroomEvidenceArtifact[]; gate: EvidenceGateSummary }) {
  const scores = pack?.scores ?? pack?.site_graph?.scores ?? {}
  const network = artifacts.find((artifact) => artifact.kind === 'network_log')
  const networkCount = readJSONNumber(network?.json, 'count')
  const scoreRows = Object.entries(gate.scoreBreakdown)
  const artifactCompleteness = gate.artifactCompleteness
  return (
    <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1, minWidth: 0 }}>
      <Typography variant="body2" fontWeight={800}>{t('productVerification.evidenceScore')}</Typography>
      <Stack spacing={1} sx={{ mt: 1 }}>
        <EvidenceField label={t('productVerification.gateVerdict')} value={gate.verdict ?? 'unknown'} />
        <EvidenceField label="90-point gate" value={formatGateScore(gate.score)} />
        <EvidenceField label="Verdict" value={pack?.verdict ?? 'unknown'} />
        <EvidenceField label={t('hardcoded.observed.coverage.cbdbdf95')} value={formatScore(scores['observed_coverage'])} />
        <EvidenceField label={t('hardcoded.reachable.coverage.e4e2178c')} value={formatScore(scores['reachable_coverage'])} />
        <EvidenceField label={t('hardcoded.network.requests.0d6c3ae8')} value={typeof networkCount === 'number' ? String(networkCount) : 'not captured'} />
        {artifactCompleteness && (
          <EvidenceField
            label={t('hardcoded.artifact.completeness.0b82e601')}
            value={`${artifactCompleteness.present?.length ?? 0}/${artifactCompleteness.required?.length ?? 0} ${artifactCompleteness.complete ? 'complete' : 'missing'}`}
          />
        )}
        {artifactCompleteness?.missing && artifactCompleteness.missing.length > 0 && (
          <EvidenceField label={t('hardcoded.missing.artifacts.d17dd24b')} value={artifactCompleteness.missing.join(', ')} />
        )}
      </Stack>
      {scoreRows.length > 0 && (
        <Box sx={{ mt: 1.25 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={800}>{t('hardcoded.score.breakdown.0677fa8c')}</Typography>
          <Stack spacing={0.75} sx={{ mt: 0.75 }}>
            {scoreRows.map(([key, value]) => (
              <ContractRow
                key={key}
                label={formatScoreKey(key)}
                value={formatScoreBreakdownValue(value)}
              />
            ))}
          </Stack>
        </Box>
      )}
      {gate.blockers.length > 0 && (
        <Box sx={{ mt: 1.25 }}>
          <InlineErrorNotice error={gate.blockers.join(', ')} />
        </Box>
      )}
    </Box>
  )
}

function EvidencePackPreview({ pack }: { pack: WarroomEvidencePack }) {
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, minWidth: 0, overflow: 'hidden' }}>
      <SectionHeader icon={<FileJson size={16} />} title={t('productVerification.rawEvidencePack')} />
      <Box sx={{ p: 1.5 }}>
        <CodePreview value={jsonPreview(pack)} />
      </Box>
    </Box>
  )
}

export function GraphEvidencePanel({
  pack,
  artifacts,
  mode = 'all',
}: {
  pack: WarroomEvidencePack | null
  artifacts: WarroomEvidenceArtifact[]
  mode?: 'all' | 'discovery' | 'intent' | 'network'
}) {
  const graph = pack?.site_graph
  const intents = graph?.intents ?? []
  const actions = graph?.actions ?? []
  const apis = graph?.apis ?? []
  const pages = graph?.pages ?? []
  const allowedStates = graph?.state_graph?.allowed_states ?? []
  const observedStates = Array.from(new Set(pages.flatMap((page) => page.states ?? []))).sort()
  const dom = artifacts.find((artifact) => artifact.kind === 'dom_snapshot')
  const network = artifacts.find((artifact) => artifact.kind === 'network_log')
  const showDiscovery = mode === 'all' || mode === 'discovery'
  const showIntent = mode === 'all' || mode === 'intent'
  const showNetwork = mode === 'all' || mode === 'network'

  if (!graph) {
    return (
      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<GitBranch size={16} />} title={graphPanelTitle(mode)} />
        <Alert severity="info" sx={{ m: 2 }}>
          {t('productVerification.noGraphEvidence')}
        </Alert>
      </Paper>
    )
  }

  return (
    <Stack spacing={2}>
      {showDiscovery && <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<Activity size={16} />} title={t('productVerification.discoveryEvidence')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1fr) minmax(320px, 0.55fr)' }, gap: 1.25 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25, minWidth: 0 }}>
            {pages.slice(0, 8).map((page, index) => (
              <Box key={page.id ?? index} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={850} sx={{ overflowWrap: 'anywhere' }}>{page.url ?? `page_${index + 1}`}</Typography>
                <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}>
                  <EvidenceField label="Controls" value={String(page.control_count ?? 0)} />
                  <EvidenceField label="APIs" value={String(page.api_count ?? 0)} />
                  <EvidenceField label={t('hardcoded.body.chars.99e3bbcf')} value={String(page.body_chars ?? 0)} />
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, overflowWrap: 'anywhere' }}>
                  {(page.states ?? []).join(', ') || 'state pending'}
                </Typography>
              </Box>
            ))}
            {pages.length === 0 && <EvidenceField label="Discovery" value="No pages captured yet" />}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" fontWeight={850} sx={{ mb: 1 }}>{t('hardcoded.action.candidates.427ffc7a')}</Typography>
            <Stack spacing={0.75}>
              {actions.slice(0, 8).map((action, index) => (
                <ContractRow
                  key={action.id ?? index}
                  label={action.label ?? action.kind ?? 'action'}
                  value={`${action.selector ?? 'selector pending'} · ${action.expected_state ?? 'actionable'}${action.intent_id ? ` · ${action.intent_id}` : ''}`}
                />
              ))}
              {actions.length === 0 && <EvidenceField label="Actions" value="No actions extracted yet" />}
            </Stack>
          </Box>
        </Box>
      </Paper>}

      {showIntent && <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<GitBranch size={16} />} title={t('productVerification.intentGraph')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
          {intents.slice(0, 8).map((intent, index) => (
            <EvidenceField
              key={String(intent.id ?? index)}
              label={String(intent.verb ?? 'intent')}
              value={`${String(intent.object ?? 'unknown')} · ${String(intent.source ?? 'observed')}`}
            />
          ))}
          {intents.length === 0 && <EvidenceField label={t('productVerification.intentGraph')} value="No intents extracted yet" />}
        </Box>
      </Paper>}

      {showNetwork && <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<Network size={16} />} title={t('productVerification.stateApiGraph')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
          <EvidenceField label={t('hardcoded.observed.paths.bb13018a')} value={String(graph.observed_paths?.length ?? 0)} />
          <EvidenceField label={t('hardcoded.reachable.paths.c3733d97')} value={String(graph.reachable_paths?.length ?? 0)} />
          <EvidenceField label={t('hardcoded.api.edges.f9c0b3ab')} value={String(apis.length)} />
          <EvidenceField label={t('hardcoded.dom.artifact.e7282f3e')} value={dom ? dom.name : 'not captured'} />
          <EvidenceField label={t('hardcoded.network.artifact.ffab4e4d')} value={network ? network.name : 'not captured'} />
          <EvidenceField label={t('hardcoded.allowed.states.c652d980')} value={allowedStates.join(', ') || 'n/a'} />
        </Box>
        <Box sx={{ px: 2, pb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {observedStates.map((state) => <Chip key={state} size="small" label={state} />)}
        </Box>
      </Paper>}

      {showNetwork && <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<Network size={16} />} title={t('productVerification.networkApiEvidence')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1fr) minmax(320px, 0.55fr)' }, gap: 1.25 }}>
          <Stack spacing={0.75} sx={{ minWidth: 0 }}>
            {apis.slice(0, 12).map((api, index) => (
              <ContractRow
                key={api.id ?? index}
                label={`${api.method ?? 'GET'} ${api.status ?? 'n/a'}`}
                value={`${api.url ?? 'unknown'}${api.trigger ? ` · trigger ${api.trigger}` : ''}${api.ghost_api_type ? ` · ${api.ghost_api_type}` : ''}`}
              />
            ))}
            {apis.length === 0 && <EvidenceField label={t('hardcoded.api.edges.f9c0b3ab')} value="No API edges captured yet" />}
          </Stack>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" fontWeight={850} sx={{ mb: 1 }}>{t('hardcoded.network.log.artifact.0fbeb402')}</Typography>
            <CodePreview value={artifactPreview(network)} />
          </Box>
        </Box>
      </Paper>}

      {showNetwork && <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<ScrollText size={16} />} title={t('productVerification.domSnapshotEvidence')} />
        <Box sx={{ p: 2 }}>
          <CodePreview value={artifactPreview(dom)} />
        </Box>
      </Paper>}
    </Stack>
  )
}

function graphPanelTitle(mode: 'all' | 'discovery' | 'intent' | 'network') {
  if (mode === 'discovery') return t('productVerification.discoveryEvidence')
  if (mode === 'intent') return t('productVerification.intentGraph')
  if (mode === 'network') return t('productVerification.networkApiEvidence')
  return t('productVerification.graphEvidence')
}

export function DeterministicRulesPanel({
  summary,
  findings,
}: {
  summary: DeterministicRuleSummary
  findings: WarroomEvidenceFinding[]
}) {
  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<AlertTriangle size={16} />} title={t('productVerification.deterministicRules')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
          {summary.rows.map((row) => (
            <EvidenceField key={row.code} label={row.label} value={`${row.count} ${row.status}`} />
          ))}
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<AlertTriangle size={16} />} title={t('productVerification.stateContradictions')} />
        <Box sx={{ p: 2 }}>
          <FindingList findings={findings} />
        </Box>
      </Paper>
    </Stack>
  )
}
