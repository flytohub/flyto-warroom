/**
 * IssueHelpers — utility functions and sub-components for IssuesView.
 * Extracted from IssuesView.tsx to reduce file size.
 */

import { useState } from 'react'
import { Play, AlarmClock, EyeOff, CheckCircle } from 'lucide-react'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import CircularProgress from '@mui/material/CircularProgress'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import { t } from '@lib/i18n';
import type { SecurityIssue, EnrichedSecurityIssue } from '@lib/engine'

export function getTypeBadge(issue: SecurityIssue): { label: string; color: 'error' | 'warning' | 'info' | 'success' | 'default' } {
  if (issue.type === 'secret') return { label: t('hardcoded.key.color.warning.db8437eb'), color: 'warning' }
  if (issue.type === 'security_finding') return { label: t('hardcoded.sec.color.error.67166728'), color: 'error' }
  const pkg = issue.package ?? ''
  if (pkg.includes('/') && !pkg.startsWith('@')) return { label: t('hardcoded.go.color.info.3470a99f'), color: 'info' }
  if (pkg.startsWith('@') || pkg.includes('node') || pkg.includes('express') || pkg.includes('webpack'))
    return { label: t('hardcoded.js.color.success.f955cc29'), color: 'success' }
  if (pkg.includes('crate') || pkg.includes('tokio') || pkg.includes('serde'))
    return { label: t('hardcoded.rs.color.default.b85a7a2d'), color: 'default' }
  return { label: t('hardcoded.py.color.info.f6679dea'), color: 'info' }
}

export function sevChipProps(severity: string): { label: string; color: 'error' | 'warning' | 'info' | 'default'; sx?: Record<string, unknown> } {
  switch (severity) {
    case 'CRITICAL': return { label: t('hardcoded.crit.color.error.83d51950'), color: 'error' }
    case 'HIGH': return { label: t('hardcoded.high.color.warning.dfc52c67'), color: 'warning', sx: { bgcolor: '#f97316', color: '#fff' } }
    case 'MODERATE': return { label: t('hardcoded.mod.color.warning.69a54da1'), color: 'warning' }
    case 'LOW': return { label: t('hardcoded.low.color.info.3cf3ab18'), color: 'info' }
    default: return { label: severity, color: 'default' }
  }
}

export function hasContextSignals(issue: SecurityIssue): boolean {
  const e = issue as EnrichedSecurityIssue
  if (e.open_prs_touching && e.open_prs_touching.length > 0) return true
  if (e.taint_adjacency) return true
  if (e.autofix_eligible) return true
  if (e.pentest_verdict) return true
  return false
}

export type IssueTab = 'open' | 'snoozed' | 'ignored' | 'solved'
export const TAB_VALUES: IssueTab[] = ['open', 'snoozed', 'ignored', 'solved']

export function IssueActionMenu({ tab, isPending, onVerify, onSnooze, onIgnore, onSolve, onReopen }: {
  tab: string
  isPending: boolean
  onVerify: () => void
  onSnooze: () => void
  onIgnore: () => void
  onSolve: () => void
  onReopen: () => void
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const open = Boolean(anchorEl)

  const handleClose = () => setAnchorEl(null)

  return (
    <>
      <IconButton
        size="small"
        onClick={(e) => setAnchorEl(e.currentTarget)}
        disabled={isPending}
        aria-label={t('common.actions')}
        title={t('common.actions')}
      >
        {isPending ? <CircularProgress size={16} /> : <MoreVertIcon fontSize="small" />}
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: { minWidth: 160 },
          },
        }}
      >
        {tab === 'open' ? [
          <MenuItem key="verify" onClick={() => { onVerify(); handleClose() }} disabled={isPending}>
            <ListItemIcon><Play size={16} /></ListItemIcon>
            <ListItemText>{t('warroom.verifyFinding')}</ListItemText>
          </MenuItem>,
          <MenuItem key="snooze" onClick={() => { onSnooze(); handleClose() }} disabled={isPending}>
            <ListItemIcon><AlarmClock size={16} /></ListItemIcon>
            <ListItemText>{t('issues.snoozed')}</ListItemText>
          </MenuItem>,
          <MenuItem key="ignore" onClick={() => { onIgnore(); handleClose() }} disabled={isPending}>
            <ListItemIcon><EyeOff size={16} /></ListItemIcon>
            <ListItemText>{t('issues.ignored')}</ListItemText>
          </MenuItem>,
          <MenuItem key="solve" onClick={() => { onSolve(); handleClose() }} disabled={isPending} sx={{ color: 'success.main' }}>
            <ListItemIcon><CheckCircle size={16} style={{ color: 'inherit' }} /></ListItemIcon>
            <ListItemText>{t('issues.solved')}</ListItemText>
          </MenuItem>,
        ] : (
          <MenuItem onClick={() => { onReopen(); handleClose() }} disabled={isPending}>
            <ListItemText>{t('issues.reopen')}</ListItemText>
          </MenuItem>
        )}
      </Menu>
    </>
  )
}
