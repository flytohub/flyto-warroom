/**
 * ScanLogTab — shows org-wide scan history with status, errors, and timing.
 */

import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import Tooltip from '@mui/material/Tooltip'
import { CheckCircle2, XCircle, Clock, Loader2, AlertTriangle } from 'lucide-react'
import { t, tOr } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import { getOrgScanLog, type ScanLogEntry } from '@lib/engine'

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  complete: { icon: CheckCircle2, color: '#22c55e', label: 'Complete' },
  failed:   { icon: XCircle,     color: '#ef4444', label: 'Failed' },
  running:  { icon: Loader2,     color: '#3b82f6', label: 'Running' },
  queued:   { icon: Clock,       color: '#f59e0b', label: 'Queued' },
}

function formatTime(ts: string | null): string {
  if (!ts) return '-'
  const d = new Date(ts)
  return d.toLocaleString()
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start || !end) return '-'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 1000) return '<1s'
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  return `${Math.round(ms / 60_000)}m`
}

function ScanRow({ entry }: { entry: ScanLogEntry }) {
  const cfg = STATUS_CONFIG[entry.status] ?? STATUS_CONFIG.queued
  const Icon = cfg.icon

  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: '1fr 100px 80px 80px 100px',
      gap: 1, px: 2, py: 1.25,
      borderBottom: '1px solid', borderColor: 'divider',
      alignItems: 'center',
      '&:hover': { bgcolor: 'action.hover' },
      transition: 'background 0.1s',
    }}>
      {/* Repo name */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
        <Icon size={14} style={{ color: cfg.color, flexShrink: 0 }} />
        <Typography variant="body2" fontWeight={500} noWrap>
          {entry.repo_name || entry.repo_id.slice(0, 8)}
        </Typography>
        {entry.error && (
          <Tooltip title={entry.error}>
            <AlertTriangle size={13} style={{ color: '#ef4444', flexShrink: 0, cursor: 'help' }} />
          </Tooltip>
        )}
      </Box>

      {/* Status */}
      <Chip
        label={tOr(`settings.scanLog.status.${entry.status}`, cfg.label)}
        size="small"
        sx={{
          height: 20, fontSize: 12, fontWeight: 700,
          bgcolor: `${cfg.color}18`, color: cfg.color,
          border: `1px solid ${cfg.color}30`,
        }}
      />

      {/* Trigger */}
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12 }}>
        {entry.trigger_type}
      </Typography>

      {/* Duration */}
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12 }}>
        {formatDuration(entry.started_at, entry.completed_at)}
      </Typography>

      {/* Time */}
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12 }}>
        {formatTime(entry.created_at)}
      </Typography>
    </Box>
  )
}

export function ScanLogTab() {
  const { org } = useOrg()
  const { data, isLoading } = useQuery({
    queryKey: qk.platform.scanLog(org?.id),
    queryFn: () => getOrgScanLog(org!.id),
    enabled: !!org?.id,
    staleTime: 10_000,
  })

  const entries = data?.entries ?? []
  const failedCount = entries.filter(e => e.status === 'failed').length
  const completeCount = entries.filter(e => e.status === 'complete').length

  if (isLoading) {
    return <Box sx={{ p: 2 }}><Skeleton variant="rounded" height={200} /></Box>
  }

  return (
    <Box>
      {/* Summary */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <Chip label={`${completeCount} ${t('settings.scanLog.complete')}`} size="small"
          sx={{ bgcolor: 'rgba(34,197,94,0.1)', color: '#22c55e', fontWeight: 600 }} />
        {failedCount > 0 && (
          <Chip label={`${failedCount} ${t('settings.scanLog.failed')}`} size="small"
            sx={{ bgcolor: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 600 }} />
        )}
        <Chip label={`${entries.length} ${t('settings.scanLog.total')}`} size="small"
          sx={{ bgcolor: 'rgba(148,163,184,0.1)', color: '#94a3b8', fontWeight: 600 }} />
      </Box>

      {/* Header */}
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: '1fr 100px 80px 80px 100px',
        gap: 1, px: 2, py: 0.75,
        borderBottom: '2px solid', borderColor: 'divider',
      }}>
        {['Repo', 'Status', 'Trigger', 'Duration', 'Time'].map(h => (
          <Typography key={h} variant="caption" fontWeight={700} color="text.secondary" sx={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {h}
          </Typography>
        ))}
      </Box>

      {/* Rows */}
      {entries.length === 0 ? (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            {t('settings.scanLog.empty')}
          </Typography>
        </Box>
      ) : (
        entries.map(e => <ScanRow key={e.id} entry={e} />)
      )}
    </Box>
  )
}
