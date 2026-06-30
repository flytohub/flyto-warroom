/**
 * KpiCard — a manager-grade metric tile.
 *
 *   - Animated count-up of the main value (motion).
 *   - Optional unit suffix.
 *   - Optional delta vs previous period (up/down arrow + token color).
 *   - Optional inline sparkline (tiny themed area chart).
 *   - Optional onClick drilldown (renders as a button surface).
 *   - Loading skeleton + empty state.
 *
 * No inline hex — up/down/neutral colors come from severity tokens
 * (good = green token, bad = red token). For KPIs where "up is bad"
 * (e.g. open criticals), pass `invertDelta`.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import { alpha, useTheme } from '@mui/material/styles'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { animate } from 'motion/react'
import Chart from 'react-apexcharts'
import type { ApexOptions } from 'apexcharts'
import { SEVERITY_TONE, GRADE_TONE } from '@lib/tokens/severity'
import { flytoRadii, flytoSpacing, flytoTypography } from '@/styles/visualSystem'

export interface KpiCardProps {
  label: string
  /** Main metric. Pass a number for count-up; strings render as-is. */
  value: number | string | null | undefined
  unit?: string
  /** Previous-period value for delta computation. */
  previous?: number | null
  /** When true, a positive delta is "bad" (red) — e.g. open criticals. */
  invertDelta?: boolean
  /** Tiny sparkline series (recent history). */
  sparkline?: number[]
  /** Drilldown handler — turns the card into a clickable surface. */
  onClick?: () => void
  loading?: boolean
  /** Force the empty state (e.g. metric not available for this org). */
  empty?: boolean
  emptyHint?: string
  /** Optional precision for count-up + delta. Default 0. */
  precision?: number
  /** Optional lucide icon — rendered in a tinted chip beside the label.
   *  Purely decorative scannability cue; no layout cost when omitted. */
  icon?: ReactNode
  /** Optional accent color (severity/grade token). When set, the card
   *  gets a left accent bar, a tone-tinted icon chip, and a tone-colored
   *  value — used to make hero/at-risk tiles read at a glance. Omit for
   *  the default neutral tile (backwards-compatible). */
  tone?: string
}

const GOOD = GRADE_TONE.good.tone
const BAD = SEVERITY_TONE.critical.tone
const NEUTRAL = SEVERITY_TONE[''].tone

function useCountUp(target: number | null, precision: number): string {
  const [display, setDisplay] = useState(0)
  const prev = useRef(0)
  useEffect(() => {
    if (target == null) return
    const controls = animate(prev.current, target, {
      duration: 0.8,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(v),
    })
    prev.current = target
    return () => controls.stop()
  }, [target])
  if (target == null) return '—'
  return display.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  })
}

export function KpiCard({
  label,
  value,
  unit,
  previous,
  invertDelta,
  sparkline,
  onClick,
  loading,
  empty,
  emptyHint,
  precision = 0,
  icon,
  tone,
}: KpiCardProps) {
  const theme = useTheme()
  const numeric = typeof value === 'number' ? value : null
  const counted = useCountUp(numeric, precision)

  // Delta math
  let deltaNode: React.ReactNode = null
  if (numeric != null && previous != null && previous !== 0) {
    const diff = numeric - previous
    const pct = (diff / Math.abs(previous)) * 100
    const rising = diff > 0
    const flat = diff === 0
    const isGood = flat ? null : invertDelta ? !rising : rising
    const color = flat ? NEUTRAL : isGood ? GOOD : BAD
    const Icon = flat ? Minus : rising ? ArrowUpRight : ArrowDownRight
    deltaNode = (
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, color, fontSize: 12, fontWeight: 600 }}>
        <Icon size={14} />
        {Math.abs(pct).toFixed(1)}%
      </Box>
    )
  }

  const sparkOptions: ApexOptions = {
    chart: { sparkline: { enabled: true }, animations: { enabled: false } },
    stroke: { curve: 'smooth', width: 2 },
    fill: { type: 'gradient', gradient: { opacityFrom: 0.3, opacityTo: 0 } },
    colors: [theme.palette.primary.main],
    tooltip: { enabled: false },
  }

  const interactive = !!onClick && !loading && !empty

  return (
    <Card
      onClick={interactive ? onClick : undefined}
      sx={{
        p: flytoSpacing.surfacePadding.regular,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        borderRadius: flytoRadii.surface,
        cursor: interactive ? 'pointer' : 'default',
        transition: 'border-color .2s, box-shadow .2s',
        border: `1px solid ${alpha(theme.palette.text.primary, 0.06)}`,
        // Tone accent: a left bar + faint tonal wash so hero / at-risk
        // tiles stand apart from neutral metrics without a heavy fill.
        ...(tone && {
          borderLeft: `3px solid ${alpha(tone, 0.7)}`,
          background: `linear-gradient(90deg, ${alpha(tone, theme.palette.mode === 'dark' ? 0.10 : 0.06)} 0%, transparent 42%)`,
        }),
        // Static hover — NO transform of any kind. The card must not move
        // or resize on hover (any position/size change reads as layout
        // shift). Interactive cue is border-color + a soft shadow ring
        // only; the card stays exactly in place.
        ...(interactive && {
          '&:hover': {
            borderColor: alpha(tone ?? theme.palette.primary.main, 0.6),
            boxShadow: `0 0 0 1px ${alpha(tone ?? theme.palette.primary.main, 0.35)}`,
          },
        }),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="caption" sx={{ ...flytoTypography.metricLabel, color: theme.palette.text.secondary }}>
          {label}
        </Typography>
        {icon && (
          <Box
            sx={{
              width: 28,
              height: 28,
              flexShrink: 0,
              borderRadius: flytoRadii.icon,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: alpha(tone ?? theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.16 : 0.09),
              color: tone ?? theme.palette.text.secondary,
            }}
          >
            {icon}
          </Box>
        )}
      </Box>

      {loading ? (
        <>
          <Skeleton variant="text" width="60%" height={40} />
          <Skeleton variant="rounded" width="100%" height={36} />
        </>
      ) : empty ? (
        <Box sx={{ py: 1 }}>
          <Typography variant="h4" sx={{ ...flytoTypography.metricValue, color: theme.palette.text.disabled }}>
            —
          </Typography>
          {emptyHint && (
            <Typography variant="caption" sx={{ ...flytoTypography.metricLabel, color: theme.palette.text.disabled }}>
              {emptyHint}
            </Typography>
          )}
        </Box>
      ) : (
        <>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, flexWrap: 'wrap' }}>
            <Typography variant="h4" sx={{ ...flytoTypography.metricValue, color: tone ?? 'text.primary' }}>
              {numeric != null ? counted : (value ?? '—')}
            </Typography>
            {unit && (
              <Typography variant="body2" sx={{ color: theme.palette.text.secondary, fontWeight: 600 }}>
                {unit}
              </Typography>
            )}
            {deltaNode}
          </Box>
          {sparkline && sparkline.length > 1 && (
            <Box sx={{ mt: 'auto' }}>
              <Chart type="area" height={40} series={[{ name: label, data: sparkline }]} options={sparkOptions} />
            </Box>
          )}
        </>
      )}
    </Card>
  )
}
