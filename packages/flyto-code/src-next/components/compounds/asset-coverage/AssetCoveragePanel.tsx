import { useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { alpha, useTheme } from '@mui/material/styles'
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Database,
  ExternalLink,
  ShieldQuestion,
} from 'lucide-react'

import { ChartCard } from '@compounds/_shared'
import { qk } from '@lib/queryKeys'
import {
  getAssetCoverage,
  type AssetCoverageResponse,
  type CoverageScope,
  type CoverageResource,
  type CoverageSource,
  type SourceStatus,
} from '@lib/engine/code/assetCoverage'
import { colors } from '@/styles/designTokens'
import {
  answeredCoverageForResource,
  coverageDebtForResource,
  formatDateTime,
  formatPct,
  pct,
  rankCoverageResources,
  rankDebtSources,
  resourceLabel,
  scopeCompletenessPct,
  scopeStateMeta,
  topScopeDebtEntities,
  entityDebtCount,
  entityLabel,
  sourceStatusMeta,
  summarizeSourceStatuses,
  totalCoverageForResource,
} from './coverageModel'
import {
  coverageBorder,
  coverageProgressTrack,
  coverageSubtleSurface,
  coverageSurface,
  coverageTintSurface,
  coverageToneBorder,
} from './themeTokens'
import { t } from '@lib/i18n';

const KNOWN_ANSWER_LABEL = 'Answered source pairs'
const DEBT_LABEL = 'Uncertainty debt'

interface AssetCoveragePanelProps {
  orgId?: string
  data?: AssetCoverageResponse
  isLoading?: boolean
  isError?: boolean
  compact?: boolean
}

export function AssetCoveragePanel({
  orgId,
  data: providedData,
  isLoading,
  isError,
  compact = false,
}: AssetCoveragePanelProps) {
  const navigate = useNavigate()
  const q = useQuery({
    queryKey: qk.exposure.assetCoverage(orgId),
    queryFn: () => getAssetCoverage(orgId!),
    enabled: !!orgId && !providedData,
    staleTime: 60_000,
  })

  const data = providedData ?? q.data
  const loading = isLoading ?? q.isLoading
  const error = isError ?? q.isError
  const statusCounts = useMemo(() => summarizeSourceStatuses(data?.sources ?? []), [data?.sources])
  const debtSources = useMemo(() => rankDebtSources(data?.sources ?? []).slice(0, compact ? 4 : 8), [compact, data?.sources])
  const rankedResources = useMemo(
    () => rankCoverageResources(data?.resources ?? []).slice(0, compact ? 3 : 8),
    [compact, data?.resources],
  )
  const knownAnswerPct = data ? pct(data.rollup.answeredPairs, data.rollup.totalResourceSourcePairs) : 0
  const debtPct = data ? data.rollup.uncertaintyDebtPercentage : 0
  const scopeMeta = scopeStateMeta(data?.scope?.state)
  const scopePct = scopeCompletenessPct(data?.scope)

  return (
	    <ChartCard title={compact ? t('hardcoded.asset.coverage.65ac664c') : t('hardcoded.asset.coverage.ledger.8ecb388d')}>
      {loading && <LoadingState compact={compact} />}
      {error && (
        <Alert severity="warning" sx={{ fontSize: 12, mb: 1.5 }}>
          Coverage ledger unavailable. Existing asset data can still be shown, but coverage certainty cannot be evaluated from this response.
        </Alert>
      )}
      {!loading && !error && data && (
        <Stack spacing={1.5}>
          <Stack direction="row" justifyContent="space-between" spacing={1.5} alignItems="flex-start">
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.45 }}>
                Confirmed assets, source health, and unresolved collection debt. Unknown, stale, unavailable, errored, and uncollected states are never rendered as clean absence.
              </Typography>
            </Box>
            {compact && orgId && (
              <Button
                size="small"
                endIcon={<ExternalLink size={14} />}
                onClick={() => navigate(`/projects/${orgId}/asset-coverage`)}
                sx={{ flexShrink: 0 }}
              >
                Open
              </Button>
            )}
          </Stack>

          <Box
            sx={{
              display: 'grid',
              gap: 1,
              gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
            }}
          >
            <MetricTile
              label={t('hardcoded.group.scope.732afcf1')}
              value={data.scope ? `${data.scope.rollup.coveredEntities}/${data.scope.rollup.requiredEntities}` : 'undeclared'}
              subvalue={data.scope?.state}
              icon={<Building2 size={14} />}
              tone={scopeMeta.tone}
            />
            <MetricTile label={t('hardcoded.confirmed.inventory.fbed4d7a')} value={data.rollup.confirmedResources} icon={<Database size={14} />} />
            <MetricTile label={t('hardcoded.quarantined.candidates.666ac709')} value={data.rollup.quarantinedCandidates} icon={<ShieldQuestion size={14} />} />
            <MetricTile
              label={KNOWN_ANSWER_LABEL}
              value={`${data.rollup.answeredPairs}/${data.rollup.totalResourceSourcePairs}`}
              icon={<CheckCircle2 size={14} />}
            />
            <MetricTile
              label={DEBT_LABEL}
              value={data.rollup.uncertaintyDebtPairs}
              subvalue={formatPct(debtPct)}
              icon={<AlertTriangle size={14} />}
              tone={debtPct > 0 ? colors.semantic.warning : colors.semantic.neutral}
            />
          </Box>

          <CoverageProgress
            label={t('hardcoded.known.answer.coverage.a22d2ab2')}
            helper="Fresh present, vendor-empty, and not-applicable answers only. Unknown, stale, unavailable, errored, and not-collected pairs stay as debt."
            value={knownAnswerPct}
            debtValue={debtPct}
          />

          <ScopeMiniLedger scope={data.scope} scopePct={scopePct} />

          <SourceHealth counts={statusCounts} sources={debtSources} total={data.sources.length} compact={compact} />
          <ResourceDebtList data={data} resources={rankedResources} />
          {!compact && <QuarantineList data={data} />}
          <CaveatList caveats={data.caveats ?? []} />
        </Stack>
      )}
      {!loading && !error && !data && (
        <Typography variant="body2" color="text.secondary">
          No coverage response has been returned for this organization context.
        </Typography>
      )}
    </ChartCard>
  )
}

function LoadingState({ compact }: { compact: boolean }) {
  return (
    <Stack spacing={1.2}>
      <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        {Array.from({ length: 4 }).map((_, idx) => (
          <Skeleton key={idx} variant="rounded" height={58} />
        ))}
      </Box>
      <Skeleton variant="rounded" height={38} />
      <Skeleton variant="rounded" height={compact ? 94 : 124} />
      {!compact && <Skeleton variant="rounded" height={140} />}
    </Stack>
  )
}

function MetricTile({
  label,
  value,
  subvalue,
  icon,
  tone = colors.semantic.info,
}: {
  label: string
  value: number | string
  subvalue?: string
  icon: ReactNode
  tone?: string
}) {
  const theme = useTheme()
  return (
    <Box
      sx={{
        minWidth: 0,
        border: `1px solid ${coverageBorder(theme)}`,
        bgcolor: coverageSurface(theme),
        backgroundImage: `linear-gradient(135deg, ${coverageTintSurface(theme, tone)} 0%, transparent 62%)`,
        borderRadius: 1,
        px: 1,
        py: 0.9,
      }}
    >
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
        <Box sx={{ color: tone, display: 'inline-flex', flexShrink: 0 }}>{icon}</Box>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          title={label}
        >
          {label}
        </Typography>
      </Stack>
      <Stack direction="row" spacing={0.75} alignItems="baseline" sx={{ mt: 0.35, minWidth: 0 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.05, minWidth: 0 }}>
          {value}
        </Typography>
        {subvalue && (
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
            {subvalue}
          </Typography>
        )}
      </Stack>
    </Box>
  )
}

function CoverageProgress({
  label,
  helper,
  value,
  debtValue,
}: {
  label: string
  helper: string
  value: number
  debtValue: number
}) {
  const theme = useTheme()
  const tone = debtValue > 25 ? colors.semantic.warning : colors.semantic.info
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
        <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>
          {label}
        </Typography>
        <Typography variant="caption" sx={{ fontWeight: 800, color: tone }}>
          {formatPct(value)}
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={value}
        sx={{
          mt: 0.75,
          height: 8,
          borderRadius: 999,
          bgcolor: coverageProgressTrack(theme),
          '& .MuiLinearProgress-bar': { bgcolor: tone, borderRadius: 999 },
        }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.65, lineHeight: 1.35 }}>
        {helper}
      </Typography>
    </Box>
  )
}

function ScopeMiniLedger({ scope, scopePct }: { scope?: CoverageScope; scopePct: number }) {
  const meta = scopeStateMeta(scope?.state)
  const entities = topScopeDebtEntities(scope, 3)
  if (!scope) {
    return (
      <Alert severity="info" icon={<Building2 size={16} />} sx={{ fontSize: 12 }}>
        No entity scope ledger returned. Group-level completeness cannot be claimed from resource coverage alone.
      </Alert>
    )
  }
  return (
    <Box>
      <SectionHeader
        icon={<Building2 size={14} />}
        title={t('hardcoded.group.scope.732afcf1')}
        subtitle={`${scope.rollup.coveredEntities}/${scope.rollup.requiredEntities} required entities covered; state ${scope.state}.`}
      />
      <CoverageProgress
        label={t('hardcoded.declared.entity.coverage.2e8d69c2')}
        helper={meta.detail}
        value={scopePct}
        debtValue={scope.rollup.scopeDebtPercentage}
      />
      <Stack spacing={0.75} sx={{ mt: 1 }}>
        {entities.length > 0 ? entities.map((entity) => (
          <Box key={entity.id} sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" useFlexGap flexWrap="wrap">
              <Typography
                variant="body2"
                sx={{ fontWeight: 800, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                title={entityLabel(entity)}
              >
                {entityLabel(entity)}
              </Typography>
              <Chip size="small" variant="outlined" label={`${entityDebtCount(entity)} debt`} />
              <Chip size="small" variant="outlined" label={`${entity.resources.length} assets`} />
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {entity.debt?.[0]?.message ?? t('hardcoded.entity.has.unresolved.scope.evidence.debt.c4b65605')}
            </Typography>
          </Box>
        )) : (
          <Typography variant="caption" color="text.secondary">
            No entity-specific debt returned in this scope ledger.
          </Typography>
        )}
      </Stack>
    </Box>
  )
}

function SourceHealth({
  counts,
  sources,
  total,
  compact,
}: {
  counts: Record<string, number>
  sources: CoverageSource[]
  total: number
  compact: boolean
}) {
  return (
    <Box>
      <SectionHeader
        icon={<Activity size={14} />}
        title={t('hardcoded.source.health.10e110be')}
        subtitle={`${total} registered sources; debt states are tracked separately from negative findings.`}
      />
      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
        {Object.entries(counts)
          .sort(([a], [b]) => sourceStatusMeta(a).priority - sourceStatusMeta(b).priority)
          .map(([status, count]) => (
            <StatusChip key={status} status={status} label={`${sourceStatusMeta(status).label}: ${count}`} />
          ))}
      </Stack>
      <Stack spacing={0.75} sx={{ mt: 1 }}>
        {sources.length > 0 ? sources.map((source) => <SourceRow key={source.integrationId} source={source} compact={compact} />) : (
          <Typography variant="caption" color="text.secondary">
            No stale, unavailable, errored, disabled, unknown, or uncollected source states in this response.
          </Typography>
        )}
      </Stack>
    </Box>
  )
}

function SourceRow({ source, compact }: { source: CoverageSource; compact: boolean }) {
  const theme = useTheme()
  const meta = sourceStatusMeta(source.status)
  const detail = source.caveat || source.detail || meta.detail
  const observedAt = source.lastAttemptAt || source.lastSuccessAt
  const missing = source.missingEnvGroups?.length
    ? ` Missing credential groups: ${source.missingEnvGroups.slice(0, 2).join(', ')}${source.missingEnvGroups.length > 2 ? '...' : ''}.`
    : ''
  return (
    <Box
      sx={{
        border: `1px solid ${coverageToneBorder(theme, meta.tone)}`,
        borderRadius: 1,
        px: 1,
        py: 0.8,
        bgcolor: coverageTintSurface(theme, meta.tone),
      }}
    >
      <Stack direction="row" spacing={1} alignItems="flex-start">
        <StatusIcon status={source.status} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{ fontWeight: 800, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              title={source.label}
            >
              {source.label}
            </Typography>
            <StatusChip status={source.status} label={meta.label} />
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.35, mt: 0.25 }}>
            {detail}{missing}
          </Typography>
          {!compact && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.35 }}>
              Last attempt: {formatDateTime(observedAt)}
            </Typography>
          )}
        </Box>
      </Stack>
    </Box>
  )
}

function ResourceDebtList({
  data,
  resources,
}: {
  data: AssetCoverageResponse
  resources: CoverageResource[]
}) {
  return (
    <Box>
      <SectionHeader
        icon={<Database size={14} />}
        title={t('hardcoded.resource.coverage.cd3b0ce4')}
        subtitle={`${data.resources.length} confirmed resources; rows are sorted by unresolved source-pair debt.`}
      />
      <Stack spacing={0.75} sx={{ mt: 1 }}>
        {resources.length > 0 ? resources.map((resource) => <ResourceRow key={resource.resource.id} resource={resource} />) : (
          <Typography variant="caption" color="text.secondary">
            No confirmed resources returned by the coverage response.
          </Typography>
        )}
      </Stack>
    </Box>
  )
}

function ResourceRow({ resource }: { resource: CoverageResource }) {
  const theme = useTheme()
  const answered = answeredCoverageForResource(resource)
  const total = totalCoverageForResource(resource)
  const debt = coverageDebtForResource(resource)
  const knownPct = pct(answered, total)
  const debtTone = debt > 0 ? colors.semantic.warning : colors.semantic.neutral
  return (
    <Box
      sx={{
        border: `1px solid ${coverageBorder(theme, 'muted')}`,
        borderRadius: 1,
        px: 1,
        py: 0.8,
        bgcolor: coverageSubtleSurface(theme),
      }}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ xs: 'stretch', md: 'center' }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            variant="body2"
            sx={{ fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            title={resourceLabel(resource)}
          >
            {resourceLabel(resource)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {[resource.resource.category, resource.resource.type, resource.resource.reviewStatus].filter(Boolean).join(' / ')}
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ justifyContent: { md: 'flex-end' } }}>
          <Chip size="small" variant="outlined" label={`Present ${resource.summary.present}`} />
          <Chip size="small" variant="outlined" label={`Vendor-empty ${resource.summary.vendorEmpty}`} />
          <Chip size="small" variant="outlined" label={`N/A ${resource.summary.notApplicable}`} />
          <Chip
            size="small"
            label={`Debt ${debt}`}
            sx={{
              bgcolor: alpha(debtTone, debt > 0 ? 0.14 : 0.08),
              color: debtTone,
              fontWeight: 800,
            }}
          />
        </Stack>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={knownPct}
        sx={{
          mt: 0.85,
          height: 5,
          borderRadius: 999,
          bgcolor: coverageProgressTrack(theme),
          '& .MuiLinearProgress-bar': { bgcolor: colors.semantic.info, borderRadius: 999 },
        }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.45 }}>
        {answered}/{total} answered pairs. {resource.caveats?.[0] ?? t('hardcoded.no.resource.specific.caveat.returned.with.answered.claims.d9ab16a4')}
      </Typography>
    </Box>
  )
}

function QuarantineList({ data }: { data: AssetCoverageResponse }) {
  if (data.quarantine.length === 0) return null
  return (
    <Box>
      <SectionHeader
        icon={<ShieldQuestion size={14} />}
        title="Quarantine"
        subtitle={t('hardcoded.candidate.resources.are.visible.for.review.but.not.93edf457')}
      />
      <Stack spacing={0.75} sx={{ mt: 1 }}>
        {data.quarantine.slice(0, 4).map((item) => (
          <Box key={item.resource.id} sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
              <Typography
                variant="body2"
                sx={{ fontWeight: 800, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                title={item.resource.displayName || item.resource.canonicalValue || item.resource.id}
              >
                {item.resource.displayName || item.resource.canonicalValue || item.resource.id}
              </Typography>
              <Chip size="small" variant="outlined" label={item.certainty} />
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {item.reason} / confidence {item.resource.confidenceScore}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  )
}

function CaveatList({ caveats }: { caveats: string[] }) {
  if (caveats.length === 0) return null
  return (
    <Alert icon={<CircleHelp size={16} />} severity="info" sx={{ fontSize: 12 }}>
      {caveats.slice(0, 2).join(' ')}
    </Alert>
  )
}

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode
  title: string
  subtitle: string
}) {
  return (
    <Stack direction="row" spacing={0.75} alignItems="flex-start">
      <Box sx={{ color: colors.semantic.info, display: 'inline-flex', mt: 0.2 }}>{icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.35 }}>
          {subtitle}
        </Typography>
      </Box>
    </Stack>
  )
}

function StatusChip({ status, label }: { status: SourceStatus | string; label: string }) {
  const meta = sourceStatusMeta(status)
  return (
    <Chip
      size="small"
      label={label}
      sx={{
        height: 22,
        bgcolor: alpha(meta.tone, 0.14),
        color: meta.tone,
        fontWeight: 800,
        '& .MuiChip-label': { px: 0.8 },
      }}
    />
  )
}

function StatusIcon({ status }: { status: SourceStatus | string }) {
  const meta = sourceStatusMeta(status)
  const iconProps = { size: 15, color: meta.tone }
  if (status === 'fresh') return <CheckCircle2 {...iconProps} />
  if (status === 'stale') return <Clock3 {...iconProps} />
  if (status === 'error' || status === 'unavailable') return <AlertTriangle {...iconProps} />
  return <CircleHelp {...iconProps} />
}
