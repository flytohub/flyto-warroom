/**
 * ManagerHero — the configurable focal band a manager page drops into
 * ManagerDashboard's `hero` slot. It gives every page ONE dominant
 * element (the 重點) with a consistent, accent-driven treatment so the
 * pages stop looking interchangeable WITHOUT each one hand-rolling a
 * bespoke layout.
 *
 * Composition, three optional regions in a responsive row:
 *   [ visual ]   [ headline + delta + sub ]   [ aside ]
 *
 *   - `visual`   — a gauge / ring / donut / globe (left, fixed-ish width)
 *   - `headline` — the page's signature number + label (always present)
 *   - `aside`    — supporting stats, a spotlight subject, a mini-rail
 *
 * Dual-mode safe: `accent` supplies only a hue; surfaces come from the
 * theme. Big numbers are monospace + tabular for a "console" read.
 */

import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { alpha, useTheme } from '@mui/material/styles'

export interface ManagerHeroHeadline {
  /** The dominant value — a score, count, $ figure, %, grade. */
  value: ReactNode
  /** Caption under/above the value. */
  label: ReactNode
  /** Optional unit shown next to the value. */
  unit?: ReactNode
  /** Optional delta / direction chip (e.g. +47 ↑). */
  delta?: ReactNode
  /** Optional supporting line under the headline. */
  sub?: ReactNode
}

export interface ManagerHeroProps {
  accent: string
  headline: ManagerHeroHeadline
  /** Left focal visual (gauge / ring / donut / map). */
  visual?: ReactNode
  /** Right supporting region (stats, spotlight subject, mini rail). */
  aside?: ReactNode
  /** Small lucide icon shown in a tinted chip above the label. */
  icon?: ReactNode
  /** Tone the big value with the accent (default true). */
  tintValue?: boolean
  /** Min height of the band. Default 180. */
  minHeight?: number
}

export function ManagerHero({
  accent, headline, visual, aside, icon, tintValue = true, minHeight = 180,
}: ManagerHeroProps) {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  const valueIsLongText = typeof headline.value === 'string' && headline.value.length > 18
  const hasAllRegions = Boolean(visual && aside)

  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: {
        xs: 'minmax(0, 1fr)',
        md: hasAllRegions ? 'minmax(140px, 190px) minmax(0, 1fr)' : visual ? 'minmax(150px, 220px) minmax(0, 1fr)' : aside ? 'minmax(0, 1fr) minmax(210px, 280px)' : 'minmax(0, 1fr)',
        xl: hasAllRegions ? 'minmax(140px, 190px) minmax(0, 1fr) minmax(190px, 260px)' : visual ? 'minmax(150px, 220px) minmax(0, 1fr)' : aside ? 'minmax(0, 1fr) minmax(210px, 280px)' : 'minmax(0, 1fr)',
      },
      alignItems: 'center',
      gap: { xs: 1.5, md: 2 },
      minHeight,
      minWidth: 0,
    }}>
      {visual && (
        <Box sx={{
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: 'stretch',
          '& > *': { minWidth: 0, maxWidth: '100%' },
        }}>
          {visual}
        </Box>
      )}

      <Box sx={{
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
        ...(valueIsLongText && { alignSelf: 'center' }),
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {icon && (
            <Box sx={{
              width: 26, height: 26, borderRadius: 1, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: alpha(accent, dark ? 0.16 : 0.1), color: accent,
            }}>
              {icon}
            </Box>
          )}
          <Typography sx={{
            fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'text.secondary',
          }}>
            {headline.label}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
          <Typography sx={{
            fontFamily: 'ui-monospace, monospace',
            fontSize: valueIsLongText ? { xs: 27, md: hasAllRegions ? 30 : 34 } : { xs: 40, md: 52 },
            fontWeight: 800,
            lineHeight: valueIsLongText ? 1.12 : 1,
            color: tintValue ? accent : 'text.primary',
            textShadow: tintValue ? `0 0 28px ${alpha(accent, 0.35)}` : 'none',
            maxWidth: '100%',
            overflowWrap: 'anywhere',
            wordBreak: valueIsLongText ? 'break-word' : 'normal',
          }}>
            {headline.value}
          </Typography>
          {headline.unit && (
            <Typography sx={{ fontSize: 18, fontWeight: 700, color: 'text.secondary' }}>
              {headline.unit}
            </Typography>
          )}
          {headline.delta && <Box sx={{ ml: 0.5 }}>{headline.delta}</Box>}
        </Box>

        {headline.sub && (
          <Typography sx={{ fontSize: 13.5, color: 'text.secondary', lineHeight: 1.5, maxWidth: 560 }}>
            {headline.sub}
          </Typography>
        )}
      </Box>

      {aside && (
        <Box sx={{
          minWidth: 0,
          gridColumn: hasAllRegions ? { md: '1 / -1', xl: 'auto' } : 'auto',
          borderTop: hasAllRegions ? { md: `1px solid ${alpha(theme.palette.text.primary, dark ? 0.12 : 0.08)}`, xl: 0 } : 0,
          borderLeft: { md: hasAllRegions ? 0 : `1px solid ${alpha(theme.palette.text.primary, dark ? 0.12 : 0.08)}`, xl: `1px solid ${alpha(theme.palette.text.primary, dark ? 0.12 : 0.08)}` },
          pt: hasAllRegions ? { md: 1.25, xl: 0 } : 0,
          pl: { md: hasAllRegions ? 0 : 2, xl: 2 },
        }}>
          {aside}
        </Box>
      )}
    </Box>
  )
}

/** HeroStat — a compact labelled stat for the hero's `aside` region.
 *  Stack several in a column for a "supporting metrics" rail. */
export function HeroStat({
  label, value, tone, icon,
}: { label: ReactNode; value: ReactNode; tone?: string; icon?: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.6 }}>
      {icon && <Box sx={{ color: tone ?? 'text.secondary', display: 'flex', flexShrink: 0 }}>{icon}</Box>}
      <Typography sx={{
        fontFamily: 'ui-monospace, monospace', fontSize: 18, fontWeight: 800,
        color: tone ?? 'text.primary', minWidth: 44,
      }}>
        {value}
      </Typography>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </Typography>
    </Box>
  )
}
