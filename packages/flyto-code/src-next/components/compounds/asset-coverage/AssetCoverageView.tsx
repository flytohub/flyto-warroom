import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
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
  CheckCircle2,
  ClipboardCheck,
  Database,
  Eye,
  FileWarning,
  Network,
  ShieldQuestion,
  X,
} from 'lucide-react'

import {
  ChartCard,
  HeroStat,
  KpiCard,
  ManagerActionList,
  ManagerDashboard,
  ManagerHero,
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
  claimStateMeta,
  claimSummary,
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
  sourceNextAction,
  sourceStatusMeta,
  summarizeSourceStatuses,
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
import { t } from '@lib/i18n';

const ACCENT = colors.semantic.info

type ManagerCoverageTab = 'overview' | 'worklist' | 'sources' | 'resources' | 'quarantine'
type EngineerCoverageTab = 'resources' | 'scope' | 'sources' | 'policy' | 'quarantine'

const MANAGER_TABS: Array<{ value: ManagerCoverageTab; label: string }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'worklist', label: 'Worklist' },
  { value: 'sources', label: 'Sources' },
  { value: 'resources', label: 'Resources' },
  { value: 'quarantine', label: 'Quarantine' },
]

const ENGINEER_TABS: Array<{ value: EngineerCoverageTab; label: string }> = [
  { value: 'resources', label: 'Resources' },
  { value: 'scope', label: 'Scope' },
  { value: 'sources', label: 'Sources' },
  { value: 'policy', label: 'Policy' },
  { value: 'quarantine', label: 'Quarantine' },
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
  const scopeRollup = normalizeScopeRollup(scope)
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
      subtitle: [entity.kind, entity.verificationState, entity.required ? 'required' : 'candidate'].filter(Boolean).join(' / '),
      meta: entity.debt?.[0]?.message ?? t('hardcoded.entity.has.unresolved.scope.debt.541a1bbe'),
      value: `${entityDebtCount(entity)} debt`,
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
          subtitle: [resource.resource.category, resource.resource.type, resource.resource.reviewStatus].filter(Boolean).join(' / '),
          meta: resourceCoverageVerdict(resource).detail,
          value: `${debt} debt`,
          severity: severity as 'high' | 'medium',
        }
      })
    return [...entityItems, ...resourceItems].slice(0, 8)
  }, [debtResources, scopeDebtEntities])

  return (
    <>
      <ManagerDashboard
        title={t('hardcoded.asset.coverage.65ac664c')}
        subtitle={t('hardcoded.confirmed.inventory.source.health.and.unresolved.collection.debt.db336bdc')}
        accent={ACCENT}
        titleIcon={<ClipboardCheck size={20} />}
        layout="full-bleed"
        chartMinWidth={280}
        contentOverflow="hidden"
        hero={
          <ManagerHero
            accent={ACCENT}
            icon={<ClipboardCheck size={15} />}
            minHeight={150}
            visual={<CoverageDial answeredPct={answeredPct} debtPct={debtPct} loading={loading} />}
            headline={{
              label: t('hardcoded.coverage.certainty.ce5d2309'),
              value: data ? formatPct(answeredPct) : '--',
              sub: data
                ? `${scopeMeta.label}: ${scopePct ? formatPct(scopePct) : '0%'} entity coverage. ${data.rollup.answeredPairs} answered resource-source pairs; ${data.rollup.uncertaintyDebtPairs} pairs remain uncertainty debt.`
                : 'Coverage certainty appears after the asset coverage ledger returns source-pair data.',
            }}
            aside={
              <Box>
                <HeroStat icon={<Building2 size={14} />} tone={scopeMeta.tone} label="Scope" value={scope?.state ?? '--'} />
                <HeroStat icon={<Database size={14} />} tone={colors.semantic.success} label="Confirmed" value={data?.rollup.confirmedResources ?? '--'} />
                <HeroStat icon={<ShieldQuestion size={14} />} tone={colors.semantic.warning} label="Quarantine" value={data?.rollup.quarantinedCandidates ?? '--'} />
                <HeroStat icon={<AlertTriangle size={14} />} tone={debtPct > 0 ? colors.semantic.warning : colors.semantic.neutral} label="Debt" value={data?.rollup.uncertaintyDebtPairs ?? '--'} />
              </Box>
            }
          />
        }
        kpis={
          <>
            <KpiCard label={t('hardcoded.group.scope.732afcf1')} value={scope ? `${scopeRollup.coveredEntities}/${scopeRollup.requiredEntities}` : null} unit={scope?.state} loading={loading} icon={<Building2 size={15} />} tone={scopeMeta.tone} />
            <KpiCard label={t('hardcoded.confirmed.inventory.fbed4d7a')} value={data?.rollup.confirmedResources ?? null} loading={loading} icon={<Database size={15} />} tone={colors.semantic.success} />
            <KpiCard label={t('hardcoded.registered.sources.fee280ea')} value={data?.rollup.sourceCount ?? null} loading={loading} icon={<Eye size={15} />} />
            <KpiCard label={t('hardcoded.answered.pairs.075eb895')} value={data ? `${data.rollup.answeredPairs}/${data.rollup.totalResourceSourcePairs}` : null} loading={loading} icon={<CheckCircle2 size={15} />} tone={ACCENT} />
            <KpiCard label={t('hardcoded.uncertainty.debt.4dc58d41')} value={data?.rollup.uncertaintyDebtPairs ?? null} unit={data ? formatPct(debtPct) : undefined} loading={loading} icon={<AlertTriangle size={15} />} tone={debtPct > 0 ? colors.semantic.warning : colors.semantic.neutral} />
          </>
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
          gridTemplateRows: 'auto auto minmax(0, 1fr)',
          gap: 1.5,
          boxSizing: 'border-box',
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
            <Box sx={{ color: ACCENT, display: 'inline-flex', flexShrink: 0 }}><ClipboardCheck size={22} /></Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography component="h1" variant="h5" sx={{ fontWeight: 800 }} noWrap>
                Asset Coverage
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                Generated {formatDateTime(data?.generatedAt)}. Inspect source status, resource source-pairs, and quarantined candidates.
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
            <Chip
              size="small"
              icon={<FileWarning size={14} />}
              label={t('hardcoded.debt.is.not.absence.fb1e6234')}
              sx={{ fontWeight: 800, bgcolor: alpha(colors.semantic.info, 0.1), color: colors.semantic.info }}
            />
            {q.isError && <Chip size="small" color="warning" label={t('hardcoded.coverage.ledger.unavailable.cf923bdb')} />}
          </Stack>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gap: 1,
            gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(5, minmax(0, 1fr))' },
          }}
        >
          <MetricBox label="Confirmed" value={data?.rollup.confirmedResources ?? '--'} tone={colors.semantic.success} />
          <MetricBox label="Quarantine" value={data?.rollup.quarantinedCandidates ?? '--'} tone={colors.semantic.warning} />
          <MetricBox label="Sources" value={data?.rollup.sourceCount ?? '--'} tone={ACCENT} />
          <MetricBox label="Answered" value={data ? `${data.rollup.answeredPairs}/${data.rollup.totalResourceSourcePairs}` : '--'} tone={colors.semantic.success} />
          <MetricBox label="Scope" value={data?.scope?.state ?? '--'} tone={scopeMeta.tone} />
        </Box>

        <CoverageTabbedFrame
          value={tab}
          onChange={(value) => setTab(value as EngineerCoverageTab)}
          tabs={ENGINEER_TABS.map((item) => {
            if (item.value === 'resources') return { ...item, count: resources.length }
            if (item.value === 'scope') return { ...item, count: scopeEntities.length }
            if (item.value === 'sources') return { ...item, count: data?.sources.length ?? 0 }
            if (item.value === 'quarantine') return { ...item, count: data?.quarantine.length ?? 0 }
            return item
          })}
          ariaLabel="Asset coverage engineer sections"
        >
          <EngineerTabContent
            tab={tab}
            data={data}
            resources={resources}
            scopeEntities={scopeEntities}
            statusCounts={statusCounts}
            onSelectResource={setSelected}
          />
        </CoverageTabbedFrame>
      </Box>
      <AssetCoverageDrawer resource={selected} onClose={() => setSelected(null)} />
    </>
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
        if (item.value === 'worklist') return { ...item, count: actionItems.length }
        if (item.value === 'sources') return { ...item, count: data?.sources.length ?? 0 }
        if (item.value === 'resources') return { ...item, count: resources.length }
        if (item.value === 'quarantine') return { ...item, count: data?.quarantine.length ?? 0 }
        return item
      })}
      ariaLabel="Asset coverage manager sections"
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
        title={t('hardcoded.coverage.worklist.781aec6b')}
        subtitle={t('hardcoded.confirmed.resources.with.unresolved.source.pair.debt.59d4af29')}
        items={actionItems}
        emptyText="No unresolved coverage debt returned"
        actionLabel="Open engineer view"
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
        <Surface title={t('hardcoded.source.health.10e110be')} subtitle={`${data.sources.length} registered sources; debt states are tracked separately from negative findings.`}>
          <SourceTable sources={data.sources} />
        </Surface>
      </Stack>
    )
  }
  if (tab === 'resources') {
    return (
      <Surface title={t('hardcoded.confirmed.resource.source.pairs.37e5825c')} subtitle={`${resources.length} confirmed resources sorted by unresolved debt. Click a row for claims and caveats.`}>
        <ResourceTable resources={resources} onSelect={onSelectResource} />
      </Surface>
    )
  }
  if (tab === 'quarantine') {
    return (
      <Surface title="Quarantine" subtitle={t('hardcoded.candidate.resources.are.reviewable.evidence.but.not.counted.fb01591d')}>
        <QuarantineTable items={data.quarantine} />
      </Surface>
    )
  }
  return (
    <Stack spacing={1.5}>
      <ScopeCoverageSummary scope={scope} compact />
      <ChartCard title={t('hardcoded.certainty.rule.d6d57dfd')}>
        <Stack spacing={1.25}>
          <Typography variant="body2" color="text.secondary">
            Asset Coverage only counts confirmed resources in the main inventory. Candidate resources stay in quarantine until review or evidence upgrades them. Missing, stale, unavailable, errored, and unknown states are uncertainty debt, not evidence of absence.
          </Typography>
          <PolicySummary data={data} />
          {(data.caveats?.length ?? 0) > 0 && (
            <Alert severity="info" sx={{ fontSize: 13 }}>
              {data.caveats!.join(' ')}
            </Alert>
          )}
        </Stack>
      </ChartCard>
    </Stack>
  )
}

function EngineerTabContent({
  tab,
  data,
  resources,
  scopeEntities,
  statusCounts,
  onSelectResource,
}: {
  tab: EngineerCoverageTab
  data?: AssetCoverageResponse
  resources: CoverageResource[]
  scopeEntities: CoverageEntity[]
  statusCounts: Record<string, number>
  onSelectResource: (resource: CoverageResource) => void
}) {
  if (!data) return <NoCoverageData />
  if (tab === 'policy') {
    return (
      <Stack spacing={1.5}>
	        <Surface title={t('hardcoded.evidence.policy.5ab02abe')} subtitle={t('hardcoded.coverage.ledger.rules.before.presentation.bdf62fc5')}>
          <PolicySummary data={data} />
        </Surface>
        <Alert severity="info" sx={{ fontSize: 13 }}>
	          {t('hardcoded.coverage.debt.states.not.clean.absence.b9bbac43')}
        </Alert>
      </Stack>
    )
  }
  if (tab === 'scope') {
    const scopeRollup = normalizeScopeRollup(data.scope)
    return data.scope ? (
      <Surface title={t('hardcoded.entity.scope.ledger.06407639')} subtitle={`${scopeRollup.coveredEntities}/${scopeRollup.requiredEntities} required entities covered; ${scopeRollup.entitiesWithDebt} entities still carry debt.`}>
        <ScopeEntityTable entities={scopeEntities} />
      </Surface>
    ) : (
      <Alert severity="info" icon={<Building2 size={16} />} sx={{ fontSize: 13 }}>
        No entity scope ledger returned. Group-level completeness cannot be claimed from resource coverage alone.
      </Alert>
    )
  }
  if (tab === 'sources') {
    return (
      <Stack spacing={1.5}>
        <SourceStatusStrip counts={statusCounts} total={data.sources.length} />
        <Surface title={t('hardcoded.source.health.10e110be')} subtitle={`${data.sources.length} registered sources; counts: ${Object.entries(statusCounts).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`}>
          <SourceTable sources={data.sources} />
        </Surface>
      </Stack>
    )
  }
  if (tab === 'quarantine') {
    return (
      <Surface title="Quarantine" subtitle={t('hardcoded.candidate.resources.are.reviewable.evidence.but.not.counted.fb01591d')}>
        <QuarantineTable items={data.quarantine} />
      </Surface>
    )
  }
  return (
    <Stack spacing={1.5}>
      <Surface title={t('hardcoded.confirmed.resource.source.pairs.37e5825c')} subtitle={`${resources.length} confirmed resources sorted by unresolved debt. Click a row for claims and caveats.`}>
        <ResourceTable resources={resources} onSelect={onSelectResource} />
      </Surface>
      {(data.caveats?.length ?? 0) > 0 && (
        <Alert severity="info" sx={{ fontSize: 13 }}>
          {data.caveats!.join(' ')}
        </Alert>
      )}
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
      <Chip size="small" label={`${total} registered sources`} sx={{ fontWeight: 800 }} />
      {Object.entries(counts)
        .sort(([a], [b]) => sourceStatusMeta(a).priority - sourceStatusMeta(b).priority)
        .map(([status, count]) => {
          const meta = sourceStatusMeta(status)
          return <StatusChip key={status} status={status} label={`${meta.label}: ${count}`} />
        })}
    </Box>
  )
}

function TabbedLoadingState() {
  return (
    <Box sx={{ minHeight: 220, display: 'grid', placeItems: 'center' }}>
      <Stack spacing={1} alignItems="center">
        <LinearProgress sx={{ width: 180 }} />
        <Typography variant="body2" color="text.secondary">{t('hardcoded.loading.coverage.ledger.97afc063')}</Typography>
      </Stack>
    </Box>
  )
}

function LedgerUnavailable() {
  return (
    <Alert severity="warning" sx={{ fontSize: 13 }}>
      Coverage ledger unavailable. Existing asset data can still be shown elsewhere, but coverage certainty cannot be evaluated from this response.
    </Alert>
  )
}

function NoCoverageData() {
  return (
    <Typography variant="body2" color="text.secondary">
      No coverage response has been returned for this organization context.
    </Typography>
  )
}

function CoverageDial({ answeredPct, debtPct, loading }: { answeredPct: number; debtPct: number; loading: boolean }) {
  const theme = useTheme()
  const answered = loading ? 0 : answeredPct
  const debt = loading ? 0 : debtPct
  return (
    <Box sx={{ width: '100%', maxWidth: 360 }}>
      <Stack spacing={1.4}>
        <Box>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>Answered</Typography>
            <Typography variant="caption" sx={{ fontWeight: 800, color: colors.semantic.success }}>{formatPct(answered)}</Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={answered}
            sx={{
              mt: 0.75,
              height: 12,
              borderRadius: 999,
              bgcolor: coverageProgressTrack(theme),
              '& .MuiLinearProgress-bar': { bgcolor: colors.semantic.success, borderRadius: 999 },
            }}
          />
        </Box>
        <Box>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>{t('hardcoded.uncertainty.debt.4dc58d41')}</Typography>
            <Typography variant="caption" sx={{ fontWeight: 800, color: debt > 0 ? colors.semantic.warning : colors.semantic.neutral }}>{formatPct(debt)}</Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={debt}
            sx={{
              mt: 0.75,
              height: 12,
              borderRadius: 999,
              bgcolor: coverageProgressTrack(theme),
              '& .MuiLinearProgress-bar': { bgcolor: debt > 0 ? colors.semantic.warning : colors.semantic.neutral, borderRadius: 999 },
            }}
          />
        </Box>
      </Stack>
    </Box>
  )
}

function ScopeCoverageSummary({ scope, compact }: { scope?: CoverageScope; compact?: boolean }) {
  const meta = scopeStateMeta(scope?.state)
  const rollup = normalizeScopeRollup(scope)
  const completePct = scopeCompletenessPct(scope)
  const debtEntities = topScopeDebtEntities(scope, compact ? 3 : 6)
  return (
    <ChartCard title={t('hardcoded.group.scope.ledger.c518a226')}>
      {!scope ? (
        <Typography variant="body2" color="text.secondary">
          No entity scope ledger returned. Group-level completeness cannot be claimed from resource coverage alone.
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <Box sx={{ color: meta.tone, display: 'inline-flex', mt: 0.15 }}><Building2 size={18} /></Box>
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={0.75} alignItems="center" useFlexGap flexWrap="wrap">
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{meta.label}</Typography>
                <Chip size="small" label={scope.state} sx={{ height: 22, bgcolor: alpha(meta.tone, 0.14), color: meta.tone, fontWeight: 800 }} />
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {meta.detail}
              </Typography>
            </Box>
          </Stack>

          <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' } }}>
            <MetricBox label={t('hardcoded.required.entities.d3c6df36')} value={rollup.requiredEntities} tone={colors.semantic.info} />
            <MetricBox label={t('hardcoded.covered.entities.7094bca3')} value={rollup.coveredEntities} tone={colors.semantic.success} />
            <MetricBox label={t('hardcoded.entity.debt.146c9d38')} value={rollup.entitiesWithDebt} tone={rollup.entitiesWithDebt > 0 ? colors.semantic.warning : colors.semantic.neutral} />
            <MetricBox label={t('hardcoded.unlinked.assets.7c90c6d6')} value={rollup.unlinkedResources} tone={rollup.unlinkedResources > 0 ? colors.semantic.warning : colors.semantic.neutral} />
          </Box>

          <ScopeProgress
            label={t('hardcoded.declared.entity.coverage.2e8d69c2')}
            helper="Only declared required entities with linked assets and answered sources count as covered."
            value={completePct}
            debtValue={rollup.scopeDebtPercentage}
          />

          {debtEntities.length > 0 ? (
            <Stack spacing={0.75}>
              {debtEntities.map((entity) => (
                <Box key={entity.id} sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={0.75} alignItems="center" useFlexGap flexWrap="wrap">
                    <Typography variant="body2" sx={{ fontWeight: 800 }}>{entityLabel(entity)}</Typography>
                    <Chip size="small" variant="outlined" label={`${entityDebtCount(entity)} debt`} />
                    <Chip size="small" variant="outlined" label={`${entity.resources?.length ?? 0} assets`} />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {entity.debt?.[0]?.message ?? t('hardcoded.entity.has.unresolved.scope.evidence.debt.c4b65605')}
                  </Typography>
                </Box>
              ))}
            </Stack>
          ) : (
            <Typography variant="caption" color="text.secondary">
              No entity-specific debt returned in this scope ledger.
            </Typography>
          )}

          {(scope.caveats?.length ?? 0) > 0 && (
            <Alert severity="info" sx={{ fontSize: 12 }}>
              {scope.caveats!.slice(0, 2).join(' ')}
            </Alert>
          )}
        </Stack>
      )}
    </ChartCard>
  )
}

function ScopeEntityTable({ entities }: { entities: CoverageEntity[] }) {
  if (entities.length === 0) return <EmptyTable text="No declared scope entities returned." />
  return (
    <Table size="small" aria-label="asset coverage entity scope">
      <TableHead>
        <TableRow>
          <TableCell>Entity</TableCell>
          <TableCell>Parent</TableCell>
          <TableCell>State</TableCell>
          <TableCell>Required</TableCell>
          <TableCell align="right">Assets</TableCell>
          <TableCell align="right">{t('hardcoded.source.debt.1dcdfc59')}</TableCell>
          <TableCell align="right">{t('hardcoded.debt.items.71b97daa')}</TableCell>
          <TableCell>{t('agentFirewall.colNextAction')}</TableCell>
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

function ScopeProgress({
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
  const tone = debtValue > 0 ? colors.semantic.warning : colors.semantic.success
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
      <TableCell>{entity.verificationState}</TableCell>
      <TableCell>{entity.required ? 'yes' : 'no'}</TableCell>
      <TableCell align="right">{entity.resources.length}</TableCell>
      <TableCell align="right">{sourceDebt}</TableCell>
      <TableCell align="right">{entityDebtCount(entity)}</TableCell>
      <TableCell sx={{ minWidth: 260 }}>
        {primaryDebt ? <ScopeDebtText item={primaryDebt} /> : 'Monitor'}
      </TableCell>
    </TableRow>
  )
}

function ScopeDebtText({ item }: { item: ScopeDebtItem }) {
  return (
    <Box>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>{item.message}</Typography>
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
            {source.caveat || source.detail || meta.detail}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Last attempt: {formatDateTime(source.lastAttemptAt || source.lastSuccessAt)}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Next action: {sourceNextAction(source)}
          </Typography>
        </Box>
      </Stack>
    </Box>
  )
}

function MetricBox({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  const theme = useTheme()
  return (
    <Box
      sx={{
        minWidth: 0,
        minHeight: 72,
        border: `1px solid ${coverageToneBorder(theme, tone)}`,
        borderRadius: 1,
        p: 1.25,
        bgcolor: coverageSurface(theme),
        backgroundImage: `linear-gradient(135deg, ${coverageTintSurface(theme, tone)} 0%, transparent 62%)`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>{label}</Typography>
      <Typography sx={{ mt: 0.3, fontSize: 22, lineHeight: 1, fontWeight: 800, color: tone, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(value)}>{value}</Typography>
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
  if (sources.length === 0) return <EmptyTable text="No source records returned." />
  return (
    <Table size="small" aria-label="asset coverage sources">
      <TableHead>
        <TableRow>
          <TableCell>Source</TableCell>
          <TableCell>Status</TableCell>
          <TableCell>{t('agentFirewall.colNextAction')}</TableCell>
          <TableCell>Mode</TableCell>
          <TableCell>{t('hardcoded.output.groups.aa657938')}</TableCell>
          <TableCell>{t('hardcoded.missing.env.c91b34e8')}</TableCell>
          <TableCell>{t('hardcoded.last.attempt.82aee111')}</TableCell>
          <TableCell>Caveat</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {sources.map((source) => (
          <TableRow key={source.integrationId}>
            <TableCell sx={{ fontWeight: 800 }}>{source.label}</TableCell>
            <TableCell><StatusChip status={source.status} /></TableCell>
            <TableCell>{sourceNextAction(source)}</TableCell>
            <TableCell>{source.collectionMode}</TableCell>
            <TableCell>{source.outputGroups.join(', ') || 'none'}</TableCell>
            <TableCell>{source.missingEnvGroups?.join(', ') || 'none'}</TableCell>
            <TableCell>{formatDateTime(source.lastAttemptAt || source.lastSuccessAt)}</TableCell>
            <TableCell>{source.caveat || source.detail || sourceStatusMeta(source.status).detail}</TableCell>
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
    ['Resource inclusion', data.policy.resourceInclusion],
    ['Candidate handling', data.policy.candidateHandling],
    ['Uncertainty rendering', data.policy.uncertaintyRendering],
    ['Not-collected meaning', data.policy.absentNotCollectedMeaning],
    ['Unavailable source treatment', data.policy.unavailableSourceTreatment],
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

function ResourceTable({ resources, onSelect }: { resources: CoverageResource[]; onSelect: (resource: CoverageResource) => void }) {
  if (resources.length === 0) return <EmptyTable text="No confirmed resources returned." />
  return (
    <Table size="small" aria-label="asset coverage resources">
      <TableHead>
        <TableRow>
          <TableCell>Resource</TableCell>
          <TableCell>Category</TableCell>
          <TableCell>Review</TableCell>
          <TableCell>Verdict</TableCell>
          <TableCell align="right">Present</TableCell>
          <TableCell align="right">{t('hardcoded.vendor.empty.d4fa6d63')}</TableCell>
          <TableCell align="right">N/A</TableCell>
          <TableCell align="right">Stale</TableCell>
          <TableCell align="right">Error</TableCell>
          <TableCell align="right">{t('hardcoded.not.collected.2a5fc945')}</TableCell>
          <TableCell>{t('footprint.field.lastSeen')}</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {resources.map((resource) => (
          <ResourceTableRow key={resource.resource.id} resource={resource} onSelect={onSelect} />
        ))}
      </TableBody>
    </Table>
  )
}

function ResourceTableRow({ resource, onSelect }: { resource: CoverageResource; onSelect: (resource: CoverageResource) => void }) {
  const verdict = resourceCoverageVerdict(resource)
  return (
    <TableRow
      hover
      tabIndex={0}
      onClick={() => onSelect(resource)}
      sx={{ cursor: 'pointer' }}
    >
      <TableCell sx={{ fontWeight: 800 }}>{resourceLabel(resource)}</TableCell>
      <TableCell>{resource.resource.category} / {resource.resource.type}</TableCell>
      <TableCell>{resource.resource.reviewStatus}</TableCell>
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
  if (items.length === 0) return <EmptyTable text="No quarantined candidates returned." />
  return (
    <Table size="small" aria-label="asset coverage quarantine">
      <TableHead>
        <TableRow>
          <TableCell>Candidate</TableCell>
          <TableCell>Category</TableCell>
          <TableCell>Certainty</TableCell>
          <TableCell>Reason</TableCell>
          <TableCell align="right">Confidence</TableCell>
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

function AssetCoverageDrawer({ resource, onClose }: { resource: CoverageResource | null; onClose: () => void }) {
  const open = !!resource
  const verdict = resource ? resourceCoverageVerdict(resource) : null
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
              <Typography variant="overline" color="text.secondary">{t('hardcoded.resource.coverage.cd3b0ce4')}</Typography>
              <Typography variant="h6" sx={{ fontWeight: 800, wordBreak: 'break-word' }}>{resourceLabel(resource)}</Typography>
              <Typography variant="body2" color="text.secondary">
                {[resource.resource.category, resource.resource.type, resource.resource.reviewStatus].filter(Boolean).join(' / ')}
              </Typography>
            </Box>
            <IconButton aria-label={t('hardcoded.close.coverage.drawer.a463e759')} onClick={onClose}><X size={18} /></IconButton>
          </Stack>

          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
            {verdict && <VerdictChip verdict={verdict} />}
            <Chip size="small" label={`Present ${resource.summary.present}`} color="success" variant="outlined" />
            <Chip size="small" label={`Vendor-empty ${resource.summary.vendorEmpty}`} variant="outlined" />
            <Chip size="small" label={`N/A ${resource.summary.notApplicable}`} variant="outlined" />
            <Chip size="small" label={`Stale ${resource.summary.stale}`} variant="outlined" />
            <Chip size="small" label={`Error ${resource.summary.error}`} color={resource.summary.error > 0 ? 'warning' : 'default'} variant="outlined" />
            <Chip size="small" label={`Not collected ${resource.summary.notCollected}`} variant="outlined" />
          </Stack>

          <Alert severity="info" sx={{ fontSize: 13 }}>
            {verdict?.detail} Missing claims or debt states do not prove that a resource is absent from that source.
          </Alert>

          <Divider />
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Claims</Typography>
            {resource.claims.length > 0 ? (
              <Stack spacing={1}>
                {resource.claims.map((claim) => <ClaimCard key={claim.id} claim={claim} />)}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No claims returned for this resource.
              </Typography>
            )}
          </Box>

          {(resource.caveats?.length ?? 0) > 0 && (
            <Alert severity="warning" sx={{ fontSize: 13 }}>
              {resource.caveats!.join(' ')}
            </Alert>
          )}
        </Stack>
      )}
    </Drawer>
  )
}

function ClaimCard({ claim }: { claim: CoverageClaim }) {
  const theme = useTheme()
  const meta = claimStateMeta(claim.coverageState)
  return (
    <Box sx={{ border: `1px solid ${coverageBorder(theme)}`, borderRadius: 1, p: 1.1, bgcolor: coverageSubtleSurface(theme) }}>
      <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 800 }}>{claim.sourceLabel}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {claimSummary(claim)}
          </Typography>
        </Box>
        <StateChip state={claim.coverageState} />
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        {meta.detail} Observed {formatDateTime(claim.observedAt)}{claim.value ? ` / ${claim.value}` : ''}
      </Typography>
    </Box>
  )
}

function StatusChip({ status, label }: { status: string; label?: string }) {
  const meta = sourceStatusMeta(status)
  return (
    <Chip
      size="small"
      label={label ?? meta.label}
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
      label={meta.label}
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
      label={verdict.label}
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
