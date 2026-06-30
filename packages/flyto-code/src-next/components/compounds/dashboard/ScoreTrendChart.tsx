/**
 * ScoreTrendChart — ApexCharts line chart showing score history over time,
 * with grade change event annotations.
 *
 * Used in both the org Dashboard (unified score) and Domain Detail (CTEM score).
 */

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import IconButton from '@mui/material/IconButton'
import { TrendingUp, TrendingDown, ArrowRight, Calendar, Maximize2 } from 'lucide-react'
import { ScoreTrendPage } from './ScoreTrendPage'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import {
  getUnifiedScoreHistory,
  getOrgScoreEvents,
  type ScoreEvent,
} from '@lib/engine'
import { GRADE_COLORS } from './types'
import { queryFailed, querySucceeded, queryUnresolved, resolvedList } from '@lib/queryState'

interface ScoreTrendChartProps {
  /** Number of days to show (default 90) */
  days?: number
}

export function ScoreTrendChart({ days = 90 }: ScoreTrendChartProps) {
  const [expanded, setExpanded] = useState(false)
  const { org } = useOrg()

  const historyQ = useQuery({
    queryKey: qk.dashboard.scoreHistory(org?.id, days),
    queryFn: () => getUnifiedScoreHistory(org!.id, days),
    enabled: !!org?.id,
    staleTime: 60_000,
  })

  const eventsQ = useQuery({
    queryKey: qk.scoring.scoreEvents(org?.id, days),
    queryFn: () => getOrgScoreEvents(org!.id, days),
    enabled: !!org?.id,
    staleTime: 60_000,
  })

  const entries = resolvedList(historyQ.data?.entries, historyQ, !!org?.id)
  const events = resolvedList(eventsQ.data?.events, eventsQ, !!org?.id)
  const historyLoading = queryUnresolved(historyQ, !!org?.id)
  const historyFailed = queryFailed(historyQ, !!org?.id)

  // A3-F3 (2026-05-25). Pre-A3 this transform did:
  //   Number(ec.overallRaw ?? ec.overall_raw ?? 0)
  // — a snake/camel dual-read plus `?? 0` final fallback.
  // Two problems:
  //
  //   1. The dual-read was dead defence — UnifiedScoreEntry on
  //      /unified-score-history is contract-camelCase only
  //      (per store.UnifiedScoreHistory JSON tags). The `as
  //      Record<string, unknown>` cast was the only way the
  //      snake_case branch could ever fire, and it punched a
  //      hole in TS strict mode.
  //
  //   2. The `?? 0` floor silently drew any point with a
  //      missing / NaN score at the F-band bottom (raw=0,
  //      display=0). With several such points, the line dipped
  //      through "real F" territory — visually identical to a
  //      genuine catastrophic score collapse. operator's
  //      "有資料沒圖" was the SYMPTOM of this; the cause was the
  //      type mismatch the dual-read masked.
  //
  // A3 contract: skip points without a valid raw score. If
  // <2 valid points remain, the early return below collapses
  // the chart to nothing (better than a "0-bottom" line).
  // `typeof === 'number'` is the runtime guard for the rare
  // case backend ships null/undefined under the camelCase key
  // — we're typed for non-null but A3 history rows can in
  // principle carry score-less entries someday.
  const chartData = useMemo(() => {
    type Point = { date: string; raw: number; display: number; grade: string }
    const out: Point[] = []
    for (const e of entries) {
      if (typeof e.overallRaw !== 'number' || !Number.isFinite(e.overallRaw)) continue
      if (!e.computedAt) continue
      out.push({
        date: new Date(e.computedAt).toLocaleDateString(),
        raw: e.overallRaw,
        display: typeof e.overallDisplay === 'number' ? e.overallDisplay : e.overallRaw,
        grade: e.overallGrade ?? '',
      })
    }
    return out.reverse() // oldest first
  }, [entries])

  if (historyLoading) {
    return (
      <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: 1, borderColor: 'divider' }}>
        <Typography variant="subtitle2" fontWeight={700}>
          {t('dashboard.scoreTrend')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {t('dashboard.scoreTrendLoading')}
        </Typography>
      </Paper>
    )
  }

  if (historyFailed) {
    return (
      <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: 1, borderColor: 'divider' }}>
        <Typography variant="subtitle2" fontWeight={700}>
          {t('dashboard.scoreTrend')}
        </Typography>
        <Typography variant="body2" color="error.main" sx={{ mt: 1 }}>
          {t('dashboard.scoreTrendError')}
        </Typography>
      </Paper>
    )
  }

  if (!querySucceeded(historyQ, !!org?.id) || chartData.length < 2) return null // need at least 2 points for a trend

  if (expanded) {
    return (
      <Paper elevation={0} sx={{ borderRadius: 3, border: 1, borderColor: 'divider', overflow: 'hidden' }}>
        <ScoreTrendPage onBack={() => setExpanded(false)} />
      </Paper>
    )
  }

  // Delta from the same normalised chartData so it survives the
  // wire-format mismatch above. chartData is oldest-first after the
  // reverse(); newest is the last index.
  const latestRaw = chartData[chartData.length - 1].raw
  const earliestRaw = chartData[0].raw
  const delta = latestRaw - earliestRaw
  const improving = delta > 0

  return (
    <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: 1, borderColor: 'divider' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Calendar size={16} style={{ opacity: 0.5 }} />
          <Typography variant="subtitle2" fontWeight={700}>
            {t('dashboard.scoreTrend')}
          </Typography>
          <Chip
            label={`${days}d`}
            size="small"
            sx={{ height: 20, fontSize: 13, fontWeight: 600, bgcolor: 'action.hover' }}
          />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton
            size="small"
            onClick={() => setExpanded(true)}
            aria-label={t('common.expand')}
            title={t('common.expand')}
            sx={{ bgcolor: 'action.hover' }}
          >
            <Maximize2 size={14} />
          </IconButton>
          {improving ? (
            <TrendingUp size={14} style={{ color: '#22c55e' }} />
          ) : delta < 0 ? (
            <TrendingDown size={14} style={{ color: '#ef4444' }} />
          ) : null}
          <Typography variant="body2" fontWeight={600} sx={{ color: improving ? '#22c55e' : delta < 0 ? '#ef4444' : 'text.secondary' }}>
            {delta > 0 ? '+' : ''}{delta} pts
          </Typography>
        </Box>
      </Box>

      {/* Sparkline — SVG polyline + area fill. Previously a CSS
          bar-stack with `flex: 1` per bar; with 90 days of data each
          bar was ~3px wide and 4-22px tall at 0.7 opacity, which
          looked like an empty card at any normal zoom level
          (operator 2026-05-22: "有資料沒圖"). Line chart reads as
          a real chart at any density. */}
      <Box sx={{ height: 80, mb: 2 }}>
        {chartData.length >= 2 && (() => {
          const W = 800, H = 80, P = 6
          const vals = chartData.map(p => p.raw)
          const min = Math.min(...vals)
          const max = Math.max(...vals)
          const range = (max - min) || 1
          const pts = chartData.map((p, i) => ({
            x: P + (i / (chartData.length - 1)) * (W - 2 * P),
            y: P + (1 - (p.raw - min) / range) * (H - 2 * P),
            color: GRADE_COLORS[p.grade as keyof typeof GRADE_COLORS] ?? '#94a3b8',
          }))
          const linePath = 'M ' + pts.map(p => `${p.x},${p.y}`).join(' L ')
          const areaPath = linePath + ` L ${pts[pts.length - 1].x},${H - P} L ${pts[0].x},${H - P} Z`
          const lineColor = improving ? '#22c55e' : delta < 0 ? '#ef4444' : '#64748b'
          return (
            <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
              <defs>
                <linearGradient id="scoreTrendFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={lineColor} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <path d={areaPath} fill="url(#scoreTrendFill)" />
              <path d={linePath} fill="none" stroke={lineColor} strokeWidth={2} vectorEffect="non-scaling-stroke" />
              {/* End cap — small grade-tinted circle so the latest
                  reading reads as a marker, not just a line tail. */}
              {pts.length > 0 && (
                <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={3.5} fill={pts[pts.length - 1].color} />
              )}
            </svg>
          )
        })()}
      </Box>

      {/* Grade change events */}
      {events.length > 0 && (
        <Box>
          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            {t('dashboard.gradeChanges')}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {events.slice(0, 5).map((evt, i) => (
              <GradeChangeEvent key={i} event={evt} />
            ))}
          </Box>
        </Box>
      )}
    </Paper>
  )
}

function GradeChangeEvent({ event }: { event: ScoreEvent }) {
  const isDown = event.direction === 'downgrade'
  const color = isDown ? '#ef4444' : '#22c55e'
  const fromColor = GRADE_COLORS[event.from_grade as keyof typeof GRADE_COLORS] ?? '#94a3b8'
  const toColor = GRADE_COLORS[event.to_grade as keyof typeof GRADE_COLORS] ?? '#94a3b8'

  return (
    <Box sx={{
      display: 'flex', alignItems: 'flex-start', gap: 1.5,
      p: 1.5, borderRadius: 2, bgcolor: `${color}08`,
      border: '1px solid', borderColor: `${color}20`,
    }}>
      <Box sx={{
        width: 6, height: 6, borderRadius: '50%', bgcolor: color,
        mt: 0.75, flexShrink: 0,
      }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            {new Date(event.date).toLocaleDateString()}
          </Typography>
          <Chip label={event.from_grade} size="small"
            sx={{ height: 18, fontSize: 12, fontWeight: 700, bgcolor: `${fromColor}20`, color: fromColor }} />
          <ArrowRight size={10} style={{ opacity: 0.4 }} />
          <Chip label={event.to_grade} size="small"
            sx={{ height: 18, fontSize: 12, fontWeight: 700, bgcolor: `${toColor}20`, color: toColor }} />
          <Typography variant="caption" color="text.secondary">
            ({event.from_score} → {event.to_score})
          </Typography>
        </Box>
        {event.reasons.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
            {event.reasons.map((reason, j) => (
              <Typography key={j} variant="caption" color="text.secondary" sx={{ lineHeight: 1.4 }}>
                {reason}
              </Typography>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}
