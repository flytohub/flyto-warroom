/**
 * techConsole — shared "SOC / war-room console" visual language for the
 * scoring + history surfaces (Compliance, Score Trends, Timeline Center, …).
 *
 * The pages were clean-but-flat MUI. Operator wanted them to
 * read "more tech / 資安 / hacker" without bloating layout (no giant
 * gradient heroes — see the PostureOverview slim-hero precedent). This
 * module is the one place that treatment lives so every view
 * stays consistent:
 *
 *   - MONO            monospace stack for codes + numerals (terminal feel)
 *   - techGrid(dark)  faint SOC dot-grid + scanline on a ::before, theme-aware
 *   - techTile(c,d)   per-metric console card sx (top hairline + hover glow)
 *   - <TechEyebrow>   mono brand badge for the page header
 *   - <ConsoleSectionLabel>  glowing-dot mono section divider
 *
 * Dual-mode safe (light + dark), semantic tokens, no hardcoded page bg.
 */

import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { colors, softBg } from '@/styles/designTokens'

export const MONO = 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace'
export const BRAND = colors.brandDeep

/** Faint SOC-console grid + violet scanline, rendered on a ::before so
 *  content stays untinted. Top-fade mask keeps it subtle. */
export function techGrid(dark: boolean) {
  const dot = dark ? softBg(colors.semantic.neutral, 0.10) : softBg(colors.severity.low, 0.07)
  const line = dark ? softBg(colors.brandDeep, 0.07) : softBg(colors.brandDeep, 0.05)
  return {
    position: 'relative' as const,
    overflow: 'hidden',
    '&::before': {
      content: '""',
      position: 'absolute' as const,
      inset: 0,
      pointerEvents: 'none' as const,
      backgroundImage: [
        `radial-gradient(circle at 1px 1px, ${dot} 1px, transparent 1.5px)`,
        `repeating-linear-gradient(90deg, ${line} 0 1px, transparent 1px 88px)`,
      ].join(','),
      backgroundSize: '22px 22px, 88px 100%',
      maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.85), transparent 92%)',
      WebkitMaskImage: 'linear-gradient(180deg, rgba(0,0,0,0.85), transparent 92%)',
      zIndex: 0,
    },
  }
}

/** Per-tile console treatment: a coloured top hairline + soft glow on
 *  hover. Spread into a StatTile's `sx`. */
export function techTile(color: string, dark: boolean) {
  return {
    position: 'relative' as const,
    overflow: 'hidden',
    bgcolor: dark ? 'rgba(255,255,255,0.012)' : 'background.paper',
    transition: 'border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease',
    '&::before': {
      content: '""',
      position: 'absolute' as const,
      top: 0, left: 0, right: 0, height: 2,
      background: `linear-gradient(90deg, ${color}, ${color}00 85%)`,
    },
    '& .MuiTypography-root': { fontVariantNumeric: 'tabular-nums' },
    '&:hover': {
      borderColor: `${color}55`,
      boxShadow: `0 0 0 1px ${color}22, 0 6px 18px -10px ${color}77`,
      transform: 'translateY(-1px)',
    },
  }
}

/** Mono brand badge for a page header (e.g. "POSTURE MATRIX"). */
export function TechEyebrow({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <Box component="span" sx={{
      fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
      color: BRAND, px: 1, py: 0.25, borderRadius: 1,
      border: `1px solid ${BRAND}3a`, bgcolor: `${BRAND}14`,
      display: 'inline-flex', alignItems: 'center', gap: 0.5, whiteSpace: 'nowrap',
    }}>
      {icon}
      {children}
    </Box>
  )
}

/** Glowing-dot mono section divider with a fading hairline. */
export function ConsoleSectionLabel({ label, suffix }: { label: string; suffix?: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
      <Box sx={{ width: 6, height: 6, borderRadius: '2px', bgcolor: BRAND, boxShadow: `0 0 6px ${BRAND}`, flexShrink: 0 }} />
      <Typography variant="caption" fontWeight={700} sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: MONO, whiteSpace: 'nowrap' }}>
        {label}
      </Typography>
      {suffix != null && (
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500, fontFamily: MONO, whiteSpace: 'nowrap' }}>
          · {suffix}
        </Typography>
      )}
      <Box sx={{ flex: 1, height: '1px', background: (t) => `linear-gradient(90deg, ${t.palette.divider}, transparent)` }} />
    </Box>
  )
}
