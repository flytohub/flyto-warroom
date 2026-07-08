import { Fragment, Suspense, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { alpha, useTheme } from '@mui/material/styles'
import {
  AlertTriangle,
  Building2,
  ClipboardCheck,
  Database,
  FileWarning,
  Network,
  ShieldQuestion,
  X,
} from 'lucide-react'

import {
  ManagerActionList,
  ManagerDashboard,
  type ManagerActionItem,
} from '@compounds/_shared'
import { qk } from '@lib/queryKeys'
import {
  getAssetCoverage,
  type AssetCoverageResponse,
  type CoverageEntity,
  type CoverageClaim,
  type CoverageResource,
  type CoverageScope,
  type CoverageSource,
  type QuarantineResource,
  type ScopeDebtItem,
} from '@lib/engine/code/assetCoverage'
import { colors } from '@/styles/designTokens'
import {
  answeredCoverageForResource,
  claimStateMeta,
  coverageDebtForResource,
  formatDateTime,
  formatPct,
  entityDebtCount,
  entityLabel,
  normalizeScopeRollup,
  rankScopeEntities,
  pct,
  rankCoverageResources,
  rankDebtSources,
  resourceCoverageVerdict,
  resourceLabel,
  scopeCompletenessPct,
  scopeStateMeta,
  sourceStatusMeta,
  summarizeSourceStatuses,
  totalCoverageForResource,
  topScopeDebtEntities,
} from './coverageModel'
import {
  coverageBorder,
  coverageProgressTrack,
  coverageSubtleSurface,
  coverageSurface,
  coverageTintSurface,
  coverageToneBorder,
} from './themeTokens'
import { tOr } from '@lib/i18n';

const ACCENT = colors.semantic.info
const DEBT_TONE = colors.semantic.warning
const COVERED_TONE = colors.semantic.success
const QUARANTINE_TONE = '#f59e0b'

function ac(key: string, fallback: string, params?: Record<string, string | number>) {
  return tOr(`assetCoverage.${key}`, fallback, params)
}

function localizedTab<T extends string>(
  item: { value: T; labelKey: string; fallback: string },
  count?: number,
): { value: T; label: string; count?: number } {
  return {
    value: item.value,
    label: ac(item.labelKey, item.fallback),
    ...(count != null ? { count } : {}),
  }
}

function localizedSourceStatusLabel(status: string): string {
  const meta = sourceStatusMeta(status)
  return ac(`sourceStatus.${status}.label`, meta.label)
}

function localizedSourceStatusDetail(status: string): string {
  const meta = sourceStatusMeta(status)
  return ac(`sourceStatus.${status}.detail`, meta.detail)
}

function localizedClaimStateLabel(state: string): string {
  const meta = claimStateMeta(state)
  return ac(`claimState.${state}.label`, meta.label)
}

function localizedClaimStateDetail(state: string): string {
  const meta = claimStateMeta(state)
  return ac(`claimState.${state}.detail`, meta.detail)
}

function localizedVerdictLabel(kind: string, fallback: string): string {
  return ac(`verdict.${kind}`, fallback)
}

function localizedResourceVerdictDetail(resource: CoverageResource): string {
  const answered = answeredCoverageForResource(resource)
  const debt = coverageDebtForResource(resource)
  const total = totalCoverageForResource(resource)
  if (total === 0) {
    return ac(
      'verdictDetail.empty',
      'No resource-source pairs were returned; do not derive an asset coverage answer.',
    )
  }
  if (debt === 0) {
    return ac(
      'verdictDetail.answered',
      '{answered}/{total} source pairs have explicit answers.',
      { answered, total },
    )
  }
  if (answered === 0) {
    return ac(
      'verdictDetail.debt',
      '0/{total} source pairs have explicit answers; collection or source repair is required.',
      { total },
    )
  }
  return ac(
    'verdictDetail.partial',
    '{answered}/{total} source pairs have explicit answers; {debt} evidence-debt pairs require collection or retry.',
    { answered, total, debt },
  )
}

function localizedSourceNextAction(source: CoverageSource): string {
  if (source.missingEnvGroups?.length) return ac('sourceAction.connectCredential', 'Connect credential')
  if (source.status === 'fresh') return ac('sourceAction.monitor', 'Monitor')
  if (source.status === 'stale') return ac('sourceAction.refreshSource', 'Refresh source')
  if (source.status === 'error') return ac('sourceAction.fixCollection', 'Fix collection')
  if (source.status === 'unavailable') return ac('sourceAction.connectIntegration', 'Connect integration')
  if (source.status === 'disabled') return ac('sourceAction.enableSource', 'Enable source')
  if (source.status === 'not_collected') return ac('sourceAction.runCollection', 'Run collection')
  return ac('sourceAction.classifySource', 'Classify source')
}

function localizedClaimSummary(claim: CoverageClaim): string {
  return `${localizedClaimStateLabel(claim.coverageState)} / ${claim.field} / ${claim.valueKind} / ${ac('confidenceLower', 'confidence')} ${claim.confidence}`
}

function localizedReviewStatus(status?: string): string {
  if (!status) return ac('sourceStatus.unknown.label', 'Unknown')
  return ac(`reviewStatus.${status}`, status.replace(/_/g, ' '))
}

function localizedPolicyValue(value: string): string {
  return ac(`policyValue.${value}`, value.replace(/_/g, ' '))
}

function localizedResourceMeta(resource: CoverageResource['resource']): string {
  return [resource.category, resource.type, localizedReviewStatus(resource.reviewStatus)].filter(Boolean).join(' / ')
}

function localizedEvidenceText(value?: string): string {
  if (!value) return ''
  if (value === 'API key missing') {
    return ac('backend.apiKeyMissing', 'API key missing')
  }
  if (value === 'Collection failed; this is not evidence of absence.') {
    return ac('backend.collectionFailedNotAbsence', 'Collection failed; this is not evidence of absence.')
  }
  if (value === 'Coverage debt remains until collection succeeds.') {
    return ac('backend.coverageDebtUntilCollection', 'Coverage debt remains until collection succeeds.')
  }
  if (value === 'scope is not complete until every required entity, source, and linked asset has fresh evidence') {
    return ac(
      'backend.scopeIncompleteFreshEvidence',
      'scope is not complete until every required entity, source, and linked asset has fresh evidence',
    )
  }
  if (value === 'Required entity has no confirmed linked assets.') {
    return ac('backend.requiredEntityNoAssets', 'Required entity has no confirmed linked assets.')
  }
  const presenceMatch = value.match(/^(.+) presence has (\d+) unanswered pair\(s\) for this entity\.$/)
  if (presenceMatch) {
    return ac(
      'backend.presenceUnansweredPairs',
      '{name} presence has {count} unanswered pair(s) for this entity.',
      { name: presenceMatch[1], count: presenceMatch[2] },
    )
  }
  const staleSourceMatch = value.match(/^(.+) is stale; its previous observations cannot support current certainty$/)
  if (staleSourceMatch) {
    return ac(
      'backend.sourceStaleCurrentCertainty',
      '{source} is stale; its previous observations cannot support current certainty',
      { source: staleSourceMatch[1] },
    )
  }
  const unavailableCredentialMatch = value.match(/^(.+) is unavailable because required credential groups are missing; this cannot be interpreted as no exposure$/)
  if (unavailableCredentialMatch) {
    return ac(
      'backend.sourceUnavailableMissingCredentials',
      '{source} is unavailable because required credential groups are missing; this cannot be interpreted as no exposure',
      { source: unavailableCredentialMatch[1] },
    )
  }
  const unknownSourceMatch = value.match(/^(.+) source state is unknown; this cannot be interpreted as no exposure$/)
  if (unknownSourceMatch) {
    return ac(
      'backend.sourceUnknownNotNoExposure',
      '{source} source state is unknown; this cannot be interpreted as no exposure',
      { source: unknownSourceMatch[1] },
    )
  }
  const noAttemptMatch = value.match(/^(.+) has not recorded a successful or failed attempt for this org; this is coverage debt$/)
  if (noAttemptMatch) {
    return ac(
      'backend.sourceNoAttemptCoverageDebt',
      '{source} has not recorded a successful or failed attempt for this org; this is coverage debt',
      { source: noAttemptMatch[1] },
    )
  }
  if (value === 'candidate resources are quarantined until auto or human confirmation; they are not counted as confirmed inventory') {
    return ac(
      'backend.candidateResourcesQuarantined',
      'candidate resources are quarantined until auto or human confirmation; they are not counted as confirmed inventory',
    )
  }
  const sourceRetryMatch = value.match(/^(.+) error still needs retry before confidence can be asserted\.$/)
  if (sourceRetryMatch) {
    return ac(
      'backend.sourceErrorNeedsRetry',
      '{source} error still needs retry before confidence can be asserted.',
      { source: sourceRetryMatch[1] },
    )
  }
  return value
}

function localizedEvidenceList(items?: string[] | null): string {
  return (items ?? []).map(localizedEvidenceText).join(' ')
}

function localizedSourceMessage(source: CoverageSource): string {
  return localizedEvidenceText(source.caveat) || localizedEvidenceText(source.detail) || localizedSourceStatusDetail(source.status)
}

type CaveatKind = 'stale' | 'credential' | 'unknown' | 'quarantine' | 'other'

const CAVEAT_BUCKETS: Array<{ kind: CaveatKind; labelKey: string; fallback: string; tone: string }> = [
  { kind: 'stale', labelKey: 'caveatBucket.stale', fallback: 'Stale sources', tone: DEBT_TONE },
  { kind: 'credential', labelKey: 'caveatBucket.credential', fallback: 'Missing credentials', tone: colors.semantic.danger },
  { kind: 'unknown', labelKey: 'caveatBucket.unknown', fallback: 'Unknown collection', tone: ACCENT },
  { kind: 'quarantine', labelKey: 'caveatBucket.quarantine', fallback: 'Quarantined candidates', tone: QUARANTINE_TONE },
  { kind: 'other', labelKey: 'caveatBucket.other', fallback: 'Other debt', tone: colors.semantic.neutral },
]

function classifyCoverageCaveat(value: string): CaveatKind {
  if (/is stale;/.test(value)) return 'stale'
  if (/credential groups are missing|API key missing/i.test(value)) return 'credential'
  if (/source state is unknown|has not recorded a successful or failed attempt|coverage debt/i.test(value)) return 'unknown'
  if (/candidate resources are quarantined|not counted as confirmed inventory/i.test(value)) return 'quarantine'
  return 'other'
}

type ManagerCoverageTab = 'overview' | 'worklist' | 'sources' | 'resources' | 'quarantine'
type EngineerCoverageTab = 'resources' | 'scope' | 'sources' | 'policy' | 'quarantine'

const MANAGER_TABS: Array<{ value: ManagerCoverageTab; labelKey: string; fallback: string }> = [
  { value: 'overview', labelKey: 'tabs.overview', fallback: 'Overview' },
  { value: 'worklist', labelKey: 'tabs.worklist', fallback: 'Worklist' },
  { value: 'sources', labelKey: 'tabs.sources', fallback: 'Sources' },
  { value: 'resources', labelKey: 'tabs.resources', fallback: 'Resources' },
  { value: 'quarantine', labelKey: 'tabs.quarantine', fallback: 'Quarantine' },
]

const ENGINEER_TABS: Array<{ value: EngineerCoverageTab; labelKey: string; fallback: string }> = [
  { value: 'resources', labelKey: 'tabs.resources', fallback: 'Resources' },
  { value: 'scope', labelKey: 'tabs.scope', fallback: 'Scope' },
  { value: 'sources', labelKey: 'tabs.sources', fallback: 'Sources' },
  { value: 'policy', labelKey: 'tabs.policy', fallback: 'Policy' },
  { value: 'quarantine', labelKey: 'tabs.quarantine', fallback: 'Quarantine' },
]

interface AssetCoverageViewProps {
  orgId?: string
}

function useResolvedOrgId(explicitOrgId?: string): string | undefined {
  const params = useParams<{ orgId: string }>()
  return explicitOrgId ?? params.orgId
}

export function AssetCoverageManagerView({ orgId: explicitOrgId }: AssetCoverageViewProps) {
  const orgId = useResolvedOrgId(explicitOrgId)
  const [tab, setTab] = useState<ManagerCoverageTab>('overview')
  const [selected, setSelected] = useState<CoverageResource | null>(null)
  const q = useQuery({
    queryKey: qk.exposure.assetCoverage(orgId),
    queryFn: () => getAssetCoverage(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const data = q.data
  const loading = q.isLoading
  const answeredPct = data ? pct(data.rollup.answeredPairs, data.rollup.totalResourceSourcePairs) : 0
  const debtPct = data ? data.rollup.uncertaintyDebtPercentage : 0
  const scope = data?.scope
  const scopeMeta = scopeStateMeta(scope?.state)
  const scopePct = scopeCompletenessPct(scope)
  const debtResources = useMemo(() => rankCoverageResources(data?.resources ?? []).slice(0, 6), [data?.resources])
  const resources = useMemo(() => rankCoverageResources(data?.resources ?? []), [data?.resources])
  const debtSources = useMemo(() => rankDebtSources(data?.sources ?? []).slice(0, 4), [data?.sources])
  const scopeDebtEntities = useMemo(() => topScopeDebtEntities(scope, 5), [scope])
  const statusCounts = useMemo(() => summarizeSourceStatuses(data?.sources ?? []), [data?.sources])
  const actionItems = useMemo(() => {
    const entityItems = scopeDebtEntities.map((entity) => ({
      id: entity.id,
      title: entityLabel(entity),
      subtitle: [
        entity.kind,
        localizedReviewStatus(entity.verificationState),
        entity.required ? ac('required', 'required') : ac('candidate', 'candidate'),
      ].filter(Boolean).join(' / '),
      meta: localizedEvidenceText(entity.debt?.[0]?.message) || ac('entityDebtFallback', 'Entity has unresolved scope debt.'),
      value: ac('debtCount', '{count} debt', { count: entityDebtCount(entity) }),
      severity: 'high' as const,
    }))
    const resourceItems = debtResources
      .filter((resource) => coverageDebtForResource(resource) > 0)
      .map((resource) => {
        const debt = coverageDebtForResource(resource)
        const severity = resource.summary.error > 0 ? 'high' : 'medium'
        return {
          id: resource.resource.id,
          title: resourceLabel(resource),
          subtitle: localizedResourceMeta(resource.resource),
          meta: localizedResourceVerdictDetail(resource),
          value: ac('debtCount', '{count} debt', { count: debt }),
          severity: severity as 'high' | 'medium',
        }
      })
    return [...entityItems, ...resourceItems].slice(0, 8)
  }, [debtResources, scopeDebtEntities])

  return (
    <>
      <ManagerDashboard
        title={ac('managerTitle', 'Asset coverage')}
        subtitle={ac('subtitle', 'Confirmed inventory, source health, and unresolved collection debt')}
        accent={ACCENT}
        titleIcon={<ClipboardCheck size={20} />}
        layout="full-bleed"
        chartMinWidth={280}
        contentOverflow="hidden"
        hero={
          <ManagerCoverageSummaryBand
            data={data}
            loading={loading}
            answeredPct={answeredPct}
            debtPct={debtPct}
            scope={scope}
            scopeMeta={scopeMeta}
            scopePct={scopePct}
          />
        }
        charts={
          <AssetCoverageManagerWorkbench
            tab={tab}
            onTabChange={setTab}
            data={data}
            isLoading={loading}
            isError={q.isError}
            scope={scope}
            actionItems={actionItems}
            debtSources={debtSources}
            statusCounts={statusCounts}
            resources={resources}
            onSelectResource={setSelected}
          />
        }
      />
      <AssetCoverageDrawer resource={selected} onClose={() => setSelected(null)} />
    </>
  )
}

export function AssetCoverageEngineerView({ orgId: explicitOrgId }: AssetCoverageViewProps) {
  const orgId = useResolvedOrgId(explicitOrgId)
  const [selected, setSelected] = useState<CoverageResource | null>(null)
  const [tab, setTab] = useState<EngineerCoverageTab>('resources')
  const q = useQuery({
    queryKey: qk.exposure.assetCoverage(orgId),
    queryFn: () => getAssetCoverage(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const data = q.data
  const resources = useMemo(() => rankCoverageResources(data?.resources ?? []), [data?.resources])
  const scopeEntities = useMemo(() => rankScopeEntities(data?.scope?.entities), [data?.scope?.entities])
  const scopeMeta = scopeStateMeta(data?.scope?.state)
  const statusCounts = useMemo(() => summarizeSourceStatuses(data?.sources ?? []), [data?.sources])

  return (
    <>
      <Box
        data-testid="asset-coverage-engineer-root"
        sx={{
          height: '100%',
          minHeight: 0,
          overflow: 'hidden',
          p: { xs: 1.5, md: 2.5 },
          bgcolor: 'background.default',
          color: 'text.primary',
          display: 'grid',
          gridTemplateRows: 'auto minmax(0, 1fr)',
          gap: 1.5,
          boxSizing: 'border-box',
        }}
      >
        <EngineerLedgerHeader data={data} scopeTone={scopeMeta.tone} isError={q.isError} />

        <CoverageTabbedFrame
          value={tab}
          onChange={(value) => setTab(value as EngineerCoverageTab)}
          tabs={ENGINEER_TABS.map((item) => {
            if (item.value === 'resources') return localizedTab(item, resources.length)
            if (item.value === 'scope') return localizedTab(item, scopeEntities.length)
            if (item.value === 'sources') return localizedTab(item, data?.sources.length ?? 0)
            if (item.value === 'quarantine') return localizedTab(item, data?.quarantine.length ?? 0)
            return localizedTab(item)
          })}
          ariaLabel={ac('aria.engineerSections', 'Asset coverage engineer sections')}
        >
          <EngineerTabContent
            tab={tab}
            data={data}
            resources={resources}
            scopeEntities={scopeEntities}
            statusCounts={statusCounts}
            selectedResource={selected}
            onSelectResource={setSelected}
          />
        </CoverageTabbedFrame>
      </Box>
    </>
  )
}

function ManagerCoverageSummaryBand({
  data,
  loading,
  answeredPct,
  debtPct,
  scope,
  scopeMeta,
  scopePct,
}: {
  data?: AssetCoverageResponse
  loading: boolean
  answeredPct: number
  debtPct: number
  scope?: CoverageScope
  scopeMeta: ReturnType<typeof scopeStateMeta>
  scopePct: number
}) {
  const theme = useTheme()
  const debtTone = debtPct > 0 ? colors.semantic.warning : colors.semantic.success
  const summary = data
    ? ac(
      'coverageSummary',
      '{scopeLabel}: {scopePct} entity coverage. {answered} answered resource-source pairs; {debt} pairs remain uncertainty debt.',
      {
        scopeLabel: ac(`scopeState.${scope?.state || 'unstarted'}.label`, scopeMeta.label),
        scopePct: scopePct ? formatPct(scopePct) : '0%',
        answered: data.rollup.answeredPairs,
        debt: data.rollup.uncertaintyDebtPairs,
      },
    )
    : ac('coveragePending', 'Coverage certainty appears after the asset coverage ledger returns source-pair data.')

  const metrics = [
    {
      label: ac('scope', 'Scope'),
      value: scope ? ac(`scopeState.${scope.state}.label`, scopeMeta.label) : '--',
      detail: scopePct ? formatPct(scopePct) : '0%',
      tone: scopeMeta.tone,
      icon: <Building2 size={15} />,
    },
    {
      label: ac('confirmed', 'Confirmed'),
      value: loading ? '--' : data?.rollup.confirmedResources ?? '--',
      detail: ac('confirmedInventory', 'Confirmed inventory'),
      tone: colors.semantic.success,
      icon: <Database size={15} />,
    },
    {
      label: ac('quarantine', 'Quarantine'),
      value: loading ? '--' : data?.rollup.quarantinedCandidates ?? '--',
      detail: ac('candidateQueue', 'Candidate queue'),
      tone: colors.semantic.warning,
      icon: <ShieldQuestion size={15} />,
    },
    {
      label: ac('debt', 'Debt'),
      value: loading ? '--' : data?.rollup.uncertaintyDebtPairs ?? '--',
      detail: formatPct(debtPct),
      tone: debtTone,
      icon: <AlertTriangle size={15} />,
    },
  ]

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', lg: 'minmax(260px, 0.72fr) minmax(0, 1fr)' },
        alignItems: 'stretch',
        gap: 1.1,
        minWidth: 0,
      }}
    >
      <Box
        sx={{
          minWidth: 0,
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr)',
          alignItems: 'center',
          gap: 1.2,
          px: { xs: 1.1, md: 1.35 },
          py: 1,
          border: `1px solid ${coverageToneBorder(theme, ACCENT)}`,
          borderRadius: 1,
          bgcolor: coverageTintSurface(theme, ACCENT),
        }}
      >
        <Box
          sx={{
            width: 82,
            height: 82,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            position: 'relative',
            flex: '0 0 auto',
            background: `conic-gradient(${ACCENT} ${Math.max(0, Math.min(100, answeredPct)) * 3.6}deg, ${coverageProgressTrack(theme)} 0deg)`,
            '&::after': {
              content: '""',
              position: 'absolute',
              inset: 10,
              borderRadius: '50%',
              bgcolor: theme.palette.background.paper,
              border: `1px solid ${coverageBorder(theme, 'muted')}`,
            },
          }}
        >
          <Box sx={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
            <Typography sx={{ fontSize: 24, lineHeight: 1, fontWeight: 950, color: ACCENT }}>
              {loading ? '--' : formatPct(answeredPct)}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, fontWeight: 850 }}>
              {ac('coverageCertainty', 'Coverage certainty')}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.45 }}>
            <Box sx={{ color: ACCENT, display: 'flex' }}><ClipboardCheck size={16} /></Box>
            <Typography sx={{ fontSize: 14, fontWeight: 900 }}>
              {data && data.rollup.uncertaintyDebtPairs > 0
                ? ac('scopeIncomplete', 'Scope is not ready')
                : ac('coverageBaselineReady', 'Coverage baseline ready')}
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.45 }}>
            {summary}
          </Typography>
        </Box>
      </Box>

      <Box
        sx={{
          minWidth: 0,
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
          gap: 1,
        }}
      >
        {metrics.map((item) => (
          <Box
            key={item.label}
            sx={{
              minWidth: 0,
              border: `1px solid ${coverageToneBorder(theme, item.tone)}`,
              borderRadius: 1,
              bgcolor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.46 : 0.86),
              px: 1,
              py: 0.9,
              display: 'grid',
              gridTemplateColumns: 'auto minmax(0, 1fr)',
              alignItems: 'start',
              gap: 0.85,
            }}
          >
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: 1,
                display: 'grid',
                placeItems: 'center',
                color: item.tone,
                bgcolor: alpha(item.tone, 0.12),
              }}
            >
              {item.icon}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 850 }} noWrap>
                {item.label}
              </Typography>
              <Box sx={{ minWidth: 0, mt: 0.15 }}>
                <Typography
                  sx={{
                    fontSize: typeof item.value === 'string' && item.value.length > 5 ? 16 : 20,
                    lineHeight: 1.08,
                    fontWeight: 950,
                    color: item.tone,
                    overflowWrap: 'anywhere',
                  }}
                  title={String(item.value)}
                >
                  {item.value}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: 0.2, fontWeight: 800, lineHeight: 1.15 }}
                >
                  {item.detail}
                </Typography>
              </Box>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

function EngineerLedgerHeader({
  data,
  scopeTone,
  isError,
}: {
  data?: AssetCoverageResponse
  scopeTone: string
  isError: boolean
}) {
  const theme = useTheme()
  const answeredPct = data ? pct(data.rollup.answeredPairs, data.rollup.totalResourceSourcePairs) : 0
  const debtPct = data?.rollup.uncertaintyDebtPercentage ?? 0
  return (
    <Box
      sx={{
        minWidth: 0,
        border: `1px solid ${coverageBorder(theme)}`,
        borderLeft: `3px solid ${ACCENT}`,
        borderRadius: 1,
        bgcolor: coverageSurface(theme),
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          px: { xs: 1.25, md: 1.5 },
          py: 1.2,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.2fr) minmax(420px, 0.8fr)' },
          gap: 1.25,
          alignItems: 'center',
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
            <Box
              sx={{
                width: 34,
                height: 34,
                borderRadius: 1,
                color: ACCENT,
                bgcolor: alpha(ACCENT, 0.1),
                display: 'grid',
                placeItems: 'center',
                flex: '0 0 auto',
              }}
            >
              <ClipboardCheck size={19} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography component="h1" variant="h5" sx={{ fontWeight: 900, lineHeight: 1.05 }} noWrap>
                {ac('engineerTitle', 'Asset Coverage Ledger')}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {ac(
                  'engineerSubtitleLine',
                  'Generated {time} · source-pair answers, debt states, and quarantine evidence',
                  { time: formatDateTime(data?.generatedAt) },
                )}
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 0.9 }}>
            <Chip
              size="small"
              icon={<FileWarning size={14} />}
              label={ac('debtIsNotAbsence', 'Debt is not absence')}
              sx={{ height: 24, fontWeight: 850, bgcolor: alpha(colors.semantic.info, 0.1), color: colors.semantic.info }}
            />
            {isError && <Chip size="small" color="warning" label={ac('ledgerUnavailableShort', 'Coverage ledger unavailable')} />}
          </Stack>
        </Box>

        <Box
          sx={{
            minWidth: 0,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '178px minmax(0, 1fr)' },
            gap: 0.9,
            alignItems: 'stretch',
          }}
        >
          <CoveragePrism3D
            answeredPct={answeredPct}
            debtPct={debtPct}
            scopePct={data?.scope ? scopeCompletenessPct(data.scope) : 0}
            sourceCount={data?.rollup.sourceCount ?? 0}
            confirmedCount={data?.rollup.confirmedResources ?? 0}
            quarantineCount={data?.rollup.quarantinedCandidates ?? 0}
            compact
          />
          <Box sx={{ display: 'grid', gap: 0.6 }}>
            <Box sx={{ display: 'grid', gap: 0.6 }}>
              <LedgerBar label={ac('answered', 'Answered')} value={answeredPct} tone={colors.semantic.success} />
              <LedgerBar label={ac('uncertaintyDebt', 'Uncertainty debt')} value={debtPct} tone={debtPct > 0 ? colors.semantic.warning : colors.semantic.neutral} />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 0.6 }}>
              <LedgerStat label={ac('confirmed', 'Confirmed')} value={data?.rollup.confirmedResources ?? '--'} tone={colors.semantic.success} />
              <LedgerStat label={ac('sources', 'Sources')} value={data?.rollup.sourceCount ?? '--'} tone={ACCENT} />
              <LedgerStat label={ac('answered', 'Answered')} value={data ? `${data.rollup.answeredPairs}/${data.rollup.totalResourceSourcePairs}` : '--'} tone={colors.semantic.success} />
              <LedgerStat
                label={ac('scope', 'Scope')}
                value={data?.scope ? ac(`scopeState.${data.scope.state}.label`, scopeStateMeta(data.scope.state).label) : '--'}
                tone={scopeTone}
              />
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

function LedgerBar({ label, value, tone }: { label: string; value: number; tone: string }) {
  const theme = useTheme()
  return (
    <Box sx={{ minWidth: 0 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
        <Typography variant="caption" sx={{ fontWeight: 850, color: 'text.secondary' }}>{label}</Typography>
        <Typography variant="caption" sx={{ fontWeight: 900, color: tone }}>{formatPct(value)}</Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={value}
        sx={{
          mt: 0.35,
          height: 7,
          borderRadius: 999,
          bgcolor: coverageProgressTrack(theme),
          '& .MuiLinearProgress-bar': { bgcolor: tone, borderRadius: 999 },
        }}
      />
    </Box>
  )
}

function LedgerStat({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return (
    <Box
      sx={{
        minWidth: 0,
        border: '1px solid',
        borderColor: alpha(tone, 0.22),
        borderRadius: 1,
        px: 0.8,
        py: 0.65,
        bgcolor: alpha(tone, 0.055),
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 850 }} noWrap>{label}</Typography>
      <Typography sx={{ mt: 0.15, fontSize: 16, lineHeight: 1, fontWeight: 950, color: tone }} noWrap title={String(value)}>
        {value}
      </Typography>
    </Box>
  )
}

function AssetCoverageManagerWorkbench({
  tab,
  onTabChange,
  data,
  isLoading,
  isError,
  scope,
  actionItems,
  debtSources,
  statusCounts,
  resources,
  onSelectResource,
}: {
  tab: ManagerCoverageTab
  onTabChange: (value: ManagerCoverageTab) => void
  data?: AssetCoverageResponse
  isLoading: boolean
  isError: boolean
  scope?: CoverageScope
  actionItems: ManagerActionItem[]
  debtSources: CoverageSource[]
  statusCounts: Record<string, number>
  resources: CoverageResource[]
  onSelectResource: (resource: CoverageResource) => void
}) {
  return (
    <CoverageTabbedFrame
      value={tab}
      onChange={(value) => onTabChange(value as ManagerCoverageTab)}
      tabs={MANAGER_TABS.map((item) => {
        if (item.value === 'worklist') return localizedTab(item, actionItems.length)
        if (item.value === 'sources') return localizedTab(item, data?.sources.length ?? 0)
        if (item.value === 'resources') return localizedTab(item, resources.length)
        if (item.value === 'quarantine') return localizedTab(item, data?.quarantine.length ?? 0)
        return localizedTab(item)
      })}
      ariaLabel={ac('aria.managerSections', 'Asset coverage manager sections')}
    >
      {isLoading ? (
        <TabbedLoadingState />
      ) : (
        <ManagerTabContent
          tab={tab}
          data={data}
          isError={isError}
          scope={scope}
          actionItems={actionItems}
          debtSources={debtSources}
          statusCounts={statusCounts}
          resources={resources}
          onSelectResource={onSelectResource}
        />
      )}
    </CoverageTabbedFrame>
  )
}

function ManagerTabContent({
  tab,
  data,
  isError,
  scope,
  actionItems,
  debtSources,
  statusCounts,
  resources,
  onSelectResource,
}: {
  tab: ManagerCoverageTab
  data?: AssetCoverageResponse
  isError: boolean
  scope?: CoverageScope
  actionItems: ManagerActionItem[]
  debtSources: CoverageSource[]
  statusCounts: Record<string, number>
  resources: CoverageResource[]
  onSelectResource: (resource: CoverageResource) => void
}) {
  if (isError) {
    return <LedgerUnavailable />
  }
  if (!data) {
    return <NoCoverageData />
  }
  if (tab === 'worklist') {
    return (
      <ManagerActionList
        title={ac('coverageWorklist', 'Coverage worklist')}
        subtitle={ac('coverageWorklistSubtitle', 'Confirmed resources with unresolved source-pair debt.')}
        items={actionItems}
        emptyText={ac('noUnresolvedDebt', 'No unresolved coverage debt returned')}
        actionLabel={ac('openEngineerView', 'Open engineer view')}
      />
    )
  }
  if (tab === 'sources') {
    return (
      <Stack spacing={1.5}>
        <SourceStatusStrip counts={statusCounts} total={data.sources.length} />
        {debtSources.length > 0 && (
          <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
            {debtSources.map((source) => <SourceDebtCard key={source.integrationId} source={source} />)}
          </Box>
        )}
        <Surface
          title={ac('sourceHealth', 'Source health')}
          subtitle={ac(
            'sourceHealthSubtitle',
            '{count} registered sources; debt states are tracked separately from negative findings.',
            { count: data.sources.length },
          )}
        >
          <SourceTable sources={data.sources} />
        </Surface>
      </Stack>
    )
  }
  if (tab === 'resources') {
    return (
      <Surface
        title={ac('resourcePairsTitle', 'Confirmed resource source-pairs')}
        subtitle={ac(
          'resourcePairsSubtitle',
          '{count} confirmed resources sorted by unresolved debt. Click a row for claims and caveats.',
          { count: resources.length },
        )}
      >
        <ResourceTable resources={resources} onSelect={onSelectResource} />
      </Surface>
    )
  }
  if (tab === 'quarantine') {
    return (
      <Surface title={ac('quarantine', 'Quarantine')} subtitle={ac('quarantineSubtitle', 'Candidate resources are reviewable evidence but not counted until confirmed.')}>
        <QuarantineTable items={data.quarantine} />
      </Surface>
    )
  }
  return (
    <ManagerDecisionOverview
      data={data}
      scope={scope}
      actionItems={actionItems}
      debtSources={debtSources}
      statusCounts={statusCounts}
      resources={resources}
    />
  )
}

function ManagerDecisionOverview({
  data,
  scope,
  actionItems,
  debtSources,
  statusCounts,
  resources,
}: {
  data: AssetCoverageResponse
  scope?: CoverageScope
  actionItems: ManagerActionItem[]
  debtSources: CoverageSource[]
  statusCounts: Record<string, number>
  resources: CoverageResource[]
}) {
  const theme = useTheme()
  const scopeRollup = normalizeScopeRollup(scope)
  const answeredPct = pct(data.rollup.answeredPairs, data.rollup.totalResourceSourcePairs)
  const scopePct = scopeCompletenessPct(scope)
  const debtPct = data.rollup.uncertaintyDebtPercentage
  const scopeMeta = scopeStateMeta(scope?.state)
  const blocked = data.rollup.uncertaintyDebtPairs > 0 || scopeRollup.entitiesWithDebt > 0
  const decisionTone = blocked ? colors.semantic.warning : colors.semantic.success
  const debtResourceCount = resources.filter((resource) => coverageDebtForResource(resource) > 0).length

  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1.05fr) minmax(360px, 0.95fr)' },
          gap: 1.2,
          alignItems: 'stretch',
        }}
      >
        <Box
          sx={{
            minWidth: 0,
            border: `1px solid ${coverageToneBorder(theme, decisionTone)}`,
            borderRadius: 1,
            p: { xs: 1.25, md: 1.5 },
            bgcolor: coverageTintSurface(theme, decisionTone),
            display: 'grid',
            gap: 1.25,
          }}
        >
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <Box
              sx={{
                width: 34,
                height: 34,
                borderRadius: 1,
                display: 'grid',
                placeItems: 'center',
                bgcolor: alpha(decisionTone, 0.14),
                color: decisionTone,
                flex: '0 0 auto',
              }}
            >
              <ClipboardCheck size={18} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 900 }}>
                {ac('managerDecisionKicker', 'Manager decision')}
              </Typography>
              <Typography component="h2" sx={{ mt: 0.2, fontSize: { xs: 22, md: 28 }, lineHeight: 1.05, fontWeight: 950, color: decisionTone }}>
                {blocked ? ac('managerDecisionBlocked', 'Not ready to claim complete coverage') : ac('managerDecisionReady', 'Coverage baseline is ready')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.7, lineHeight: 1.5 }}>
                {ac(
                  'managerDecisionBody',
                  '{answered} answered pairs, {debt} evidence-debt pairs, {quarantine} quarantined candidates. Focus on the debt categories before using this as a board-level coverage claim.',
                  {
                    answered: data.rollup.answeredPairs,
                    debt: data.rollup.uncertaintyDebtPairs,
                    quarantine: data.rollup.quarantinedCandidates,
                  },
                )}
              </Typography>
            </Box>
          </Stack>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1 }}>
            <ManagerDecisionProgress label={ac('answered', 'Answered')} value={answeredPct} tone={colors.semantic.success} />
            <ManagerDecisionProgress label={ac('declaredEntityCoverage', 'Declared entity coverage')} value={scopePct} tone={scopeMeta.tone} />
            <ManagerDecisionProgress label={ac('uncertaintyDebt', 'Uncertainty debt')} value={debtPct} tone={debtPct > 0 ? colors.semantic.warning : colors.semantic.neutral} />
          </Box>

          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
            <ManagerRuleChip label={ac('policyValue.confirmed_resources_only', 'Confirmed resources only')} />
            <ManagerRuleChip label={ac('policyValue.debt_not_absence', 'Evidence debt, not absence')} />
            <ManagerRuleChip label={ac('policyValue.quarantine_until_confirmed', 'Quarantine until confirmed')} />
          </Stack>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))', xl: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>
          <ManagerDecisionTile
            label={ac('managerTile.priorityActions', 'Priority actions')}
            value={actionItems.length}
            helper={ac('managerTile.priorityActionsHelper', 'Items blocking a clean coverage claim')}
            tone={actionItems.length > 0 ? colors.semantic.warning : colors.semantic.success}
          />
          <ManagerDecisionTile
            label={ac('managerTile.sourceRepair', 'Source repair')}
            value={debtSources.length}
            helper={ac('managerTile.sourceRepairHelper', 'Sources needing refresh, credentials, or retry')}
            tone={debtSources.length > 0 ? colors.semantic.warning : colors.semantic.success}
          />
          <ManagerDecisionTile
            label={ac('managerTile.debtResources', 'Debt resources')}
            value={debtResourceCount}
            helper={ac('managerTile.debtResourcesHelper', 'Confirmed resources with unresolved source-pairs')}
            tone={debtResourceCount > 0 ? colors.semantic.warning : colors.semantic.success}
          />
          <ManagerDecisionTile
            label={ac('managerTile.confirmedInventory', 'Confirmed inventory')}
            value={data.rollup.confirmedResources}
            helper={ac('managerTile.confirmedInventoryHelper', 'Resources counted in the main inventory')}
            tone={colors.semantic.success}
          />
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(320px, 0.72fr) minmax(0, 1fr)' }, gap: 1.2, alignItems: 'start' }}>
        <ManagerActionList
          title={ac('managerNextActions', 'Next actions')}
          subtitle={ac('managerNextActionsSubtitle', 'Ranked items that change the executive coverage answer.')}
          items={actionItems.slice(0, 5)}
          emptyText={ac('noUnresolvedDebt', 'No unresolved coverage debt returned')}
          actionLabel={ac('review', 'Review')}
        />
        <CoverageCaveatSummary caveats={data.caveats} />
      </Box>

      <Box sx={{ borderTop: `1px solid ${coverageBorder(theme, 'muted')}`, pt: 1 }}>
        <SourceStatusStrip counts={statusCounts} total={data.sources.length} />
      </Box>
    </Box>
  )
}

function ManagerRuleChip({ label }: { label: string }) {
  return (
    <Chip
      size="small"
      label={label}
      sx={{
        height: 24,
        borderRadius: 1,
        fontWeight: 850,
        bgcolor: alpha(ACCENT, 0.1),
        color: ACCENT,
      }}
    />
  )
}

function ManagerDecisionProgress({ label, value, tone }: { label: string; value: number; tone: string }) {
  const theme = useTheme()
  return (
    <Box sx={{ minWidth: 0 }}>
      <Stack direction="row" justifyContent="space-between" spacing={1}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 850 }} noWrap>
          {label}
        </Typography>
        <Typography variant="caption" sx={{ fontWeight: 950, color: tone }}>
          {formatPct(value)}
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={value}
        sx={{
          mt: 0.55,
          height: 8,
          borderRadius: 999,
          bgcolor: coverageProgressTrack(theme),
          '& .MuiLinearProgress-bar': { bgcolor: tone, borderRadius: 999 },
        }}
      />
    </Box>
  )
}

function ManagerDecisionTile({
  label,
  value,
  helper,
  tone,
}: {
  label: string
  value: number | string
  helper: string
  tone: string
}) {
  const theme = useTheme()
  return (
    <Box
      sx={{
        minWidth: 0,
        minHeight: 116,
        border: `1px solid ${coverageToneBorder(theme, tone)}`,
        borderRadius: 1,
        p: 1.15,
        bgcolor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.42 : 0.82),
        backgroundImage: `linear-gradient(135deg, ${alpha(tone, 0.1)}, transparent 64%)`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, lineHeight: 1.2 }}>
        {label}
      </Typography>
      <Box>
        <Typography sx={{ color: tone, fontSize: { xs: 22, md: 28 }, lineHeight: 1, fontWeight: 950 }} noWrap title={String(value)}>
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.55, lineHeight: 1.25 }}>
          {helper}
        </Typography>
      </Box>
    </Box>
  )
}

function EngineerTabContent({
  tab,
  data,
  resources,
  scopeEntities,
  statusCounts,
  selectedResource,
  onSelectResource,
}: {
  tab: EngineerCoverageTab
  data?: AssetCoverageResponse
  resources: CoverageResource[]
  scopeEntities: CoverageEntity[]
  statusCounts: Record<string, number>
  selectedResource: CoverageResource | null
  onSelectResource: (resource: CoverageResource) => void
}) {
  if (!data) return <NoCoverageData />
  if (tab === 'policy') {
    return (
      <Stack spacing={1.5}>
        <Surface title={ac('evidencePolicy', 'Evidence policy')} subtitle={ac('evidencePolicySubtitle', 'Coverage ledger rules before presentation.')}>
          <PolicySummary data={data} />
        </Surface>
        <Alert severity="info" sx={{ fontSize: 13 }}>
          {ac('coverageDebtWarning', 'Coverage debt states are not clean absence; they mean the backend has not returned a current answer yet.')}
        </Alert>
      </Stack>
    )
  }
  if (tab === 'scope') {
    const scopeRollup = normalizeScopeRollup(data.scope)
    return data.scope ? (
      <Surface
        title={ac('entityScopeLedger', 'Entity scope ledger')}
        subtitle={ac(
          'entityScopeSubtitle',
          '{covered}/{required} required entities covered; {debt} entities still carry debt.',
          {
            covered: scopeRollup.coveredEntities,
            required: scopeRollup.requiredEntities,
            debt: scopeRollup.entitiesWithDebt,
          },
        )}
      >
        <ScopeEntityTable entities={scopeEntities} />
      </Surface>
    ) : (
      <Alert severity="info" icon={<Building2 size={16} />} sx={{ fontSize: 13 }}>
        {ac('noScopeLedger', 'No entity scope ledger returned. Group-level completeness cannot be claimed from resource coverage alone.')}
      </Alert>
    )
  }
  if (tab === 'sources') {
    return (
      <Stack spacing={1.5}>
        <SourceStatusStrip counts={statusCounts} total={data.sources.length} />
        <Surface
          title={ac('sourceHealth', 'Source health')}
          subtitle={ac(
            'sourceHealthCounts',
            '{count} registered sources; counts: {counts}',
            {
              count: data.sources.length,
              counts: Object.entries(statusCounts).map(([k, v]) => `${localizedSourceStatusLabel(k)} ${v}`).join(', ') || ac('none', 'none'),
            },
          )}
        >
          <SourceTable sources={data.sources} />
        </Surface>
      </Stack>
    )
  }
  if (tab === 'quarantine') {
    return (
      <Surface title={ac('quarantine', 'Quarantine')} subtitle={ac('quarantineSubtitle', 'Candidate resources are reviewable evidence but not counted until confirmed.')}>
        <QuarantineTable items={data.quarantine} />
      </Surface>
    )
  }
  return (
    <Stack spacing={1.5}>
      <Surface
        title={ac('resourcePairsTitle', 'Confirmed resource source-pairs')}
        subtitle={ac(
          'resourcePairsSubtitle',
          '{count} confirmed resources sorted by unresolved debt. Click a row for claims and caveats.',
          { count: resources.length },
        )}
      >
        <ResourceTable
          resources={resources}
          onSelect={onSelectResource}
          selectedId={selectedResource?.resource.id}
          expandable
        />
      </Surface>
      <CoverageCaveatSummary caveats={data.caveats} />
    </Stack>
  )
}

function CoverageTabbedFrame({
  value,
  onChange,
  tabs,
  ariaLabel,
  children,
}: {
  value: string
  onChange: (value: string) => void
  tabs: Array<{ value: string; label: string; count?: number }>
  ariaLabel: string
  children: React.ReactNode
}) {
  const theme = useTheme()
  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr)',
        border: `1px solid ${coverageBorder(theme)}`,
        borderRadius: 1,
        bgcolor: coverageSurface(theme),
        overflow: 'hidden',
      }}
    >
      <Box sx={{ borderBottom: `1px solid ${coverageBorder(theme, 'muted')}`, bgcolor: coverageSubtleSurface(theme), px: 1 }}>
        <Tabs
          value={value}
          onChange={(_, next) => onChange(next)}
          variant="scrollable"
          scrollButtons="auto"
          aria-label={ariaLabel}
          sx={{
            minHeight: 44,
            '& .MuiTabs-indicator': { bgcolor: ACCENT, height: 3, borderRadius: 1 },
            '& .MuiTab-root': {
              minHeight: 44,
              textTransform: 'none',
              fontSize: 13,
              fontWeight: 800,
              px: 1.25,
            },
          }}
        >
          {tabs.map((tab) => (
            <Tab
              key={tab.value}
              value={tab.value}
              label={<TabLabel label={tab.label} count={tab.count} />}
            />
          ))}
        </Tabs>
      </Box>
      <Box
        role="tabpanel"
        data-testid="asset-coverage-tab-panel"
        sx={{
          minHeight: 0,
          overflow: 'auto',
          overflowX: 'hidden',
          p: { xs: 1.25, md: 1.5 },
        }}
      >
        {children}
      </Box>
    </Box>
  )
}

function TabLabel({ label, count }: { label: string; count?: number }) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
      <span>{label}</span>
      {count != null && (
        <Chip
          size="small"
          label={count}
          sx={{ height: 18, fontSize: 12, fontWeight: 800, '& .MuiChip-label': { px: 0.65 } }}
        />
      )}
    </Box>
  )
}

function SourceStatusStrip({ counts, total }: { counts: Record<string, number>; total: number }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', minHeight: 30 }}>
      <Chip size="small" label={ac('registeredSources', '{count} registered sources', { count: total })} sx={{ fontWeight: 800 }} />
      {Object.entries(counts)
        .sort(([a], [b]) => sourceStatusMeta(a).priority - sourceStatusMeta(b).priority)
        .map(([status, count]) => {
          return <StatusChip key={status} status={status} label={`${localizedSourceStatusLabel(status)}: ${count}`} />
        })}
    </Box>
  )
}

function TabbedLoadingState() {
  return (
    <Box sx={{ minHeight: 220, display: 'grid', placeItems: 'center' }}>
      <Stack spacing={1} alignItems="center">
        <LinearProgress sx={{ width: 180 }} />
        <Typography variant="body2" color="text.secondary">{ac('loadingCoverageLedger', 'Loading coverage ledger...')}</Typography>
      </Stack>
    </Box>
  )
}

function LedgerUnavailable() {
  return (
    <Alert severity="warning" sx={{ fontSize: 13 }}>
      {ac(
        'ledgerUnavailable',
        'Coverage ledger unavailable. Existing asset data can still be shown elsewhere, but coverage certainty cannot be evaluated from this response.',
      )}
    </Alert>
  )
}

function NoCoverageData() {
  return (
    <Typography variant="body2" color="text.secondary">
      {ac('noCoverageData', 'No coverage response has been returned for this organization context.')}
    </Typography>
  )
}

function CoverageCaveatSummary({ caveats }: { caveats?: string[] | null }) {
  const theme = useTheme()
  const [expanded, setExpanded] = useState(false)
  const items = useMemo(() => (caveats ?? []).filter(Boolean), [caveats])
  const bucketCounts = useMemo(() => {
    return items.reduce<Record<CaveatKind, number>>(
      (acc, item) => {
        acc[classifyCoverageCaveat(item)] += 1
        return acc
      },
      { stale: 0, credential: 0, unknown: 0, quarantine: 0, other: 0 },
    )
  }, [items])

  if (items.length === 0) return null

  return (
    <Box
      sx={{
        border: `1px solid ${coverageToneBorder(theme, ACCENT)}`,
        borderRadius: 1,
        bgcolor: coverageTintSurface(theme, ACCENT),
        p: 1.15,
        display: 'grid',
        gap: 0.9,
      }}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'flex-start' }}>
        <Stack direction="row" spacing={0.8} alignItems="flex-start" sx={{ minWidth: 0 }}>
          <Box sx={{ color: ACCENT, display: 'inline-flex', mt: 0.15 }}>
            <FileWarning size={16} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" useFlexGap flexWrap="wrap">
              <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
                {ac('coverageDebtSummaryTitle', 'Coverage debt summary')}
              </Typography>
              <Chip size="small" label={ac('caveatCount', '{count} caveats', { count: items.length })} sx={{ height: 21, fontWeight: 850 }} />
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.2, lineHeight: 1.45 }}>
              {ac(
                'coverageDebtSummaryBody',
                'Backend returned raw caveats for traceability. This view groups them into actionable debt categories instead of showing a debug wall.',
              )}
            </Typography>
          </Box>
        </Stack>
        <Box
          component="button"
          type="button"
          onClick={() => setExpanded((value) => !value)}
          sx={{
            justifySelf: { xs: 'start', md: 'end' },
            border: `1px solid ${alpha(ACCENT, 0.32)}`,
            borderRadius: 1,
            px: 1,
            py: 0.45,
            bgcolor: alpha(theme.palette.background.paper, 0.72),
            color: ACCENT,
            font: 'inherit',
            fontSize: 12,
            fontWeight: 900,
            cursor: 'pointer',
          }}
        >
          {expanded ? ac('hideCaveatDetails', 'Hide details') : ac('showCaveatDetails', 'Show details')}
        </Box>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(5, minmax(0, 1fr))' }, gap: 0.75 }}>
        {CAVEAT_BUCKETS.map((bucket) => (
          <Box
            key={bucket.kind}
            sx={{
              minWidth: 0,
              border: `1px solid ${alpha(bucket.tone, 0.22)}`,
              borderRadius: 1,
              px: 0.9,
              py: 0.7,
              bgcolor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.3 : 0.72),
            }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 850 }} noWrap>
              {ac(bucket.labelKey, bucket.fallback)}
            </Typography>
            <Typography sx={{ mt: 0.2, color: bucket.tone, fontSize: 18, lineHeight: 1, fontWeight: 950 }}>
              {bucketCounts[bucket.kind]}
            </Typography>
          </Box>
        ))}
      </Box>

      {expanded && (
        <Box
          sx={{
            maxHeight: 190,
            overflowY: 'auto',
            border: `1px solid ${coverageBorder(theme, 'muted')}`,
            borderRadius: 1,
            bgcolor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.42 : 0.68),
          }}
        >
          {items.map((item, index) => (
            <Box
              key={`${item}-${index}`}
              sx={{
                px: 1,
                py: 0.7,
                borderTop: index === 0 ? 'none' : `1px solid ${coverageBorder(theme, 'muted')}`,
              }}
            >
              <Typography variant="body2" sx={{ lineHeight: 1.45, wordBreak: 'break-word' }}>
                {localizedEvidenceText(item)}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}

function CoveragePrism3D({
  answeredPct,
  debtPct,
  scopePct,
  sourceCount,
  confirmedCount,
  quarantineCount,
  loading = false,
  compact = false,
}: {
  answeredPct: number
  debtPct: number
  scopePct: number
  sourceCount: number
  confirmedCount: number
  quarantineCount: number
  loading?: boolean
  compact?: boolean
}) {
  const theme = useTheme()
  const isJsdom = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)
  const canRender3d = typeof window !== 'undefined' && !isJsdom
  const answered = loading ? 0 : Math.max(0, Math.min(100, answeredPct))
  const debt = loading ? 0 : Math.max(0, Math.min(100, debtPct))
  const scope = loading ? 0 : Math.max(0, Math.min(100, scopePct))
  const height = compact ? 112 : 154
  const stats = [
    { label: ac('prism.answered', 'Answered'), value: formatPct(answered), tone: COVERED_TONE },
    { label: ac('uncertaintyDebt', 'Uncertainty debt'), value: formatPct(debt), tone: DEBT_TONE },
    { label: ac('prism.sources', 'Sources'), value: sourceCount, tone: ACCENT },
    { label: ac('prism.quarantine', 'Quarantine'), value: quarantineCount, tone: QUARANTINE_TONE },
  ]

  return (
    <Box
      data-testid="coverage-prism-3d"
      sx={{
        width: '100%',
        minHeight: height,
        border: `1px solid ${coverageBorder(theme)}`,
        borderRadius: 1,
        position: 'relative',
        overflow: 'hidden',
        bgcolor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.45 : 0.84),
        backgroundImage: `linear-gradient(135deg, ${alpha(ACCENT, theme.palette.mode === 'dark' ? 0.16 : 0.09)}, transparent 54%)`,
        display: 'grid',
        gridTemplateColumns: compact ? '1fr' : { xs: '1fr', md: 'minmax(0, 1fr) 136px' },
        alignItems: 'stretch',
      }}
    >
      <Box sx={{ position: 'absolute', inset: 0, opacity: 0.42, backgroundImage: `radial-gradient(circle at 45% 30%, ${alpha(COVERED_TONE, 0.2)}, transparent 30%)` }} />
      <Box sx={{ position: 'relative', minHeight: height, minWidth: 0 }}>
        {canRender3d ? (
          <Canvas
            dpr={[1, 1.5]}
            camera={{ position: [3.8, 2.8, 4.6], fov: 40 }}
            gl={{ antialias: true, alpha: true }}
            style={{ position: 'absolute', inset: 0 }}
          >
            <Suspense fallback={null}>
              <CoveragePrismScene
                answeredPct={answered}
                debtPct={debt}
                scopePct={scope}
                sourceCount={sourceCount}
                confirmedCount={confirmedCount}
                quarantineCount={quarantineCount}
                compact={compact}
              />
            </Suspense>
          </Canvas>
        ) : (
          <CoveragePrismFallback answeredPct={answered} debtPct={debt} sourceCount={sourceCount} />
        )}
      </Box>
      {!compact && (
        <Box
          sx={{
            position: 'relative',
            zIndex: 1,
            borderLeft: { md: `1px solid ${coverageBorder(theme, 'muted')}` },
            px: 1,
            py: 0.9,
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(4, minmax(0, 1fr))', md: '1fr' },
            gap: 0.55,
            alignContent: 'center',
          }}
        >
          {stats.map((item) => (
            <Box
              key={item.label}
              sx={{
                minWidth: 0,
                px: 0.7,
                py: 0.45,
                borderRadius: 0.8,
                bgcolor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.55 : 0.66),
                border: `1px solid ${alpha(item.tone, 0.22)}`,
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 10.5, fontWeight: 850, lineHeight: 1.1 }} noWrap>
                {item.label}
              </Typography>
              <Typography sx={{ mt: 0.2, color: item.tone, fontSize: 13, fontWeight: 950, lineHeight: 1 }} noWrap>
                {item.value}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}

function CoveragePrismFallback({
  answeredPct,
  debtPct,
  sourceCount,
}: {
  answeredPct: number
  debtPct: number
  sourceCount: number
}) {
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 12,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        alignItems: 'end',
        gap: 1,
        pb: 4.8,
      }}
    >
      {[answeredPct, Math.max(debtPct, 6), Math.max(12, Math.min(100, sourceCount * 5))].map((value, index) => {
        const tone = index === 0 ? COVERED_TONE : index === 1 ? DEBT_TONE : ACCENT
        return (
          <Box
            key={index}
            sx={{
              height: `${Math.max(18, Math.min(92, value))}%`,
              borderRadius: 1,
              bgcolor: alpha(tone, 0.18),
              border: `1px solid ${alpha(tone, 0.42)}`,
            }}
          />
        )
      })}
    </Box>
  )
}

function CoveragePrismScene({
  answeredPct,
  debtPct,
  scopePct,
  sourceCount,
  confirmedCount,
  quarantineCount,
  compact,
}: {
  answeredPct: number
  debtPct: number
  scopePct: number
  sourceCount: number
  confirmedCount: number
  quarantineCount: number
  compact: boolean
}) {
  const group = useRef<THREE.Group>(null)
  const nodeCount = Math.max(5, Math.min(12, sourceCount || 5))
  const answeredHeight = THREE.MathUtils.lerp(0.28, compact ? 1.25 : 1.65, answeredPct / 100)
  const debtHeight = THREE.MathUtils.lerp(0.18, compact ? 1.05 : 1.45, debtPct / 100)
  const scopeRadius = THREE.MathUtils.lerp(0.8, compact ? 1.32 : 1.55, scopePct / 100)
  const quarantineHeight = THREE.MathUtils.lerp(0.16, compact ? 0.75 : 0.95, Math.min(quarantineCount, 12) / 12)
  const confirmedHeight = THREE.MathUtils.lerp(0.24, compact ? 1.0 : 1.35, Math.min(confirmedCount, 120) / 120)

  useFrame(({ clock }) => {
    if (!group.current) return
    const t = clock.getElapsedTime()
    group.current.rotation.y = -0.42 + Math.sin(t * 0.36) * 0.12
    group.current.rotation.x = -0.18 + Math.sin(t * 0.24) * 0.035
  })

  return (
    <>
      <ambientLight intensity={0.85} />
      <directionalLight position={[3, 4, 2]} intensity={1.4} />
      <pointLight position={[-3, 2, 3]} intensity={0.65} color={ACCENT} />
      <group ref={group} position={[0, compact ? 0.08 : 0.15, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.9, 0]}>
          <circleGeometry args={[compact ? 1.65 : 1.95, 72]} />
          <meshStandardMaterial color={ACCENT} transparent opacity={0.08} roughness={0.62} metalness={0.2} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.86, 0]}>
          <torusGeometry args={[scopeRadius, 0.015, 8, 96]} />
          <meshStandardMaterial color={ACCENT} emissive={ACCENT} emissiveIntensity={0.28} />
        </mesh>
        <CoverageBlock position={[-0.64, -0.86 + answeredHeight / 2, -0.12]} size={[0.52, answeredHeight, 0.52]} tone={COVERED_TONE} />
        <CoverageBlock position={[0.08, -0.86 + confirmedHeight / 2, 0.18]} size={[0.48, confirmedHeight, 0.48]} tone={ACCENT} />
        <CoverageBlock position={[0.74, -0.86 + debtHeight / 2, -0.12]} size={[0.42, debtHeight, 0.42]} tone={debtPct > 0 ? DEBT_TONE : colors.semantic.neutral} />
        <CoverageBlock position={[1.12, -0.86 + quarantineHeight / 2, 0.42]} size={[0.28, quarantineHeight, 0.28]} tone={QUARANTINE_TONE} />
        {Array.from({ length: nodeCount }).map((_, index) => {
          const angle = (index / nodeCount) * Math.PI * 2
          const radius = compact ? 1.18 : 1.42
          const y = -0.78 + (index % 3) * 0.08
          return (
            <mesh key={index} position={[Math.cos(angle) * radius, y, Math.sin(angle) * radius]}>
              <sphereGeometry args={[0.045 + (index % 2) * 0.012, 16, 16]} />
              <meshStandardMaterial color={index % 4 === 0 ? DEBT_TONE : ACCENT} emissive={index % 4 === 0 ? DEBT_TONE : ACCENT} emissiveIntensity={0.22} />
            </mesh>
          )
        })}
      </group>
    </>
  )
}

function CoverageBlock({
  position,
  size,
  tone,
}: {
  position: [number, number, number]
  size: [number, number, number]
  tone: string
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={tone} emissive={tone} emissiveIntensity={0.16} roughness={0.32} metalness={0.32} />
    </mesh>
  )
}

function ScopeEntityTable({ entities }: { entities: CoverageEntity[] }) {
  if (entities.length === 0) return <EmptyTable text={ac('empty.scopeEntities', 'No declared scope entities returned.')} />
  return (
    <Table size="small" aria-label="asset coverage entity scope">
      <TableHead>
        <TableRow>
          <TableCell>{ac('table.entity', 'Entity')}</TableCell>
          <TableCell>{ac('table.parent', 'Parent')}</TableCell>
          <TableCell>{ac('table.state', 'State')}</TableCell>
          <TableCell>{ac('table.required', 'Required')}</TableCell>
          <TableCell align="right">{ac('table.assets', 'Assets')}</TableCell>
          <TableCell align="right">{ac('table.sourceDebt', 'Source debt')}</TableCell>
          <TableCell align="right">{ac('table.debtItems', 'Debt items')}</TableCell>
          <TableCell>{ac('table.nextAction', 'Next action')}</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {entities.map((entity) => (
          <ScopeEntityRow key={entity.id} entity={entity} />
        ))}
      </TableBody>
    </Table>
  )
}

function ScopeEntityRow({ entity }: { entity: CoverageEntity }) {
  const primaryDebt = entity.debt?.[0]
  const sourceDebt = entity.sourceStates.reduce((sum, source) => sum + source.debtPairs, 0)
  const tone = entityDebtCount(entity) > 0 ? colors.semantic.warning : colors.semantic.success
  return (
    <TableRow>
      <TableCell sx={{ minWidth: 220 }}>
        <Stack direction="row" spacing={0.75} alignItems="flex-start">
          <Box sx={{ color: tone, display: 'inline-flex', mt: 0.25 }}><Network size={15} /></Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 800, wordBreak: 'break-word' }}>{entityLabel(entity)}</Typography>
            <Typography variant="caption" color="text.secondary">
              {entity.canonicalValue}
            </Typography>
          </Box>
        </Stack>
      </TableCell>
      <TableCell>{entity.parentId || 'root'}</TableCell>
      <TableCell>{localizedReviewStatus(entity.verificationState)}</TableCell>
      <TableCell>{entity.required ? ac('yes', 'yes') : ac('no', 'no')}</TableCell>
      <TableCell align="right">{entity.resources.length}</TableCell>
      <TableCell align="right">{sourceDebt}</TableCell>
      <TableCell align="right">{entityDebtCount(entity)}</TableCell>
      <TableCell sx={{ minWidth: 260 }}>
        {primaryDebt ? <ScopeDebtText item={primaryDebt} /> : ac('sourceAction.monitor', 'Monitor')}
      </TableCell>
    </TableRow>
  )
}

function ScopeDebtText({ item }: { item: ScopeDebtItem }) {
  return (
    <Box>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>{localizedEvidenceText(item.message)}</Typography>
      <Typography variant="caption" color="text.secondary">{item.nextAction}</Typography>
    </Box>
  )
}

function SourceDebtCard({ source }: { source: CoverageSource }) {
  const theme = useTheme()
  const meta = sourceStatusMeta(source.status)
  return (
    <Box sx={{ border: `1px solid ${coverageToneBorder(theme, meta.tone)}`, borderRadius: 1, p: 1.2, bgcolor: coverageTintSurface(theme, meta.tone) }}>
      <Stack direction="row" spacing={1} alignItems="flex-start">
        <AlertTriangle size={16} color={meta.tone} />
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={0.75} alignItems="center" useFlexGap flexWrap="wrap">
            <Typography variant="body2" sx={{ fontWeight: 800 }}>{source.label}</Typography>
            <StatusChip status={source.status} />
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.35 }}>
            {localizedSourceMessage(source)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {ac('lastAttemptWithTime', 'Last attempt: {time}', { time: formatDateTime(source.lastAttemptAt || source.lastSuccessAt) })}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {ac('nextActionWithValue', 'Next action: {action}', { action: localizedSourceNextAction(source) })}
          </Typography>
        </Box>
      </Stack>
    </Box>
  )
}

function Surface({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const theme = useTheme()
  return (
    <Box sx={{ border: `1px solid ${coverageBorder(theme)}`, borderRadius: 1, overflow: 'hidden', bgcolor: coverageSurface(theme) }}>
      <Box sx={{ px: 1.5, py: 1.25, borderBottom: `1px solid ${coverageBorder(theme, 'muted')}`, bgcolor: coverageSubtleSurface(theme) }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{title}</Typography>
        <Typography variant="body2" color="text.secondary">{subtitle}</Typography>
      </Box>
      <Box
        sx={{
          overflowX: 'auto',
          '& .MuiTableCell-head': {
            position: 'sticky',
            top: 0,
            zIndex: 1,
            bgcolor: coverageSubtleSurface(theme),
            whiteSpace: 'nowrap',
          },
          '& .MuiTableCell-root': {
            borderColor: coverageBorder(theme, 'muted'),
          },
        }}
      >
        {children}
      </Box>
    </Box>
  )
}

function SourceTable({ sources }: { sources: CoverageSource[] }) {
  if (sources.length === 0) return <EmptyTable text={ac('empty.sources', 'No source records returned.')} />
  return (
    <Table size="small" aria-label="asset coverage sources">
      <TableHead>
        <TableRow>
          <TableCell>{ac('table.source', 'Source')}</TableCell>
          <TableCell>{ac('table.status', 'Status')}</TableCell>
          <TableCell>{ac('table.nextAction', 'Next action')}</TableCell>
          <TableCell>{ac('table.mode', 'Mode')}</TableCell>
          <TableCell>{ac('table.outputGroups', 'Output groups')}</TableCell>
          <TableCell>{ac('table.missingEnv', 'Missing env')}</TableCell>
          <TableCell>{ac('table.lastAttempt', 'Last attempt')}</TableCell>
          <TableCell>{ac('table.caveat', 'Caveat')}</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {sources.map((source) => (
          <TableRow key={source.integrationId}>
            <TableCell sx={{ fontWeight: 800 }}>{source.label}</TableCell>
            <TableCell><StatusChip status={source.status} /></TableCell>
            <TableCell>{localizedSourceNextAction(source)}</TableCell>
            <TableCell>{source.collectionMode}</TableCell>
            <TableCell>{source.outputGroups.join(', ') || ac('none', 'none')}</TableCell>
            <TableCell>{source.missingEnvGroups?.join(', ') || ac('none', 'none')}</TableCell>
            <TableCell>{formatDateTime(source.lastAttemptAt || source.lastSuccessAt)}</TableCell>
            <TableCell>{localizedSourceMessage(source)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function PolicySummary({ data }: { data: { policy: {
  resourceInclusion: string
  candidateHandling: string
  uncertaintyRendering: string
  absentNotCollectedMeaning: string
  unavailableSourceTreatment: string
} } }) {
  const rows = [
    [ac('policy.resourceInclusion', 'Resource inclusion'), localizedPolicyValue(data.policy.resourceInclusion)],
    [ac('policy.candidateHandling', 'Candidate handling'), localizedPolicyValue(data.policy.candidateHandling)],
    [ac('policy.uncertaintyRendering', 'Uncertainty rendering'), localizedPolicyValue(data.policy.uncertaintyRendering)],
    [ac('policy.notCollectedMeaning', 'Not-collected meaning'), localizedPolicyValue(data.policy.absentNotCollectedMeaning)],
    [ac('policy.unavailableSourceTreatment', 'Unavailable source treatment'), localizedPolicyValue(data.policy.unavailableSourceTreatment)],
  ]
  return (
    <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', md: 'repeat(5, minmax(0, 1fr))' }, p: 1.25 }}>
      {rows.map(([label, value]) => (
        <Box key={label} sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>{label}</Typography>
          <Typography variant="body2" sx={{ fontWeight: 700, wordBreak: 'break-word' }}>{value}</Typography>
        </Box>
      ))}
    </Box>
  )
}

function ResourceTable({
  resources,
  onSelect,
  selectedId,
  expandable = false,
}: {
  resources: CoverageResource[]
  onSelect: (resource: CoverageResource) => void
  selectedId?: string
  expandable?: boolean
}) {
  if (resources.length === 0) return <EmptyTable text={ac('empty.resources', 'No confirmed resources returned.')} />
  return (
    <Table size="small" aria-label="asset coverage resources">
      <TableHead>
        <TableRow>
          <TableCell>{ac('table.resource', 'Resource')}</TableCell>
          <TableCell>{ac('table.category', 'Category')}</TableCell>
          <TableCell>{ac('table.review', 'Review')}</TableCell>
          <TableCell>{ac('table.verdict', 'Verdict')}</TableCell>
          <TableCell align="right">{ac('table.present', 'Present')}</TableCell>
          <TableCell align="right">{ac('table.vendorEmpty', 'Vendor-empty')}</TableCell>
          <TableCell align="right">{ac('table.notApplicable', 'N/A')}</TableCell>
          <TableCell align="right">{ac('table.stale', 'Stale')}</TableCell>
          <TableCell align="right">{ac('table.error', 'Error')}</TableCell>
          <TableCell align="right">{ac('table.notCollected', 'Not collected')}</TableCell>
          <TableCell>{ac('table.lastSeen', 'Last seen')}</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {resources.map((resource) => {
          const selected = selectedId === resource.resource.id
          return (
            <Fragment key={resource.resource.id}>
              <ResourceTableRow resource={resource} onSelect={onSelect} selected={selected} />
              {expandable && selected && (
                <TableRow>
                  <TableCell colSpan={11} sx={{ p: 0, borderColor: 'transparent' }}>
                    <ResourceClaimsPanel resource={resource} embedded />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          )
        })}
      </TableBody>
    </Table>
  )
}

function ResourceTableRow({
  resource,
  onSelect,
  selected,
}: {
  resource: CoverageResource
  onSelect: (resource: CoverageResource) => void
  selected?: boolean
}) {
  const verdict = resourceCoverageVerdict(resource)
  return (
    <TableRow
      hover
      tabIndex={0}
      onClick={() => onSelect(resource)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(resource)
        }
      }}
      sx={(theme) => ({
        cursor: 'pointer',
        bgcolor: selected ? alpha(ACCENT, theme.palette.mode === 'dark' ? 0.16 : 0.08) : 'transparent',
        '&:hover': { bgcolor: selected ? alpha(ACCENT, theme.palette.mode === 'dark' ? 0.2 : 0.11) : undefined },
      })}
    >
      <TableCell sx={{ fontWeight: 800 }}>{resourceLabel(resource)}</TableCell>
      <TableCell>{resource.resource.category} / {resource.resource.type}</TableCell>
      <TableCell>{localizedReviewStatus(resource.resource.reviewStatus)}</TableCell>
      <TableCell><VerdictChip verdict={verdict} /></TableCell>
      <TableCell align="right">{resource.summary.present}</TableCell>
      <TableCell align="right">{resource.summary.vendorEmpty}</TableCell>
      <TableCell align="right">{resource.summary.notApplicable}</TableCell>
      <TableCell align="right">{resource.summary.stale}</TableCell>
      <TableCell align="right">{resource.summary.error}</TableCell>
      <TableCell align="right">{resource.summary.notCollected}</TableCell>
      <TableCell>{formatDateTime(resource.resource.lastSeenAt)}</TableCell>
    </TableRow>
  )
}

function QuarantineTable({ items }: { items: QuarantineResource[] }) {
  if (items.length === 0) return <EmptyTable text={ac('empty.quarantine', 'No quarantined candidates returned.')} />
  return (
    <Table size="small" aria-label="asset coverage quarantine">
      <TableHead>
        <TableRow>
          <TableCell>{ac('table.candidate', 'Candidate')}</TableCell>
          <TableCell>{ac('table.category', 'Category')}</TableCell>
          <TableCell>{ac('table.certainty', 'Certainty')}</TableCell>
          <TableCell>{ac('table.reason', 'Reason')}</TableCell>
          <TableCell align="right">{ac('table.confidence', 'Confidence')}</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.resource.id}>
            <TableCell sx={{ fontWeight: 800 }}>{item.resource.displayName || item.resource.canonicalValue || item.resource.id}</TableCell>
            <TableCell>{item.resource.category} / {item.resource.type}</TableCell>
            <TableCell>{item.certainty}</TableCell>
            <TableCell>{item.reason}</TableCell>
            <TableCell align="right">{item.resource.confidenceScore}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function ResourceClaimsPanel({ resource, embedded = false }: { resource: CoverageResource; embedded?: boolean }) {
  const theme = useTheme()
  const verdict = resourceCoverageVerdict(resource)
  return (
    <Box
      sx={{
        p: embedded ? 1.1 : 0,
        borderTop: embedded ? `1px solid ${coverageBorder(theme, 'muted')}` : 'none',
        borderBottom: embedded ? `1px solid ${coverageBorder(theme, 'muted')}` : 'none',
        bgcolor: embedded ? alpha(ACCENT, theme.palette.mode === 'dark' ? 0.08 : 0.045) : 'transparent',
      }}
    >
      <Stack spacing={embedded ? 1.1 : 2}>
        {embedded && (
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="overline" color="text.secondary">{ac('resourceCoverage', 'Resource coverage')}</Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 900, wordBreak: 'break-word', lineHeight: 1.15 }}>
              {resourceLabel(resource)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {localizedResourceMeta(resource.resource)}
            </Typography>
          </Box>
        )}

        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
          <VerdictChip verdict={verdict} />
          <Chip size="small" label={`${ac('table.present', 'Present')} ${resource.summary.present}`} color="success" variant="outlined" />
          <Chip size="small" label={`${ac('table.vendorEmpty', 'Vendor-empty')} ${resource.summary.vendorEmpty}`} variant="outlined" />
          <Chip size="small" label={`${ac('table.notApplicable', 'N/A')} ${resource.summary.notApplicable}`} variant="outlined" />
          <Chip size="small" label={`${ac('table.stale', 'Stale')} ${resource.summary.stale}`} variant="outlined" />
          <Chip size="small" label={`${ac('table.error', 'Error')} ${resource.summary.error}`} color={resource.summary.error > 0 ? 'warning' : 'default'} variant="outlined" />
          <Chip size="small" label={`${ac('table.notCollected', 'Not collected')} ${resource.summary.notCollected}`} variant="outlined" />
        </Stack>

        <Alert severity="info" sx={{ fontSize: 13, py: embedded ? 0.55 : undefined }}>
          {localizedResourceVerdictDetail(resource)} {ac('missingClaimsDisclaimer', 'Missing claims or debt states do not prove that a resource is absent from that source.')}
        </Alert>

        {!embedded && <Divider />}
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 900, mb: 1 }}>{ac('claims', 'Claims')}</Typography>
          {resource.claims.length > 0 ? (
            <Box sx={{ display: 'grid', gap: 0.8, gridTemplateColumns: embedded ? { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' } : '1fr' }}>
              {resource.claims.map((claim) => <ClaimCard key={claim.id} claim={claim} />)}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {ac('noClaims', 'No claims returned for this resource.')}
            </Typography>
          )}
        </Box>

        {(resource.caveats?.length ?? 0) > 0 && (
          <Alert severity="warning" sx={{ fontSize: 13, py: embedded ? 0.55 : undefined }}>
            {localizedEvidenceList(resource.caveats)}
          </Alert>
        )}
      </Stack>
    </Box>
  )
}

function AssetCoverageDrawer({ resource, onClose }: { resource: CoverageResource | null; onClose: () => void }) {
  const open = !!resource
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: (theme) => ({ width: { xs: '100%', sm: 560 }, p: 2, overflowY: 'auto', bgcolor: coverageSurface(theme), borderLeft: `1px solid ${coverageBorder(theme)}` }) }}
    >
      {resource && (
        <Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="overline" color="text.secondary">{ac('resourceCoverage', 'Resource coverage')}</Typography>
              <Typography variant="h6" sx={{ fontWeight: 800, wordBreak: 'break-word' }}>{resourceLabel(resource)}</Typography>
              <Typography variant="body2" color="text.secondary">
                {localizedResourceMeta(resource.resource)}
              </Typography>
            </Box>
            <IconButton aria-label={ac('closeCoverageDrawer', 'Close coverage drawer')} onClick={onClose}><X size={18} /></IconButton>
          </Stack>
          <ResourceClaimsPanel resource={resource} />
        </Stack>
      )}
    </Drawer>
  )
}

function ClaimCard({ claim }: { claim: CoverageClaim }) {
  const theme = useTheme()
  return (
    <Box sx={{ border: `1px solid ${coverageBorder(theme)}`, borderRadius: 1, p: 1.1, bgcolor: coverageSubtleSurface(theme) }}>
      <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 800 }}>{claim.sourceLabel}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {localizedClaimSummary(claim)}
          </Typography>
        </Box>
        <StateChip state={claim.coverageState} />
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        {localizedClaimStateDetail(claim.coverageState)} {ac('observedWithTime', 'Observed {time}', { time: formatDateTime(claim.observedAt) })}{claim.value ? ` / ${claim.value}` : ''}
      </Typography>
    </Box>
  )
}

function StatusChip({ status, label }: { status: string; label?: string }) {
  const meta = sourceStatusMeta(status)
  return (
    <Chip
      size="small"
      label={label ?? localizedSourceStatusLabel(status)}
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

function StateChip({ state }: { state: string }) {
  const meta = claimStateMeta(state)
  return (
    <Chip
      size="small"
      label={localizedClaimStateLabel(state)}
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

function VerdictChip({ verdict }: { verdict: ReturnType<typeof resourceCoverageVerdict> }) {
  return (
    <Chip
      size="small"
      label={localizedVerdictLabel(verdict.kind, verdict.label)}
      sx={{
        height: 22,
        bgcolor: alpha(verdict.tone, 0.14),
        color: verdict.tone,
        fontWeight: 800,
        '& .MuiChip-label': { px: 0.8 },
      }}
    />
  )
}

function EmptyTable({ text }: { text: string }) {
  return (
    <Box sx={{ minHeight: 112, display: 'grid', placeItems: 'center', px: 2, py: 3 }}>
      <Typography variant="body2" color="text.secondary">{text}</Typography>
    </Box>
  )
}
