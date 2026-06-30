import { alpha, type Theme } from '@mui/material/styles'

function ink(theme: Theme) {
  return theme.palette.mode === 'dark' ? theme.palette.common.white : theme.palette.common.black
}

export function coverageBorder(theme: Theme, strength: 'muted' | 'normal' = 'normal') {
  const dark = theme.palette.mode === 'dark'
  const opacity = strength === 'muted'
    ? (dark ? 0.1 : 0.06)
    : (dark ? 0.16 : 0.08)
  return alpha(ink(theme), opacity)
}

export function coverageSurface(theme: Theme) {
  return theme.palette.mode === 'dark'
    ? alpha(theme.palette.background.paper, 0.9)
    : theme.palette.background.paper
}

export function coverageSubtleSurface(theme: Theme) {
  return theme.palette.mode === 'dark'
    ? alpha(theme.palette.common.white, 0.045)
    : alpha(theme.palette.common.black, 0.025)
}

export function coverageTintSurface(theme: Theme, tone: string) {
  return alpha(tone, theme.palette.mode === 'dark' ? 0.1 : 0.065)
}

export function coverageToneBorder(theme: Theme, tone: string) {
  return alpha(tone, theme.palette.mode === 'dark' ? 0.34 : 0.26)
}

export function coverageProgressTrack(theme: Theme) {
  return alpha(ink(theme), theme.palette.mode === 'dark' ? 0.16 : 0.08)
}
