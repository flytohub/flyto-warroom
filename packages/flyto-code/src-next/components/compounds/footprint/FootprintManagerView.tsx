/**
 * FootprintManagerView — manager-mode EASM surface.
 *
 * Narrative + KPI + chart view of the external attack surface, every
 * number sourced from a REAL engine endpoint:
 *   - new-exposure delta KPI + exposure trend  ← /footprint/timeseries
 *   - 4-tier verdict donut                      ← /footprint/actionable (any)
 *   - brand-impersonation bar                   ← /footprint/surface?pool=noise
 *   - candidate-chain risk bubble               ← /footprint/candidate-paths
 *   - attacker narrative                        ← /footprint/narrative
 *   - posture headline                          ← /posture-headline
 *
 * Client functions imported by DIRECT FILE PATH per decoupling rule.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import { alpha } from '@mui/material/styles'
import { FileText, Radar, GitBranch, Network, Shield, TrendingUp, TrendingDown } from 'lucide-react'

import {
  ManagerDashboard,
  ManagerHero,
  HeroStat,
  ChartCard,
  KpiCard,
  TrendChart,
  DonutChart,
  StackedBarChart,
  BubbleChart,
  type DonutDatum,
} from '@compounds/_shared'
import { type Severity } from '@lib/tokens/severity'
import { t, tOr } from '@lib/i18n';
import { colors } from '@/styles/designTokens'

import {
  getFootprintTimeseries,
  getFootprintActionable,
  getFootprintNarrative,
  getPostureHeadline,
} from '@lib/engine/code/footprintGraph'
import {
  getFootprintSurface,
  getBOYAttackPathCandidates,
  getBOYBreakthroughPaths,
  getCandidatePaths,
  researchFootprintCandidateSelector,
  researchFootprintPathSelector,
  researchFootprintSubjectSelector,
  type ResearchFootprintSelector,
} from '@lib/engine/code/footprintSurface'
import { qk } from '@lib/queryKeys'
import { ResearchFootprintDrawer } from './ResearchFootprintDrawer'
import { DataBoundary } from '@atoms/DataBoundary'

interface Props {
  orgId: string
}

// Map an actionability tier → a 4-tier verdict label + severity tone.
const TIER_META: Record<string, { label: string; labelKey: string; severity: Severity }> = {
  red_team_actionable: { label: 'Red-team actionable', labelKey: 'footprint.tier.redTeamActionable', severity: 'critical' },
  needs_more_evidence: { label: 'Needs evidence', labelKey: 'footprint.tier.needsEvidence', severity: 'high' },
  informational: { label: 'Informational', labelKey: 'footprint.tier.informational', severity: 'medium' },
  rejected: { label: 'Rejected', labelKey: 'footprint.tier.rejected', severity: 'low' },
}

function dayKey(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

export function FootprintManagerView({ orgId }: Props) {
  const [researchSelector, setResearchSelector] = useState<ResearchFootprintSelector | null>(null)
  const tsQ = useQuery({
    queryKey: qk.footprint.timeseries(orgId),
    queryFn: () => getFootprintTimeseries(orgId),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const actQ = useQuery({
    queryKey: qk.footprint.actionable(orgId, 'any', 200),
    queryFn: () => getFootprintActionable(orgId, 'any', 200),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const noiseQ = useQuery({
    queryKey: qk.footprint.surface(orgId, 'noise'),
    queryFn: () => getFootprintSurface(orgId, 'noise'),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const pathsQ = useQuery({
    queryKey: qk.footprint.candidatePaths(orgId, 50),
    queryFn: () => getCandidatePaths(orgId, 50),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const boyQ = useQuery({
    queryKey: qk.footprint.breakthroughCandidates(orgId, 50),
    queryFn: () => getBOYAttackPathCandidates(orgId, 50),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const breakthroughPathsQ = useQuery({
    queryKey: qk.footprint.breakthroughPaths(orgId, 50),
    queryFn: () => getBOYBreakthroughPaths(orgId, 50),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const narrQ = useQuery({
    queryKey: qk.footprint.narrative(orgId),
    queryFn: () => getFootprintNarrative(orgId),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
    retry: false,
  })
  const postureQ = useQuery({
    queryKey: qk.footprint.postureHeadline(orgId),
    queryFn: () => getPostureHeadline(orgId),
    enabled: !!orgId,
    staleTime: 60_000,
    retry: false,
  })

  // ── New-exposure delta + exposure trend (newly_exposed signals binned per day)
  const exposure = useMemo(() => {
    const signals = (tsQ.data?.signals ?? []).filter((s) => s.signal === 'newly_exposed')
    const byDay = new Map<string, number>()
    for (const s of signals) {
      const k = dayKey(s.first_seen_at)
      if (!k) continue
      byDay.set(k, (byDay.get(k) ?? 0) + 1)
    }
    const days = [...byDay.keys()].sort()
    const categories = days.map((d) => d.slice(5)) // MM-DD
    const values = days.map((d) => byDay.get(d) ?? 0)
    const last = values.length ? values[values.length - 1] : 0
    const prev = values.length > 1 ? values[values.length - 2] : null
    return { categories, values, last, prev, total: signals.length }
  }, [tsQ.data])

  // ── 4-tier verdict donut
  const verdictDonut: DonutDatum[] = useMemo(() => {
    const findings = actQ.data?.findings ?? []
    const counts = new Map<string, number>()
    for (const f of findings) counts.set(f.tier, (counts.get(f.tier) ?? 0) + 1)
    return Object.entries(TIER_META)
      .map(([tier, meta]) => ({
        label: tOr(meta.labelKey, meta.label),
        value: counts.get(tier) ?? 0,
        severity: meta.severity,
      }))
      .filter((d) => d.value > 0)
  }, [actQ.data])

  // ── Brand-impersonation bar (noise/look-alike apexes grouped by type)
  const brandBar = useMemo(() => {
    const items = noiseQ.data?.items ?? []
    const byType = new Map<string, number>()
    for (const it of items) byType.set(it.Type, (byType.get(it.Type) ?? 0) + 1)
    const entries = [...byType.entries()].sort((a, b) => b[1] - a[1])
    return {
      categories: entries.map((e) => e[0]),
      values: entries.map((e) => e[1]),
      total: items.length,
    }
  }, [noiseQ.data])

  // ── Candidate-chain risk bubble: x=hops, y=score, z=distinct sources
  const bubble = useMemo(() => {
    const paths = pathsQ.data?.paths ?? []
    const bucket: Record<Severity, { x: number; y: number; z: number }[]> = {
      critical: [], high: [], medium: [], low: [], '': [],
    }
    for (const p of paths) {
      const sev: Severity = p.score >= 75 ? 'critical' : p.score >= 50 ? 'high' : p.score >= 25 ? 'medium' : 'low'
      bucket[sev].push({ x: p.hops, y: p.score, z: Math.max(1, p.distinctSources) })
    }
    return (Object.keys(bucket) as Severity[])
      .filter((s) => bucket[s].length > 0)
      .map((s) => ({ name: s || 'other', data: bucket[s], severity: s }))
  }, [pathsQ.data])

  const actionableCount = useMemo(
    () => (actQ.data?.findings ?? []).filter((f) => f.tier === 'red_team_actionable').length,
    [actQ.data],
  )

  // ── Hero focal datum: the most-reachable candidate attack chain.
  // Highest path-score wins; fewest hops breaks ties (a shorter chain at
  // the same score is more reachable). Pure derivation from data already
  // fetched for the bubble chart — no new query.
  const topPath = useMemo(() => {
    const paths = pathsQ.data?.paths ?? []
    if (paths.length === 0) return null
    return [...paths].sort((a, b) => (b.score - a.score) || (a.hops - b.hops))[0]
  }, [pathsQ.data])
  const topBreakthrough = useMemo(() => {
    const candidates = boyQ.data?.candidates ?? []
    if (candidates.length === 0) return null
    return [...candidates].sort((a, b) => (b.priority_score - a.priority_score) || (b.updated_at || '').localeCompare(a.updated_at || ''))[0]
  }, [boyQ.data])
  const topBreakthroughPath = useMemo(() => {
    const paths = breakthroughPathsQ.data?.paths ?? []
    if (paths.length === 0) return null
    return [...paths].sort((a, b) => (b.priority_score - a.priority_score) || (b.updated_at || '').localeCompare(a.updated_at || ''))[0]
  }, [breakthroughPathsQ.data])
  const validatedBreakthroughs = useMemo(
    () => (breakthroughPathsQ.data?.paths ?? []).filter(c => c.state === 'validated').length || (boyQ.data?.candidates ?? []).filter(c => c.state === 'validated').length,
    [boyQ.data, breakthroughPathsQ.data],
  )
  const blockedBreakthroughs = useMemo(
    () => (breakthroughPathsQ.data?.paths ?? []).filter(p => p.missing_evidence > 0 || p.state === 'needs_validation').length,
    [breakthroughPathsQ.data],
  )
  const acceptedRiskBreakthroughs = useMemo(
    () => (breakthroughPathsQ.data?.paths ?? []).filter(p => p.state === 'accepted_risk').length || (boyQ.data?.candidates ?? []).filter(c => c.state === 'accepted_risk').length,
    [boyQ.data, breakthroughPathsQ.data],
  )
  const topResearchSelector = useMemo<ResearchFootprintSelector | null>(() => {
    if (topBreakthroughPath) return researchFootprintPathSelector(topBreakthroughPath)
    if (topBreakthrough) return researchFootprintCandidateSelector(topBreakthrough)
    if (topPath) return researchFootprintSubjectSelector(topPath.type, topPath.value)
    return null
  }, [topBreakthrough, topBreakthroughPath, topPath])

  const loading = tsQ.isLoading || actQ.isLoading
  const primaryError = tsQ.error ?? actQ.error
  const partialError = noiseQ.error ?? pathsQ.error ?? boyQ.error ?? breakthroughPathsQ.error ?? narrQ.error ?? postureQ.error

  const ACCENT = colors.section.exposure

  if ((loading || primaryError) && !tsQ.data && !actQ.data) {
    return (
      <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', p: 3 }}>
        <DataBoundary
          isLoading={loading}
          isError={!!primaryError}
          error={primaryError}
          hasData={false}
          label="attack surface"
          loadingVariant="spinner"
        >
          <span />
        </DataBoundary>
      </Box>
    )
  }

  return (
    <>
    {partialError && (
      <Box sx={{ px: 2, pt: 2 }}>
        <Alert severity="warning" variant="outlined">
          {t('footprint.managerView.partialRefreshFailed')}
        </Alert>
      </Box>
    )}
    <ManagerDashboard
      title={t('footprint.managerView.title')}
      subtitle={t('footprint.managerView.subtitle')}
      accent={ACCENT}
      titleIcon={<Radar size={20} />}
      layout="full-bleed"
      hero={
        <ManagerHero
          accent={ACCENT}
          icon={<Network size={15} />}
          minHeight={200}
          visual={
            bubble.length > 0 ? (
              <Box sx={{ width: { xs: '100%', md: 360 } }}>
                <BubbleChart
                  height={188}
                  series={bubble}
                  xTitle="Hops"
                  yTitle="Path score"
                  yMax={100}
                />
              </Box>
            ) : undefined
          }
          headline={{
            label: t('footprint.managerView.topBreakthrough'),
            value: topBreakthroughPath ? Math.round(topBreakthroughPath.priority_score) : topBreakthrough ? Math.round(topBreakthrough.priority_score) : topPath ? Math.round(topPath.score) : '—',
            unit: topBreakthroughPath || topBreakthrough || topPath ? '/ 100' : undefined,
            sub: topBreakthroughPath
              ? `${topBreakthroughPath.subject_value} · ${topBreakthroughPath.state.replace(/_/g, ' ')} · ${topBreakthroughPath.missing_evidence} missing evidence`
              : topBreakthrough
              ? `${topBreakthrough.subject_value} · ${topBreakthrough.state.replace(/_/g, ' ')} · ${topBreakthrough.recommended_verifier.replace(/_/g, ' ')}`
              : topPath
                ? `${topPath.value} · ${topPath.hops} ${topPath.hops === 1 ? 'hop' : 'hops'} · ${topPath.distinctSources} ${topPath.distinctSources === 1 ? 'source' : 'sources'}`
              : 'No candidate attack chains yet — run a footprint expansion to map reachable paths.',
            delta: exposure.prev != null && exposure.last !== exposure.prev ? (
              <Chip
                size="small"
                icon={exposure.last > exposure.prev ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                label={`${exposure.last > exposure.prev ? '+' : ''}${exposure.last - exposure.prev} new exp.`}
                sx={{
                  fontWeight: 700, fontSize: 12,
                  // More new exposures = worse, so up is danger here.
                  bgcolor: alpha(exposure.last > exposure.prev ? colors.semantic.danger : colors.semantic.success, 0.14),
                  color: exposure.last > exposure.prev ? colors.semantic.danger : colors.semantic.success,
                  '& .MuiChip-icon': { color: 'inherit' },
                }}
              />
            ) : undefined,
          }}
          aside={
            <Box>
              <HeroStat
                icon={<GitBranch size={14} />}
                tone={ACCENT}
                label={t('footprint.managerView.breakthroughs')}
                value={breakthroughPathsQ.data ? (breakthroughPathsQ.data.paths?.length ?? 0) : boyQ.data ? (boyQ.data.candidates?.length ?? 0) : '—'}
              />
              <HeroStat
                icon={<Network size={14} />}
                tone={ACCENT}
                label={t('footprint.managerView.validated')}
                value={boyQ.data ? validatedBreakthroughs : '—'}
              />
              <HeroStat
                icon={<FileText size={14} />}
                tone={ACCENT}
                label={t('footprint.managerView.validationBlocked')}
                value={breakthroughPathsQ.data ? blockedBreakthroughs : '—'}
              />
              <HeroStat
                icon={<Shield size={14} />}
                tone={ACCENT}
                label={t('footprint.managerView.acceptedRisk')}
                value={breakthroughPathsQ.data || boyQ.data ? acceptedRiskBreakthroughs : '—'}
              />
              <HeroStat
                icon={<Radar size={14} />}
                tone={ACCENT}
                label={t('footprint.tier.redTeamActionable')}
                value={actQ.data ? actionableCount : '—'}
              />
            </Box>
          }
        />
      }
      kpis={
        <>
          <KpiCard
            label={t('footprint.managerView.newExposuresLatest')}
            value={exposure.values.length ? exposure.last : null}
            previous={exposure.prev}
            invertDelta
            sparkline={exposure.values.length > 1 ? exposure.values : undefined}
            loading={tsQ.isLoading}
            empty={!tsQ.isLoading && exposure.total === 0}
            emptyHint={t('footprint.managerView.empty.newlyExposedSignals')}
          />
          <KpiCard
            label={t('footprint.tier.redTeamActionable')}
            value={actQ.data ? actionableCount : null}
            invertDelta
            loading={actQ.isLoading}
          />
          <KpiCard
            label={t('footprint.managerView.lookalikeLossPosts')}
            value={noiseQ.data ? brandBar.total : null}
            invertDelta
            loading={noiseQ.isLoading}
          />
          <KpiCard
            label={t('footprint.managerView.healthyRatio')}
            value={postureQ.data ? Math.round((postureQ.data.health_ratio ?? 0) * 100) : null}
            unit="%"
            loading={postureQ.isLoading}
            empty={!postureQ.isLoading && !postureQ.data}
            emptyHint={t('footprint.managerView.empty.postureData')}
          />
        </>
      }
      charts={
        <>
          <ChartCard title={t('footprint.managerView.exposureTrend')}>
            {exposure.values.length > 1 ? (
              <TrendChart
                height={240}
                categories={exposure.categories}
                series={[{ name: t('footprint.managerView.series.newExposures'), data: exposure.values, severity: 'high' }]}
              />
            ) : (
              <EmptyChart text={t('footprint.managerView.empty.exposureHistory')} />
            )}
          </ChartCard>

          <ChartCard title={t('footprint.managerView.ownershipVerdicts')}>
            {verdictDonut.length > 0 ? (
              <DonutChart data={verdictDonut} height={240} totalLabel={t('footprint.managerView.leads')} />
            ) : (
              <EmptyChart text={t('footprint.managerView.empty.classifiedLeads')} />
            )}
          </ChartCard>

          <ChartCard title={t('footprint.managerView.brandImpersonation')}>
            {brandBar.values.length > 0 ? (
              <StackedBarChart
                height={240}
                horizontal
                categories={brandBar.categories}
                series={[{ name: t('footprint.managerView.series.lookalikes'), data: brandBar.values, severity: 'high' }]}
              />
            ) : (
              <EmptyChart text={t('footprint.managerView.empty.lookalikeHosts')} />
            )}
          </ChartCard>

        </>
      }
      narrative={
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
            {t('footprint.managerView.attackerNarrative')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
            {narrQ.isLoading
              ? t('footprint.managerView.generatingNarrative')
              : narrQ.data?.narrative
                ? narrQ.data.narrative
                : loading
                  ? t('footprint.managerView.loadingSurfaceData')
                  : t('footprint.managerView.narrativeEmpty')}
          </Typography>
          {topResearchSelector && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<FileText size={15} />}
              sx={{ mt: 1.5 }}
              onClick={() => setResearchSelector(topResearchSelector)}
            >
              {t('footprint.managerView.openResearchFootprint')}
            </Button>
          )}
        </Box>
      }
    />
    <ResearchFootprintDrawer
      orgId={orgId}
      open={!!researchSelector}
      selector={researchSelector}
      onClose={() => setResearchSelector(null)}
    />
    </>
  )
}

function EmptyChart({ text }: { text: string }) {
  return (
    <Box sx={{ height: 240, display: 'grid', placeItems: 'center' }}>
      <Typography variant="body2" color="text.secondary">
        {text}
      </Typography>
    </Box>
  )
}
