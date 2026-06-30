/**
 * PostureManagerView — manager-mode surface for the Posture Overview
 * hub. Score hero + grade gauge, weight donut, percentile-vs-peer
 * band, a forecast-aware trend, and a category accordion summary —
 * every number sourced from a real engine endpoint:
 *
 *   getComputedScore         → hero score / grade / categories / weights
 *   getUnifiedScoreHistory   → 90-day score trend + previous score
 *   getOrgBenchmark          → sector percentile + p25/p50/p75/p90 band
 *   getScoreForecast         → 30-day projected score band
 *
 * Engineer view (the existing <PostureOverview/>) is preserved verbatim
 * by the page wrapper via <ModeView/>. This is purely additive.
 *
 * Client functions imported by DIRECT FILE PATH per the decoupling rule.
 */

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Accordion from '@mui/material/Accordion'
import AccordionSummary from '@mui/material/AccordionSummary'
import AccordionDetails from '@mui/material/AccordionDetails'
import LinearProgress from '@mui/material/LinearProgress'
import Chip from '@mui/material/Chip'
import { alpha, useTheme } from '@mui/material/styles'
import { ChevronDown, Gauge, TrendingUp, TrendingDown, Users, Layers } from 'lucide-react'

import {
  ManagerDashboard,
  ChartCard,
  KpiCard,
  GaugeChart,
  TrendChart,
  DonutChart,
  ManagerHero,
  HeroStat,
  gradeColor,
  type DonutDatum,
  type TrendSeries,
} from '@compounds/_shared'

import { useOrg } from '@hooks/useOrg'
import { t } from '@lib/i18n';
import { colors } from '@/styles/designTokens'
import { qk } from '@lib/queryKeys'
import {
  getComputedScore,
  getUnifiedScoreHistory,
  getOrgBenchmark,
} from '@lib/engine/scoring/scoring'
import { getScoreForecast } from '@lib/engine/ctem/upstreamData'
import { gradeTone, percentileNarrative } from './managerShared'

const EMPTY_CHART = (msg: string) => (
  <Box sx={{ height: 240, display: 'grid', placeItems: 'center' }}>
    <Typography variant="body2" color="text.secondary">{msg}</Typography>
  </Box>
)

export function PostureManagerView() {
  const { org } = useOrg()
  const orgId = org?.id
  const theme = useTheme()
  const [expanded, setExpanded] = useState<string | false>(false)

  const scoreQ = useQuery({
    queryKey: qk.computedScore(orgId),
    queryFn: () => getComputedScore(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const histQ = useQuery({
    queryKey: qk.scoring.scoreHistory(orgId, 90),
    queryFn: () => getUnifiedScoreHistory(orgId!, 90),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const benchQ = useQuery({
    queryKey: qk.scoring.benchmark(orgId),
    queryFn: () => getOrgBenchmark(orgId!),
    enabled: !!orgId,
    staleTime: 120_000,
  })
  const forecastQ = useQuery({
    queryKey: qk.scoring.scoreForecast(orgId),
    queryFn: () => getScoreForecast(orgId!, 30),
    enabled: !!orgId,
    staleTime: 120_000,
  })

  const score = scoreQ.data
  const hasScore =
    !!score && score.score_available !== false && score.overall_display != null
  const bench = benchQ.data
  const hasBench =
    !!bench && bench.score_available !== false && bench.percentile != null && !!bench.benchmark

  // Trend (oldest → newest) + forecast continuation.
  const trend = useMemo(() => {
    const entries = [...(histQ.data?.entries ?? [])].sort(
      (a, b) => new Date(a.computedAt).getTime() - new Date(b.computedAt).getTime(),
    )
    return {
      categories: entries.map((e) => new Date(e.computedAt).toLocaleDateString()),
      values: entries.map((e) => Math.round(e.overallDisplay)),
    }
  }, [histQ.data])

  const prevScore = useMemo(() => {
    const e = histQ.data?.entries
    if (!e || e.length < 2) return null
    const sorted = [...e].sort(
      (a, b) => new Date(b.computedAt).getTime() - new Date(a.computedAt).getTime(),
    )
    return Math.round(sorted[1].overallDisplay)
  }, [histQ.data])

  // Forecast series — projected mid-line appended after history, with
  // an upper/lower band as separate dashed series.
  const forecastSeries: { categories: (string | number)[]; series: TrendSeries[] } | null = useMemo(() => {
    const fc = forecastQ.data?.forecast
    if (!fc || fc.length === 0 || trend.values.length === 0) return null
    const histLen = trend.values.length
    const cats: (string | number)[] = [
      ...trend.categories,
      ...fc.map((p) => new Date(p.t).toLocaleDateString()),
    ]
    const pad = (n: number) => Array<number | null>(n).fill(null)
    // History line spans only the history span; projection lines pad
    // the leading history length then carry the forecast values.
    return {
      categories: cats,
      series: [
        {
          name: 'Actual',
          data: [...trend.values, ...pad(fc.length)] as unknown as number[],
        },
        {
          name: 'Projected',
          data: [
            ...pad(histLen - 1),
            trend.values[histLen - 1],
            ...fc.map((p) => Math.round(p.value)),
          ] as unknown as number[],
        },
        {
          name: 'Upper',
          data: [...pad(histLen), ...fc.map((p) => Math.round(p.upper))] as unknown as number[],
          severity: 'low',
        },
        {
          name: 'Lower',
          data: [...pad(histLen), ...fc.map((p) => Math.round(p.lower))] as unknown as number[],
          severity: 'low',
        },
      ],
    }
  }, [forecastQ.data, trend])

  // Weight donut — effective_weight per active category.
  const weightData: DonutDatum[] = useMemo(() => {
    return (score?.categories ?? [])
      .filter((c) => c.effective_weight > 0)
      .map((c) => ({ label: c.label, value: Math.round(c.effective_weight * 100) }))
  }, [score])

  // Category summary rows for the accordion.
  const catRows = useMemo(() => {
    return (score?.categories ?? []).map((c) => ({
      id: c.id,
      label: c.label,
      display: c.display,
      grade: c.grade,
      weight: Math.round(c.effective_weight * 100),
      subs: c.sub_vectors,
    }))
  }, [score])

  const loading = scoreQ.isLoading

  // Peer band donut-ish: render the org score against p25/p50/p75/p90
  // as a horizontal marker row inside a ChartCard (no fake numbers).
  const peerBand = hasBench ? bench!.benchmark! : null

  const ACCENT = colors.section.scoring
  const scoreNow = hasScore ? Math.round(score!.overall_display!) : null
  const scoreDelta = scoreNow != null && prevScore != null ? scoreNow - prevScore : null

  return (
    <ManagerDashboard
      title={t('external.postureTitle')}
      subtitle={t('external.postureSub')}
      accent={ACCENT}
      titleIcon={<Gauge size={20} />}
      layout="hero-split"
      hero={
        <ManagerHero
          accent={ACCENT}
          icon={<Gauge size={15} />}
          minHeight={200}
          visual={
            hasScore ? (
              <GaugeChart
                value={scoreNow!}
                max={100}
                label={score!.overall_grade ?? 'Score'}
                grade={gradeTone(score!.overall_grade, score!.overall_display)}
                height={188}
              />
            ) : undefined
          }
          headline={{
            label: t('external.kpiPostureScore'),
            value: hasScore ? (score!.overall_grade ?? scoreNow) : '—',
            sub: hasScore
              ? `${scoreNow}/100${hasBench ? ` · ${percentileNarrative(bench!.percentile)}` : ''}`
              : 'Connect a repo or run a scan to generate your first posture score.',
            delta: scoreDelta != null && scoreDelta !== 0 ? (
              <Chip
                size="small"
                icon={scoreDelta > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                label={`${scoreDelta > 0 ? '+' : ''}${scoreDelta} 90d`}
                sx={{
                  fontWeight: 700, fontSize: 12,
                  bgcolor: alpha(scoreDelta > 0 ? colors.semantic.success : colors.semantic.danger, 0.14),
                  color: scoreDelta > 0 ? colors.semantic.success : colors.semantic.danger,
                  '& .MuiChip-icon': { color: 'inherit' },
                }}
              />
            ) : undefined,
          }}
          aside={
            <Box>
              <HeroStat
                icon={<Users size={14} />}
                tone={ACCENT}
                label={t('external.kpiSectorPercentile')}
                value={hasBench ? Math.round(bench!.percentile!) : '—'}
              />
              <HeroStat
                icon={<Layers size={14} />}
                tone={ACCENT}
                label={t('external.kpiActiveDimensions')}
                value={score ? `${score.active_count}/${score.total_count}` : '—'}
              />
            </Box>
          }
        />
      }
      kpis={
        <>
          <KpiCard
            label={t('external.kpiPostureScore')}
            value={hasScore ? Math.round(score!.overall_display!) : null}
            unit="/ 100"
            previous={prevScore}
            sparkline={trend.values.length > 1 ? trend.values : undefined}
            loading={loading}
            empty={!loading && !hasScore}
            emptyHint="No score yet"
          />
          <KpiCard
            label="Grade"
            value={hasScore ? (score!.overall_grade ?? '—') : null}
            loading={loading}
            empty={!loading && !hasScore}
            emptyHint="Pending first scan"
          />
          <KpiCard
            label={t('external.kpiSectorPercentile')}
            value={hasBench ? Math.round(bench!.percentile!) : null}
            unit="pctl"
            loading={benchQ.isLoading}
            empty={!benchQ.isLoading && !hasBench}
            emptyHint="No peer data"
          />
          <KpiCard
            label={t('external.kpiActiveDimensions')}
            value={score ? score.active_count : null}
            unit={score ? `of ${score.total_count}` : undefined}
            loading={loading}
          />
        </>
      }
      charts={
        <>
          <ChartCard title={t('scoring.trends.chartTitleTrendForecast')}>
            {forecastSeries
              ? (
                <TrendChart
                  categories={forecastSeries.categories}
                  series={forecastSeries.series}
                  area={false}
                  yMin={0}
                  yMax={100}
                  height={240}
                />
              )
              : trend.values.length > 1
                ? (
                  <TrendChart
                    categories={trend.categories}
                    series={[{ name: 'Posture', data: trend.values }]}
                    yMin={0}
                    yMax={100}
                    height={240}
                  />
                )
                : EMPTY_CHART('Not enough history to chart a trend')}
          </ChartCard>

          <ChartCard title={t('external.chartDimensionWeights')}>
            {weightData.length > 0
              ? <DonutChart data={weightData} totalLabel="Weights" height={240} />
              : EMPTY_CHART('No weighted dimensions yet')}
          </ChartCard>

          <ChartCard title={t('external.chartPeerBaseline')}>
            {peerBand
              ? (
                <PeerBandRow
                  org={hasScore ? Math.round(score!.overall_display!) : null}
                  p25={peerBand.p25}
                  p50={peerBand.p50}
                  p75={peerBand.p75}
                  p90={peerBand.p90}
                  sector={bench!.sector}
                  sampleSize={peerBand.sample_size}
                />
              )
              : EMPTY_CHART('No peer baseline for this sector')}
          </ChartCard>
        </>
      }
      narrative={
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            Posture Summary
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {hasScore
              ? `Your organization holds a ${score!.overall_grade ?? ''} grade at ${Math.round(
                  score!.overall_display!,
                )}/100 across ${score!.active_count} of ${score!.total_count} active dimensions${
                  hasBench ? ` — ${percentileNarrative(bench!.percentile)}` : ''
                }. Switch to engineer mode (top bar) for raw dimension breakdowns and evidence.`
              : 'Connect a repository or run a scan to generate your first posture score. Once data lands, this overview populates automatically.'}
          </Typography>

          {/* Category accordion summary */}
          {catRows.length > 0 && (
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: theme.palette.text.secondary }}>
                Category Breakdown
              </Typography>
              {catRows.map((row) => {
                const tone = gradeColor(gradeTone(row.grade, row.display))
                return (
                  <Accordion
                    key={row.id}
                    disableGutters
                    elevation={0}
                    expanded={expanded === row.id}
                    onChange={(_, isOpen) => setExpanded(isOpen ? row.id : false)}
                    sx={{
                      bgcolor: 'transparent',
                      borderBottom: `1px solid ${alpha(theme.palette.text.primary, 0.06)}`,
                      '&:before': { display: 'none' },
                    }}
                  >
                    <AccordionSummary expandIcon={<ChevronDown size={16} />} sx={{ px: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%', pr: 2 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
                          {row.label}
                        </Typography>
                        <Box sx={{ width: 120 }}>
                          <LinearProgress
                            variant="determinate"
                            value={row.display != null ? Math.max(0, Math.min(100, row.display)) : 0}
                            sx={{
                              height: 6,
                              borderRadius: 3,
                              bgcolor: alpha(theme.palette.text.primary, 0.08),
                              '& .MuiLinearProgress-bar': { bgcolor: tone, borderRadius: 3 },
                            }}
                          />
                        </Box>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: tone, minWidth: 56, textAlign: 'right' }}>
                          {row.display != null ? `${Math.round(row.display)} ${row.grade ?? ''}` : '—'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 48, textAlign: 'right' }}>
                          {row.weight}% wt
                        </Typography>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails sx={{ px: 0, pt: 0 }}>
                      <Stack spacing={0.75}>
                        {row.subs.length === 0 && (
                          <Typography variant="caption" color="text.secondary">
                            No sub-vectors active for this category.
                          </Typography>
                        )}
                        {row.subs.map((sv) => (
                          <Box key={sv.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Typography variant="caption" sx={{ flex: 1, color: theme.palette.text.secondary }}>
                              {sv.label}
                            </Typography>
                            <Typography variant="caption" sx={{ textTransform: 'uppercase', opacity: 0.7 }}>
                              {sv.mode}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{
                                fontWeight: 700,
                                minWidth: 56,
                                textAlign: 'right',
                                color: gradeColor(gradeTone(sv.grade, sv.display)),
                              }}
                            >
                              {sv.display != null ? `${Math.round(sv.display)} ${sv.grade ?? ''}` : '—'}
                            </Typography>
                          </Box>
                        ))}
                      </Stack>
                    </AccordionDetails>
                  </Accordion>
                )
              })}
            </Box>
          )}
        </Box>
      }
    />
  )
}

/** PeerBandRow — org score plotted against sector p25/p50/p75/p90. No
 *  individual peers exposed (legal-safe, matches engine policy). */
function PeerBandRow({
  org, p25, p50, p75, p90, sector, sampleSize,
}: {
  org: number | null
  p25: number; p50: number; p75: number; p90: number
  sector: string; sampleSize: number
}) {
  const theme = useTheme()
  const min = Math.min(p25, org ?? p25) - 5
  const max = Math.max(p90, org ?? p90) + 5
  const span = Math.max(1, max - min)
  const pos = (v: number) => `${((v - min) / span) * 100}%`
  const marks: { v: number; label: string }[] = [
    { v: p25, label: 'P25' },
    { v: p50, label: 'P50' },
    { v: p75, label: 'P75' },
    { v: p90, label: 'P90' },
  ]
  return (
    <Box sx={{ height: 240, display: 'flex', flexDirection: 'column', justifyContent: 'center', px: 1 }}>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 2 }}>
        {sector} sector · {sampleSize} peers
      </Typography>
      <Box sx={{ position: 'relative', height: 8, borderRadius: 4, bgcolor: alpha(theme.palette.text.primary, 0.08), mb: 4 }}>
        <Box
          sx={{
            position: 'absolute', left: pos(p25), width: `calc(${pos(p90)} - ${pos(p25)})`,
            top: 0, bottom: 0, borderRadius: 4, bgcolor: alpha(theme.palette.primary.main, 0.25),
          }}
        />
        {marks.map((m) => (
          <Box key={m.label} sx={{ position: 'absolute', left: pos(m.v), top: -4, transform: 'translateX(-50%)' }}>
            <Box sx={{ width: 2, height: 16, bgcolor: alpha(theme.palette.text.primary, 0.4) }} />
            <Typography variant="caption" sx={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontSize: 12 }}>
              {m.label}
            </Typography>
            <Typography variant="caption" sx={{ position: 'absolute', top: 30, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontSize: 12, color: theme.palette.text.secondary }}>
              {Math.round(m.v)}
            </Typography>
          </Box>
        ))}
        {org != null && (
          <Box sx={{ position: 'absolute', left: pos(org), top: -10, transform: 'translateX(-50%)' }}>
            <Box sx={{ width: 3, height: 28, bgcolor: theme.palette.primary.main, borderRadius: 1 }} />
            <Typography variant="caption" sx={{ position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontWeight: 700, color: theme.palette.primary.main }}>
              You · {org}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  )
}
