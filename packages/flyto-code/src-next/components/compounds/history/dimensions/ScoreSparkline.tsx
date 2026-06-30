import { useMemo } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { FeedItem } from '@lib/engine'
import { t } from '@lib/i18n';

// ScoreSparkline — compact SVG line chart of the unified score
// over time. Returns null when there's fewer than 2 score events
// (a 1-point "line" is just a dot, no story).
//
// Renders bare — the parent's `SectionCard` provides the panel
// chrome. Self-wrapping in `CARD_SX` was duplicating frames.

export function ScoreSparkline({ items }: { items: FeedItem[] }) {
  const scores = useMemo(() => {
    return items
      .filter(i => i.kind === 'score' && typeof i.payload?.score === 'number')
      .map(i => ({ t: new Date(i.recorded_at).getTime(), v: Number(i.payload!.score) }))
      .sort((a, b) => a.t - b.t)
  }, [items])

  if (scores.length < 2) {
    return (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {t('history.scoreSparklineEmpty')}
      </Typography>
    )
  }

  const w = 600, h = 80, pad = 4
  const minV = Math.min(...scores.map(s => s.v))
  const maxV = Math.max(...scores.map(s => s.v))
  const minT = scores[0].t
  const maxT = scores[scores.length - 1].t
  const x = (t: number) => pad + ((t - minT) / Math.max(1, maxT - minT)) * (w - 2 * pad)
  const y = (v: number) => h - pad - ((v - minV) / Math.max(1, maxV - minV)) * (h - 2 * pad)

  const path = scores.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(s.t).toFixed(1)},${y(s.v).toFixed(1)}`).join(' ')
  const lastV = scores[scores.length - 1].v
  const firstV = scores[0].v
  const trend = lastV - firstV
  // Use the brand accent for flat trends so the chart doesn't flash
  // semantic red/green when nothing moved.
  const trendColor = trend > 0 ? '#22c55e' : trend < 0 ? '#ef4444' : 'var(--exp-accent)'

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.75 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {firstV} → <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{lastV}</Box>
          {' '}({trend >= 0 ? '+' : ''}{trend})
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
          {scores.length} {t('history.snapshots')} · range {minV}–{maxV}
        </Typography>
      </Box>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        <path d={path + ` L${x(maxT).toFixed(1)},${h - pad} L${x(minT).toFixed(1)},${h - pad} Z`} fill={trendColor} fillOpacity="0.12" />
        <path d={path} fill="none" stroke={trendColor} strokeWidth="2" />
        {scores.map((s, i) => (
          <circle key={i} cx={x(s.t)} cy={y(s.v)} r={i === scores.length - 1 ? 3.5 : 2} fill={trendColor} />
        ))}
      </svg>
    </Box>
  )
}
