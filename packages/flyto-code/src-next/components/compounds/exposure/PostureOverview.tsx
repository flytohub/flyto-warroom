import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, AlertTitle, Chip, Box, ButtonBase, Button, Stack, Typography } from '@mui/material'
import {
  Globe2, Clock, Network, Shield, Radio, Package,
  AlertTriangle,
} from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { t, tOr } from '@lib/i18n';
import {
  listAttackSurface, getCTEMPriorities, listAttackPaths,
  getLeakExposure,
  getPostureSnapshots, getDiscoveryRuns, getVerifierSourceHealth,
} from '@lib/engine'
import { BUFilterDropdown } from '@atoms/BUFilterDropdown'
import { TabBar } from '@atoms/TabBar'
import { GradeCircle } from '@compounds/_shared/GradeCircle'
import { displayScore, GRADE_COLORS } from '@compounds/_shared/scoring'
import { Loading, Empty } from '../scanning/_shared'
import { getExternalPosture, getExternalPostureKernel, extractHostFromAssetValue, type ExternalPosture } from './shared'
import type { ExternalPostureWithKpi } from '@lib/engine/code/posture'
import { subdomainStats } from './externalModel'
import { qk } from '@lib/queryKeys'
import { navigateToCTEMActions, navigateToSection } from '@lib/warroomNav'
import { colors } from '@/styles/designTokens'
import { SupplyChainView } from './SupplyChainView'
import { ActivityFeed } from '@atoms/ActivityFeed'
import { listMonitoringEvents } from '@lib/engine'
import { DomainDetailPanel } from './posture/DomainDetailPanel'
import { DarkWebTab } from './posture/DarkWebTab'
import { QuickLinkChip } from './posture/QuickLinkChip'

// Audit 2026-05-17 v3: ThreatIntel + Monitoring filler tabs
// consolidated into a single Activity feed. Reduces tab churn from
// 5 ??4 and gives the operator one chronological timeline of every
// signal instead of two half-empty panels.
type PostureTab = 'overview' | 'activity' | 'supply' | 'darkweb'

export function PostureOverview() {
  const { org } = useOrg()
  const orgId = org?.id
  const [tab, setTab] = useState<PostureTab>('overview')
  // BU filter ??empty string = whole-org view (default). When
  // the org has zero BUs declared, BUFilterDropdown hides itself
  // so this state stays at '' indefinitely with no visible
  // picker. Drives the priority list backend query + a
  // client-side filter on attack-surface for the KPI tiles.
  const [buFilter, setBUFilter] = useState<string>('')
  // Selected domain for the right-column "鞈?閰喟敦" panel. Null =
  // detail panel shows the empty-state hint. Set by clicking a row
  // in the middle Domain Status column.
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null)

  const postureQ = useQuery({
    queryKey: qk.externalPosture(orgId),
    queryFn: () => getExternalPosture(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const { data, isLoading } = postureQ

  // Kernel-backed posture ??score/grade truth for the Domain Status
  // table. Legacy `/external-posture` stays primary for trend /
  // sla_violations / risk_summary / supply_chain ??kernel hasn't
  // grown those fields yet, see Known Remaining Legacy Consumers in
  // FRONTEND_REPAIR_HANDOFF_2026_05_28.md.
  const kernelPostureQ = useQuery({
    queryKey: qk.externalPostureKernel(orgId),
    queryFn: () => getExternalPostureKernel(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const { data: kernelPostureData } = kernelPostureQ
  // Lookup keyed by the normalised host so legacy posture rows
  // (`d.domain`) and kernel `canonical_value` always meet on the
  // same key regardless of scheme / case / scanner suffix shape.
  // Mirrors DomainsView / buildDomainRows.
  const kernelByDomain = useMemo(() => {
    const map = new Map<string, { score?: number; grade?: string }>()
    for (const asset of kernelPostureData?.assets ?? []) {
      if (asset.type !== 'domain' && asset.type !== 'subdomain') continue
      const host = extractHostFromAssetValue(asset.canonical_value)
      if (!host) continue
      map.set(host, { score: asset.score, grade: asset.grade })
    }
    return map
  }, [kernelPostureData])

  // Subdomain + asset counts from attack surface
  const assetsQ = useQuery({
    queryKey: qk.attackSurface(orgId),
    queryFn: () => listAttackSurface(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const { data: assetData } = assetsQ
  // Posture snapshots ??90 days for the trend chart. Worker writes
  // one per day, so initial load on a fresh org returns []; chart
  // gracefully shows the "trend builds over time" empty state.
  const snapshotsQ = useQuery({
    queryKey: qk.exposure.postureSnapshots(orgId),
    queryFn: () => getPostureSnapshots(orgId!, 90),
    enabled: !!orgId,
    staleTime: 5 * 60_000, // snapshots only refresh once/day
  })
  const { data: snapshotsData } = snapshotsQ

  // Discovery runs ??proof to the operator that proactive collection
  // is actually running. Limit 20 = last day or two of CT log + Shodan
  // sweeps across an org's roots.
  const runsQ = useQuery({
    queryKey: qk.exposure.discoveryRuns(orgId),
    queryFn: () => getDiscoveryRuns(orgId!, 20),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const { data: runsData } = runsQ

  // Monitoring events feed the unified Activity tab (replaces the
  // old Threat/Monitoring split). 200 rows is enough for a few
  // days of operator scroll; older events accessible via
  // dedicated monitoring history view if needed.
  const activityQ = useQuery({
    queryKey: qk.exposure.monitoringEvents(orgId),
    queryFn: () => listMonitoringEvents(orgId!, 200),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const { data: activityEventsData } = activityQ

  // Verifier source health ??per-source PASS/FAIL/INCONCLUSIVE tally
  // over last 24h. If crt.sh / DoH is silently failing, this badge
  // flips amber before scoring degrades.
  const sourceHealthQ = useQuery({
    queryKey: qk.exposure.verifierSourceHealth(orgId),
    queryFn: () => getVerifierSourceHealth(orgId!, 24),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  })
  const { data: sourceHealthData } = sourceHealthQ

  // Pre-fetch CTEM priorities + attack paths so the QuickLink
  // chips can show live counts (KEV / Crown Jewel / Threat Actor /
  // Paths). All three are already cached at the page level so
  // touching them here doesn't trigger extra network.
  const ctemQ = useQuery({
    // Key includes BU so changing the filter refetches the
    // (already server-filtered) list. Empty buFilter falls
    // through to the no-arg shape ??identical request as before
    // for orgs that haven't set up BUs.
    queryKey: qk.ctem.priorities(orgId, buFilter),
    queryFn: () => getCTEMPriorities(orgId!, buFilter || undefined),
    enabled: !!orgId,
    staleTime: 30_000,
  })
  const { data: ctemData } = ctemQ
  const pathsQ = useQuery({
    queryKey: qk.ctem.attackPaths(orgId),
    queryFn: () => listAttackPaths(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  })
  const { data: pathsData } = pathsQ
  // Dark-web exposure ??only used by the new tab.
  const { data: leakData } = useQuery({
    queryKey: qk.exposure.leakExposure(orgId),
    queryFn: () => getLeakExposure(orgId!),
    enabled: !!orgId && tab === 'darkweb',
    staleTime: 60 * 60_000,
  })
  // P1-7 (Wave 1): the seven headline KPI tallies (KEV / Crown Jewel /
  // Threat Actor / Phishing / Stealer / Cert / SaaS) now come from the
  // server-computed `kpi_summary` block on `/external-posture` ??no more
  // O(n) client tally over every attack_surface / priority row. The KPI
  // type lives in lib/engine/code/posture. `kpi_summary` is BU-scoped by
  // the same `?business_unit_id=` the posture query already passes via
  // the kernel; the legacy whole-org posture call does not echo a BU
  // scope, so we keep the asset-derived fallback ONLY for engine
  // revisions that predate kpi_summary (rollout window). HONESTY: when
  // kpi_summary is present we render its counts verbatim ??including a
  // deliberate 0 for signals that aren't BU-attributable ??and never
  // backfill from the client asset list.
  const kpi = (data as ExternalPostureWithKpi | undefined)?.kpi_summary
  const quickCounts = useMemo(() => {
    const items = ctemData?.items ?? []
    // BU filter ??when active, client-side narrow attack_surface
    // by business_unit_id. Used only for the client fallback path +
    // for the signals kpi_summary does not carry (brand / paths /
    // verification-method tiers). Server already filters the CTEM
    // priority list; this keeps the asset-derived KPI counts in
    // lockstep with the same scope.
    const allAssets = assetData?.assets ?? []
    const assets = !buFilter
      ? allAssets
      : buFilter === 'unassigned'
        ? allAssets.filter(a => !(a as { business_unit_id?: string }).business_unit_id)
        : allAssets.filter(a => (a as { business_unit_id?: string }).business_unit_id === buFilter)

    // Helper: count assets matching any of N types. Centralises
    // the lookup so adding a new asset_type means one entry here.
    const countByType = (...types: string[]) =>
      assets.filter(a => types.includes(a.asset_type)).length

    return {
      // ?? Server-authoritative when kpi_summary is present ??
      // `?? client-tally` only fires on pre-kpi_summary engines;
      // a present-but-0 server count stays 0 (honesty: not backfilled).
      kev: kpi?.kev_count ?? items.filter(i => i.kev_listed).length,
      crownJewel: kpi?.crown_jewel_count ?? items.filter(i => i.asset_tier === 'crown_jewel').length,
      threatActor: kpi?.threat_actor_count ?? items.filter(i => !!i.threat_actor).length,
      // ?? Phase A signals ??server-sourced via kpi_summary ??
      phishing: kpi?.phishing_count ?? countByType('phishing_url'),     // PhishTank + OpenPhish hits
      stealerLogs: kpi?.stealer_count ?? countByType('stealer_log_hit'), // HIBP + Hudson Rock
      suspCerts: kpi?.certs_count ?? countByType('suspicious_cert'),     // CT-log phishing certs
      saasPosture: kpi?.saas_count ?? countByType('saas_posture'),       // GitHub org config drift
      // ?? Not carried by kpi_summary ??derived client-side ??
      paths: (pathsData?.paths ?? []).filter(p => p.status === 'open').length,
      brand: countByType('lookalike', 'brand_lookalike'),
      // Auth-verified DAST findings ??different trust tier than passive.
      authVerified: items.filter(i => i.verification_method === 'authenticated_verified').length,
      activeVerified: items.filter(i => i.verification_method === 'active_verified').length,
    }
  }, [kpi, ctemData, pathsData, assetData, buFilter])

  // ?? Cross-query error aggregation ??????????????????????????
  // 9 useQuery calls fan out from this page. A na簿ve render would
  // hide errors entirely (each tile silently falling back to empty
  // data) ??operator never learns which dimension is broken and
  // why the page looks "lighter than it should". Audit 2026-05-19
  // surfaced this as a real risk for the most-visited page in the
  // app. The banner lists every failing dimension by name with a
  // single Retry button that refetches all of them at once.
  const dimensionQueries = [
    { name: t('external.errDimPosture'), q: postureQ },
    { name: t('external.errDimPostureKernel'), q: kernelPostureQ },
    { name: t('external.errDimAssets'), q: assetsQ },
    { name: t('external.errDimSnapshots'), q: snapshotsQ },
    { name: t('external.errDimRuns'), q: runsQ },
    { name: t('external.errDimActivity'), q: activityQ },
    { name: t('external.errDimSourceHealth'), q: sourceHealthQ },
    { name: t('external.errDimCtem'), q: ctemQ },
    { name: t('external.errDimPaths'), q: pathsQ },
  ]
  const failedDimensions = dimensionQueries.filter(d => d.q.isError)

  // Subdomain tallies for the hero footer. Derivation lives in the
  // external adapter (audit F2) ??useMemo here only preserves the
  // referential identity so the hero doesn't re-render on unrelated
  // state changes.
  const assetStats = useMemo(() => subdomainStats(assetData?.assets), [assetData])

  return (
    <div className="exp-root" style={{ '--exp-accent': '#06b6d4', '--exp-accent-end': '#38bdf8' } as React.CSSProperties}>
      {/* BU filter ??auto-hides when no BUs are declared.
          Compact right-aligned row; no redundant page title
          (already in the sidebar). */}
      <Box sx={{
        display: 'flex',
        justifyContent: 'flex-end',
        flexShrink: 0,
        minHeight: 0,
        alignItems: 'center',
        '&:empty': { display: 'none' },
      }}>
        <BUFilterDropdown orgId={orgId} value={buFilter} onChange={setBUFilter} />
      </Box>

      {/* Cross-query error banner ??only renders when ?? query failed.
          Names every failing dimension explicitly so the operator
          knows WHICH part of the page is degraded, not just "something
          is broken". Single Retry refetches all of them. */}
      {failedDimensions.length > 0 && (
        <Alert
          severity="warning"
          variant="outlined"
          sx={{ mb: 2 }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => failedDimensions.forEach(d => d.q.refetch())}
            >
              {t('common.retry')}
            </Button>
          }
        >
          <AlertTitle sx={{ fontWeight: 600 }}>
            {t('external.partialDataTitle')}
          </AlertTitle>
          {t('external.partialDataDesc')}{' '}
          <Box component="span" sx={{ fontWeight: 600 }}>
            {failedDimensions.map(d => d.name).join(', ')}
          </Box>
          {'. '}
          {t('external.partialDataHint')}
        </Alert>
      )}

      {/* Tabs ??fold the retired sidebar entries (Monitoring,
          Supply Chain, Threat Intel) in as views here. Overview
          is the default landing. Each KPI in Overview deep-links
          to CTEM Actions with the matching filter preset so the
          operator's path is hub ??triage. */}
      <TabBar
        value={tab}
        onChange={(v) => setTab(v as PostureTab)}
        accentColor={colors.tech}
        noDivider
        sx={{
          minHeight: 36, mb: 1.1, mx: 0.5,
          '& .MuiTab-root': { minHeight: 36, px: 2, fontSize: 12 },
        }}
        items={[
          { value: 'overview', label: t('external.tabOverview'), icon: <Globe2 size={13} /> },
          { value: 'activity', label: t('external.tabActivity'), icon: <Radio size={13} /> },
          { value: 'supply', label: t('external.tabSupply'), icon: <Package size={13} /> },
          { value: 'darkweb', label: t('external.tabDarkWeb'), icon: <AlertTriangle size={13} /> },
        ]}
      />

      {/* Tabbed content ??Overview keeps the existing hero/trend/
          domain table layout. Other tabs simply render the
          previously-standalone views (now folded in). */}
      {tab === 'activity' && (
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Unified activity feed ??monitoring events + threat
              intel + SLA breaches in one chronological list, severity-
              filterable. Replaces the old MonitoringView + ThreatIntelView
              split tabs which both rendered thin filler over the same
              underlying event stream. */}
          <ActivityFeed monitoringEvents={activityEventsData?.events ?? []} />
        </Box>
      )}
      {tab === 'supply' && (
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <SupplyChainView embedded />
        </Box>
      )}
      {tab === 'darkweb' && (
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'auto', pr: 0.75 }}>
          <DarkWebTab data={leakData} />
        </Box>
      )}
      {tab !== 'overview' && null}

      {tab === 'overview' && isLoading && <Loading />}

      {tab === 'overview' && !isLoading && (!data || data.domain_count === 0) && (
        <Empty icon={Globe2}
          text={t('external.noDomains')}
          description={t('external.noDomainsDesc')}
        />
      )}

      {tab === 'overview' && !isLoading && data && data.domain_count > 0 && (() => {
        const dataDefined = data as ExternalPosture
        // A3-F1 (Codex review of 277b745, 2026-05-25). Same shape
        // as Dashboard sectorPosition: `score_available === false`
        // ??avg_score / avg_grade are null/"" and feeding them to
        // displayScore / computeCorpusPercentile (pre-A3 path:
        // `?? 0`) silently rendered every external-only org with
        // no scoring data yet as "score 250, grade --, Below
        // median sector position" ??every chip a fabricated
        // worst-tier signal.
        //
        // Gate the entire hero score block + percentile chips on
        // score availability. `undefined` is tolerated as truthy
        // (rollout window).
        const hasScore =
          data.score_available !== false && data.avg_score != null && data.avg_grade !== ''
        const gc = hasScore ? (GRADE_COLORS[data.avg_grade] ?? '#94a3b8') : '#94a3b8'
        const rs = data.risk_summary
        // Action items intentionally NOT rendered here ??the
        // CTEM Actions page (`exp-ctem`) is the single triage
        // surface (priority engine + closed-loop verify + filters).
        // The standalone Remediation page (`exp-actions`,
        // ActionPlanView) was retired 2026-05-17 as a duplicate.
        return (
          <EngineerPostureWorkbench
            data={dataDefined}
            hasScore={hasScore}
            scoreColor={gc}
            riskSummary={rs}
            assetStats={assetStats}
            quickCounts={quickCounts}
            selectedDomain={selectedDomain}
            setSelectedDomain={setSelectedDomain}
            kernelByDomain={kernelByDomain}
            sourceHealthCount={sourceHealthData?.sources?.length ?? 0}
            snapshotsCount={snapshotsData?.snapshots?.length ?? 0}
            runsCount={runsData?.runs?.length ?? 0}
            scoreTrendCount={dataDefined.score_trend?.length ?? 0}
          />
        )

      })()}
    </div>
  )
}

type ExternalDomainRow = ExternalPosture['domains'][number]
type KernelScoreMap = Map<string, { score?: number; grade?: string }>

interface EngineerQuickCounts {
  kev: number
  crownJewel: number
  threatActor: number
  phishing: number
  stealerLogs: number
  suspCerts: number
  saasPosture: number
  paths: number
  brand: number
  authVerified: number
  activeVerified: number
}

interface EngineerAssetStats {
  totalSubdomains: number
  resolvingSubdomains: number
  totalAssets: number
}

function EngineerPostureWorkbench({
  data,
  hasScore,
  scoreColor,
  riskSummary,
  assetStats,
  quickCounts,
  selectedDomain,
  setSelectedDomain,
  kernelByDomain,
  sourceHealthCount,
  snapshotsCount,
  runsCount,
  scoreTrendCount,
}: {
  data: ExternalPosture
  hasScore: boolean
  scoreColor: string
  riskSummary?: ExternalPosture['risk_summary']
  assetStats: EngineerAssetStats
  quickCounts: EngineerQuickCounts
  selectedDomain: string | null
  setSelectedDomain: (domain: string | null) => void
  kernelByDomain: KernelScoreMap
  sourceHealthCount: number
  snapshotsCount: number
  runsCount: number
  scoreTrendCount: number
}) {
  const rows = useMemo(() => {
    return data.domains.map((domain) => {
      const kernel = kernelByDomain.get(extractHostFromAssetValue(domain.domain))
      const score = kernel?.score ?? domain.score
      const grade = kernel?.grade ?? domain.grade
      const isDefaultUnscanned = score === 100 && !domain.issue_count
      const domainScored = data.score_available !== false && !!grade && !isDefaultUnscanned
      return { ...domain, score, grade, domainScored }
    }).sort((a, b) => {
      const issueDelta = b.issue_count - a.issue_count
      if (issueDelta !== 0) return issueDelta
      const aScore = a.domainScored ? a.score : Number.POSITIVE_INFINITY
      const bScore = b.domainScored ? b.score : Number.POSITIVE_INFINITY
      return aScore - bScore || a.domain.localeCompare(b.domain)
    })
  }, [data, kernelByDomain])

  const activeDomain = selectedDomain ?? rows[0]?.domain ?? null

  const selected = useMemo(() => {
    if (!activeDomain) return null
    const legacy = data.domains.find((domain) => domain.domain === activeDomain)
    if (!legacy) return null
    const row = rows.find((domain) => domain.domain === activeDomain)
    const kernel = kernelByDomain.get(extractHostFromAssetValue(activeDomain))
    return {
      ...legacy,
      score: kernel?.score ?? legacy.score,
      grade: kernel?.grade ?? legacy.grade,
      domainScored: row?.domainScored ?? true,
    }
  }, [activeDomain, data.domains, kernelByDomain, rows])

  const scoredDomains = rows.filter((row) => row.domainScored).length
  const issueDomains = rows.filter((row) => row.issue_count > 0).length
  const topDomain = rows[0]
  const totalIssues = rows.reduce((sum, row) => sum + row.issue_count, 0)
  const scoreLabel = hasScore && data.avg_score != null ? String(displayScore(data.avg_score)) : '--'
  const gradeLabel = hasScore ? data.avg_grade : tOr('external.noScoreYet', 'No score')

  return (
    <Box sx={{
      flex: 1,
      minHeight: 0,
      display: 'grid',
      gridTemplateRows: 'auto minmax(0, 1fr)',
      gap: 1.5,
      overflow: 'hidden',
    }}>
      <Box sx={{
        border: '1px solid var(--mui-palette-divider)',
        borderLeft: '3px solid var(--exp-accent)',
        borderRadius: 1,
        px: 1.5,
        py: 1.2,
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) auto' },
        gap: 1.2,
        alignItems: 'center',
        bgcolor: 'background.paper',
      }}>
        <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 1.4 }}>
          <Box sx={{
            width: 44,
            height: 44,
            borderRadius: 1.3,
            display: 'grid',
            placeItems: 'center',
            color: 'var(--exp-accent)',
            border: '1px solid var(--mui-palette-divider)',
            bgcolor: 'action.hover',
          }}>
            <Radio size={20} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h2" sx={{ fontSize: 22, fontWeight: 950, lineHeight: 1.05 }}>
              {tOr('external.engineerPostureTitle', '\u66dd\u96aa\u8a3a\u65b7\u5de5\u4f5c\u53f0')}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {topDomain?.domain ?? '--'} · {data.domain_count} {t('external.domains')} · {totalIssues} issues · {sourceHealthCount} sources
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.8, flexWrap: 'wrap', justifyContent: { xs: 'flex-start', lg: 'flex-end' } }}>
          <EngineerMetric label="Score" value={scoreLabel} color={scoreColor} />
          <EngineerMetric label="Grade" value={gradeLabel} color={scoreColor} />
          <EngineerMetric label={tOr('external.engineerScored', '\u5df2\u8a55\u5206')} value={`${scoredDomains}/${data.domain_count}`} color={colors.semantic.success} />
          <EngineerMetric label={tOr('external.engineerIssues', '\u554f\u984c')} value={String(issueDomains)} color={issueDomains > 0 ? colors.severity.high : colors.semantic.success} />
        </Box>
      </Box>

      <Box sx={{
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', lg: '260px minmax(560px, 1.55fr) minmax(320px, 0.85fr)' },
        gap: 1.2,
        overflow: 'hidden',
      }}>
        <Stack spacing={1.2} sx={{ minHeight: 0, overflow: 'hidden' }}>
          <EngineerPanel title={tOr('external.engineerSignals', '\u8a0a\u865f')} icon={<Network size={15} />} accent={colors.tech}>
            <Box sx={{ display: 'grid', gap: 0.8 }}>
              <QuickLinkChip fullWidth icon={<AlertTriangle size={14} />} label="CTEM" count={(riskSummary?.critical_count ?? 0) + (riskSummary?.high_count ?? 0)} tone={colors.severity.high} onClick={() => navigateToCTEMActions({ severities: ['critical', 'high'] })} />
              <QuickLinkChip fullWidth icon={<Network size={14} />} label={t('external.quickPaths')} count={quickCounts.paths} tone={colors.severity.medium} onClick={() => navigateToSection('exp-paths')} />
              <QuickLinkChip fullWidth icon={<Shield size={14} />} label={t('external.quickBrand')} count={quickCounts.brand} tone={colors.brand} onClick={() => navigateToSection('exp-brand')} />
              <QuickLinkChip fullWidth icon={<Shield size={14} />} label={t('external.quickMitigations')} count={riskSummary?.sla_breaches ?? 0} tone={colors.semantic.success} onClick={() => navigateToSection('exp-mitigations')} />
            </Box>
          </EngineerPanel>

          <EngineerPanel title={tOr('external.engineerCoverage', '\u8986\u84cb')} icon={<Shield size={15} />} accent={colors.semantic.success}>
            <Stack spacing={1}>
              <CoverageLine label="Domains" value={data.domain_count} total={Math.max(data.domain_count, 1)} color={colors.tech} />
              <CoverageLine label="Subdomains" value={assetStats.resolvingSubdomains} total={Math.max(assetStats.totalSubdomains, 1)} color={colors.semantic.success} />
              <CoverageLine label="Runs" value={runsCount} total={Math.max(runsCount, 1)} color={colors.brand} />
              <CoverageLine label="Snapshots" value={snapshotsCount} total={Math.max(scoreTrendCount, snapshotsCount, 1)} color={colors.section.scoring} />
            </Stack>
          </EngineerPanel>

          <EngineerPanel title={tOr('external.engineerThreatQueue', '\u9ad8\u98a8\u96aa\u968a\u5217')} icon={<AlertTriangle size={15} />} accent={colors.severity.high} sx={{ minHeight: 0, flex: 1 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 0.8 }}>
              <ThreatBadge label="KEV" value={quickCounts.kev} />
              <ThreatBadge label="Crown" value={quickCounts.crownJewel} />
              <ThreatBadge label="Phishing" value={quickCounts.phishing} />
              <ThreatBadge label="Stealer" value={quickCounts.stealerLogs} />
              <ThreatBadge label="Cert" value={quickCounts.suspCerts} />
              <ThreatBadge label="SaaS" value={quickCounts.saasPosture} />
            </Box>
          </EngineerPanel>
        </Stack>

        <EngineerPanel
          title={tOr('external.engineerDomainQueue', 'Domain \u8a3a\u65b7\u968a\u5217')}
          icon={<Globe2 size={15} />}
          accent={colors.tech}
          sx={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}
          bodySx={{ minHeight: 0, flex: 1, display: 'flex', flexDirection: 'column', p: 0 }}
        >
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 64px 64px 64px 34px',
            px: 1.5,
            py: 1,
            gap: 1,
            fontSize: 11,
            color: 'text.secondary',
            fontWeight: 950,
            borderBottom: '1px solid var(--mui-palette-divider)',
            textTransform: 'uppercase',
          }}>
            <span>Domain</span>
            <span style={{ textAlign: 'center' }}>Assets</span>
            <span style={{ textAlign: 'center' }}>Issues</span>
            <span style={{ textAlign: 'center' }}>Score</span>
            <span />
          </Box>
          <Box sx={{ flex: '0 0 auto', maxHeight: { xs: 360, lg: 430 }, minHeight: 0, overflow: 'auto' }}>
            {rows.map((row) => (
              <DomainQueueRow
                key={row.domain}
                row={row}
                selected={activeDomain === row.domain}
                onClick={() => setSelectedDomain(row.domain)}
              />
            ))}
          </Box>
          <EngineerDataTruthPanel
            rows={rows.length}
            scoredDomains={scoredDomains}
            totalIssues={totalIssues}
            sourceHealthCount={sourceHealthCount}
            runsCount={runsCount}
            snapshotsCount={snapshotsCount}
            pathsCount={quickCounts.paths}
            certCount={quickCounts.suspCerts}
          />
        </EngineerPanel>

        <Box sx={{ minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <DomainDetailPanel
            domain={selected}
            onClear={() => setSelectedDomain(null)}
            onViewFindings={() => navigateToCTEMActions({})}
          />
        </Box>
      </Box>
    </Box>
  )
}

function EngineerPanel({
  title,
  icon,
  accent,
  children,
  sx,
  bodySx,
}: {
  title: string
  icon: React.ReactNode
  accent: string
  children: React.ReactNode
  sx?: object
  bodySx?: object
}) {
  return (
    <Box sx={{
      minWidth: 0,
      border: '1px solid var(--mui-palette-divider)',
      borderRadius: 1,
      bgcolor: 'background.paper',
      overflow: 'hidden',
      boxShadow: 'none',
      position: 'relative',
      '&::before': {
        content: '""',
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 3,
        bgcolor: accent,
        opacity: 0.78,
      },
      ...sx,
    }}>
      <Box sx={{
        px: 1.4,
        py: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 0.8,
        borderBottom: '1px solid var(--mui-palette-divider)',
        color: accent,
        bgcolor: 'background.default',
      }}>
        {icon}
        <Typography variant="subtitle2" sx={{ color: 'text.primary', fontWeight: 950 }}>
          {title}
        </Typography>
      </Box>
      <Box sx={{ p: 1.2, minWidth: 0, ...bodySx }}>
        {children}
      </Box>
    </Box>
  )
}

function EngineerMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Box sx={{
      minWidth: 94,
      border: '1px solid var(--mui-palette-divider)',
      borderRadius: 1,
      px: 1,
      py: 0.65,
      bgcolor: 'background.default',
      boxShadow: `inset 0 2px 0 color-mix(in srgb, ${color} 56%, transparent)`,
    }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 850, display: 'block' }}>
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 950, color, lineHeight: 1.1 }} noWrap>
        {value}
      </Typography>
    </Box>
  )
}

function CoverageLine({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, total)) * 100))
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.45 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 850 }}>{label}</Typography>
        <Typography variant="caption" sx={{ fontWeight: 950 }}>{value}</Typography>
      </Box>
      <Box sx={{ height: 7, borderRadius: 999, bgcolor: 'action.hover', overflow: 'hidden' }}>
        <Box sx={{ height: 1, width: `${pct}%`, bgcolor: color, borderRadius: 999 }} />
      </Box>
    </Box>
  )
}

function ThreatBadge({ label, value }: { label: string; value: number }) {
  const tone = value > 0 ? colors.severity.high : 'var(--mui-palette-text-secondary)'
  return (
    <Box sx={{
      border: '1px solid var(--mui-palette-divider)',
      borderRadius: 1,
      px: 1,
      py: 0.75,
      bgcolor: 'background.default',
      boxShadow: value > 0 ? `inset 0 2px 0 ${colors.severity.high}` : 'inset 0 2px 0 var(--mui-palette-divider)',
      minWidth: 0,
    }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 850 }} noWrap>{label}</Typography>
      <Typography sx={{ fontSize: 20, lineHeight: 1, fontWeight: 950, color: tone }}>{value}</Typography>
    </Box>
  )
}

function EngineerDataTruthPanel({
  rows,
  scoredDomains,
  totalIssues,
  sourceHealthCount,
  runsCount,
  snapshotsCount,
  pathsCount,
  certCount,
}: {
  rows: number
  scoredDomains: number
  totalIssues: number
  sourceHealthCount: number
  runsCount: number
  snapshotsCount: number
  pathsCount: number
  certCount: number
}) {
  const missingScores = Math.max(0, rows - scoredDomains)
  const facts = [
    { label: '\u5f8c\u7aef\u8a55\u5206', value: `${scoredDomains}/${rows}`, tone: scoredDomains > 0 ? colors.semantic.success : colors.severity.medium },
    { label: 'Findings', value: String(totalIssues), tone: totalIssues > 0 ? colors.severity.high : colors.semantic.success },
    { label: '\u8cc7\u6599\u4f86\u6e90', value: String(sourceHealthCount), tone: sourceHealthCount > 0 ? colors.tech : colors.severity.medium },
    { label: '\u6383\u63cf\u57f7\u884c', value: String(runsCount), tone: runsCount > 0 ? colors.brand : colors.severity.medium },
    { label: 'Snapshots', value: String(snapshotsCount), tone: snapshotsCount > 0 ? colors.section.scoring : colors.severity.medium },
    { label: '\u653b\u64ca\u8def\u5f91', value: String(pathsCount), tone: pathsCount > 0 ? colors.severity.medium : colors.semantic.success },
    { label: 'Cert', value: String(certCount), tone: certCount > 0 ? colors.severity.medium : colors.semantic.success },
    { label: '\u672a\u8a55\u5206', value: String(missingScores), tone: missingScores > 0 ? colors.severity.medium : colors.semantic.success },
  ]
  const message = scoredDomains === 0
    ? '\u76ee\u524d\u6c92\u6709 kernel \u8a55\u5206\uff0c\u6240\u4ee5\u5217\u8868\u8207\u8a73\u60c5\u90fd\u4e0d\u986f\u793a\u6eff\u5206\u3002'
    : '\u53ea\u986f\u793a\u5f8c\u7aef\u5df2\u7d93\u7522\u751f\u7684\u8a55\u5206\uff0c\u672a\u8a55\u5206\u9805\u76ee\u4fdd\u6301 --\u3002'

  return (
    <Box sx={{
      flex: 1,
      minHeight: 0,
      borderTop: '1px solid var(--mui-palette-divider)',
      bgcolor: 'background.default',
      p: 1.2,
      display: 'flex',
      flexDirection: 'column',
      gap: 1,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 950 }}>
          {'\u8cc7\u6599\u771f\u5be6\u72c0\u614b'}
        </Typography>
        <Chip
          size="small"
          label={missingScores > 0 ? '\u6709\u7f3a\u53e3' : '\u5df2\u5c31\u7dd2'}
          sx={{
            height: 22,
            borderRadius: 1,
            fontWeight: 950,
            color: missingScores > 0 ? colors.severity.medium : colors.semantic.success,
            bgcolor: 'background.paper',
            border: '1px solid var(--mui-palette-divider)',
          }}
        />
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.45 }}>
        {message}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 0.8, mt: 'auto' }}>
        {facts.map((fact) => (
          <Box key={fact.label} sx={{
            border: '1px solid var(--mui-palette-divider)',
            borderRadius: 1,
            px: 0.9,
            py: 0.75,
            bgcolor: 'background.paper',
            boxShadow: `inset 0 2px 0 color-mix(in srgb, ${fact.tone} 62%, transparent)`,
            minWidth: 0,
          }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 850, display: 'block' }} noWrap>
              {fact.label}
            </Typography>
            <Typography sx={{ fontWeight: 950, fontVariantNumeric: 'tabular-nums', color: fact.tone, lineHeight: 1.15 }} noWrap>
              {fact.value}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

function DomainQueueRow({
  row,
  selected,
  onClick,
}: {
  row: ExternalDomainRow & { domainScored: boolean }
  selected: boolean
  onClick: () => void
}) {
  const scoreColor = row.domainScored ? (GRADE_COLORS[row.grade] ?? '#94a3b8') : '#94a3b8'
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        width: '100%',
        display: 'block',
        textAlign: 'left',
        borderBottom: '1px solid var(--mui-palette-divider)',
        bgcolor: selected ? 'action.selected' : 'transparent',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 64px 64px 64px 34px',
        gap: 1,
        alignItems: 'center',
        px: 1.5,
        py: 1.05,
      }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography className="exp-mono" sx={{ fontWeight: 950, fontSize: 13 }} noWrap title={row.domain}>
            {row.domain}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {row.environment || 'production'}
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ textAlign: 'center', fontWeight: 800 }}>{row.asset_count}</Typography>
        <Typography variant="body2" sx={{ textAlign: 'center', fontWeight: 950, color: row.issue_count > 0 ? colors.severity.high : colors.semantic.success }}>
          {row.issue_count || '--'}
        </Typography>
        <Typography variant="body2" sx={{ textAlign: 'center', fontWeight: 950, color: scoreColor }}>
          {row.domainScored ? displayScore(row.score) : '--'}
        </Typography>
        <Box sx={{ display: 'grid', placeItems: 'center' }}>
          {row.domainScored
            ? <GradeCircle grade={row.grade} color={scoreColor} size={24} />
            : <Clock size={15} color="var(--mui-palette-text-secondary)" />}
        </Box>
      </Box>
    </ButtonBase>
  )
}
