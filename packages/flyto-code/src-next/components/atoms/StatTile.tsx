import type { ReactNode } from 'react'
import { Box, Paper, Skeleton, Typography } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'

/**
 * StatTile — the single metric-card primitive.
 *
 * Was previously: every domain hand-rolled its own labelled metric box
 * (CloudPostureView `Metric`, ScoreTrendsView `StatCard`,
 * ComplianceDashboardView `StatCard`, ScoreTrendPage `StatCard`, …) —
 * same job, a different padding / value size / label style each time.
 * One product, half a dozen metric-card dialects.
 *
 * This is the one true labelled-metric card. Three orientations cover
 * every observed shape:
 *
 *   stacked (default)         horizontal              centered
 *   ┌──────────────┐          ┌──────────────┐        ┌──────────────┐
 *   │ LABEL        │          │ ⬡  42        │        │     42       │
 *   │ 42           │          │    label sub │        │    label     │
 *   │ sub          │          └──────────────┘        └──────────────┘
 *   └──────────────┘
 *
 * NOT for: the exposure CSS-grid KPI row (`KpiTile`/`KpiRow` — its own
 * visual system) or the compact "icon · label · value-right" status
 * ROW in ArchOverview (that's a row, not a card). Use those where they
 * already live; this atom is the standalone metric CARD.
 */

export type StatTileOrientation = 'stacked' | 'horizontal' | 'centered'

export interface StatTileProps {
  /** Caption. Rendered uppercase in `stacked`, natural-case otherwise. */
  label: string
  /** Big number / text. Strings (e.g. "N/A", "C") render verbatim. */
  value: number | string
  /** Optional secondary line beneath the value/label. */
  sub?: ReactNode
  /** Pre-rendered icon node (e.g. `<Shield size={18} />`). */
  icon?: ReactNode
  /** Colour applied to value + icon. Defaults to primary text colour. */
  color?: string
  orientation?: StatTileOrientation
  /** Value font size in px. Default 28. */
  valueSize?: number
  /** Show a skeleton in place of the value while data loads. */
  loading?: boolean
  /** Min card width (keeps a row of tiles from collapsing). */
  minWidth?: number
  /** Let the tile grow to share row width. Default true. */
  grow?: boolean
  /** Optional trailing slot (e.g. a grade chip, delta arrows). */
  trailing?: ReactNode
  sx?: SxProps<Theme>
}

export function StatTile({
  label, value, sub, icon, color,
  orientation = 'stacked', valueSize = 28, loading = false,
  minWidth, grow = true, trailing, sx,
}: StatTileProps) {
  const valueColor = color ?? 'text.primary'

  const valueNode = loading ? (
    <Skeleton variant="text" width={80} height={valueSize * 1.3} />
  ) : (
    <Typography
      sx={{
        fontSize: valueSize, fontWeight: 700, lineHeight: 1.15,
        color: valueColor, fontVariantNumeric: 'tabular-nums',
      }}
    >
      {value}
    </Typography>
  )

  const labelNode = (
    <Typography
      variant="caption"
      color="text.secondary"
      sx={
        orientation === 'stacked'
          ? { textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, display: 'block' }
          : { fontSize: 13 }
      }
    >
      {label}
    </Typography>
  )

  const subNode = sub != null && (
    <Typography variant="body2" color="text.secondary">{sub}</Typography>
  )

  let body: ReactNode
  if (orientation === 'horizontal') {
    body = (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        {icon && <Box sx={{ color: valueColor, display: 'flex', flexShrink: 0 }}>{icon}</Box>}
        <Box sx={{ minWidth: 0 }}>
          {valueNode}
          {labelNode}
          {subNode}
        </Box>
        {trailing}
      </Box>
    )
  } else if (orientation === 'centered') {
    body = (
      <Box sx={{ textAlign: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 1 }}>
          {valueNode}
          {trailing}
        </Box>
        {labelNode}
        {subNode}
      </Box>
    )
  } else {
    body = (
      <>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          {labelNode}
          {trailing}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
          {icon && <Box sx={{ color: valueColor, display: 'flex', flexShrink: 0 }}>{icon}</Box>}
          {valueNode}
        </Box>
        {subNode}
      </>
    )
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2, borderColor: 'divider', borderRadius: 2,
        ...(grow ? { flex: 1 } : null),
        ...(minWidth != null ? { minWidth } : null),
        ...sx,
      }}
    >
      {body}
    </Paper>
  )
}
