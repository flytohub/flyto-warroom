import type { ReactNode } from 'react'
import { Box, Chip, Paper, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { Activity, AlertTriangle, Clock, FileJson, GitBranch, Network, ShieldCheck } from 'lucide-react'

import { t } from '@lib/i18n'
import type {
  WarroomCampaignExecution,
  WarroomEvidenceArtifact,
  WarroomEvidencePack,
} from '@lib/engine'
import {
  formatGateScore,
  formatVerificationDate as formatDate,
  targetHost,
  type EvidenceGateSummary,
} from './productVerificationModel'
import { buildVerificationMatrix } from './productVerificationMatrix'
import { SectionHeader, TechCorners, VerificationBeacon } from './productVerificationPrimitives'
import {
  resolveVerificationToneColor as resolveToneColor,
  verificationScanline,
  verificationStatusColor as statusColor,
} from './productVerificationPresentation'

export function ProductVerificationOverview({
  runs,
  selectedRun,
  contract,
  evidenceGate,
  evidencePack,
  artifacts,
  inputTargetUrl,
  inputRepoId,
  onSelectRun,
}: {
  runs: WarroomCampaignExecution[]
  selectedRun?: WarroomCampaignExecution
  contract: string
  evidenceGate: EvidenceGateSummary
  evidencePack: WarroomEvidencePack | null
  artifacts: WarroomEvidenceArtifact[]
  inputTargetUrl: string
  inputRepoId: string
  onSelectRun: (run: WarroomCampaignExecution) => void
}) {
  const activeTarget = selectedRun?.targetUrl || inputTargetUrl.trim()
  const activeRepo = selectedRun?.repoId || inputRepoId.trim()
  const verdict = evidenceGate.verdict ?? selectedRun?.verdict ?? selectedRun?.status ?? t('productVerification.infoNone')
  const artifactCompleteness = evidenceGate.artifactCompleteness
  const artifactTotal = artifactCompleteness?.required?.length ?? 3
  const artifactPresent = artifactCompleteness?.present?.length ?? artifacts.length
  const matrixRows = buildVerificationMatrix(selectedRun, evidencePack, artifacts, evidenceGate)
  const blockingRows = matrixRows.filter((row) => row.status === 'blocked' || row.status === 'missing')
  const hasTarget = Boolean(activeTarget)
  const hasRunner = Boolean(selectedRun?.runnerExecutionId)
  const hasEvidence = Boolean(selectedRun?.evidenceSig || evidencePack || artifactPresent > 0)
  const hasBlockers = hasTarget && (evidenceGate.blockers.length > 0 || blockingRows.length > 0)
  const decisionTone = !hasTarget
    ? 'primary.main'
    : hasBlockers
      ? 'warning.main'
      : hasEvidence
        ? 'success.main'
        : 'info.main'
  const decisionTitle = !hasTarget
    ? t('productVerification.commandTitle')
    : hasBlockers
      ? t('productVerification.overviewResolveBlockers')
      : hasEvidence
        ? t('productVerification.overviewReviewEvidence')
        : t('productVerification.overviewWaitingRunner')
  const decisionBody = !hasTarget
    ? t('productVerification.commandSubtitle')
    : hasBlockers
      ? t('productVerification.overviewResolveBlockersDetail')
      : hasEvidence
        ? t('productVerification.overviewReviewEvidenceDetail')
        : t('productVerification.evidenceWaitingForRunner')
  const selectedTitle = targetHost(activeTarget) || t('productVerification.infoNeedsTarget')

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
        minHeight: 0,
        flexShrink: 0,
        width: '100%',
        pb: 1,
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          position: 'relative',
          flexShrink: 0,
          borderRadius: 1,
          overflow: 'hidden',
          borderColor: (theme) => alpha(resolveToneColor(theme, decisionTone), theme.palette.mode === 'dark' ? 0.38 : 0.28),
          bgcolor: (theme) =>
            theme.palette.mode === 'dark'
              ? alpha(theme.palette.background.paper, 0.92)
              : alpha(theme.palette.background.paper, 0.985),
          boxShadow: (theme) => `0 16px 34px ${alpha(theme.palette.common.black, theme.palette.mode === 'dark' ? 0.24 : 0.06)}`,
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            opacity: (theme) => (theme.palette.mode === 'dark' ? 0.3 : 0.34),
            backgroundImage: (theme) =>
              `linear-gradient(135deg, ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.12 : 0.055)}, transparent 38%, ${alpha(theme.palette.info.main, theme.palette.mode === 'dark' ? 0.1 : 0.045)} 74%, transparent), linear-gradient(${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.08 : 0.055)} 1px, transparent 1px), linear-gradient(90deg, ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.07 : 0.045)} 1px, transparent 1px)`,
            backgroundSize: '100% 100%, 32px 32px, 32px 32px',
          },
          '&::after': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: (theme) =>
              `linear-gradient(90deg, ${alpha(theme.palette.primary.main, 0.72)}, ${alpha(theme.palette.info.main, 0.62)}, ${alpha(theme.palette.success.main, 0.5)})`,
          },
        }}
      >
        <TechCorners tone={decisionTone} />
        <Box
          sx={{
            position: 'relative',
            zIndex: 1,
            p: { xs: 2, md: 2.25 },
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) minmax(360px, 0.72fr)' },
            gap: 2.25,
            alignItems: 'center',
          }}
        >
          <Box
            sx={{
              minWidth: 0,
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '104px minmax(0, 1fr)' },
              gap: 1.6,
              alignItems: 'center',
            }}
          >
            <VerificationBeacon value={hasTarget ? formatGateScore(evidenceGate.score) : 'PV'} tone={decisionTone} active={hasTarget} />
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.2 }}>
                <Chip size="small" color={statusColor[verdict] ?? 'primary'} label={verdict} sx={{ fontWeight: 900 }} />
                <Chip size="small" variant="outlined" label={contract} sx={{ fontWeight: 850, bgcolor: 'background.paper' }} />
                <Chip
                  size="small"
                  variant="outlined"
                  label={activeRepo || t('productVerification.infoRepoOptional')}
                  sx={{ fontWeight: 850, maxWidth: 260, bgcolor: 'background.paper' }}
                />
              </Stack>
              <Typography
                variant="h5"
                fontWeight={950}
                noWrap
                title={selectedTitle}
                sx={{ lineHeight: 1.04, letterSpacing: 0 }}
              >
                {selectedTitle}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap title={activeTarget || undefined} sx={{ mt: 0.75 }}>
                {activeTarget || t('productVerification.commandSubtitle')}
              </Typography>

              <Box
                sx={{
                  mt: 1.6,
                  height: 8,
                  borderRadius: 999,
                  overflow: 'hidden',
                  bgcolor: (theme) => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.18 : 0.08),
                }}
              >
                <Box
                  sx={{
                    width: hasTarget ? (hasEvidence ? '92%' : '52%') : '18%',
                    height: '100%',
                    borderRadius: 999,
                    background: (theme) =>
                      `linear-gradient(90deg, ${theme.palette.primary.main}, ${hasEvidence ? theme.palette.success.main : theme.palette.info.main})`,
                  }}
                />
              </Box>

              <VerificationPipeline
                targetActive={hasTarget}
                targetValue={selectedTitle}
                evidenceActive={hasEvidence}
                runnerActive={hasRunner}
                artifactValue={`${artifactPresent}/${artifactTotal}`}
              />

              <Box sx={{ mt: 1.35, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 0.85 }}>
                <DecisionMetric
                  icon={<ShieldCheck size={16} />}
                  label={t('productVerification.gateScore')}
                  value={formatGateScore(evidenceGate.score)}
                  tone={decisionTone}
                />
                <DecisionMetric
                  icon={<FileJson size={16} />}
                  label={t('productVerification.matrixEvidence')}
                  value={`${artifactPresent}/${artifactTotal}`}
                  tone={artifactCompleteness?.complete ? 'success.main' : artifactPresent > 0 ? 'warning.main' : 'text.secondary'}
                />
                <DecisionMetric
                  icon={<Activity size={16} />}
                  label={t('productVerification.runnerExecution')}
                  value={hasRunner ? t('productVerification.infoRunnerLinked') : t('productVerification.infoNoRunner')}
                  tone={hasRunner ? 'success.main' : 'text.secondary'}
                />
              </Box>
            </Box>
          </Box>

          <Box
            sx={{
              minWidth: 0,
              border: 1,
              borderColor: (theme) => alpha(resolveToneColor(theme, decisionTone), theme.palette.mode === 'dark' ? 0.55 : 0.42),
              borderLeft: 4,
              borderRadius: 1,
              p: { xs: 1.5, md: 1.75 },
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 1.25,
              bgcolor: (theme) =>
                theme.palette.mode === 'dark'
                  ? alpha(resolveToneColor(theme, decisionTone), 0.1)
                  : alpha(resolveToneColor(theme, decisionTone), 0.045),
              backdropFilter: 'blur(8px)',
              '&::before': {
                content: '""',
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                backgroundImage: verificationScanline,
                backgroundSize: '24px 100%',
                opacity: 0.38,
              },
            }}
          >
            <Box sx={{ minWidth: 0, position: 'relative', zIndex: 1 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={900} textTransform="uppercase" sx={{ letterSpacing: 0 }}>
                {t('productVerification.overviewNextAction')}
              </Typography>
              <Typography variant="h6" fontWeight={950} sx={{ color: decisionTone, mt: 0.6, lineHeight: 1.16, letterSpacing: 0 }}>
                {decisionTitle}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.85, lineHeight: 1.55 }}>
                {decisionBody}
              </Typography>
            </Box>

            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ position: 'relative', zIndex: 1 }}>
              <Chip size="small" icon={<ShieldCheck size={14} />} label={t('productVerification.testingMatrixTitle')} />
              <Chip size="small" icon={<FileJson size={14} />} label={t('productVerification.tabEvidencePack')} />
              <Chip size="small" icon={<Clock size={14} />} label={t('productVerification.tabSchedulerRuns')} />
            </Stack>
          </Box>
        </Box>
      </Paper>

      <Box
        sx={{
          minHeight: 0,
          flexShrink: 0,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) minmax(320px, 0.42fr)' },
          gap: 1.25,
          alignItems: 'stretch',
        }}
      >
        <Paper
          variant="outlined"
          sx={{
            position: 'relative',
            flexShrink: 0,
            borderRadius: 1,
            overflow: 'hidden',
            minHeight: 'auto',
            height: 'auto',
            borderColor: (theme) => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.16 : 0.12),
            bgcolor: 'background.paper',
            boxShadow: (theme) => `0 10px 22px ${alpha(theme.palette.common.black, theme.palette.mode === 'dark' ? 0.18 : 0.045)}`,
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              background: (theme) =>
                `linear-gradient(90deg, ${alpha(theme.palette.primary.main, 0.62)}, ${alpha(theme.palette.info.main, 0.46)}, transparent)`,
            },
          }}
        >
          <SectionHeader icon={<AlertTriangle size={16} />} title={t('productVerification.testingMatrixTitle')} />
          <Box sx={{ p: 1.25, minHeight: 0 }}>
            {hasBlockers ? (
              <Stack spacing={0.8} sx={{ mt: 1.25 }}>
                {evidenceGate.blockers.slice(0, 4).map((blocker) => (
                  <EvidenceIssue key={blocker} text={blocker} tone="warning.main" />
                ))}
                {blockingRows.slice(0, 4).map((row) => (
                  <EvidenceIssue key={row.id} text={`${row.title}: ${row.evidence}`} tone={row.status === 'blocked' ? 'error.main' : 'warning.main'} />
                ))}
              </Stack>
            ) : (
              <PreflightBoard
                hasTarget={hasTarget}
                hasEvidence={hasEvidence}
                hasRunner={hasRunner}
                decisionTone={decisionTone}
                decisionTitle={decisionTitle}
                selectedTitle={selectedTitle}
                artifactValue={`${artifactPresent}/${artifactTotal}`}
                verdict={verdict}
              />
            )}
          </Box>
        </Paper>

        <Paper
          variant="outlined"
          sx={{
            position: 'relative',
            flexShrink: 0,
            borderRadius: 1,
            overflow: 'hidden',
            minHeight: 'auto',
            height: 'auto',
            borderColor: (theme) => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.16 : 0.12),
            bgcolor: 'background.paper',
            boxShadow: (theme) => `0 10px 22px ${alpha(theme.palette.common.black, theme.palette.mode === 'dark' ? 0.18 : 0.045)}`,
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              background: (theme) =>
                `linear-gradient(90deg, ${alpha(theme.palette.primary.main, 0.62)}, ${alpha(theme.palette.info.main, 0.42)}, transparent)`,
            },
          }}
        >
          <SectionHeader icon={<Clock size={16} />} title={t('productVerification.overviewRecentRuns')} />
          <Stack spacing={0.8} sx={{ p: 1.25, minHeight: 0 }}>
            {runs.slice(0, 4).map((run) => (
              <CompactRunRow
                key={run.id}
                run={run}
                selected={selectedRun?.id === run.id}
                onSelect={() => onSelectRun(run)}
              />
            ))}
            {runs.length === 0 && (
              <RecentRunsEmpty />
            )}
            {runs.length > 4 && (
              <Typography variant="caption" color="text.secondary" sx={{ px: 0.75 }}>
                {t('productVerification.overviewMoreRuns', { count: runs.length - 4 })}
              </Typography>
            )}
          </Stack>
        </Paper>
      </Box>
    </Box>
  )
}

function VerificationPipeline({
  targetActive,
  targetValue,
  evidenceActive,
  runnerActive,
  artifactValue,
}: {
  targetActive: boolean
  targetValue: string
  evidenceActive: boolean
  runnerActive: boolean
  artifactValue: string
}) {
  const stages = [
    {
      icon: <Network size={14} />,
      label: t('productVerification.targetUrl'),
      value: targetActive ? targetValue : t('productVerification.infoPending'),
      active: targetActive,
      tone: 'info.main',
    },
    {
      icon: <FileJson size={14} />,
      label: t('productVerification.tabEvidencePack'),
      value: artifactValue,
      active: evidenceActive,
      tone: 'success.main',
    },
    {
      icon: <Activity size={14} />,
      label: t('productVerification.runnerExecution'),
      value: runnerActive ? t('productVerification.infoRunnerLinked') : t('productVerification.infoNoRunner'),
      active: runnerActive,
      tone: 'primary.main',
    },
  ]

  return (
    <Box
      sx={{
        mt: 1.1,
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
        gap: 0.7,
        position: 'relative',
      }}
    >
      {stages.map((stage, index) => (
        <Box
          key={stage.label}
          sx={{
            minWidth: 0,
            position: 'relative',
            border: 1,
            borderColor: (theme) => alpha(theme.palette.divider, theme.palette.mode === 'dark' ? 0.9 : 1),
            borderRadius: 1,
            px: 0.9,
            py: 0.75,
            display: 'grid',
            gridTemplateColumns: 'auto minmax(0, 1fr)',
            gap: 0.7,
            alignItems: 'center',
            bgcolor: (theme) =>
              stage.active
                ? alpha(resolveToneColor(theme, stage.tone), theme.palette.mode === 'dark' ? 0.09 : 0.045)
                : alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.6 : 0.92),
            '&::before': index === 0 ? undefined : {
              content: '""',
              position: 'absolute',
              top: '50%',
              right: '100%',
              width: 10,
              height: 1,
              bgcolor: (theme) => (stage.active ? resolveToneColor(theme, stage.tone) : theme.palette.divider),
              transform: 'translateY(-50%)',
            },
          }}
        >
          <Box
            sx={{
              width: 26,
              height: 26,
              borderRadius: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: stage.active ? stage.tone : 'text.secondary',
              bgcolor: (theme) =>
                alpha(stage.active ? resolveToneColor(theme, stage.tone) : theme.palette.text.secondary, theme.palette.mode === 'dark' ? 0.12 : 0.065),
            }}
          >
            {stage.icon}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={850} noWrap>
              {stage.label}
            </Typography>
            <Typography variant="body2" sx={{ color: stage.active ? stage.tone : 'text.primary', fontWeight: 950, lineHeight: 1.15 }} noWrap title={stage.value}>
              {stage.value}
            </Typography>
          </Box>
        </Box>
      ))}
    </Box>
  )
}

function PreflightBoard({
  hasTarget,
  hasEvidence,
  hasRunner,
  decisionTone,
  decisionTitle,
  selectedTitle,
  artifactValue,
  verdict,
}: {
  hasTarget: boolean
  hasEvidence: boolean
  hasRunner: boolean
  decisionTone: string
  decisionTitle: string
  selectedTitle: string
  artifactValue: string
  verdict: string
}) {
  const nodes = [
    {
      icon: <Network size={15} />,
      label: t('productVerification.targetUrl'),
      value: hasTarget ? selectedTitle : t('productVerification.infoPending'),
      detail: t('productVerification.commandSubtitle'),
      active: hasTarget,
      tone: 'info.main',
    },
    {
      icon: <FileJson size={15} />,
      label: t('productVerification.tabEvidencePack'),
      value: artifactValue,
      detail: t('productVerification.evidenceWaitingForRunner'),
      active: hasEvidence,
      tone: 'success.main',
    },
    {
      icon: <Activity size={15} />,
      label: t('productVerification.runnerExecution'),
      value: hasRunner ? t('productVerification.infoRunnerLinked') : t('productVerification.infoNoRunner'),
      detail: t('productVerification.overviewWaitingRunner'),
      active: hasRunner,
      tone: 'primary.main',
    },
    {
      icon: <ShieldCheck size={15} />,
      label: t('productVerification.gateVerdict'),
      value: verdict,
      detail: decisionTitle,
      active: hasTarget || hasEvidence,
      tone: decisionTone,
    },
  ]

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 176,
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr) auto',
        gap: 1,
      }}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr) auto',
          gap: 0.9,
          alignItems: 'center',
          minWidth: 0,
          px: 0.4,
        }}
      >
        <Box sx={{ color: 'primary.main', display: 'flex' }}>
          <GitBranch size={16} />
        </Box>
        <Typography variant="body2" fontWeight={950} noWrap>
          {t('productVerification.evidencePipeline')}
        </Typography>
        <Chip
          size="small"
          label={decisionTitle}
          sx={{
            height: 22,
            maxWidth: 220,
            color: decisionTone,
            bgcolor: (theme) => alpha(resolveToneColor(theme, decisionTone), theme.palette.mode === 'dark' ? 0.13 : 0.08),
            fontWeight: 900,
          }}
        />
      </Box>

      <Box
        sx={{
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
          gap: 0.85,
        }}
      >
        {nodes.map((node) => (
          <PreflightNode key={node.label} {...node} />
        ))}
      </Box>

      <Box
        sx={{
          height: 8,
          borderRadius: 999,
          overflow: 'hidden',
          bgcolor: (theme) => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.16 : 0.07),
        }}
      >
        <Box
          sx={{
            height: '100%',
            width: hasEvidence ? '88%' : hasTarget ? '46%' : '18%',
            borderRadius: 999,
            background: (theme) =>
              `linear-gradient(90deg, ${theme.palette.primary.main}, ${theme.palette.info.main}, ${hasEvidence ? theme.palette.success.main : alpha(theme.palette.info.main, 0.42)})`,
          }}
        />
      </Box>
    </Box>
  )
}

function PreflightNode({
  icon,
  label,
  value,
  detail,
  active,
  tone,
}: {
  icon: ReactNode
  label: string
  value: string
  detail: string
  active: boolean
  tone: string
}) {
  return (
    <Box
      sx={{
        minWidth: 0,
        border: 1,
        borderColor: (theme) =>
          alpha(resolveToneColor(theme, active ? tone : 'text.secondary'), active ? (theme.palette.mode === 'dark' ? 0.34 : 0.28) : (theme.palette.mode === 'dark' ? 0.2 : 0.16)),
        borderRadius: 1,
        p: 1,
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr)',
        gap: 0.85,
        alignItems: 'center',
        bgcolor: (theme) =>
          active
            ? alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.095 : 0.05)
            : alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.62 : 0.92),
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
          color: active ? tone : 'text.secondary',
          bgcolor: (theme) => alpha(resolveToneColor(theme, active ? tone : 'text.secondary'), theme.palette.mode === 'dark' ? 0.13 : 0.075),
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={850} noWrap>
          {label}
        </Typography>
        <Typography variant="body2" fontWeight={950} sx={{ color: active ? tone : 'text.primary', lineHeight: 1.1 }} noWrap title={value}>
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }} noWrap title={detail}>
          {detail}
        </Typography>
      </Box>
    </Box>
  )
}

function RecentRunsEmpty() {
  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 176,
        border: 1,
        borderColor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.22 : 0.14),
        borderRadius: 1,
        p: 1.25,
        display: 'grid',
        gridTemplateRows: 'minmax(0, 1fr) auto',
        gap: 1,
        bgcolor: (theme) => (theme.palette.mode === 'dark' ? alpha(theme.palette.background.paper, 0.64) : alpha(theme.palette.background.paper, 0.96)),
        backgroundImage: (theme) =>
          `linear-gradient(${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.07 : 0.035)} 1px, transparent 1px), linear-gradient(90deg, ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.06 : 0.03)} 1px, transparent 1px)`,
        backgroundSize: '28px 28px',
      }}
    >
      <Box sx={{ minWidth: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <Box sx={{ minWidth: 0 }}>
          <Box
            sx={{
              width: 42,
              height: 42,
              mx: 'auto',
              borderRadius: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'primary.main',
              bgcolor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.13 : 0.07),
              border: 1,
              borderColor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.28 : 0.2),
            }}
          >
            <Clock size={18} />
          </Box>
          <Typography variant="body2" fontWeight={950} sx={{ mt: 1 }}>
            {t('productVerification.overviewNoRuns')}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.45, lineHeight: 1.45 }}>
            {t('productVerification.empty')}
          </Typography>
        </Box>
      </Box>
      <Stack direction="row" spacing={0.65} useFlexGap flexWrap="wrap">
        <Chip size="small" label={t('productVerification.testingMatrixTitle')} sx={{ height: 22, fontWeight: 850 }} />
        <Chip size="small" label={t('productVerification.tabEvidencePack')} sx={{ height: 22, fontWeight: 850 }} />
        <Chip size="small" label={t('productVerification.tabSchedulerRuns')} sx={{ height: 22, fontWeight: 850 }} />
      </Stack>
    </Box>
  )
}

function DecisionMetric({
  icon,
  label,
  value,
  tone = 'primary.main',
}: {
  icon: ReactNode
  label: string
  value: string
  tone?: string
}) {
  return (
    <Box
      sx={{
        minWidth: 0,
        border: 1,
        borderColor: (theme) => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.14 : 0.1),
        borderRadius: 1,
        borderLeft: 3,
        borderLeftColor: tone,
        p: 1,
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr)',
        gap: 0.85,
        alignItems: 'center',
        bgcolor: (theme) =>
          theme.palette.mode === 'dark'
            ? alpha(resolveToneColor(theme, tone), 0.08)
            : alpha(resolveToneColor(theme, tone), 0.04),
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
          bgcolor: (theme) => alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.12 : 0.07),
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={850} noWrap>
          {label}
        </Typography>
        <Typography sx={{ mt: 0.35, fontSize: 19, lineHeight: 1, fontWeight: 950, color: tone }} noWrap title={value}>
          {value}
        </Typography>
      </Box>
    </Box>
  )
}

function CompactRunRow({ run, selected, onSelect }: { run: WarroomCampaignExecution; selected: boolean; onSelect: () => void }) {
  const status = run.verdict ?? run.status
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onSelect()
      }}
      sx={{
        minWidth: 0,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: 1,
        alignItems: 'center',
        border: 1,
        borderColor: selected ? 'primary.main' : 'divider',
        borderRadius: 1,
        px: 1,
        py: 0.85,
        cursor: 'pointer',
        bgcolor: selected ? 'action.hover' : 'background.paper',
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={850} noWrap title={run.targetUrl}>
          {targetHost(run.targetUrl) || run.targetUrl}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
          {formatDate(run.createdAt)} - {run.evidenceSig ?? run.runnerExecutionId ?? t('productVerification.infoPending')}
        </Typography>
      </Box>
      <Stack direction="row" spacing={0.5}>
        <Chip size="small" color={statusColor[status] ?? statusColor[run.status] ?? 'default'} label={status} sx={{ height: 22 }} />
        {run.criticalCount > 0 && <Chip size="small" color="error" label={`P0 ${run.criticalCount}`} sx={{ height: 22 }} />}
      </Stack>
    </Box>
  )
}

function EvidenceIssue({ text, tone }: { text: string; tone: string }) {
  return (
    <Box sx={{ border: 1, borderColor: tone, borderRadius: 1, p: 1, minWidth: 0, bgcolor: (theme) => alpha(theme.palette.warning.main, theme.palette.mode === 'dark' ? 0.1 : 0.06) }}>
      <Typography variant="body2" fontWeight={850} sx={{ overflowWrap: 'anywhere' }}>
        {text}
      </Typography>
    </Box>
  )
}
