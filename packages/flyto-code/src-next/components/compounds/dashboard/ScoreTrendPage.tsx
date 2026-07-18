/**
 * ScoreTrendPage — Full-page Flyto2 score trend view.
 *
 * Features:
 * - Top stat cards: highest/lowest score + date, grade changes count
 * - Interactive SVG chart with grade-band coloring (250-900 scale)
 * - Click on data points to see score change details
 * - Grade change annotations sidebar
 * - Time range selector (30d / 90d / 180d / 1y)
 */

import { useState, useMemo, useRef, useEffect } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import IconButton from '@mui/material/IconButton'
import { TrendingUp, TrendingDown, ArrowRight, ChevronLeft } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { displayScore } from './types'
import { FlytoPageHeader } from '@atoms/FlytoPageHeader'
import { useOrg } from '@hooks/useOrg'
import { LETTER_GRADE_TONE } from '@lib/tokens/severity'
import {
  getUnifiedScoreHistory,
  getOrgScoreEvents,
  type UnifiedScoreEntry,
  type ScoreEvent,
} from '@lib/engine'

// Grade band definitions for chart background. Colors are sourced from
// the canonical A→F letter-grade ramp (LETTER_GRADE_TONE) so a brand
// recolor stays a single-file edit.
const GRADE_BANDS = [
  { grade: 'A', min: 740, max: 900, color: LETTER_GRADE_TONE.A.tone },
  { grade: 'B', min: 640, max: 740, color: LETTER_GRADE_TONE.B.tone },
  { grade: 'C', min: 500, max: 640, color: LETTER_GRADE_TONE.C.tone },
  { grade: 'D', min: 380, max: 500, color: LETTER_GRADE_TONE.D.tone },
  { grade: 'F', min: 250, max: 380, color: LETTER_GRADE_TONE.F.tone },
]

const TIME_RANGES = [
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '180d', days: 180 },
  { label: '1y', days: 365 },
]

interface ScoreTrendPageProps {
  onBack?: () => void
}

export function ScoreTrendPage({ onBack }: ScoreTrendPageProps) {
  const { org } = useOrg()
  const [days, setDays] = useState(90)
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null)

  const { data: historyData } = useQuery({
    queryKey: qk.dashboard.scoreHistory(org?.id, days),
    queryFn: () => getUnifiedScoreHistory(org!.id, days),
    enabled: !!org?.id,
    staleTime: 60_000,
  })

  const { data: eventsData } = useQuery({
    queryKey: qk.scoring.scoreEvents(org?.id, days),
    queryFn: () => getOrgScoreEvents(org!.id, days),
    enabled: !!org?.id,
    staleTime: 60_000,
  })

  const entries = useMemo(() =>
    [...(historyData?.entries ?? [])].reverse(), // oldest first
    [historyData]
  )
  const events = eventsData?.events ?? []

  // Stats
  const stats = useMemo(() => {
    if (entries.length === 0) return null
    let highest = entries[0], lowest = entries[0]
    let upgrades = 0, downgrades = 0
    for (const e of entries) {
      if (e.overallDisplay > highest.overallDisplay) highest = e
      if (e.overallDisplay < lowest.overallDisplay) lowest = e
    }
    for (const evt of events) {
      if (evt.direction === 'upgrade') upgrades++
      if (evt.direction === 'downgrade') downgrades++
    }
    const latest = entries[entries.length - 1]
    const earliest = entries[0]
    const delta = latest.overallDisplay - earliest.overallDisplay
    return { highest, lowest, upgrades, downgrades, changes: events.length, delta, latest }
  }, [entries, events])

  if (!stats || entries.length < 2) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">{t('dashboard.noTrendData')}</Typography>
      </Box>
    )
  }

  return (
    // Bitsight-style fixed-region layout: outer page never scrolls;
    // header + stats are pinned, the chart + events row fills the
    // remaining viewport, and the events column scrolls internally
    // via @tanstack/react-virtual (only ~10 visible cards rendered
    // even with thousands of events). Operator 2026-05-23:
    // "右邊要滾軸阿 然後虛擬列表先阿".
    <Box sx={{ height: '100%', overflow: 'hidden', p: 3, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1, flexShrink: 0 }}>
        {onBack && (
          <IconButton
            size="small"
            onClick={onBack}
            aria-label={t('common.back')}
            title={t('common.back')}
            sx={{ bgcolor: 'action.hover' }}
          >
            <ChevronLeft size={18} />
          </IconButton>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <FlytoPageHeader
            title={t('dashboard.scoreTrendTitle')}
            subtitle={t('dashboard.scoreTrendSub')}
            bottomGap={4}
            action={
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {TIME_RANGES.map(tr => (
                  <Chip
                    key={tr.days}
                    label={tr.label}
                    size="small"
                    onClick={() => setDays(tr.days)}
                    sx={{
                      height: 28, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      bgcolor: days === tr.days ? 'primary.main' : 'action.hover',
                      color: days === tr.days ? '#fff' : 'text.secondary',
                      '&:hover': { bgcolor: days === tr.days ? 'primary.dark' : 'action.selected' },
                    }}
                  />
                ))}
              </Box>
            }
          />
        </Box>
      </Box>

      {/* Stat cards — responsive grid, pinned above the scroll
          region (flexShrink:0). */}
      <Box sx={{
        flexShrink: 0,
        display: 'grid',
        gridTemplateColumns: {
          xs: '1fr',
          sm: 'repeat(2, minmax(0, 1fr))',
          md: 'repeat(4, minmax(0, 1fr))',
        },
        gap: 2, mb: 3,
      }}>
        <StatCard
          label={t('dashboard.highestOn').replace('{date}', fmtDate(stats.highest.computedAt))}
          score={stats.highest.overallDisplay}
          grade={stats.highest.overallGrade}
        />
        <StatCard
          label={t('dashboard.lowestOn').replace('{date}', fmtDate(stats.lowest.computedAt))}
          score={stats.lowest.overallDisplay}
          grade={stats.lowest.overallGrade}
        />
        <StatCard
          label={t('dashboard.changesInPeriod')}
          score={stats.changes}
          delta={{ up: stats.upgrades, down: stats.downgrades }}
        />
        <StatCard
          label={t('dashboard.netChange')}
          score={stats.delta}
          isDelta
        />
      </Box>

      {/* Main chart + events — fills remaining viewport. Side-by-side
          on desktop; chart on the left (own scroll), events on the
          right (internal scroll via virtual list). */}
      <Box sx={{
        flex: 1, minHeight: 0,
        display: 'grid',
        gridTemplateColumns: {
          xs: '1fr',
          md: 'minmax(0, 1fr) minmax(0, 380px)',
        },
        gap: 3,
        overflow: 'hidden',
      }}>
        {/* Chart */}
        <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: 1, borderColor: 'divider', minWidth: 0, overflow: 'hidden' }}>
          <TrendChart
            entries={entries}
            selectedPoint={selectedPoint}
            onSelectPoint={setSelectedPoint}
          />
          {/* Legend */}
          <Box sx={{ display: 'flex', gap: 3, mt: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            {GRADE_BANDS.map(b => (
              <Box key={b.grade} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: b.color, opacity: 0.85 }} />
                <Typography variant="caption" color="text.secondary">{b.grade} ({b.min}-{b.max})</Typography>
              </Box>
            ))}
          </Box>
        </Paper>

        {/* Events timeline — grouped by year like Bitsight.
            selectedDate is derived from the chart's selectedPoint;
            the matching EventCard (or nearest one within ±1 day)
            renders with a primary-color ring + scrollIntoView. */}
        <Paper elevation={0} sx={{ minWidth: 0, borderRadius: 3, border: 1, borderColor: 'divider', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
            <Typography variant="subtitle2" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.03em', fontSize: 13 }}>
              {t('dashboard.ratingChanges')}
            </Typography>
          </Box>
          {/* Inner scroll container — fixed-height region that the
              virtual list measures inside EventTimeline. Removed the
              px padding here (now each row owns its left+right
              padding) so the virtualiser's height math matches the
              actual row content. */}
          <Box sx={{ flex: 1, minHeight: 0, overflowY: 'hidden' }}>
            {events.length === 0 ? (
              <Typography variant="caption" color="text.secondary" sx={{ p: 2 }}>
                {t('dashboard.noGradeChanges')}
              </Typography>
            ) : (
              <EventTimeline
                events={events}
                selectedDate={selectedPoint !== null ? entries[selectedPoint]?.computedAt : undefined}
              />
            )}
          </Box>
        </Paper>
      </Box>
    </Box>
  )
}

// ── Sub-components ──

function StatCard({ label, score, grade, delta, isDelta }: {
  label: string
  score: number
  grade?: string
  delta?: { up: number; down: number }
  isDelta?: boolean
}) {
  const gradeColor = grade ? GRADE_BANDS.find(b => b.grade === grade)?.color ?? '#94a3b8' : undefined
  return (
    <Paper elevation={0} sx={{ p: 2, borderRadius: 2.5, border: 1, borderColor: 'divider', textAlign: 'center' }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontSize: 13 }}>
        {label}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 1 }}>
        <Typography variant="h4" fontWeight={900} sx={{ color: isDelta ? (score > 0 ? '#22c55e' : score < 0 ? '#ef4444' : 'text.primary') : 'text.primary' }}>
          {isDelta && score > 0 ? '+' : ''}{score}
        </Typography>
        {grade && (
          <Chip label={grade} size="small" sx={{ height: 22, fontSize: 13, fontWeight: 700, bgcolor: `${gradeColor}20`, color: gradeColor }} />
        )}
      </Box>
      {delta && (
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5, mt: 1 }}>
          <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 600 }}>
            {delta.down} <TrendingDown size={10} style={{ verticalAlign: 'middle' }} />
          </Typography>
          <Typography variant="caption" color="text.secondary">/</Typography>
          <Typography variant="caption" sx={{ color: '#22c55e', fontWeight: 600 }}>
            {delta.up} <TrendingUp size={10} style={{ verticalAlign: 'middle' }} />
          </Typography>
        </Box>
      )}
    </Paper>
  )
}

/** Bitsight-style timeline grouped by year */
type TimelineRow =
  | { kind: 'year'; year: string }
  | { kind: 'event'; event: ScoreEvent; eventIdx: number }

function EventTimeline({ events, selectedDate }: { events: ScoreEvent[]; selectedDate?: string }) {
  const parentRef = useRef<HTMLDivElement>(null)

  // Flatten year-header + events into a single ordered row list
  // for the virtualiser. Years descend (newest first), events
  // inside each year stay in API order (which is newest-first too).
  const rows = useMemo<TimelineRow[]>(() => {
    const byYear = new Map<string, { event: ScoreEvent; eventIdx: number }[]>()
    events.forEach((e, i) => {
      const y = new Date(e.date).getFullYear().toString()
      if (!byYear.has(y)) byYear.set(y, [])
      byYear.get(y)!.push({ event: e, eventIdx: i })
    })
    const years = Array.from(byYear.keys()).sort((a, b) => Number(b) - Number(a))
    const out: TimelineRow[] = []
    for (const y of years) {
      out.push({ kind: 'year', year: y })
      for (const item of byYear.get(y)!) {
        out.push({ kind: 'event', event: item.event, eventIdx: item.eventIdx })
      }
    }
    return out
  }, [events])

  // Find the event nearest the selected date — chart-points are daily
  // snapshots, events are only grade changes, so the exact date won't
  // always match. Pick the event with the smallest |Δ days| from the
  // selected date, capped at ±7d so a wildly off-target click doesn't
  // highlight a random event.
  const selectedEventIdx = useMemo(() => {
    if (!selectedDate) return null
    const target = Date.parse(selectedDate)
    if (!Number.isFinite(target)) return null
    let bestIdx = -1
    let bestDist = Infinity
    events.forEach((e, i) => {
      const t = Date.parse(e.date)
      if (!Number.isFinite(t)) return
      const dist = Math.abs(t - target)
      if (dist < bestDist) {
        bestDist = dist
        bestIdx = i
      }
    })
    if (bestIdx < 0) return null
    if (bestDist > 7 * 24 * 60 * 60 * 1000) return null
    return bestIdx
  }, [events, selectedDate])

  // @tanstack/react-virtual — only renders the ~10-15 rows
  // currently visible in the scroll viewport. With thousands of
  // events, the DOM stays small and scroll stays buttery.
  // Operator 2026-05-23: "右邊要滾軸阿 然後虛擬列表先阿".
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    // Compact rhythm after operator feedback "高低不均":
    //   year markers: small caption ~32 px
    //   event cards:  fixed ~120 px (capped reasons → consistent height)
    // measureElement absorbs any per-row variance after first paint.
    estimateSize: (i) => (rows[i]?.kind === 'year' ? 32 : 120),
    overscan: 6,
  })

  // When the chart selection lifts up a target event, scroll the
  // virtual list to that row so the highlighted card is in view.
  useEffect(() => {
    if (selectedEventIdx == null) return
    const rowIdx = rows.findIndex(r => r.kind === 'event' && r.eventIdx === selectedEventIdx)
    if (rowIdx < 0) return
    rowVirtualizer.scrollToIndex(rowIdx, { align: 'center', behavior: 'smooth' })
  }, [selectedEventIdx, rows, rowVirtualizer])

  return (
    <Box
      ref={parentRef}
      sx={{ height: '100%', width: '100%', overflowY: 'auto', overflowX: 'hidden', px: 2, py: 1 }}
    >
      <Box sx={{ height: rowVirtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
        {rowVirtualizer.getVirtualItems().map(vi => {
          const row = rows[vi.index]
          if (!row) return null
          return (
            <div
              key={vi.key}
              data-index={vi.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${vi.start}px)`,
              }}
            >
              {row.kind === 'year' ? (
                // Subtle year separator — small uppercase caption
                // with a thin rule each side. Was h6 with 16px text
                // which over-emphasised the year and contributed to
                // the "高低不均" feel.
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75 }}>
                  <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
                  <Typography sx={{
                    fontSize: 12, fontWeight: 700, color: 'text.secondary',
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                  }}>
                    {row.year}
                  </Typography>
                  <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
                </Box>
              ) : (
                // Tight 8px gap between cards (was 12px) so the
                // column reads as a rhythmic ledger, not a gallery.
                <Box sx={{ pb: 1 }}>
                  <EventCard
                    event={row.event}
                    highlighted={row.eventIdx === selectedEventIdx}
                  />
                </Box>
              )}
            </div>
          )
        })}
      </Box>
    </Box>
  )
}

function EventCard({ event, highlighted }: { event: ScoreEvent; highlighted?: boolean }) {
  const isDown = event.direction === 'downgrade'
  const color = isDown ? '#ef4444' : event.direction === 'upgrade' ? '#22c55e' : '#94a3b8'
  // displayDelta uses the 250-900 / 10-pt scale (computed below).
  const cardRef = useRef<HTMLDivElement | null>(null)

  // Scroll the highlighted card into view when the chart-side
  // selection lands on this event. Smooth scroll inside the events
  // panel; `block: 'nearest'` keeps the page from jumping if the
  // card is already visible.
  useEffect(() => {
    if (highlighted && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [highlighted])

  // Reasons cap — operator 2026-05-23 "高低不均 會有空白區塊".
  // 0-reason events were squat, 5-reason events were tall;
  // capping to 2 visible (+ "+N more" tail) gives a consistent
  // ~120px card rhythm. Click expands.
  const REASONS_VISIBLE = 2
  const [expanded, setExpanded] = useState(false)
  const visibleReasons = expanded ? event.reasons : event.reasons.slice(0, REASONS_VISIBLE)
  const extraCount = Math.max(0, event.reasons.length - REASONS_VISIBLE)

  // Score events from /score-events carry RAW 0-100 backend scores
  // (from_score/to_score). Map through displayScore() to the
  // Flyto2 250-900 / 10-pt display scale that the rest of the UI uses.
  // Operator 2026-05-23: "我是十分進位 怎麼會寫成這樣".
  const fromDisplay = displayScore(event.from_score)
  const toDisplay = displayScore(event.to_score)
  const displayDelta = toDisplay - fromDisplay

  const directionLabel = isDown
    ? t('dashboard.pointDecrease').replace('{n}', String(Math.abs(displayDelta)))
    : t('dashboard.pointIncrease').replace('{n}', String(Math.abs(displayDelta)))

  return (
    <Box ref={cardRef} sx={{
      px: 1.5, py: 1.25,
      borderRadius: 1.5,
      bgcolor: highlighted ? `${color}14` : 'background.paper',
      border: '1px solid',
      borderColor: highlighted ? color : 'divider',
      borderLeft: '3px solid',
      borderLeftColor: color,
      transition: 'background-color 150ms, border-color 150ms, box-shadow 150ms',
      boxShadow: highlighted ? `0 0 0 2px ${color}24` : undefined,
      display: 'flex', flexDirection: 'column', gap: 0.5,
    }}>
      {/* Row 1: date + delta chip on the same line. Tight enough that
          "May 18  •  ▲ 1 point" reads as a headline at a glance. */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.secondary' }}>
          {fmtDate(event.date)}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {isDown
            ? <TrendingDown size={12} style={{ color }} />
            : <TrendingUp size={12} style={{ color }} />}
          <Typography sx={{ fontSize: 12, color, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {directionLabel}
          </Typography>
        </Box>
      </Box>

      {/* Row 2: big from→to scores. Flyto2 250-900 / 10-pt
          display scale — displayScore(raw) maps the engine's 0-100
          raw score to the operator-facing display number. */}
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
        <Typography sx={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'text.primary' }}>
          {fromDisplay}
        </Typography>
        <ArrowRight size={14} style={{ opacity: 0.45 }} />
        <Typography sx={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color }}>
          {toDisplay}
        </Typography>
      </Box>

      {/* Reasons block — always rendered (empty array → an em-dash
          line so card height stays stable even when backend has
          no per-category breakdown). Reasons are capped to 2
          visible by default; the "+N more" toggle expands inline
          without changing card position. */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, mt: 0.25 }}>
        {visibleReasons.length === 0 ? (
          <Typography sx={{ fontSize: 12, color: 'text.secondary', fontStyle: 'italic' }}>
            {t('dashboard.noReasonsAvailable')}
          </Typography>
        ) : (
          visibleReasons.map((r, i) => (
            <Typography
              key={i}
              sx={{
                fontSize: 12, color: 'text.secondary', lineHeight: 1.45,
                overflow: 'hidden', textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}
            >
              {r}
            </Typography>
          ))
        )}
        {extraCount > 0 && (
          <Typography
            component="button"
            onClick={() => setExpanded(v => !v)}
            sx={{
              alignSelf: 'flex-start',
              fontSize: 12, fontWeight: 700, color, cursor: 'pointer',
              border: 'none', background: 'transparent', p: 0, mt: 0.25,
              '&:hover': { textDecoration: 'underline' },
            }}
          >
            {expanded
              ? t('dashboard.showLess')
              : t('dashboard.showNMore').replace('{n}', String(extraCount))}
          </Typography>
        )}
      </Box>
    </Box>
  )
}

/** SVG-based trend chart with grade band backgrounds + hover tooltip */
function TrendChart({ entries, selectedPoint, onSelectPoint }: {
  entries: UnifiedScoreEntry[]
  selectedPoint: number | null
  onSelectPoint: (i: number | null) => void
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const W = 800, H = 360
  const PAD = { top: 20, right: 20, bottom: 40, left: 50 }
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  // Y scale: 250-900
  const yMin = 250, yMax = 900
  const toY = (display: number) => PAD.top + plotH - ((display - yMin) / (yMax - yMin)) * plotH
  const toX = (i: number) => PAD.left + (i / Math.max(entries.length - 1, 1)) * plotW

  // Y-axis labels
  const yTicks = [300, 400, 500, 600, 700, 800, 900]

  // X-axis labels (show ~6 dates)
  const xStep = Math.max(1, Math.floor(entries.length / 6))
  const xLabels = entries.filter((_, i) => i % xStep === 0 || i === entries.length - 1)
    .map((e) => ({ idx: entries.indexOf(e), label: fmtShortDate(e.computedAt) }))

  // Path
  const pathD = entries.map((e, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(e.overallDisplay).toFixed(1)}`).join(' ')

  // Direction-based line color so up/down reads at a glance
  // (operator 2026-05-22: "可以明確知道上升還下降").
  // Compares overall trend across the entire window — first vs last.
  const overallDelta = entries.length >= 2
    ? entries[entries.length - 1].overallDisplay - entries[0].overallDisplay
    : 0
  const lineColor = overallDelta > 0 ? '#22c55e' : overallDelta < 0 ? '#ef4444' : '#8b5cf6'

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {/* Grade band backgrounds — opacity 0.06 → 0.16 so the
          colour reads as a real region not a barely-tinted smear
          (operator 2026-05-22: "展開的顏色不是很清楚"). */}
      {GRADE_BANDS.map(b => {
        const y1 = toY(Math.min(b.max, yMax))
        const y2 = toY(Math.max(b.min, yMin))
        return (
          <rect key={b.grade} x={PAD.left} y={y1} width={plotW} height={y2 - y1}
            fill={b.color} opacity={0.16} />
        )
      })}

      {/* Grade letter on right edge of each band — orienting tag
          so "this slice = A grade" reads without consulting the
          legend at the bottom. */}
      {GRADE_BANDS.map(b => {
        const yMid = (toY(Math.min(b.max, yMax)) + toY(Math.max(b.min, yMin))) / 2
        return (
          <text key={'lbl-' + b.grade} x={W - PAD.right - 6} y={yMid + 5}
            textAnchor="end" fill={b.color} fontSize={13} fontWeight={800}
            opacity={0.7}>
            {b.grade}
          </text>
        )
      })}

      {/* Grid lines */}
      {yTicks.map(v => (
        <line key={v} x1={PAD.left} x2={W - PAD.right} y1={toY(v)} y2={toY(v)}
          stroke="var(--mui-palette-divider, rgba(255,255,255,0.06))" strokeDasharray="3,3" />
      ))}

      {/* Y-axis labels */}
      {yTicks.map(v => (
        <text key={v} x={PAD.left - 8} y={toY(v) + 4} textAnchor="end"
          fill="var(--mui-palette-text-secondary, #94a3b8)" fontSize={12} fontWeight={600}>
          {v}
        </text>
      ))}

      {/* X-axis labels */}
      {xLabels.map(({ idx, label }) => (
        <text key={idx} x={toX(idx)} y={H - 8} textAnchor="middle"
          fill="var(--mui-palette-text-secondary, #94a3b8)" fontSize={12}>
          {label}
        </text>
      ))}

      {/* Area fill UNDER the line — soft direction-tinted gradient
          so the trend reads even when the line itself is partly
          occluded by a marker cluster. */}
      <defs>
        <linearGradient id="trendLineFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity={0.22} />
          <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
        </linearGradient>
      </defs>
      {entries.length >= 2 && (() => {
        const areaPath = pathD + ` L ${toX(entries.length - 1).toFixed(1)},${(H - PAD.bottom).toFixed(1)} L ${toX(0).toFixed(1)},${(H - PAD.bottom).toFixed(1)} Z`
        return <path d={areaPath} fill="url(#trendLineFill)" />
      })()}

      {/* White halo stroke UNDER the colored line — gives the line
          a contrast edge so the markers don't visually swallow it
          on any band background. */}
      <path d={pathD} fill="none" stroke="var(--mui-palette-background-paper, #ffffff)" strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
      {/* Line — bumped 2.5 → 3.5 stroke. Color follows overall
          direction (green up / red down / violet flat). */}
      <path d={pathD} fill="none" stroke={lineColor} strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />

      {/* Data points — markers ONLY where they tell the operator
          something:
            * always: hover / selected (interaction feedback)
            * always: start + end (anchors)
            * ~6 evenly-spaced markers (timeline orientation, like
              the X-axis labels)
            * any data point that maps to a grade change (sampled
              from the events feed — operator reads "this dot =
              event happened here")
          Earlier impl rendered a marker per daily entry which
          turned the line into a row of 90 dots; the line itself
          was hidden underneath (operator 2026-05-23: "線都看不清了").
       */}
      {(() => {
        const N = entries.length
        if (N === 0) return null
        const sampleStep = Math.max(1, Math.floor(N / 6))
        const visible = new Set<number>()
        visible.add(0)
        visible.add(N - 1)
        for (let i = 0; i < N; i += sampleStep) visible.add(i)
        if (hoverIdx !== null) visible.add(hoverIdx)
        if (selectedPoint !== null) visible.add(selectedPoint)
        return entries.map((e, i) => {
          if (!visible.has(i)) return null
          const cx = toX(i)
          const cy = toY(e.overallDisplay)
          const isActive = selectedPoint === i || hoverIdx === i
          const gradeColor = GRADE_BANDS.find(b => e.overallDisplay >= b.min && e.overallDisplay < b.max)?.color ?? '#8b5cf6'
          return (
            <g key={i}
              onClick={() => onSelectPoint(selectedPoint === i ? null : i)}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              style={{ cursor: 'pointer' }}
            >
              {isActive && <circle cx={cx} cy={cy} r={14} fill={gradeColor} opacity={0.18} />}
              <circle cx={cx} cy={cy} r={isActive ? 6 : 4} fill={gradeColor} stroke="var(--mui-palette-background-paper, #1e1e2e)" strokeWidth={2} />
            </g>
          )
        })
      })()}

      {/* Invisible wide hover targets across the whole chart width
          so clicking ANY column (not just the visible marker)
          selects the nearest data point. Width = plotW / N to
          tile across cleanly. */}
      {entries.length > 0 && entries.map((_, i) => {
        const slotW = plotW / Math.max(entries.length - 1, 1)
        return (
          <rect
            key={`hit-${i}`}
            x={toX(i) - slotW / 2}
            y={PAD.top}
            width={slotW}
            height={plotH}
            fill="transparent"
            onClick={() => onSelectPoint(selectedPoint === i ? null : i)}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
            style={{ cursor: 'pointer' }}
          />
        )
      })}

      {/* Hover tooltip */}
      {hoverIdx !== null && (() => {
        const e = entries[hoverIdx]
        const prev = hoverIdx > 0 ? entries[hoverIdx - 1] : null
        const cx = toX(hoverIdx)
        const cy = toY(e.overallDisplay)
        const delta = prev ? e.overallDisplay - prev.overallDisplay : 0
        const tooltipW = 160
        const tooltipH = prev ? 56 : 36
        // Position tooltip above the point, flip if too close to top
        const tx = Math.max(PAD.left, Math.min(cx - tooltipW / 2, W - PAD.right - tooltipW))
        const ty = cy - tooltipH - 16 > PAD.top ? cy - tooltipH - 16 : cy + 16
        return (
          <foreignObject x={tx} y={ty} width={tooltipW} height={tooltipH} style={{ pointerEvents: 'none' }}>
            <div style={{
              background: 'var(--mui-palette-background-paper, #1e1e2e)',
              border: '1px solid var(--mui-palette-divider, rgba(255,255,255,0.1))',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--mui-palette-text-primary, #e2e8f0)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
              textAlign: 'center',
              lineHeight: 1.6,
            }}>
              {prev ? (
                <>
                  <span>{prev.overallDisplay}</span>
                  <span style={{ opacity: 0.4, margin: '0 4px' }}>→</span>
                  <span>{e.overallDisplay}</span>
                  <br />
                  <span style={{ color: delta > 0 ? '#22c55e' : delta < 0 ? '#ef4444' : '#94a3b8', fontSize: 13 }}>
                    {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} {Math.abs(delta)} point {delta > 0 ? 'increase' : delta < 0 ? 'decrease' : 'no change'}
                  </span>
                </>
              ) : (
                <span>{e.overallDisplay} ({e.overallGrade})</span>
              )}
            </div>
          </foreignObject>
        )
      })()}
    </svg>
  )
}

// ── Helpers ──

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}
