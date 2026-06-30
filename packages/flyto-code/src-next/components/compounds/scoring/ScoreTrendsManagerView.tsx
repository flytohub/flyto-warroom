/**
 * ScoreTrendsManagerView — manager-mode surface for Score Trends.
 *
 * Trend narrative with momentum, a 30-day forecast band, and a
 * grade-change event ledger — the "are we getting better or worse,
 * and why" view for leadership.
 *
 *   getUnifiedScoreHistory → 90-day score line
 *   getScoreForecast       → 30-day projected band
 *   getOrgScoreEvents      → grade upgrade/downgrade ledger
 *
 * Engineer view (the existing <ScoreTrendsView/>) is preserved verbatim
 * by the page wrapper via <ModeView/>.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import { alpha, useTheme } from '@mui/material/styles'
import { TrendingUp, TrendingDown, Minus, CalendarRange, GitCommitVertical } from 'lucide-react'

import {
  ManagerDashboard,
  ChartCard,
  KpiCard,
  TrendChart,
  ManagerHero,
  HeroStat,
  gradeColor,
  type TrendSeries,
} from '@compounds/_shared'

import { useOrg } from '@hooks/useOrg'
import { colors } from '@/styles/designTokens'
import { qk } from '@lib/queryKeys'
import {
  getUnifiedScoreHistory,
  getOrgScoreEvents,
  type ScoreEvent,
} from '@lib/engine/scoring/scoring'
import { getScoreForecast } from '@lib/engine/ctem/upstreamData'
import { t } from '@lib/i18n';
import { gradeTone } from './managerShared'

const EMPTY_CHART = (msg: string) => (
  <Box sx={{ height: 240, display: 'grid', placeItems: 'center' }}>
    <Typography variant="body2" color="text.secondary">{msg}</Typography>
  </Box>
)

export function ScoreTrendsManagerView() {
  const { org } = useOrg()
  const orgId = org?.id
  const theme = useTheme()

  const histQ = useQuery({
    queryKey: qk.scoring.scoreHistory(orgId, 90),
    queryFn: () => getUnifiedScoreHistory(orgId!, 90),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const forecastQ = useQuery({
    queryKey: qk.scoring.scoreForecast(orgId),
    queryFn: () => getScoreForecast(orgId!, 30),
    enabled: !!orgId,
    staleTime: 120_000,
  })
  const eventsQ = useQuery({
    queryKey: qk.scoring.scoreEvents(orgId, 90),
    queryFn: () => getOrgScoreEvents(orgId!, 90),
    enabled: !!orgId,
    staleTime: 120_000,
  })

  const sortedAsc = useMemo(() => {
    return [...(histQ.data?.entries ?? [])].sort(
      (a, b) => new Date(a.computedAt).getTime() - new Date(b.computedAt).getTime(),
    )
  }, [histQ.data])

  const trend = useMemo(() => ({
    categories: sortedAsc.map((e) => new Date(e.computedAt).toLocaleDateString()),
    values: sortedAsc.map((e) => Math.round(e.overallDisplay)),
  }), [sortedAsc])

  const latest = trend.values.at(-1) ?? null
  const oldest = trend.values[0] ?? null
  const delta = latest != null && oldest != null ? latest - oldest : null

  const forecastSeries: { categories: (string | number)[]; series: TrendSeries[] } | null = useMemo(() => {
    const fc = forecastQ.data?.forecast
    if (!fc || fc.length === 0 || trend.values.length === 0) return null
    const histLen = trend.values.length
    const pad = (n: number) => Array<number | null>(n).fill(null)
    return {
      categories: [
        ...trend.categories,
        ...fc.map((p) => new Date(p.t).toLocaleDateString()),
      ],
      series: [
        { name: 'Actual', data: [...trend.values, ...pad(fc.length)] as unknown as number[] },
        {
          name: 'Projected',
          data: [
            ...pad(histLen - 1),
            trend.values[histLen - 1],
            ...fc.map((p) => Math.round(p.value)),
          ] as unknown as number[],
        },
        { name: 'Upper', data: [...pad(histLen), ...fc.map((p) => Math.round(p.upper))] as unknown as number[], severity: 'low' },
        { name: 'Lower', data: [...pad(histLen), ...fc.map((p) => Math.round(p.lower))] as unknown as number[], severity: 'low' },
      ],
    }
  }, [forecastQ.data, trend])

  const events = useMemo(() => {
    return [...(eventsQ.data?.events ?? [])]
      .filter((e) => e.direction !== 'stable')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 8)
  }, [eventsQ.data])

  const projectedEnd = forecastQ.data?.forecast?.at(-1)?.value
  const loading = histQ.isLoading

  // Accent ENCODES momentum direction: green when holding/improving over
  // 90 days, red when regressing. Falls back to up-tone when no delta yet.
  const up = delta != null && delta >= 0
  const ACCENT = up ? colors.semantic.success : colors.semantic.danger

  // The trend+forecast chart, shared between the hero visual and the
  // (now-removed) chart cell.
  const trendVisual = (height: number) =>
    forecastSeries
      ? (
        <TrendChart
          categories={forecastSeries.categories}
          series={forecastSeries.series}
          area={false}
          yMin={0}
          yMax={100}
          height={height}
        />
      )
      : trend.values.length > 1
        ? (
          <TrendChart
            categories={trend.categories}
            series={[{ name: 'Posture', data: trend.values }]}
            yMin={0}
            yMax={100}
            height={height}
          />
        )
        : EMPTY_CHART(t('scoring.trends.emptyHistoryMessage'))

  return (
    <ManagerDashboard
      title={t('scoring.trends.title')}
      subtitle={t('scoring.trends.subtitle')}
      accent={ACCENT}
      titleIcon={<TrendingUp size={20} />}
      layout="timeline"
      hero={
        <ManagerHero
          accent={ACCENT}
          icon={up ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
          minHeight={200}
          visual={
            <Box sx={{ width: '100%', minWidth: { md: 360 } }}>
              {trendVisual(200)}
            </Box>
          }
          headline={{
            label: t('scoring.trends.kpi90DayChange'),
            value: delta != null ? `${delta > 0 ? '+' : ''}${delta}` : '—',
            unit: delta != null ? 'pts' : undefined,
            sub: latest != null
              ? `Now at ${latest}/100${
                  projectedEnd != null ? ` · 30-day projection near ${Math.round(projectedEnd)}` : ''
                }${events.length > 0 ? ` · ${events.length} grade change${events.length === 1 ? '' : 's'}` : ''}`
              : 'Not enough scoring history yet — momentum populates after a few scans.',
            delta: delta != null && delta !== 0 ? (
              <Chip
                size="small"
                icon={delta > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                label={delta > 0 ? 'improving' : 'regressing'}
                sx={{
                  fontWeight: 700, fontSize: 12,
                  bgcolor: alpha(up ? colors.semantic.success : colors.semantic.danger, 0.14),
                  color: up ? colors.semantic.success : colors.semantic.danger,
                  '& .MuiChip-icon': { color: 'inherit' },
                }}
              />
            ) : undefined,
          }}
          aside={
            <Box>
              <HeroStat
                icon={<CalendarRange size={14} />}
                tone={ACCENT}
                label={t('scoring.trends.kpi30DayProjection')}
                value={projectedEnd != null ? Math.round(projectedEnd) : '—'}
              />
              <HeroStat
                icon={<GitCommitVertical size={14} />}
                tone={ACCENT}
                label={t('scoring.trends.kpiGradeChanges')}
                value={eventsQ.data ? events.length : '—'}
              />
            </Box>
          }
        />
      }
      kpis={
        <>
          <KpiCard
            label={t('scoring.trends.kpiCurrentScore')}
            value={latest}
            unit="/ 100"
            previous={oldest}
            sparkline={trend.values.length > 1 ? trend.values : undefined}
            loading={loading}
            empty={!loading && latest == null}
            emptyHint="No history"
          />
          <KpiCard
            label={t('scoring.trends.kpi90DayChange')}
            value={delta != null ? delta : null}
            unit="pts"
            loading={loading}
            empty={!loading && delta == null}
          />
          <KpiCard
            label={t('scoring.trends.kpi30DayProjection')}
            value={projectedEnd != null ? Math.round(projectedEnd) : null}
            unit="/ 100"
            previous={latest}
            loading={forecastQ.isLoading}
            empty={!forecastQ.isLoading && projectedEnd == null}
            emptyHint="No forecast"
          />
          <KpiCard
            label={t('scoring.trends.kpiGradeChanges')}
            value={eventsQ.data ? events.length : null}
            invertDelta
            loading={eventsQ.isLoading}
          />
        </>
      }
      charts={
        <>
          <ChartCard title={t('scoring.trends.chartTitleGradeChangeLedger')}>
            {events.length > 0
              ? <EventLedger events={events} />
              : EMPTY_CHART(t('scoring.trends.emptyGradeChangesMessage'))}
          </ChartCard>
        </>
      }
      narrative={
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            {t('scoring.trends.momentumTitle')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {latest != null && delta != null
              ? `Your posture score is at ${latest}/100, ${
                  delta > 0 ? `up ${delta}` : delta < 0 ? `down ${Math.abs(delta)}` : 'flat'
                } points over the last 90 days.${
                  projectedEnd != null
                    ? ` The 30-day projection lands near ${Math.round(projectedEnd)}/100${
                        projectedEnd > latest ? ' — continued improvement' : projectedEnd < latest ? ' — watch for regression' : ''
                      }.`
                    : ''
                }${
                  events.length > 0
                    ? ` ${events.length} grade change${events.length === 1 ? '' : 's'} recorded — see the ledger for drivers.`
                    : ''
                } Switch to engineer mode for the full event detail and per-dimension trends.`
              : 'Not enough scoring history yet. Once a few scans have run, this view shows your momentum, projection, and grade-change drivers.'}
          </Typography>
        </Box>
      }
    />
  )

  function EventLedger({ events }: { events: ScoreEvent[] }) {
    return (
      <Box sx={{ height: 260, overflowY: 'auto', pr: 0.5 }}>
        <Stack spacing={1}>
          {events.map((e, i) => {
            const up = e.direction === 'upgrade'
            const Icon = up ? TrendingUp : e.direction === 'downgrade' ? TrendingDown : Minus
            const tone = gradeColor(gradeTone(e.to_grade, e.to_score))
            return (
              <Box
                key={`${e.date}-${i}`}
                sx={{
                  display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1,
                  borderRadius: 1.5,
                  bgcolor: alpha(theme.palette.text.primary, 0.03),
                }}
              >
                <Box sx={{ color: tone, mt: 0.25 }}><Icon size={16} /></Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>
                      {e.from_grade} → {e.to_grade}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      ({Math.round(e.from_score)} → {Math.round(e.to_score)})
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                      {new Date(e.date).toLocaleDateString()}
                    </Typography>
                  </Box>
                  {e.reasons?.length > 0 && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                      {e.reasons.slice(0, 2).join(' · ')}
                    </Typography>
                  )}
                </Box>
              </Box>
            )
          })}
        </Stack>
      </Box>
    )
  }
}
