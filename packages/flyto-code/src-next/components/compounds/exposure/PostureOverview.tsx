import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, AlertTitle, Chip, Box, Tooltip, ButtonBase, Button } from '@mui/material'
import {
  Globe2, Clock, Network, Shield, Radio, Package,
  TrendingUp, TrendingDown, AlertTriangle, Flame, Crown, Info,
} from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { t, tOr } from '@lib/i18n';
import {
  listAttackSurface, getCTEMPriorities, listAttackPaths,
  getLeakExposure,
  getPostureSnapshots, getDiscoveryRuns, getVerifierSourceHealth,
  getPeerBaseline,
} from '@lib/engine'
import { PostureSnapshotChart } from '@atoms/PostureSnapshotChart'
import { DiscoveryRunsPanel } from '@atoms/DiscoveryRunsPanel'
import { ShodanEnrichmentPanel } from '@atoms/ShodanEnrichmentPanel'
import { VerifierHealthBadge } from '@atoms/VerifierHealthBadge'
import { BUFilterDropdown } from '@atoms/BUFilterDropdown'
import { TabBar } from '@atoms/TabBar'
import { GradeCircle } from '@compounds/_shared/GradeCircle'
import { displayScore, GRADE_COLORS } from '@compounds/_shared/scoring'
import { RAW, SEVERITY_TONE } from '@lib/tokens/severity'
import { Loading, Empty } from '../scanning/_shared'
import { getExternalPosture, getExternalPostureKernel, extractHostFromAssetValue } from './shared'
import type { ExternalPostureWithKpi } from '@lib/engine/code/posture'
import { subdomainStats, peerPercentileBand } from './externalModel'
import { qk } from '@lib/queryKeys'
import { navigateToCTEMActions, navigateToSection } from '@lib/warroomNav'
import { colors, softBg } from '@/styles/designTokens'
import { SupplyChainView } from './SupplyChainView'
import { ActivityFeed } from '@atoms/ActivityFeed'
import { listMonitoringEvents } from '@lib/engine'
import { JellyCard } from '@atoms/JellyCard'
import { DomainDetailPanel } from './posture/DomainDetailPanel'
import { QuickLinkChip } from './posture/QuickLinkChip'
import { DarkWebTab } from './posture/DarkWebTab'
import { MiniTrendChart } from './posture/MiniTrendChart'

// Audit 2026-05-17 v3: ThreatIntel + Monitoring filler tabs
// consolidated into a single Activity feed. Reduces tab churn from
// 5 → 4 and gives the operator one chronological timeline of every
// signal instead of two half-empty panels.
type PostureTab = 'overview' | 'activity' | 'supply' | 'darkweb'

export function PostureOverview() {
  const { org } = useOrg()
  const orgId = org?.id
  const [tab, setTab] = useState<PostureTab>('overview')
  // BU filter — empty string = whole-org view (default). When
  // the org has zero BUs declared, BUFilterDropdown hides itself
  // so this state stays at '' indefinitely with no visible
  // picker. Drives the priority list backend query + a
  // client-side filter on attack-surface for the KPI tiles.
  const [buFilter, setBUFilter] = useState<string>('')
  // Selected domain for the right-column "資訊詳細" panel. Null =
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

  // Kernel-backed posture — score/grade truth for the Domain Status
  // table. Legacy `/external-posture` stays primary for trend /
  // sla_violations / risk_summary / supply_chain — kernel hasn't
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
  // Posture snapshots — 90 days for the trend chart. Worker writes
  // one per day, so initial load on a fresh org returns []; chart
  // gracefully shows the "trend builds over time" empty state.
  const snapshotsQ = useQuery({
    queryKey: qk.exposure.postureSnapshots(orgId),
    queryFn: () => getPostureSnapshots(orgId!, 90),
    enabled: !!orgId,
    staleTime: 5 * 60_000, // snapshots only refresh once/day
  })
  const { data: snapshotsData } = snapshotsQ

  // Discovery runs — proof to the operator that proactive collection
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

  // Verifier source health — per-source PASS/FAIL/INCONCLUSIVE tally
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
    // through to the no-arg shape — identical request as before
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
  // Peer baseline — daily public-corpus percentiles from
  // peer_baseline_snapshots, rendered as the single hero "Top N%"
  // chip. The legacy `/org-benchmark` (industry_benchmarks) chip that
  // used to sit beside this was removed 2026-05-29 — two parallel
  // benchmark sources for the same hero slot was the un-integrated
  // duplication the operator flagged; this Phase A source is canonical.
  const orgSector = (org as { industrySector?: string } | undefined)?.industrySector?.toLowerCase()
  const { data: peerData } = useQuery({
    queryKey: qk.scoring.peerBaseline(orgId, orgSector),
    queryFn: () => getPeerBaseline(orgId!, orgSector!),
    enabled: !!orgId && !!orgSector,
    staleTime: 5 * 60_000,
  })
  // Dark-web exposure — only used by the new tab.
  const { data: leakData } = useQuery({
    queryKey: qk.exposure.leakExposure(orgId),
    queryFn: () => getLeakExposure(orgId!),
    enabled: !!orgId && tab === 'darkweb',
    staleTime: 60 * 60_000,
  })
  // P1-7 (Wave 1): the seven headline KPI tallies (KEV / Crown Jewel /
  // Threat Actor / Phishing / Stealer / Cert / SaaS) now come from the
  // server-computed `kpi_summary` block on `/external-posture` — no more
  // O(n) client tally over every attack_surface / priority row. The KPI
  // type lives in lib/engine/code/posture. `kpi_summary` is BU-scoped by
  // the same `?business_unit_id=` the posture query already passes via
  // the kernel; the legacy whole-org posture call does not echo a BU
  // scope, so we keep the asset-derived fallback ONLY for engine
  // revisions that predate kpi_summary (rollout window). HONESTY: when
  // kpi_summary is present we render its counts verbatim — including a
  // deliberate 0 for signals that aren't BU-attributable — and never
  // backfill from the client asset list.
  const kpi = (data as ExternalPostureWithKpi | undefined)?.kpi_summary
  const quickCounts = useMemo(() => {
    const items = ctemData?.items ?? []
    // BU filter — when active, client-side narrow attack_surface
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
      // ── Server-authoritative when kpi_summary is present ──
      // `?? client-tally` only fires on pre-kpi_summary engines;
      // a present-but-0 server count stays 0 (honesty: not backfilled).
      kev: kpi?.kev_count ?? items.filter(i => i.kev_listed).length,
      crownJewel: kpi?.crown_jewel_count ?? items.filter(i => i.asset_tier === 'crown_jewel').length,
      threatActor: kpi?.threat_actor_count ?? items.filter(i => !!i.threat_actor).length,
      // ── Phase A signals — server-sourced via kpi_summary ──
      phishing: kpi?.phishing_count ?? countByType('phishing_url'),     // PhishTank + OpenPhish hits
      stealerLogs: kpi?.stealer_count ?? countByType('stealer_log_hit'), // HIBP + Hudson Rock
      suspCerts: kpi?.certs_count ?? countByType('suspicious_cert'),     // CT-log phishing certs
      saasPosture: kpi?.saas_count ?? countByType('saas_posture'),       // GitHub org config drift
      // ── Not carried by kpi_summary — derived client-side ──
      paths: (pathsData?.paths ?? []).filter(p => p.status === 'open').length,
      brand: countByType('lookalike', 'brand_lookalike'),
      // Auth-verified DAST findings — different trust tier than passive.
      authVerified: items.filter(i => i.verification_method === 'authenticated_verified').length,
      activeVerified: items.filter(i => i.verification_method === 'active_verified').length,
    }
  }, [kpi, ctemData, pathsData, assetData, buFilter])

  // ── Cross-query error aggregation ──────────────────────────
  // 9 useQuery calls fan out from this page. A naïve render would
  // hide errors entirely (each tile silently falling back to empty
  // data) — operator never learns which dimension is broken and
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
  // external adapter (audit F2) — useMemo here only preserves the
  // referential identity so the hero doesn't re-render on unrelated
  // state changes.
  const assetStats = useMemo(() => subdomainStats(assetData?.assets), [assetData])

  return (
    <div className="exp-root" style={{ '--exp-accent': '#06b6d4', '--exp-accent-end': '#38bdf8' } as React.CSSProperties}>
      {/* BU filter — auto-hides when no BUs are declared.
          Compact right-aligned row; no redundant page title
          (already in the sidebar). */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', flexShrink: 0, minHeight: 32, alignItems: 'center' }}>
        <BUFilterDropdown orgId={orgId} value={buFilter} onChange={setBUFilter} />
      </Box>

      {/* Cross-query error banner — only renders when ≥1 query failed.
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
            {failedDimensions.map(d => d.name).join('、')}
          </Box>
          {'. '}
          {t('external.partialDataHint')}
        </Alert>
      )}

      {/* Tabs — fold the retired sidebar entries (Monitoring,
          Supply Chain, Threat Intel) in as views here. Overview
          is the default landing. Each KPI in Overview deep-links
          to CTEM Actions with the matching filter preset so the
          operator's path is hub → triage. */}
      <TabBar
        value={tab}
        onChange={(v) => setTab(v as PostureTab)}
        accentColor={colors.tech}
        noDivider
        sx={{
          minHeight: 36, mb: 1.5, mx: 0.5,
          '& .MuiTab-root': { minHeight: 36, px: 2, fontSize: 12 },
        }}
        items={[
          { value: 'overview', label: t('external.tabOverview'), icon: <Globe2 size={13} /> },
          { value: 'activity', label: t('external.tabActivity'), icon: <Radio size={13} /> },
          { value: 'supply', label: t('external.tabSupply'), icon: <Package size={13} /> },
          { value: 'darkweb', label: t('external.tabDarkWeb'), icon: <AlertTriangle size={13} /> },
        ]}
      />

      {/* Tabbed content — Overview keeps the existing hero/trend/
          domain table layout. Other tabs simply render the
          previously-standalone views (now folded in). */}
      {tab === 'activity' && (
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Unified activity feed — monitoring events + threat
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
        // A3-F1 (Codex review of 277b745, 2026-05-25). Same shape
        // as Dashboard sectorPosition: `score_available === false`
        // ⇒ avg_score / avg_grade are null/"" and feeding them to
        // displayScore / computeCorpusPercentile (pre-A3 path:
        // `?? 0`) silently rendered every external-only org with
        // no scoring data yet as "score 250, grade --, Below
        // median sector position" — every chip a fabricated
        // worst-tier signal.
        //
        // Gate the entire hero score block + percentile chips on
        // score availability. `undefined` is tolerated as truthy
        // (rollout window).
        const hasScore =
          data.score_available !== false && data.avg_score != null && data.avg_grade !== ''
        const gc = hasScore ? (GRADE_COLORS[data.avg_grade] ?? '#94a3b8') : '#94a3b8'
        const rs = data.risk_summary
        // Does the left charts/observability column have ANYTHING to
        // show? Mirrors the per-panel render guards below. When false
        // (e.g. a fresh org with no trend history yet) we drop the
        // column entirely so Domain Status fills the width instead of
        // leaving a tall empty rail that pushes content off-centre
        // (operator 2026-06-11: 重要內容被擠到下方).
        const hasLeftPanels =
          (data.score_trend?.length ?? 0) >= 2 ||
          (snapshotsData?.snapshots?.length ?? 0) > 0 ||
          (runsData?.runs?.length ?? 0) > 0 ||
          (assetData?.assets?.length ?? 0) > 0 ||
          (sourceHealthData?.sources?.length ?? 0) > 0
        // Action items intentionally NOT rendered here — the
        // CTEM Actions page (`exp-ctem`) is the single triage
        // surface (priority engine + closed-loop verify + filters).
        // The standalone Remediation page (`exp-actions`,
        // ActionPlanView) was retired 2026-05-17 as a duplicate.

        return (
          /* Independent-scroll layout (operator: 主體不同區塊滾動 2026-05-22).
             Pinned top region: Hero + Quick Links — these are small,
             summary-level info that should always be visible.
             Body: 2-column grid with each column owning its own scroll.
             Left = charts + observability panels (small-medium height
             each, stacked vertically). Right = Domain Status (a long
             list, gets its own scroll target). On narrow screens the
             grid collapses to single column so mobile still works.

             Previous layout had everything in one big column scroll,
             so the hero dominated the viewport and the domain table
             was either squeezed to ~150px or pushed below the fold. */
          <>
            {/* ═══ PINNED: Hero card (slim — operator 2026-05-22:
                "上面踏一排 有需要那麼大嗎?")
                Previous hero was a 280-300px gradient card with
                vertical stacks + a separate bottom bar. Slimmed to
                a single ~64px row: smaller grade circle, smaller
                score, severity counts inline as chips instead of
                100px-wide KpiPill tiles. Bottom bar (top risk +
                last scan + cadence) removed — last scan moved into
                a small chip on the same row, top risk gets clicked
                from the new master-detail right column. */}
            <JellyCard delay={0} noHover>
            <div className="exp-info" style={{
              flexDirection: 'column', gap: 0, padding: 0, overflow: 'hidden',
            }}>
              {/* Centered hero — score + grade is the page's anchor
                  (operator 2026-06-11: "重要內容應該在中央"). */}
              <Box sx={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 1.25, textAlign: 'center', padding: '18px 16px 14px',
              }}>
                {/* Grade + big Score */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {hasScore ? (
                    <>
                      <GradeCircle grade={data.avg_grade} color={gc} size={58} />
                      <div style={{ textAlign: 'left' }}>
                        <div style={{
                          fontSize: 46, fontWeight: 700, lineHeight: 1,
	                          letterSpacing: 0,
                          fontVariantNumeric: 'tabular-nums',
                          color: gc,
                        }}>
                          {displayScore(data.avg_score!)}
                        </div>
                        <div style={{
                          fontSize: 13, color: 'var(--color-text-tertiary)',
                          letterSpacing: '0.04em', fontWeight: 500,
                          marginTop: 4,
                        }}>
                          {data.domain_count} {t('external.domains')}
                          {assetStats.totalSubdomains > 0 && (
                            <> · {assetStats.resolvingSubdomains}/{assetStats.totalSubdomains} sub</>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    // A3 no-score affordance — NO fake grade / NO 250 floor.
                    <div>
                      <div style={{
                        fontSize: 16, fontWeight: 600, lineHeight: 1.3,
                        color: 'var(--mui-palette-text-secondary)',
                      }}>
                        {data.message ?? t('external.noScoreYet')}
                      </div>
                      <div style={{
                        fontSize: 12, color: 'var(--color-text-tertiary)',
                        letterSpacing: '0.04em', fontWeight: 500,
                        marginTop: 3,
                      }}>
                        {data.domain_count} {t('external.domains')}
                        {assetStats.totalSubdomains > 0 && (
                          <> · {assetStats.resolvingSubdomains}/{assetStats.totalSubdomains} sub</>
                        )}
                      </div>
                    </div>
                  )}
                  {hasScore && rs && rs.score_change_7d !== 0 && (
                    <Chip size="small"
                      icon={rs.score_change_7d > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                      label={`${rs.score_change_7d > 0 ? '+' : ''}${rs.score_change_7d} (7d)`}
                      sx={{ height: 22, fontSize: 12, color: rs.score_change_7d > 0 ? RAW.green500 : RAW.red500 }}
                    />
                  )}
                  {hasScore && peerData?.latest && peerPercentileBand(data.avg_score!, peerData.latest) && (() => {
                    const cp = peerPercentileBand(data.avg_score!, peerData.latest)!
                    const anySnapshot = Object.values(peerData.latest)[0]
                    return (
                      <Tooltip title={tOr('external.peerBenchmarkHint',
                        `Sector benchmark — n=${anySnapshot?.corpus_size ?? 0} public ${peerData.sector} domains, corpus ${anySnapshot?.corpus_version ?? 'v1'}. Updated daily.`)}>
                        <Chip
                          size="small"
                          icon={<TrendingUp size={11} />}
                          label={`${cp.label} · ${peerData.sector} (n=${anySnapshot?.corpus_size ?? 0})`}
                          sx={{
                            height: 22, fontSize: 12, fontWeight: 700,
                            bgcolor: softBg(cp.tone, 0.14),
                            color: cp.tone,
                            border: `1px solid ${softBg(cp.tone, 0.32)}`,
                            '& .MuiChip-icon': { color: cp.tone },
                          }}
                        />
                      </Tooltip>
                    )
                  })()}
                </div>

                {/* Severity counts — centered clickable deep-links. */}
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {([
                    { label: t('common.critical'), count: rs?.critical_count ?? 0, color: SEVERITY_TONE.critical.tone, sev: 'critical' as const },
                    { label: t('common.high'),     count: rs?.high_count ?? 0,     color: SEVERITY_TONE.high.tone,     sev: 'high' as const },
                    { label: t('common.medium'),   count: rs?.medium_count ?? 0,   color: SEVERITY_TONE.medium.tone,   sev: 'medium' as const },
                    { label: t('common.low'),      count: rs?.low_count ?? 0,      color: RAW.green500,                sev: 'low' as const },
                  ]).map(s => (
                    <Chip
                      key={s.label}
                      size="small"
                      onClick={() => navigateToCTEMActions({ severities: [s.sev] })}
                      label={
                        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.count > 0 ? s.color : 'var(--mui-palette-text-secondary)', alignSelf: 'center' }} />
                          <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{s.count}</span>
                          <span style={{ color: 'var(--mui-palette-text-secondary)' }}>{s.label}</span>
                        </span>
                      }
                      sx={{
                        height: 24, fontSize: 12, cursor: 'pointer',
                        bgcolor: 'transparent',
                        border: '1px solid var(--mui-palette-divider)',
                        '&:hover': { bgcolor: 'var(--mui-palette-action-hover)' },
                      }}
                    />
                  ))}
                  {/* SLA — same chip family, breached state goes red. */}
                  <Chip
                    size="small"
                    onClick={() => navigateToCTEMActions({ breachedOnly: true })}
                    label={
                      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: (rs?.sla_breaches ?? 0) > 0 ? RAW.red500 : 'var(--mui-palette-text-secondary)', alignSelf: 'center' }} />
                        <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{rs?.sla_breaches ?? 0}</span>
                        <span style={{ color: 'var(--mui-palette-text-secondary)' }}>SLA</span>
                      </span>
                    }
                    sx={{
                      height: 24, fontSize: 12, cursor: 'pointer',
                      bgcolor: 'transparent',
                      border: '1px solid var(--mui-palette-divider)',
                      '&:hover': { bgcolor: 'var(--mui-palette-action-hover)' },
                    }}
                  />
                </Box>

                {/* Last-scan chip — pulled inline from the old bottom
                    bar so we don't waste a second row on metadata. */}
                {data.last_scan_at && (
                  <Tooltip title={`${t('external.lastScan')}: ${new Date(data.last_scan_at).toLocaleString()} · ${data.scan_cadence}`}>
                    <Chip
                      size="small"
                      icon={<Clock size={11} />}
                      label={data.scan_cadence}
                      variant="outlined"
                      sx={{ height: 22, fontSize: 12 }}
                    />
                  </Tooltip>
                )}

                {/* ── HONESTY caveat — security can NEVER claim a perfect/
                    guaranteed score. A high score means "no issues were
                    found in the automated checks we ran", which is NOT
                    proof of security. Always shown so the number is never
                    read as a guarantee (operator 2026-06-11: "資安不能說
                    滿分,你怎麼能百分之百肯定"). */}
                <Box sx={{
                  display: 'flex', alignItems: 'flex-start', gap: 0.75,
                  mt: 0.5, px: 1.5, py: 0.75, borderRadius: 1, maxWidth: 680,
                  bgcolor: softBg(SEVERITY_TONE.medium.tone, 0.08),
                  border: `1px solid ${softBg(SEVERITY_TONE.medium.tone, 0.22)}`,
                }}>
                  <Info size={13} style={{ color: SEVERITY_TONE.medium.tone, flexShrink: 0, marginTop: 2 }} />
                  <Box sx={{ fontSize: 12, color: 'var(--mui-palette-text-secondary)', lineHeight: 1.45, textAlign: 'left' }}>
                    {t('external.scoreCaveat')}
                  </Box>
                </Box>
              </Box>
            </div>
            </JellyCard>

            {/* ═══ PINNED: Quick links chip row ═══
                Single-click jumps to workflow pages with relevant
                context. Counts come from the same posture data +
                a small attack-paths probe. flex-shrink:0 keeps it
                pinned above the scroll body. */}
            <Box sx={{
              flexShrink: 0,
              display: 'flex', flexWrap: 'wrap', gap: 1,
              padding: '4px 0',
            }}>
              <QuickLinkChip
                icon={<Flame size={13} />}
                label={t('external.quickKev')}
                count={quickCounts.kev}
                onClick={() => navigateToCTEMActions({ severities: ['critical'] })}
                tone={colors.severity.critical}
              />
              <QuickLinkChip
                icon={<Crown size={13} />}
                label={t('external.quickCrownJewel')}
                count={quickCounts.crownJewel}
                onClick={() => navigateToCTEMActions({ tiers: ['crown_jewel'] })}
                tone={colors.section.history}
              />
              <QuickLinkChip
                icon={<AlertTriangle size={13} />}
                label={t('external.quickThreatActor')}
                count={quickCounts.threatActor}
                onClick={() => navigateToCTEMActions({ hasThreatActor: true })}
                tone={colors.brandDeep}
              />
              <QuickLinkChip
                icon={<Network size={13} />}
                label={t('external.quickPaths')}
                count={quickCounts.paths}
                onClick={() => navigateToSection('exp-paths')}
                tone={colors.severity.high}
              />
              <QuickLinkChip
                icon={<Shield size={13} />}
                label={t('external.quickMitigations')}
                onClick={() => navigateToSection('exp-mitigations')}
                tone={colors.semantic.success}
              />
              <QuickLinkChip
                icon={<Globe2 size={13} />}
                label={t('external.quickBrand')}
                count={quickCounts.brand}
                onClick={() => navigateToSection('exp-brand')}
                tone={colors.brand}
              />
              {/* ── Phase A new categories — single click into the
                  relevant detail page. All deep-link via filter
                  state so the operator's mental model stays
                  "hub → triage". Zero-count chips render greyed
                  out so the dashboard reads as a complete map
                  of the threat surface, not a list of "things we
                  happened to find today". */}
              {quickCounts.phishing > 0 && (
                <QuickLinkChip
                  icon={<AlertTriangle size={13} />}
                  label={t('external.quickPhishing')}
                  count={quickCounts.phishing}
                  onClick={() => navigateToSection('exp-brand')}
                  tone={colors.severity.high}
                />
              )}
              {quickCounts.stealerLogs > 0 && (
                <QuickLinkChip
                  icon={<AlertTriangle size={13} />}
                  label={t('external.quickStealerLogs')}
                  count={quickCounts.stealerLogs}
                  onClick={() => navigateToCTEMActions({})}
                  tone={colors.severity.critical}
                />
              )}
              {quickCounts.suspCerts > 0 && (
                <QuickLinkChip
                  icon={<Shield size={13} />}
                  label={t('external.quickSuspCerts')}
                  count={quickCounts.suspCerts}
                  onClick={() => navigateToSection('exp-brand')}
                  tone={colors.severity.medium}
                />
              )}
              {quickCounts.saasPosture > 0 && (
                <QuickLinkChip
                  icon={<Shield size={13} />}
                  label={t('external.quickSaaSPosture')}
                  count={quickCounts.saasPosture}
                  onClick={() => navigateToCTEMActions({})}
                  tone={colors.severity.medium}
                />
              )}
              {quickCounts.authVerified > 0 && (
                <QuickLinkChip
                  icon={<Shield size={13} />}
                  label={t('external.quickAuthVerified')}
                  count={quickCounts.authVerified}
                  onClick={() => navigateToCTEMActions({})}
                  tone={colors.severity.critical}
                />
              )}
            </Box>

            {/* ═══ SCROLL BODY — 3-column independent-scroll region ═══
                Master-detail layout (operator 2026-05-22):
                  LEFT 30%   — Charts + observability (Trend / 90-day
                               Snapshot / Discovery / Shodan / Verifier).
                               Owns its own scroll.
                  MIDDLE 33% — Domain Status master list. Clickable rows
                               populate the right column.
                  RIGHT  37% — Selected-domain detail panel. Empty state
                               when nothing is selected.

                On narrow screens collapses to single column so mobile
                still works (detail panel falls below the master list). */}
            <Box sx={{
              flex: 1, minHeight: 0, overflow: 'hidden',
              display: 'grid',
              // 38/34/28 — operator 2026-05-22: "左側小區塊偏小".
              // Charts column needs the most space (Trend +
              // 90-day snapshot both scale with width); detail
              // panel only renders label+value rows so 28% is
              // generous. Middle stays mid-weight for the master
              // list which has 4 numeric columns + grade circle.
              gridTemplateColumns: {
                xs: '1fr',
                // With charts: 38/34/28. Without (empty rail dropped):
                // Domain Status becomes the wide main body + detail panel.
                md: hasLeftPanels
                  ? 'minmax(0, 38fr) minmax(0, 34fr) minmax(0, 28fr)'
                  : 'minmax(0, 62fr) minmax(0, 38fr)',
              },
              gap: 1.75,
            }}>
              {/* ─── LEFT COLUMN: charts + observability panels ─── */}
              {hasLeftPanels && (
              <Box sx={{
                minHeight: 0,
                overflowY: 'auto',
                display: 'flex', flexDirection: 'column', gap: 1.75,
                pr: 0.5,
              }}>

            {/* ═══ Row 2: Score Trend ═══ */}
            {(() => {
              const points = data.score_trend ?? []
              const violations = data.sla_violations ?? []
              if (points.length < 2) return null
              // HONESTY: MiniTrendChart paints its line/fill green whenever
              // the trend is flat-or-up. With no computed score (hasScore
              // false) those points have no scoring basis, so the chart
              // would render a fabricated green "improving" signal for an
              // org that has never been scored. Drop the trend entirely in
              // that state — the hero already shows the no-score affordance.
              if (!hasScore) return null
              return (
                <JellyCard delay={0.04}>
                <div className="exp-card" style={{ padding: 20 }}>
                  {/* Title row — wraps cleanly on narrow columns
                      (operator 2026-05-23: "超容易跑版"). The date
                      range moves to its own line below so the title +
                      chips never compete with it for width. */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <TrendingUp size={14} style={{ color: '#38bdf8' }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                      {t('external.scoreTrend')}
                    </span>
                    {/* HONESTY: a positive 30d delta is only a real
                        "improving" signal when the org actually has a
                        computed score. With no scored domains (hasScore
                        false) the trend has no scoring basis, so never
                        paint an uptrend green — render the delta neutral
                        so an empty org can't read as "getting better". */}
                    {hasScore && rs && rs.score_change_30d !== 0 && (
                      <Chip size="small"
                        label={`${rs.score_change_30d > 0 ? '+' : ''}${rs.score_change_30d} (30d)`}
                        variant="outlined"
                        sx={{ height: 18, fontSize: 12, color: rs.score_change_30d > 0 ? RAW.green500 : RAW.red500 }}
                      />
                    )}
                    {violations.length > 0 && (
                      <Chip size="small" label={`${violations.length} ${t('external.slaBreaches')}`}
                        sx={{
                          height: 18, fontSize: 12,
                          bgcolor: softBg(SEVERITY_TONE.critical.tone, 0.14),
                          color: SEVERITY_TONE.critical.tone,
                        }}
                      />
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 12, fontVariantNumeric: 'tabular-nums' }}>
                    {points[points.length - 1]?.date} — {points[0]?.date}
                  </div>
                  <MiniTrendChart points={points} />
                </div>
                </JellyCard>
              )
            })()}

            {/* ═══ Row 2.5: Posture Snapshot Trend (90 days) ═══
                Built from posture_snapshot rows the worker writes
                daily. Shows score + asset count + finding count on
                one shared X axis so the operator sees "are findings
                growing while score drops?" in one glance. Renders
                an empty-state hint when <2 datapoints; doesn't take
                up real estate when there's nothing yet. */}
            {(() => {
              const snapshots = snapshotsData?.snapshots ?? []
              if (snapshots.length === 0) return null
              return (
                <JellyCard delay={0.08}>
                <div className="exp-card" style={{ padding: 20 }}>
                  {/* Same fix as Score Trend — title row wraps,
                      hint goes underneath at 12px caption size. */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    flexWrap: 'wrap', marginBottom: 4,
                  }}>
                    <TrendingUp size={14} style={{ color: colors.tech }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                      {t('external.postureTrend90')}
                    </span>
                    <Chip
                      size="small"
                      label={`${snapshots.length} snapshots`}
                      variant="outlined"
                      sx={{ height: 18, fontSize: 12, color: 'var(--mui-palette-text-secondary, #94a3b8)' }}
                    />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 12 }}>
                    {t('external.postureTrendHint')}
                  </div>
                  <PostureSnapshotChart snapshots={snapshots} height={200} />
                </div>
                </JellyCard>
              )
            })()}

            {/* ═══ Row 2.6: Discovery Runs (proactive collection
                observability) — small panel showing the most recent
                CT log / Shodan sweeps. The operator's proof that the
                pipeline is alive without having to grep worker logs. */}
            {(() => {
              const runs = runsData?.runs ?? []
              if (runs.length === 0) return null
              return (
                <JellyCard delay={0.12}>
                <div className="exp-card" style={{ padding: 0 }}>
                  <DiscoveryRunsPanel runs={runs} />
                </div>
                </JellyCard>
              )
            })()}

            {/* ═══ Row 2.7: Shodan Enrichment — surfaces ports /
                CVEs / tags that the Shodan worker loop wrote into
                each asset's metadata.shodan. Without this, the
                Shodan data accrues silently and the operator never
                sees what we already know about their IPs. */}
            {(assetData?.assets ?? []).length > 0 && (
              <JellyCard delay={0.16}>
              <div className="exp-card" style={{ padding: 0 }}>
                <ShodanEnrichmentPanel assets={assetData?.assets ?? []} />
              </div>
              </JellyCard>
            )}

            {/* ═══ Row 2.8: Verifier source health — operator sees
                when a verification source has gone silent (e.g.
                crt.sh rate-limited, DoH endpoint blocked by network
                policy). Without this, a dead source degrades scoring
                accuracy silently for hours. */}
            {(sourceHealthData?.sources?.length ?? 0) > 0 && (
              // noHover — hover scale 1.015 nudged the card out of its
              // grid cell, causing the inner scroll table to "jump"
              // and visually overflow. This card is informational
              // (not clickable), so the lift adds nothing.
              // Operator 2026-05-23: "滑鼠移動上去 那個動畫 會造成跑版".
              <JellyCard delay={0.20} noHover>
              <div className="exp-card" style={{ padding: 0 }}>
                <VerifierHealthBadge rows={sourceHealthData?.sources ?? []} />
              </div>
              </JellyCard>
            )}

              </Box>
              )}
              {/* ─── /LEFT COLUMN ─── */}

              {/* ─── RIGHT COLUMN: Domain Status table (own scroll) ───
                  Single JellyCard fills the column. The card's inner
                  div already owns the row-list overflow:auto. */}
              <Box sx={{
                minHeight: 0, overflow: 'hidden',
                display: 'flex', flexDirection: 'column',
              }}>

            {/* ═══ Domain Status (right column) ═══ */}
            <JellyCard delay={0.24} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
            <div className="exp-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, flex: 1 }}>
              <div className="exp-col-head" style={{ gridTemplateColumns: '1fr 55px 55px 55px 28px' }}>
                <div>DOMAIN</div>
                <div style={{ textAlign: 'center' }}>ASSETS</div>
                <div style={{ textAlign: 'center' }}>ISSUES</div>
                <div style={{ textAlign: 'center' }}>SCORE</div>
                <div />
              </div>
              {/* Honesty gate (mirrors the hero block's `hasScore`): the engine
                  returns score=100/grade=A for a domain that has only been
                  enumerated but never security-scanned (no DNS/SSL/HTTP/port
                  check assets) — i.e. "no data" renders as a perfect 900/A. When
                  the org has no computed score yet, show "—" instead of a
                  misleading perfect score (inverse of the A3 no-fake-worst-tier
                  fix). */}
              <div style={{ flex: 1, overflow: 'auto', minHeight: 0, paddingRight: 6 }}>
                {data.domains.map(d => {
                  const isSelected = selectedDomain === d.domain
                  // Kernel-backed score/grade truth — same source as
                  // DomainsView. Lookup key normalised so a legacy
                  // posture row that happens to carry uppercase or a
                  // URL prefix still hits the kernel entry. Falls
                  // back to legacy row values when kernel hasn't
                  // projected this domain yet.
                  const kernel = kernelByDomain.get(extractHostFromAssetValue(d.domain))
                  const score = kernel?.score ?? d.score
                  const grade = kernel?.grade ?? d.grade
                  // Hide engine default (score=100 / grade=A / no issues) which
                  // is assigned to enumerated-but-never-scanned domains.
                  // A genuine 100/A would only appear on a domain that has been
                  // scanned AND has zero findings — render "—" for the ambiguous
                  // case (no issues + perfect score) so we never claim 900 for
                  // unscanned assets.
                  const isDefaultUnscanned = score === 100 && !d.issue_count
                  const domainScored = data.score_available !== false && !!grade && !isDefaultUnscanned
                  return (
                    <ButtonBase
                      key={d.domain}
                      onClick={() => setSelectedDomain(d.domain)}
                      sx={{ width: '100%', display: 'block', textAlign: 'left' }}
                    >
                      <div className="exp-row" style={{
                        gridTemplateColumns: '1fr 55px 55px 55px 28px',
                        padding: '14px 20px',
                        background: isSelected ? 'var(--mui-palette-action-selected)' : undefined,
                        cursor: 'pointer',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="exp-mono" style={{ fontWeight: 600 }}>{d.domain}</span>
                          <Chip label={d.environment || 'production'} size="small" sx={{ height: 16, fontSize: 12 }} />
                        </div>
                        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--color-text-secondary)' }}>{d.asset_count}</div>
                        <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: d.issue_count > 0 ? '#f97316' : (domainScored ? '#22c55e' : 'var(--mui-palette-text-disabled)') }}>
                          {d.issue_count > 0 ? d.issue_count : '—'}
                        </div>
                        <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: domainScored ? (GRADE_COLORS[grade] ?? '#94a3b8') : '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                          {domainScored ? displayScore(score) : '—'}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          {domainScored
                            ? <GradeCircle grade={grade} color={GRADE_COLORS[grade] ?? '#94a3b8'} size={22} />
                            : <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }} title={t('external.notScannedYet')}>—</span>}
                        </div>
                      </div>
                    </ButtonBase>
                  )
                })}
              </div>
            </div>
            </JellyCard>

              </Box>
              {/* ─── /MIDDLE COLUMN ─── */}

              {/* ─── RIGHT COLUMN: Selected-domain detail ───
                  Shows the row's metadata in a more verbose layout
                  + click-through actions. Empty state when nothing
                  selected so the column never reads as broken. */}
              <Box sx={{
                minHeight: 0, overflow: 'hidden',
                display: 'flex', flexDirection: 'column',
              }}>
                <DomainDetailPanel
                  domain={(() => {
                    if (!selectedDomain) return null
                    const legacy = data.domains.find(d => d.domain === selectedDomain)
                    if (!legacy) return null
                    const kernel = kernelByDomain.get(extractHostFromAssetValue(selectedDomain))
                    return {
                      ...legacy,
                      score: kernel?.score ?? legacy.score,
                      grade: kernel?.grade ?? legacy.grade,
                    }
                  })()}
                  onClear={() => setSelectedDomain(null)}
                  onViewFindings={() => navigateToCTEMActions({})}
                />
              </Box>
              {/* ─── /RIGHT COLUMN ─── */}
            </Box>
            {/* ═══ /SCROLL BODY ═══ */}
          </>
        )
      })()}
    </div>
  )
}
