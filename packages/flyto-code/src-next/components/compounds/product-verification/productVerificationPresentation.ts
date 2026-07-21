import { alpha, type Theme } from '@mui/material/styles'

export const verificationStatusColor: Record<string, 'default' | 'primary' | 'success' | 'error' | 'warning'> = {
  dispatched: 'primary',
  running: 'primary',
  complete: 'success',
  pass: 'success',
  passed: 'success',
  failed: 'error',
  fail: 'error',
  blocked: 'error',
  planned: 'warning',
}

export function resolveVerificationToneColor(theme: Theme, tone: string) {
  switch (tone) {
    case 'success.main':
      return theme.palette.success.main
    case 'warning.main':
      return theme.palette.warning.main
    case 'error.main':
      return theme.palette.error.main
    case 'info.main':
      return theme.palette.info.main
    case 'text.secondary':
      return theme.palette.text.secondary
    case 'text.primary':
      return theme.palette.text.primary
    case 'primary.main':
    default:
      return theme.palette.primary.main
  }
}

export function verificationScanline(theme: Theme) {
  return `linear-gradient(90deg, ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.07 : 0.035)} 1px, transparent 1px)`
}
