import { useMemo, lazy, Suspense, type ReactNode } from 'react'
import {
  AlertTriangle, Radar, ShieldAlert, LayoutDashboard,
  ChevronRight, Target, Flame, GitPullRequest, Wand2, Crown,
  Globe2, Lock, Skull, Package, TrendingUp, TrendingDown, Minus, Clock,
  Cloud, GitBranch, Info, RadioTower,
} from 'lucide-react'
import { useOrg, useConnectedRepos } from '@hooks/useOrg'
import { useCapabilities } from '@hooks/useCapabilities'
import { useQuery } from '@tanstack/react-query'
import { t } from '@lib/i18n';
import {
  getOrgHealthSummary, listAttackSurface, listPentestProjects, getOrgPulse,
  getComputedScore, getCTEMPriorities, getPeerBaseline, getLeakExposure,
  getOrgScoreEvents, getCloudPosture, getMcpOverview,
  type ConnectedRepo, type RepoHealthSummary, type PulseItem,
} from '@lib/engine'
import { getExternalPosture, getExternalPostureKernel } from '@compounds/_shared/externalPosture'
import {
  kernelAssetsToDomainBuildings, oldestSlaViolationDays, externalThreatCountsFromCtem,
} from '@compounds/_shared/externalModel'
import { qk } from '@lib/queryKeys'
import { queryResolved } from '@lib/queryState'
import type { SurfaceId } from '@lib/surfaces'

import { alpha } from '@mui/material/styles'
import { SEVERITY_TONE, GRADE_TONE } from '@lib/tokens/severity'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import { FindingRow } from '@atoms/FindingRow'
import { QueryError } from '@atoms/QueryError'
import { FlytoPageHeader } from '@atoms/FlytoPageHeader'
import { LazyMount } from '@atoms/LazyMount'
import { JellyCard } from '@atoms/JellyCard'
import { EmptyStateGuide } from '@atoms/EmptyStateGuide'
import { useFixQueue } from '@/contexts/FixQueueContext'
import { HealthGauge, RiskBars } from './charts'
import { ScoreTrendChart } from './ScoreTrendChart'

// Lazy-load the Three.js scene so the 290 KB bundle doesn't enter
// the critical path of users who never reach the dashboard. The
// scene is now an "Asset City" — every connected repo (cube
// building) and monitored domain (cylindrical tower) is a building.
// External-only orgs see a city of towers; code-only orgs see
// blocks; combined gets both shaped districts side by side.
const AssetCity3D = lazy(() =>
  import('./AssetCity3D').then((m) => ({ default: m.AssetCity3D })),
)

// Evidence Fusion (CAASM) reconciliation queue — additive engineer surface.
const ReconciliationQueue = lazy(() =>
  import('@compounds/fusion/ReconciliationQueue').then((m) => ({
    default: m.ReconciliationQueue,
  })),
)

type OrgHealthSummary = NonNullable<ReturnType<typeof useQuery<Awaited<ReturnType<typeof getOrgHealthSummary>>>>['data']>

function useDashboardMetrics(params: {
  healthSummary: OrgHealthSummary | undefined
  totalRepos: number
  repoList: ConnectedRepo[]
  healthRepos: RepoHealthSummary[]
  computedScore: Awaited<ReturnType<typeof getComputedScore>> | undefined
}) {
  const { healthSummary, totalRepos, repoList, healthRepos, computedScore } = params
  return useMemo(() => {
    const server = healthSummary?.aggregated
    // A3 (P1-F PR4 trigger #4) — `score_available === false` is the
    // ONLY no-score signal. Pre-A3 the hero gauge had a triple
    // fallback (`computedScore ?? server.avg_score ?? 0`) that
    // silently rendered an unscored org as score=0 / grade='--'.
    // Two violations gone:
    //   - dropped the `server.avg_*` legacy leg (B1 dual-truth)
    //   - dropped the `?? 0` zero-fallback (A3 contract)
    //
    // `score_available === false` ⇒ `scoreAvailable=false` and the
    // hero card renders an empty state instead of a gauge.
    // `undefined` is treated as truthy during the rollout window
    // (older engine revisions don't emit the flag yet).
    const scoreAvailable =
      computedScore?.score_available !== false &&
      computedScore?.overall_raw != null &&
      computedScore?.overall_grade != null
    const avgScore = scoreAvailable ? computedScore!.overall_raw! : null
    const avgGrade = scoreAvailable ? computedScore!.overall_grade! : null
    const scoreMessage = computedScore?.message ?? null

    // Top risks: use unified repo_scores (sorted by raw ascending = worst first).
    // `topRisks` is an INTENTIONAL top-5 (drives the "Top Risk Repositories"
    // panel — labelled as such). The slice must NOT be the only score source,
    // though: the 3D city renders one building per scanned repo, and a repo
    // ranked 6th+ was silently falling through to score=0 / grade='-' because
    // the lookup map was built from the truncated top-5. Expose the FULL
    // per-repo score map separately so every building gets its real score.
    const scorableRepos = (computedScore?.repo_scores ?? []).filter(r => r.scorable)
    const repoScoreById = new Map(scorableRepos.map(r => [r.repo_id, { grade: r.grade, score: r.raw }]))
    const topRisks = [...scorableRepos]
      .sort((a, b) => a.raw - b.raw)
      .slice(0, 5)
      .map(r => ({
        id: r.repo_id,
        repo: repoList.find(x => x.id === r.repo_id),
        grade: r.grade,
        score: r.raw, // raw 0-100, RiskBars does displayScore() internally
      }))

    return {
      scoreAvailable,
      scoreMessage,
      avgScore,
      avgGrade,
      dist: server?.grade_dist ?? { A: 0, B: 0, C: 0, D: 0, F: 0 },
      critical: server?.critical_count ?? 0,
      high: server?.high_count ?? 0,
      medium: 0,
      atRisk: server?.at_risk_count ?? 0,
      secure: server?.secure_count ?? 0,
      scannedCount: healthSummary?.scanned_count ?? 0,
      totalCount: healthSummary?.total_count ?? totalRepos,
      topRisks,
      repoScoreById,
      healthRepos,
    }
  }, [healthSummary, totalRepos, repoList, healthRepos, computedScore])
}

// --- Main Dashboard ---
export function DashboardView({ onNavigate }: { onNavigate?: (section: string) => void }) {
  const { org, ready: orgReady, notFound: orgNotFound, error: orgError } = useOrg()
  const caps = useCapabilities(org?.id)
  const reposQ = useConnectedRepos(org?.id)
  const { data: repos } = reposQ
  const repoList = repos ?? []
  const fixQueue = useFixQueue()

  const orgSector = (org as { industrySector?: string } | undefined)
    ?.industrySector?.toLowerCase()


  const { data: healthSummary, isLoading: loading, isError, error, refetch } = useQuery({
    queryKey: qk.repos.healthSummary(org?.id),
    queryFn: () => getOrgHealthSummary(org!.id),
    enabled: !!org?.id && reposQ.isSuccess && repoList.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
  const healthRepos = useMemo(() => healthSummary?.repos ?? [], [healthSummary])

  const domainQ = useQuery({
    queryKey: qk.attackSurface(org?.id),
    queryFn: () => listAttackSurface(org!.id),
    enabled: !!org?.id,
    staleTime: 60_000,
  })
  const domainData = domainQ.data
  const cloudEnabled = !!org?.id && caps.ready && caps.canSeePage('cspm')
  const cloudQ = useQuery({
    queryKey: qk.cloud.posture(org?.id),
    queryFn: () => getCloudPosture(org!.id),
    enabled: cloudEnabled,
    staleTime: 60_000,
  })
  const cloudPosture = cloudQ.data
  const runtimeEnabled = !!org?.id && caps.ready && caps.canSeePage('mcp')
  const runtimeQ = useQuery({
    queryKey: qk.mcp.overview(org?.id),
    queryFn: () => getMcpOverview(org!.id),
    enabled: runtimeEnabled,
    staleTime: 60_000,
  })
  const runtimeOverview = runtimeQ.data
  const { data: _pentestData } = useQuery({
    queryKey: qk.pentest.projects(org?.id),
    queryFn: () => listPentestProjects(org!.id),
    enabled: !!org?.id,
    staleTime: 60_000,
  })
  void _pentestData

  // Unified score — single source of truth for dashboard gauge + breakdown
  const { data: computedScore } = useQuery({
    queryKey: qk.computedScore(org?.id),
    queryFn: () => getComputedScore(org!.id),
    enabled: !!org?.id,
    staleTime: 60_000,
  })

  // Pulse — top priority actions from cross-dim correlation engine.
  // Pulled higher in the dashboard than before (was Row 3, now Row 4)
  // and used as the source for cross-dim integration tile counts.
  const { data: pulseData } = useQuery({
    queryKey: qk.pulse.dashboard(org?.id),
    queryFn: () => getOrgPulse(org!.id, '', 20),
    enabled: !!org?.id,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  // External posture — SLA violations + risk_summary + supply chain.
  // The risk_summary.sla_breaches drives the inline SLA chip on the
  // hero banner; supply_chain drives the External Threat Snapshot row.
  const { data: externalPosture } = useQuery({
    queryKey: qk.externalPosture(org?.id),
    queryFn: () => getExternalPosture(org!.id),
    enabled: !!org?.id,
    staleTime: 60_000,
  })
  const { data: externalKernelPosture } = useQuery({
    queryKey: qk.externalPostureKernel(org?.id),
    queryFn: () => getExternalPostureKernel(org!.id),
    enabled: !!org?.id,
    staleTime: 60_000,
  })

  // CTEM priorities — KEV / crown-jewel / threat-actor flags fuel
  // the cross-dim integration tile counts.
  const { data: ctemData } = useQuery({
    queryKey: qk.ctem.priorities(org?.id),
    queryFn: () => getCTEMPriorities(org!.id),
    enabled: !!org?.id,
    staleTime: 30_000,
  })

  // Peer baseline — sector position chip on the hero banner.
  // Skipped when the org hasn't declared a sector in Settings.
  const { data: peerData } = useQuery({
    queryKey: qk.scoring.peerBaseline(org?.id, orgSector),
    queryFn: () => getPeerBaseline(org!.id, orgSector!),
    enabled: !!org?.id && !!orgSector,
    staleTime: 60 * 60_000,
  })

  // Score events — drives the 7-day momentum strip.
  const { data: eventsData } = useQuery({
    queryKey: qk.scoring.scoreEvents(org?.id, 30),
    queryFn: () => getOrgScoreEvents(org!.id, 30),
    enabled: !!org?.id,
    staleTime: 5 * 60_000,
  })

  // Dark-web leak exposure — count on External Threat row.
  const { data: leakData } = useQuery({
    queryKey: qk.dashboard.leak(org?.id),
    queryFn: () => getLeakExposure(org!.id),
    enabled: !!org?.id,
    staleTime: 60 * 60_000,
  })

  const agg = useDashboardMetrics({ healthSummary, totalRepos: repoList.length, repoList, healthRepos, computedScore })

  // ── ALL hooks must be called before any early returns below.
  //    Lint caught this in CI 2026-05-19; moving the useMemo blocks
  //    here keeps the hook order stable across the empty-state /
  //    error / loading branches. ────────────────────────────────────

  // Pulse items power the cross-dim integration tile + the Top 5 row.
  const pulseItems = pulseData?.items ?? []
  const ctemItems = ctemData?.items ?? []
  const slaViolations = externalPosture?.sla_violations ?? []
  const oldestSlaDays = useMemo(() => oldestSlaViolationDays(slaViolations), [slaViolations])

  // 7-day momentum — drives the second hero row.
  const momentum7d = useMemo(() => {
    const events = eventsData?.events ?? []
    const cutoff = Date.now() - 7 * 86_400_000
    const recent = events.filter(e => Date.parse(e.date) >= cutoff)
    const totalDelta = recent.reduce((a, e) => a + (e.to_score - e.from_score), 0)
    const upgrades = recent.filter(e => e.direction === 'upgrade').length
    const downgrades = recent.filter(e => e.direction === 'downgrade').length
    return { totalDelta, upgrades, downgrades, eventCount: recent.length }
  }, [eventsData])

  // Cross-dim integration counts — the moat visualisation. Each
  // tile asks: of the {N} critical+high findings, how many ALSO
  // have signal X? The "AND" math is the product thesis.
  const crossDim = useMemo(() => {
    const hot = pulseItems.filter(i =>
      i.severity?.toLowerCase() === 'critical' || i.severity?.toLowerCase() === 'high',
    )
    const total = hot.length
    return {
      total,
      reachable: hot.filter(i => i.taint_adjacency != null).length,
      openPR: hot.filter(i => (i.open_prs_touching?.length ?? 0) > 0).length,
      autofix: hot.filter(i => i.autofix_eligible).length,
      pentestVerified: hot.filter(i => i.pentest_verdict != null).length,
    }
  }, [pulseItems])

  // City buildings (code district) — one cubic building per scanned
  // repo. Memoised + indexed: the previous inline derivation ran two
  // O(n) `.find()` scans per repo (repoList + topRisks) on EVERY
  // render, i.e. O(repos × (repoList + topRisks)). Precompute Maps once
  // so each repo is an O(1) lookup; the map work runs only when the
  // real inputs change. Behaviour is byte-identical to the old `.find()`.
  const repoBuildings = useMemo<import('./AssetCity3D').CityBuilding[]>(() => {
    const repoById = new Map(repoList.map(x => [x.id, x]))
    // Use the FULL per-repo score map (not the top-5 `topRisks`) so every
    // building below rank 5 shows its real score/grade instead of 0 / '-'.
    const scoreById = agg.repoScoreById
    return (agg.healthRepos ?? []).map((r): import('./AssetCity3D').CityBuilding => {
      const repo = repoById.get(r.repo_id)
      const risk = scoreById.get(r.repo_id)
      const sizeProxy =
        (r.alert_total ?? 0) +
        (r.security_findings ?? 0) +
        (r.cve_total ?? 0) +
        (r.complex_functions ?? 0) +
        (r.dead_code_count ?? 0) + 1
      return {
        id: r.repo_id,
        kind: 'repo',
        name: repo?.repoName ?? r.repo_id,
        score: risk?.score ?? 0,
        grade: risk?.grade ?? '-',
        size: sizeProxy,
        criticalCount: r.cve_critical ?? 0,
      }
    })
  }, [agg.healthRepos, agg.repoScoreById, repoList])

  // KEV + threat-actor counts come from the CTEM priority list
  // (not pulse, since pulse is repo-scoped and KEV is external).
  // Derivation lives in `externalModel.externalThreatCountsFromCtem`
  // so a future variant (external-only / per-BU / per-tier) can be
  // added in one place instead of being copy-pasted across views.
  const externalThreat = useMemo(() => externalThreatCountsFromCtem(ctemItems), [ctemItems])

  // Sector position chip — shown on the hero banner when org has
  // declared a sector AND peer baseline data is loaded AND the
  // engine has a real score. A3 (Codex review of 97e3d90): the
  // pre-A3 `overall_raw ?? 0` here silently rendered every
  // unscored org as "Below median" — the worst tier — once a peer
  // baseline existed. Gate on `score_available !== false` AND
  // explicit non-null raw before comparing against percentiles.
  const sectorPosition = useMemo(() => {
    if (!orgSector || !peerData?.latest || !computedScore) return null
    if (computedScore.score_available === false || computedScore.overall_raw == null) {
      return null
    }
    const p50 = peerData.latest[50]?.value
    const p90 = peerData.latest[90]?.value
    const score = computedScore.overall_raw
    if (p90 != null && score >= p90) return { label: t('dashboard.posTop10'), tone: '#22c55e' }
    if (p50 != null && score >= p50) return { label: t('dashboard.posAboveMedian'), tone: '#84cc16' }
    if (p50 != null && score < p50) return { label: t('dashboard.posBelowMedian'), tone: '#f97316' }
    return null
  }, [orgSector, peerData, computedScore])

  // Active surfaces — data presence per pillar, derived from the surface
  // registry (@lib/surfaces) instead of a hardcoded 3-way enum. New pillars
  // (cloud, MCP…) extend by adding their presence here + a registry entry,
  // not by adding `mode` branches. Computed BEFORE the empty-state gates so
  // an external-only org (domains, no repos) is NEVER told to import code.
  const surfacePresent: Partial<Record<SurfaceId, boolean>> = {
    code: repoList.length > 0,
    external: (domainData?.assets?.length ?? 0) > 0,
    cloud: (cloudPosture?.resource_count ?? 0) > 0,
    runtime: !!runtimeOverview?.configured ||
      (runtimeOverview?.toolTotal ?? 0) > 0 ||
      (runtimeOverview?.servers?.length ?? 0) > 0 ||
      (runtimeOverview?.recentDecisions?.length ?? 0) > 0,
    // container presence is not fetched on the dashboard yet — it lights up
    // here (and in the city below) the moment its count is wired.
  }
  const hasCode = !!surfacePresent.code
  const hasExternal = !!surfacePresent.external
  const hasCloud = !!surfacePresent.cloud
  const hasRuntime = !!surfacePresent.runtime
  const presenceReady =
    !!org?.id &&
    orgReady &&
    caps.ready &&
    queryResolved(reposQ, !!org?.id) &&
    queryResolved(domainQ, !!org?.id) &&
    queryResolved(cloudQ, cloudEnabled) &&
    queryResolved(runtimeQ, runtimeEnabled)

  if (orgError || orgNotFound) {
    return (
      <QueryError
        error={orgError ?? new Error('Workspace not found')}
        label={t('dashboard.orgLabel')}
      />
    )
  }

  if (reposQ.isError) {
    return (
      <QueryError
        error={reposQ.error}
        onRetry={reposQ.refetch}
        label={t('dashboard.reposLabel')}
      />
    )
  }

  if (domainQ.isError) {
    return (
      <QueryError
        error={domainQ.error}
        onRetry={domainQ.refetch}
        label={t('dashboard.attackSurfaceLabel')}
      />
    )
  }

  if (cloudEnabled && cloudQ.isError) {
    return (
      <QueryError
        error={cloudQ.error}
        onRetry={cloudQ.refetch}
        label={t('dashboard.cloudPostureLabel')}
      />
    )
  }

  if (isError) {
    return (
      <QueryError
        error={error}
        onRetry={refetch}
        label={t('dashboard.label')}
      />
    )
  }

  if (!presenceReady || loading) {
    return (
      <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
        <Box sx={{ display: 'flex', gap: 3, mb: 3 }}>
          <Box sx={{ width: 200, height: 200, borderRadius: 3, bgcolor: 'action.hover', animation: 'pulse 1.5s infinite' }} />
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ height: 24, width: '60%', borderRadius: 1, bgcolor: 'action.hover', animation: 'pulse 1.5s infinite' }} />
            <Box sx={{ height: 16, width: '40%', borderRadius: 1, bgcolor: 'action.hover', animation: 'pulse 1.5s infinite' }} />
            <Box sx={{ flex: 1, borderRadius: 2, bgcolor: 'action.hover', animation: 'pulse 1.5s infinite' }} />
          </Box>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 2 }}>
          {[0, 1, 2].map(i => (
            <Box key={i} sx={{ height: 120, borderRadius: 2, bgcolor: 'action.hover', animation: 'pulse 1.5s infinite' }} />
          ))}
        </Box>
      </Box>
    )
  }

  // Truly-empty org — nothing connected at all (no code, external, cloud OR
  // runtime). Offer surface-specific entry points. Navigation goes through onNavigate→sectionToPath
  // so it lands on the /projects/:orgId/* route, not the app root.
  if (!hasCode && !hasExternal && !hasCloud && !hasRuntime) {
    // Surface-aware onboarding: lead with the entry point that matches what
    // THIS project actually bought, so a cloud-only project is told to
    // connect a cloud account — not pushed to add a domain or import code.
    // Order falls out of the server-authored entitlement snapshot. While
    // capabilities are loading, show the empty state without product CTAs
    // instead of guessing a default surface and leaking an unauthorized path.
    const entryCtas = [
      caps.canSeePage('domains') ? { label: t('dashboard.addDomain'), icon: <Globe2 size={16} />, target: '_domains' } : null,
      caps.canSeePage('repos') ? { label: t('dashboard.connectRepos'), icon: <GitBranch size={16} />, target: '_repos' } : null,
      caps.canSeePage('cspm') ? { label: t('dashboard.connectCloud'), icon: <Cloud size={16} />, target: '_cloud-posture' } : null,
      caps.canSeePage('mcp') ? { label: t('dashboard.connectRuntime'), icon: <RadioTower size={16} />, target: '_mcp' } : null,
    ].filter(Boolean) as { label: string; icon: ReactNode; target: string }[]
    const primary = entryCtas[0]
    const secondary = entryCtas[1]
    return (
      <EmptyStateGuide
        icon={<LayoutDashboard size={28} />}
        title={t('dashboard.welcome')}
        description={t('dashboard.getStartedDesc')}
        primaryAction={primary ? {
          label: primary.label,
          icon: primary.icon,
          onClick: () => onNavigate?.(primary.target),
        } : undefined}
        secondaryAction={secondary ? {
          label: secondary.label,
          onClick: () => onNavigate?.(secondary.target),
        } : undefined}
      />
    )
  }

  // Code/combined org with repos connected but not yet scanned. Gated on
  // hasCode AND on the org being entitled to BOTH code and external scoped
  // surfaces — so the "scan your repos" path only fires when code is the
  // org's only signal source. An org that ALSO has an external surface
  // (hasExternal) falls through to the real dashboard below, which renders
  // the external posture even before any repo scan lands; telling such an
  // org "run a code scan to see your dashboard" would be a false dead-end
  // since its external side already has data. This is the zero-findings vs
  // zero-other-surface distinction: connected-but-unscanned code is an
  // honest "scan to populate", not "you have nothing".
  if (hasCode && !hasExternal && !hasCloud && !hasRuntime && healthRepos.length === 0) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 12 }}>
        <Box sx={{
          width: 80, height: 80, borderRadius: '50%', mb: 3,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          bgcolor: 'action.hover',
        }}>
          <Radar size={36} style={{ opacity: 0.3 }} />
        </Box>
        <Typography variant="h6" fontWeight={600} color="text.primary" sx={{ mb: 1 }}>
          {t('dashboard.scanAllToStart')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', maxWidth: 400 }}>
          {t('dashboard.noDataDesc')}
        </Typography>
      </Box>
    )
  }

  // Risk level. The "healthy" verdict is only honest when the engine has
  // actually computed a score — i.e. there is real scanned coverage behind
  // the zero critical / zero at-risk counts. Without `scoreAvailable` those
  // zeros mean "nothing measured yet", NOT "measured and clean"; asserting
  // "your posture is healthy" there would fabricate a clean verdict from an
  // absence of data. In that case fall back to a neutral "awaiting first
  // results" sentence and a neutral (warning-toned) banner instead of green.
  const measured = agg.scoreAvailable
  const riskSentence = (() => {
    if (agg.critical > 0) return t('dashboard.riskCritical').replace('{n}', String(agg.critical))
    if (agg.atRisk > 0) return t('dashboard.riskAtRisk').replace('{n}', String(agg.atRisk))
    if (!measured) return t('dashboard.riskAwaiting')
    return t('dashboard.riskClear')
  })()
  const riskLevel = agg.critical > 0 ? 'critical' : agg.atRisk > 0 ? 'warning' : measured ? 'healthy' : 'neutral'
  // Theme-adaptive banner tint. Hardcoded `#xxxxxx18` low-alpha hexes
  // blend into the dark Paper background (the soft-bg disappears); route
  // every level through the canonical tone tokens so `alpha(tone, 0.14)`
  // composites correctly over BOTH the light and dark surface. Text/icon
  // use the saturated `.tone` (legible on the tint in either mode) except
  // neutral, which uses the semantic muted token so "not scored yet" reads
  // as a quiet footnote rather than a coloured verdict.
  const rcTone = {
    critical: SEVERITY_TONE.critical.tone,
    warning:  SEVERITY_TONE.high.tone,
    healthy:  GRADE_TONE.good.tone,
    // Neutral = "no measured posture yet". Slate, NOT green — green would
    // read as an earned all-clear when the truth is simply "not scored yet".
    neutral:  SEVERITY_TONE.low.tone,
  }[riskLevel]
  const rc = {
    bg: alpha(rcTone, 0.14),
    border: alpha(rcTone, 0.3),
    text: riskLevel === 'neutral' ? 'var(--mui-palette-text-disabled)' : rcTone,
  }

  // City buildings — combined codebase + external surface view.
  //   - Repos become cubic buildings; height = log(alerts + CVEs +
  //     complexity + dead code), tone = grade. (Derived + memoised in
  //     the hooks block above as `repoBuildings`.)
  //   - Domains become cylindrical towers; height = log(asset_count
  //     + issue_count), tone = grade from external posture.
  // External-only orgs see a city full of towers; code-only orgs see
  // blocks; combined orgs get both shapes side by side (cubic
  // "code district" + cylindrical "external district").
  const domainBuildings = kernelAssetsToDomainBuildings(externalKernelPosture?.assets)
  // Cloud district — one cone building per connected cloud account, sized by
  // resource count, tinted by the account's average score grade.
  const cloudBuildings = (cloudPosture?.accounts ?? []).map((a): import('./AssetCity3D').CityBuilding => ({
    id: a.account_id,
    kind: 'cloud',
    name: a.display_name || a.account_locator || a.account_id,
    score: a.avg_score ?? 0,
    grade: cloudPosture?.avg_grade ?? '-',
    size: (a.resource_count ?? 0) + 1,
    criticalCount: 0,
  }))
  const cityBuildings = [...repoBuildings, ...domainBuildings, ...cloudBuildings]

  // Non-hook derived values used in the render block below — these
  // are safe to compute after the early returns since they're plain
  // expressions, not hooks.
  const pulseTop5 = pulseItems.slice(0, 5)
  const slaBreaches = externalPosture?.risk_summary?.sla_breaches ?? 0
  const supplyChain = externalPosture?.supply_chain

  // Surface presence (`hasCode` / `hasExternal`) is computed above, before
  // the empty-state gates, so external-only orgs reach this render path.
  // Hiding tiles that have zero data is friendlier than greying them.
  const showRepoRisks = hasCode && agg.topRisks.length > 0
  const showExternalThreats = hasExternal

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, p: 1 }}>

      <FlytoPageHeader
        title={t('dashboard.title')}
        subtitle={t('dashboard.subtitle')}
        bottomGap={0}
      />

      {/* ── Risk Hero Banner ─────────────────────────────────────
          Single-line judgement of org state. Three inline chips
          (SLA / sector / view-critical action) keep it dense but
          scannable. Stretched full-width above the bento grid. */}
      <Paper
        elevation={0}
        sx={{
          display: 'flex', alignItems: 'center', gap: 2,
          px: 2.5, py: 1.75, borderRadius: 2,
          bgcolor: rc.bg, border: `1px solid ${rc.border}`, borderLeft: `4px solid ${rc.text}`,
          flexWrap: 'wrap',
        }}
      >
        <ShieldAlert size={22} style={{ color: rc.text, flexShrink: 0 }} />
        <Typography fontWeight={600} sx={{ color: rc.text, fontSize: 15, mr: 1 }}>
          {riskSentence}
        </Typography>
        {/* Honesty caveat — every verdict (clean OR alarming) is only as
            good as the automated scans behind it, so the footnote is
            symmetric: it isn't the green state alone that carries a
            disclaimer. Kept subtle + muted so it reads as a footnote. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mr: 1, minWidth: 0 }}>
          <Info size={13} style={{ color: 'var(--mui-palette-text-disabled)', flexShrink: 0 }} />
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: 12, lineHeight: 1.3 }}>
            {t('dashboard.riskScanCaveat')}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', ml: { xs: 0, md: 'auto' } }}>
          {slaBreaches > 0 && (
            <Tooltip title={oldestSlaDays > 0
              ? t('dashboard.slaTip').replace('{n}', String(oldestSlaDays))
              : t('dashboard.slaTipNoAge')}>
              <Chip size="small" icon={<Clock size={13} />}
                label={oldestSlaDays > 0
                  ? `${slaBreaches} ${t('dashboard.slaOverdue')} · ${oldestSlaDays}${t('dashboard.days')}`
                  : `${slaBreaches} ${t('dashboard.slaOverdue')}`}
                sx={{ bgcolor: '#ef444418', color: '#ef4444', fontWeight: 700, border: '1px solid #ef444440' }}
                onClick={() => onNavigate?.('_ctem')}
              />
            </Tooltip>
          )}
          {sectorPosition && (
            <Tooltip title={t('dashboard.sectorTip')}>
              <Chip size="small" icon={<Globe2 size={13} />}
                label={`${sectorPosition.label} · ${t('dashboard.sector')}`}
                sx={{ bgcolor: `${sectorPosition.tone}18`, color: sectorPosition.tone, fontWeight: 700, border: `1px solid ${sectorPosition.tone}40` }}
                onClick={() => onNavigate?.('scoring-trends')}
              />
            </Tooltip>
          )}
        </Box>
        {agg.critical > 0 && (
          <Button size="small" variant="text"
            onClick={() => onNavigate?.('_issues')}
            sx={{ color: rc.text, textTransform: 'none', fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', ml: 1 }}
            endIcon={<ChevronRight size={16} />}
          >
            {t('dashboard.viewCritical')}
          </Button>
        )}
      </Paper>

      {/* ── BENTO ROW 1: Big Gauge | Cross-Dim Tile + Momentum stacked ──
          Restored to the original asymmetric layout — operator
          flagged that splitting the gauge across a side-by-side
          3D scene caused the Cross-Dim tile to overflow. The 3D
          visualisation now gets its own full-width row below. */}
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(280px, 5fr) minmax(0, 7fr)' },
        gap: 2,
      }}>
        <JellyCard delay={0.00} noHover>
          <Paper elevation={1} className="rounded-xl" sx={{
            bgcolor: 'background.paper',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            px: { xs: 2, md: 3 }, py: { xs: 2, md: 3 }, gap: { xs: 1.5, md: 2 },
            minHeight: { xs: 220, md: 320 }, height: '100%',
          }}>
            <Typography variant="caption" fontWeight={700} sx={{
              textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 12,
            }} color="text.secondary">
              {t('dashboard.gradeTitle')}
            </Typography>
            {agg.scoreAvailable ? (
              <HealthGauge score={agg.avgScore!} grade={agg.avgGrade!} />
            ) : (
              // A3 empty state — explicit "no data yet", NOT a 0-gauge
              // with grey "--" badge (the pre-A3 fallback rendered
              // every unscored org as score=0 + grade=`--`, looking
              // identical to a real "engine computed zero").
              <Box sx={{ textAlign: 'center', py: 3, opacity: 0.7 }}>
                <Typography variant="h6" fontWeight={700} color="text.secondary">
                  —
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 240, mt: 1 }}>
                  {agg.scoreMessage ?? t('dashboard.noScoreYet')}
                </Typography>
              </Box>
            )}
            {agg.scoreAvailable && momentum7d.totalDelta !== 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {momentum7d.totalDelta > 0
                  ? <TrendingUp size={14} style={{ color: '#22c55e' }} />
                  : <TrendingDown size={14} style={{ color: '#ef4444' }} />}
                <Typography variant="caption" sx={{
                  fontWeight: 700, fontSize: 13,
                  color: momentum7d.totalDelta > 0 ? '#22c55e' : '#ef4444',
                }}>
                  {momentum7d.totalDelta > 0 ? '+' : ''}{momentum7d.totalDelta} {t('dashboard.last7d')}
                </Typography>
              </Box>
            )}
          </Paper>
        </JellyCard>

        {/* Right column — stretches to match the left gauge card's
            height (operator 2026-05-22: "這邊高度 可以跟左邊一樣").
            CrossDimTile absorbs the leftover vertical space (it has
            4 stat tiles + room to breathe), MomentumStrip stays
            natural size since it's a single-row 4-KPI strip. */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
          {crossDim.total > 0 && (
            <JellyCard delay={0.06} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <CrossDimTile
                crossDim={crossDim}
                onOpenFixQueue={(filter) => fixQueue.open({ filter })}
              />
            </JellyCard>
          )}
          <JellyCard delay={0.12}>
            <MomentumStrip
              delta={momentum7d.totalDelta}
              upgrades={momentum7d.upgrades}
              downgrades={momentum7d.downgrades}
              autofixReady={crossDim.autofix}
              verified={crossDim.pentestVerified}
              onOpenAutofixQueue={() => fixQueue.open({ filter: 'autofix' })}
            />
          </JellyCard>
        </Box>
      </Box>

      {/* ── BENTO ROW 2 (NEW): Full-width 3D Score Dimensions ────
          Replaces the previous orbital-network 3D scene. Operator
          asked for a "full row, meaningful 3D animation showing
          useful info — operators get a city skyline view of every
          connected repo. Building heights = log-scale size, tones
          = grade, and a pulsing red beacon on top of repos with
          open critical findings. Click a building → repo detail. */}
      <JellyCard delay={0.18} noHover>
        <Paper elevation={1} className="rounded-xl" sx={{
          bgcolor: 'background.paper',
          position: 'relative', overflow: 'hidden',
          // Shorter on mobile (3D scene is heavy + the hint overlay
          // crowds the canvas at narrow widths). 380 mobile / 520
          // desktop strikes the balance — big enough to see the
          // skyline, not so big that scrolling past it is a chore.
          height: { xs: 320, sm: 380, md: 520 },
        }}>
          <Box sx={{
            position: 'absolute', top: 14, left: 18, right: 18, zIndex: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 2, flexWrap: 'wrap',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pointerEvents: 'none' }}>
              <Crown size={14} style={{ color: '#7c3aed' }} />
              <Typography variant="caption" fontWeight={700} sx={{
                textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 12,
              }} color="text.secondary">
                {hasExternal && !hasCode
                  ? t('dashboard.surfaceCityTitle')
                  : hasCode && !hasExternal
                    ? t('dashboard.codeCityTitle')
                    : t('dashboard.assetCityTitle')}
              </Typography>
            </Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: 13, pointerEvents: 'none', flex: { xs: '1 1 100%', sm: '0 0 auto' } }}
            >
              {t('dashboard.codeCityHint')}
            </Typography>
          </Box>
          {/* LazyMount delays the WebGL scene + its data crunching
              until the user scrolls within 200px of the viewport.
              On first paint the 3D bundle (~400KB three.js +
              react-three-fiber) doesn't even start its chunk
              download, which keeps the above-fold cards snappy
              (operator 2026-05-22: "頁面不覺得慢"). */}
          <LazyMount
            minHeight={420}
            placeholder={
              <Box sx={{
                width: '100%', height: 420,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Typography variant="caption" color="text.secondary">
                  {t('dashboard.codeCityIdle')}
                </Typography>
              </Box>
            }
          >
            <Suspense fallback={
              <Box sx={{
                width: '100%', height: 420,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Typography variant="caption" color="text.secondary">
                  {t('dashboard.codeCityLoading')}
                </Typography>
              </Box>
            }>
              <AssetCity3D
                buildings={cityBuildings}
                onBuildingClick={(b) => {
                  // Cloud accounts have no Fix Queue scope (CSPM findings
                  // aren't in the queue yet) — route to the CSPM findings
                  // page instead. Code/external buildings open the Fix
                  // Queue scoped to the asset so the operator stays put;
                  // an empty queue renders its own "nothing to fix" state.
                  if (b.kind === 'cloud') {
                    onNavigate?.('_cloud-findings')
                    return
                  }
                  fixQueue.open({
                    filter: 'all',
                    scope: { kind: b.kind, value: b.id },
                  })
                }}
              />
            </Suspense>
          </LazyMount>
        </Paper>
      </JellyCard>

      {/* ── BENTO ROW 3: Pulse Top 5 (wide) | External Threats + Top Risks stacked (narrow) ──
          Right column stacks External Threats on top of Top Risk
          Repos so both signals share one column. Score Trend gets
          its own full-width row below — "歷史紀錄很重要". */}
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 8fr) minmax(280px, 4fr)' },
        gap: 2,
        alignItems: 'stretch',
      }}>
        {pulseTop5.length > 0 ? (
          <JellyCard delay={0.20}>
          <Paper elevation={1} className="rounded-xl" sx={{ bgcolor: 'background.paper' }}>
            <Box sx={{ px: 3, pt: 2.5, pb: 2, height: '100%' }}>
              <Box className="flex items-center justify-between mb-3">
                <Box className="flex items-center gap-2">
                  <Flame size={16} style={{ color: '#ef4444' }} />
                  <Typography variant="caption" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 13 }} color="text.secondary">
                    {t('dashboard.pulseTop5')}
                  </Typography>
                </Box>
                <Button size="small" variant="text"
                  onClick={() => onNavigate?.('_pulse')}
                  sx={{ textTransform: 'none', fontWeight: 600, fontSize: 14 }}
                  endIcon={<ChevronRight size={16} />}
                >
                  {t('dashboard.viewAllPulse')}
                </Button>
              </Box>
              <Box className="flex flex-col gap-0.5">
                {pulseTop5.map(item => {
                  const repoName = repoList.find(r => r.id === item.repo_id)?.repoName
                  return (
                    <PulseRow
                      key={item.id}
                      item={item}
                      repoName={repoName}
                      // Direct dashboard → fix flow. Clicking a row
                      // opens the Fix Queue scrolled to this finding
                      // instead of navigating to /pulse and making
                      // the operator hunt for it again.
                      onClick={() => fixQueue.open({ filter: 'all', initialItemId: item.id })}
                    />
                  )
                })}
              </Box>
            </Box>
          </Paper>
          </JellyCard>
        ) : (
          <JellyCard delay={0.20} noHover>
          <Paper elevation={1} className="rounded-xl" sx={{
            bgcolor: 'background.paper', display: 'flex',
            alignItems: 'center', justifyContent: 'center', minHeight: 280,
          }}>
            <Typography variant="body2" color="text.secondary">
              {t('dashboard.pulseEmpty')}
            </Typography>
          </Paper>
          </JellyCard>
        )}

        {/* Right column — External Threats on top, Top Risk Repos
            stacked below. Both auto-hide when their data is empty,
            and the stacking lets neither dominate. */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {showExternalThreats && (
            <JellyCard delay={0.24}>
              <ExternalThreatStrip
                kev={externalThreat.kev}
                threatActor={externalThreat.threatActor}
                crownJewel={externalThreat.crownJewel}
                supplyCriticalVendors={supplyChain?.critical_vendors ?? 0}
                leakCount={leakData?.hit_count ?? 0}
                compact
                onNavigate={onNavigate}
              />
            </JellyCard>
          )}
          {showRepoRisks && (
            <JellyCard delay={0.28}>
              <Paper elevation={1} className="rounded-xl" sx={{ bgcolor: 'background.paper' }}>
                <Box sx={{ px: 3, pt: 2.5, pb: 2 }}>
                  <Box className="flex items-center justify-between mb-2">
                    <Typography variant="caption" fontWeight={700} sx={{
                      textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 13,
                    }} color="text.secondary">
                      {t('dashboard.topRisks')}
                    </Typography>
                    <Button size="small" variant="text"
                      onClick={() => onNavigate?.('_repos')}
                      sx={{ textTransform: 'none', fontWeight: 600, fontSize: 14 }}
                      endIcon={<ChevronRight size={16} />}
                    >
                      {t('dashboard.viewAllRepos')}
                    </Button>
                  </Box>
                  <RiskBars risks={agg.topRisks} />
                </Box>
              </Paper>
            </JellyCard>
          )}
        </Box>
      </Box>

      {/* ── BENTO ROW 4: Score Trend — FULL WIDTH ────────────────
          Promoted to its own full-width row so the history chart
          gets the horizontal space it needs for date readability,
          rather than being squeezed alongside Top Risks. */}
      <JellyCard delay={0.32} noHover>
        <ScoreTrendChart />
      </JellyCard>

      {/* ── Evidence Fusion (CAASM) — cross-source reconciliation queue ──
          The human-in-the-loop triage for the fusion engine's disagreements,
          additive at the bottom of the war room. */}
      <JellyCard delay={0.34} noHover>
        <Suspense fallback={null}>
          <ReconciliationQueue />
        </Suspense>
      </JellyCard>
    </Box>
  )
}

// ── Compact sub-components ──

/** Pulse finding row with blast radius context. */
function PulseRow({ item, repoName, onClick }: {
  item: PulseItem; repoName?: string; onClick?: () => void
}) {
  // Build a compact context strip — these are workflow signals
  // (AutoFix readiness / PR overlap / Pentest verdict), not
  // severity, so they render as the neutral subtitle string.
  const contextParts: string[] = []
  if (item.autofix_eligible) contextParts.push(t('dashboard.pulseAutofix'))
  if (item.taint_adjacency) contextParts.push(t('dashboard.pulseTaint'))
  if ((item.open_prs_touching?.length ?? 0) > 0) contextParts.push(t('dashboard.pulsePR'))
  if (item.pentest_verdict) contextParts.push(t('dashboard.pulsePentest'))

  const subtitle = [repoName, contextParts.join(' · ')].filter(Boolean).join(' · ') || undefined

  // Blast radius tone bands match severity colours via the central
  // map — see lib/tokens.ts blastTone().
  const blastTone: 'critical' | 'high' | undefined =
    item.blast_radius >= 60 ? 'critical' :
    item.blast_radius >= 30 ? 'high' :
    undefined

  return (
    <FindingRow
      severity={item.severity || '—'}
      title={item.title}
      subtitle={subtitle}
      metric={{
        value: item.blast_radius,
        tone: blastTone,
        icon: <Flame size={16} />,
      }}
      onClick={onClick}
    />
  )
}

// ── New 2026-05-20: Momentum strip, Cross-Dim tile, External Threat strip ──

/**
 * MomentumStrip — 7-day trend signal as a four-stat row.
 *
 * Operators kept asking "are we getting better or worse?" — the
 * gauge alone is a point-in-time snapshot, useless for that
 * question. This strip pulls the answer to the top of the page:
 * net score delta + up/down event counts + how much AutoFix /
 * verification headroom we have to close the gap.
 */
function MomentumStrip({ delta, upgrades, downgrades, autofixReady, verified, onOpenAutofixQueue }: {
  delta: number
  upgrades: number
  downgrades: number
  autofixReady: number
  verified: number
  /** Open the fix queue drawer scoped to autofix-eligible items.
   *  AutoFix is the only momentum-tile that's actionable — the
   *  other three are read-only trend signals. */
  onOpenAutofixQueue?: () => void
}) {
  const deltaTone = delta > 0 ? '#22c55e' : delta < 0 ? '#ef4444' : '#94a3b8'
  const deltaIcon = delta > 0 ? <TrendingUp size={16} /> : delta < 0 ? <TrendingDown size={16} /> : <Minus size={16} />
  const deltaLabel = delta === 0 ? t('common.noChange') : (delta > 0 ? `+${delta}` : `${delta}`)
  return (
    <Paper
      elevation={1}
      className="rounded-xl"
      sx={{
        bgcolor: 'background.paper',
        px: { xs: 2, md: 3 }, py: 2,
        display: 'grid',
        gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' },
        gap: { xs: 1.5, sm: 3 },
      }}
    >
      <MomentumTile
        icon={deltaIcon}
        tone={deltaTone}
        label={t('dashboard.momentum7d')}
        value={deltaLabel}
      />
      <MomentumTile
        icon={<TrendingUp size={16} />}
        tone={upgrades > 0 ? '#22c55e' : 'text.secondary'}
        label={t('dashboard.momentumUp')}
        value={String(upgrades)}
      />
      <MomentumTile
        icon={<TrendingDown size={16} />}
        tone={downgrades > 0 ? '#ef4444' : 'text.secondary'}
        label={t('dashboard.momentumDown')}
        value={String(downgrades)}
      />
      <MomentumTile
        icon={<Wand2 size={16} />}
        tone={autofixReady > 0 ? '#7c3aed' : 'text.secondary'}
        label={t('dashboard.momentumAutofix')}
        value={String(autofixReady)}
        sub={verified > 0
          ? `+ ${verified} ${t('dashboard.momentumVerified')}`
          : undefined}
        onClick={autofixReady > 0 ? onOpenAutofixQueue : undefined}
      />
    </Paper>
  )
}

function MomentumTile({ icon, tone, label, value, sub, onClick }: {
  icon: React.ReactNode
  tone: string
  label: string
  value: string
  sub?: string
  onClick?: () => void
}) {
  const interactive = !!onClick
  return (
    <Box
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      sx={{
        // Fixed minHeight so all four tiles align regardless of
        // whether one has a `sub` line. `justifyContent:
        // space-between` pins the label to top, value+sub to
        // bottom — so the big numbers all sit on the same
        // horizontal baseline across the row.
        display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: 72,
        gap: 1,
        cursor: interactive ? 'pointer' : 'default',
        borderRadius: 1,
        px: 1, py: 0.5, mx: -1,
        transition: 'background-color 0.12s',
        ...(interactive && { '&:hover': { bgcolor: 'action.hover' } }),
      }}
    >
      {/* Label row — fixed 2-line height so single-line and
          wrapped-line labels all reserve the same space, and the
          big number below sits at the same baseline across the
          row. Wrap is allowed because narrow column widths make
          ellipsis on a 3-word label feel broken (the operator
          loses the tooltip on hover too). */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, minHeight: 32, minWidth: 0 }}>
        <Box sx={{ color: tone, display: 'flex', flexShrink: 0, mt: 0.125 }}>{icon}</Box>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            fontWeight: 600,
            fontSize: 13,
            lineHeight: 1.3,
            minWidth: 0,
          }}
        >
          {label}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, minHeight: 28 }}>
        <Typography sx={{ fontSize: 26, fontWeight: 700, color: tone, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </Typography>
        {sub && (
          <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 500 }}>
            {sub}
          </Typography>
        )}
      </Box>
    </Box>
  )
}

/**
 * CrossDimTile — THE PRODUCT MOAT visualised.
 *
 * For every critical+high finding the engine has joined, show how
 * many ALSO have the joined-from-other-dimension signal lit up.
 * A Bitsight-only or Snyk-only competitor cannot render any of
 * these cells — they don't have the join. This tile makes the
 * thesis visible on the front page instead of being buried in
 * Pulse rows.
 */
function CrossDimTile({ crossDim, onOpenFixQueue }: {
  crossDim: { total: number; reachable: number; openPR: number; autofix: number; pentestVerified: number }
  /** Open the right-side fix queue drawer with the matching filter. */
  onOpenFixQueue?: (filter: 'taint' | 'pr' | 'autofix' | 'pentest') => void
}) {
  const cells: Array<{ icon: React.ReactNode; label: string; count: number; tone: string; filter: 'taint' | 'pr' | 'autofix' | 'pentest' }> = [
    {
      icon: <Target size={16} />,
      label: t('dashboard.cdReachable'),
      count: crossDim.reachable,
      tone: '#ef4444',
      filter: 'taint',
    },
    {
      icon: <GitPullRequest size={16} />,
      label: t('dashboard.cdHasPR'),
      count: crossDim.openPR,
      tone: '#3b82f6',
      filter: 'pr',
    },
    {
      icon: <Wand2 size={16} />,
      label: t('dashboard.cdAutofix'),
      count: crossDim.autofix,
      tone: '#7c3aed',
      filter: 'autofix',
    },
    {
      icon: <ShieldAlert size={16} />,
      label: t('dashboard.cdPentest'),
      count: crossDim.pentestVerified,
      tone: '#f97316',
      filter: 'pentest',
    },
  ]

  return (
    <Paper elevation={1} className="rounded-xl" sx={{
      bgcolor: 'background.paper',
      // Flex column with stretch so the 4-tile grid expands to fill
      // whatever vertical space the JellyCard parent grants. Matches
      // the left gauge card's height when the parent column stretches.
      height: '100%', display: 'flex', flexDirection: 'column',
    }}>
      <Box sx={{ px: 3, pt: 2.5, pb: 2, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Box className="flex items-center justify-between mb-1">
          <Box className="flex items-center gap-2">
            <Crown size={16} style={{ color: '#7c3aed' }} />
            <Typography variant="caption" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 13 }} color="text.secondary">
              {t('dashboard.crossDim')}
            </Typography>
          </Box>
          <Tooltip title={t('dashboard.crossDimTip')}>
            <Typography variant="caption" color="text.secondary" sx={{ cursor: 'help', fontSize: 12 }}>
              {t('dashboard.cdBaseCount').replace('{n}', String(crossDim.total))}
            </Typography>
          </Tooltip>
        </Box>
        {/* Stretch the 4-tile grid to fill remaining card height —
            each cell expands evenly so the card bottom aligns with
            the left gauge card's bottom. */}
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
          gridAutoRows: '1fr',
          gap: { xs: 1.5, md: 2 },
          mt: 1.5,
          flex: 1,
        }}>
          {cells.map((cell) => (
            <CrossDimCell
              key={cell.label}
              icon={cell.icon}
              label={cell.label}
              count={cell.count}
              base={crossDim.total}
              tone={cell.tone}
              onClick={cell.count > 0 ? () => onOpenFixQueue?.(cell.filter) : undefined}
            />
          ))}
        </Box>
      </Box>
    </Paper>
  )
}

function CrossDimCell({ icon, label, count, base, tone, onClick }: {
  icon: React.ReactNode
  label: string
  count: number
  base: number
  tone: string
  onClick?: () => void
}) {
  const pct = base > 0 ? Math.round((count / base) * 100) : 0
  const interactive = !!onClick
  return (
    <Box
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      sx={{
        position: 'relative',
        // Use flex-column + justify-content space-between so the
        // label row (which may wrap to 2 lines on narrow columns)
        // pins to the top and the big number pins to the bottom.
        // Result: all four cells line up at the same baseline
        // regardless of label width.
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        minHeight: 92,
        gap: 1,
        border: '1px solid',
        borderColor: count > 0 ? `${tone}40` : 'divider',
        borderRadius: 1.5,
        px: 1.5, py: 1.25,
        minWidth: 0,
        bgcolor: count > 0 ? `${tone}0d` : 'transparent',
        cursor: interactive ? 'pointer' : 'default',
        transition: 'background-color 0.12s, border-color 0.12s',
        ...(interactive && {
          '&:hover': {
            bgcolor: `${tone}1a`,
            borderColor: `${tone}80`,
          },
        }),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, minHeight: 36, minWidth: 0 }}>
        <Box sx={{ color: count > 0 ? tone : 'text.secondary', display: 'flex', flexShrink: 0, mt: 0.125 }}>{icon}</Box>
        <Typography variant="caption" sx={{
          fontSize: 12, fontWeight: 600, color: 'text.secondary',
          lineHeight: 1.3, minWidth: 0,
        }}>
          {label}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
        <Typography sx={{ fontSize: 28, fontWeight: 700, lineHeight: 1, color: count > 0 ? tone : 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
          {count}
        </Typography>
        {base > 0 && (
          <Typography sx={{ fontSize: 13, color: 'text.secondary', fontWeight: 500 }}>
            / {base} ({pct}%)
          </Typography>
        )}
      </Box>
    </Box>
  )
}

/**
 * ExternalThreatStrip — "outside my walls" snapshot.
 *
 * The CISO-grade row: phishing infra, dark-web leaks, supply
 * chain risk, KEV listings, crown-jewel exposure. Each tile
 * deep-links into the relevant view.
 */
function ExternalThreatStrip({
  kev, threatActor, crownJewel, supplyCriticalVendors, leakCount, compact, onNavigate,
}: {
  kev: number
  threatActor: number
  crownJewel: number
  supplyCriticalVendors: number
  leakCount: number
  /** `compact` = stacked 2-col layout inside a narrow bento column.
   *  Default false = wide horizontal strip across the page. */
  compact?: boolean
  onNavigate?: (section: string) => void
}) {
  const tiles = [
    { icon: <Skull size={16} />, label: t('dashboard.tKEV'), count: kev, tone: '#ef4444', target: '_ctem' },
    { icon: <AlertTriangle size={16} />, label: t('dashboard.tActor'), count: threatActor, tone: '#ef4444', target: '_ctem' },
    { icon: <Crown size={16} />, label: t('dashboard.tCrown'), count: crownJewel, tone: '#f97316', target: '_ctem' },
    { icon: <Package size={16} />, label: t('dashboard.tSupply'), count: supplyCriticalVendors, tone: '#f97316', target: 'exp-vendors' },
    { icon: <Lock size={16} />, label: t('dashboard.tLeak'), count: leakCount, tone: '#dc2626', target: 'exp-posture' },
  ]
  // Render only tiles that have data; an all-zero strip would just
  // be noise. If everything is zero we hide the whole row.
  const visible = tiles.filter(t => t.count > 0)
  if (visible.length === 0) return null
  // Compact (narrow column inside bento): use a column count that
  // matches `visible.length` up to 2 — so a single visible tile
  // fills the column width instead of sitting in a half-empty 2-col
  // grid (the original 2026-05-20 layout had the lone Supply-chain
  // tile floating on the left with the right half blank).
  // Wide (full-row strip): scales with visible count up to 6.
  const cols = compact
    ? (visible.length === 1 ? '1fr' : 'repeat(2, 1fr)')
    : `repeat(${Math.min(visible.length, 6)}, 1fr)`
  return (
    <Paper elevation={1} className="rounded-xl" sx={{ bgcolor: 'background.paper' }}>
      <Box sx={{ px: 3, pt: 2.5, pb: 2 }}>
        <Box className="flex items-center gap-2 mb-2">
          <Globe2 size={16} style={{ opacity: 0.6 }} />
          <Typography variant="caption" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 13 }} color="text.secondary">
            {t('dashboard.externalThreats')}
          </Typography>
        </Box>
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: cols, md: cols },
          gap: { xs: 1.5, md: 2 },
        }}>
          {visible.map((tile) => (
            <ExternalThreatTile
              key={tile.label}
              icon={tile.icon}
              label={tile.label}
              count={tile.count}
              tone={tile.tone}
              onClick={() => onNavigate?.(tile.target)}
            />
          ))}
        </Box>
      </Box>
    </Paper>
  )
}

function ExternalThreatTile({ icon, label, count, tone, onClick }: {
  icon: React.ReactNode; label: string; count: number; tone: string; onClick?: () => void
}) {
  return (
    <Box
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      sx={{
        // Same flex-column + space-between treatment as CrossDimCell
        // so label wrap doesn't push numbers out of alignment.
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        minHeight: 84, gap: 1,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1.5,
        px: 1.5, py: 1.25,
        minWidth: 0,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background-color 0.12s, border-color 0.12s',
        '&:hover': onClick ? {
          bgcolor: `${tone}1a`,
          borderColor: `${tone}80`,
        } : undefined,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, minHeight: 32, minWidth: 0 }}>
        <Box sx={{ color: tone, display: 'flex', flexShrink: 0, mt: 0.125 }}>{icon}</Box>
        <Typography variant="caption" sx={{
          fontSize: 12, fontWeight: 600, color: 'text.secondary',
          lineHeight: 1.3, minWidth: 0,
        }}>
          {label}
        </Typography>
      </Box>
      <Typography sx={{ fontSize: 22, fontWeight: 700, color: tone, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {count}
      </Typography>
    </Box>
  )
}
