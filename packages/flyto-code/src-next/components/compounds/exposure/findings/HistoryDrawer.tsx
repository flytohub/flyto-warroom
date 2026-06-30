import { useMemo } from 'react'
import { Box, Typography, Chip, Skeleton, Divider } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import type { Theme } from '@mui/material/styles'
import {
  AlertTriangle, ArrowRight, CheckCircle2, CircleDot, Clock3,
  GitCommitHorizontal, MessageSquareText, RotateCcw, ShieldCheck,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { listFindingHistory, type Finding, type FindingHistoryEvent } from '@lib/engine'
import { QueryError } from '@atoms/QueryError'
import { dateLabel } from './types'
import { findingStatusMeta, sourceQualityMeta } from './presentation'

export function HistoryDrawer({ orgId, finding }: { orgId: string; finding: Finding }) {
  const theme = useTheme()
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.exposure.findingHistory(orgId, finding.id),
    queryFn: () => listFindingHistory(orgId, finding.id, 300),
    staleTime: 30_000,
  })
  const hydratedFinding = { ...finding, ...(data?.finding ?? {}) }
  const events = data?.events ?? []
  const eventRecordedCount = events.filter(ev => !ev.synthetic).length
  const summaryRecordedCount = hydratedFinding.lifecycle_summary?.recorded_event_count ?? 0
  const recordedCount = events.length > 0 ? eventRecordedCount : summaryRecordedCount
  const inferredCount = events.length > 0 ? events.length - eventRecordedCount : 0
  const stateVersions = hydratedFinding.lifecycle_summary?.state_version_count ?? hydratedFinding.state_version_count ?? 0
  const quality = sourceQualityMeta(hydratedFinding.source_quality?.coverage_status)
  const groups = useMemo(() => groupEvents(events), [events])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', minWidth: 0, overflowX: 'hidden', bgcolor: 'background.default' }}>
      <Box sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, minWidth: 0 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{
              fontSize: 16, fontWeight: 800, mb: 0.5, lineHeight: 1.25,
              overflowWrap: 'anywhere',
            }}>
              {hydratedFinding.category} · {hydratedFinding.domain}
            </Typography>
            <Typography sx={{ fontSize: 12, fontFamily: 'monospace', color: 'text.secondary' }} noWrap>
              {hydratedFinding.external_id || hydratedFinding.fingerprint}
            </Typography>
          </Box>
          <StatusChip finding={hydratedFinding} />
        </Box>
        <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 1.25, overflowWrap: 'anywhere' }}>
          {hydratedFinding.details_text || hydratedFinding.description}
        </Typography>

        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' },
          gap: 1,
          mt: 1.75,
        }}>
          <Metric label={t('findings.col.firstSeen')} value={dateLabel(hydratedFinding.first_seen_at)} />
          <Metric label={t('findings.col.lastSeen')} value={dateLabel(hydratedFinding.last_seen_at)} />
          <Metric label="Age" value={ageLabel(hydratedFinding.first_seen_at, hydratedFinding.resolved_at)} />
          <Metric label="MTTR" value={mttrLabel(hydratedFinding.mttr_hours)} />
          <Metric label={t('hardcoded.state.versions.5119f9c0')} value={stateVersions > 0 ? String(stateVersions) : '-'} />
          <Metric label={t('hardcoded.recorded.events.52a56f7e')} value={recordedCount > 0 ? String(recordedCount) : '-'} />
        </Box>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.5, minWidth: 0 }}>
          {hydratedFinding.source && <Chip size="small" label={`Source: ${hydratedFinding.source}`} sx={{ fontSize: 12 }} />}
          <Chip size="small" label={quality.label} color={quality.color} variant={quality.variant} sx={{ fontSize: 12 }} />
          <Chip
            size="small"
            label={hydratedFinding.owner_display_name ? `Owner: ${hydratedFinding.owner_display_name}` : 'Owner not linked'}
            variant={hydratedFinding.owner_display_name ? 'filled' : 'outlined'}
            sx={{ fontSize: 12, maxWidth: '100%', '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
          />
          {hydratedFinding.verification_state && <Chip size="small" label={`Verify: ${label(hydratedFinding.verification_state)}`} sx={{ fontSize: 12 }} />}
          {hydratedFinding.resource_id && <Chip size="small" label={t('hardcoded.footprint.linked.eab3f03a')} variant="outlined" sx={{ fontSize: 12 }} />}
          {hydratedFinding.lifecycle_summary?.last_recorded_event_type && (
            <Chip size="small" label={`Last event: ${label(hydratedFinding.lifecycle_summary.last_recorded_event_type)}`} variant="outlined" sx={{ fontSize: 12 }} />
          )}
          {hydratedFinding.state_family_key && (
            <Chip
              size="small"
              label={`Family: ${hydratedFinding.state_family_key}`}
              variant="outlined"
              sx={{
                fontSize: 12, maxWidth: '100%',
                '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'monospace' },
              }}
            />
          )}
          <Chip size="small" label={`${recordedCount} recorded`} variant="outlined" sx={{ fontSize: 12 }} />
          {inferredCount > 0 && <Chip size="small" label={`${inferredCount} inferred`} variant="outlined" sx={{ fontSize: 12 }} />}
          {hydratedFinding.remaining_lifetime_days != null && (
            <Chip size="small" label={`${hydratedFinding.remaining_lifetime_days}d impact`} variant="outlined" sx={{ fontSize: 12 }} />
          )}
        </Box>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', px: 3, py: 2 }}>
        <Typography sx={{
          fontSize: 12, fontWeight: 800, letterSpacing: '0.06em',
          color: 'text.secondary', textTransform: 'uppercase', mb: 1.5,
        }}>
          {t('findings.historyTitle')}
        </Typography>

        {isLoading && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} variant="rounded" height={54} />)}
          </Box>
        )}
        {isError && <QueryError error={error} onRetry={refetch} label={t('findings.historyTitle')} compact />}
        {!isLoading && !isError && events.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            {t('findings.historyEmpty')}
          </Typography>
        )}

        {!isLoading && !isError && groups.map(group => (
          <Box key={group.key} sx={{ mb: 2 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary', mb: 0.75 }}>
              {group.label}
            </Typography>
            <Box sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              overflow: 'hidden',
              bgcolor: 'background.paper',
            }}>
              {group.items.map((ev, index) => (
                <Box key={ev.id}>
                  <TimelineRow event={ev} />
                  {index < group.items.length - 1 && <Divider />}
                </Box>
              ))}
            </Box>
          </Box>
        ))}
      </Box>

      <Box sx={{ px: 3, py: 1.5, borderTop: '1px solid', borderColor: 'divider', bgcolor: alpha(theme.palette.info.main, 0.06) }}>
        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
          Synthetic rows are inferred from the current finding row when older history was not recorded. They are context anchors, not proof of an exact historical event.
        </Typography>
      </Box>
    </Box>
  )
}

function TimelineRow({ event }: { event: FindingHistoryEvent }) {
  const theme = useTheme()
  const tone = eventTone(event.event_type)
  const color = toneColor(theme, tone)
  const time = event.occurred_at || event.observed_at || ''
  const hasDelta = Boolean(event.field && (event.old_value || event.new_value))

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr)', gap: 1.25, p: 1.5, minWidth: 0 }}>
      <Box sx={{
        width: 28, height: 28, borderRadius: '50%',
        display: 'grid', placeItems: 'center',
        color,
        bgcolor: alpha(color, 0.1),
      }}>
        {eventIcon(event.event_type)}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: 13, fontWeight: 800, overflowWrap: 'anywhere' }}>
            {event.title || label(event.event_type || event.field || 'event')}
          </Typography>
          {event.synthetic && <Chip size="small" label="inferred" variant="outlined" sx={{ height: 20, fontSize: 12 }} />}
          {event.source && <Chip size="small" label={event.source} sx={{ height: 20, fontSize: 12 }} />}
        </Box>

        {event.summary && (
          <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5, overflowWrap: 'anywhere' }}>
            {event.summary}
          </Typography>
        )}

        {hasDelta && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.75, flexWrap: 'wrap' }}>
            <Chip size="small" label={emptyDash(event.old_value)} variant="outlined" sx={{ fontSize: 12, height: 22 }} />
            <ArrowRight size={12} style={{ opacity: 0.5 }} />
            <Chip size="small" label={emptyDash(event.new_value)} sx={{ fontSize: 12, height: 22 }} />
          </Box>
        )}

        <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.75, overflowWrap: 'anywhere' }}>
          {dateLabel(time)}
          {event.actor_id ? ` · ${event.actor_type || 'actor'} ${event.actor_id}` : ''}
          {event.synthetic_reason ? ` · ${event.synthetic_reason}` : ''}
        </Typography>
      </Box>
    </Box>
  )
}

function StatusChip({ finding }: { finding: Finding }) {
  const status = findingStatusMeta(finding)
  const sx = { flexShrink: 0, fontWeight: 700, fontSize: 12 }
  return <Chip size="small" color={status.color} variant={status.variant} label={status.label} sx={sx} />
}

function Metric({ label: name, value }: { label: string; value: string }) {
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1, py: 0.75, minWidth: 0 }}>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 700 }}>{name}</Typography>
      <Typography sx={{ fontSize: 13, fontWeight: 800, overflowWrap: 'anywhere' }}>{value}</Typography>
    </Box>
  )
}

function groupEvents(events: FindingHistoryEvent[]) {
  const groups = new Map<string, FindingHistoryEvent[]>()
  for (const event of events) {
    const time = event.occurred_at || event.observed_at || ''
    const key = time ? new Date(time).toISOString().slice(0, 10) : 'unknown'
    const list = groups.get(key) ?? []
    list.push(event)
    groups.set(key, list)
  }
  return Array.from(groups.entries()).map(([key, items]) => ({
    key,
    label: key === 'unknown' ? t('hardcoded.unknown.date.0ad2401c') : dateLabel(key),
    items,
  }))
}

function eventIcon(type?: string) {
  switch (type) {
    case 'resolved':
    case 'verified_fixed':
    case 'verified':
      return <CheckCircle2 size={15} />
    case 'marked_fixed':
    case 'pending_verify':
      return <ShieldCheck size={15} />
    case 'reopened':
      return <RotateCcw size={15} />
    case 'commented':
      return <MessageSquareText size={15} />
    case 'field_changed':
    case 'confidence_changed':
    case 'superseded':
      return <GitCommitHorizontal size={15} />
    case 'first_seen':
    case 'created':
      return <CircleDot size={15} />
    case 'false_positive':
      return <AlertTriangle size={15} />
    default:
      return <Clock3 size={15} />
  }
}

function eventTone(type?: string) {
  switch (type) {
    case 'resolved':
    case 'verified_fixed':
    case 'verified':
      return 'success'
    case 'reopened':
    case 'false_positive':
      return 'error'
    case 'marked_fixed':
    case 'pending_verify':
    case 'superseded':
      return 'warning'
    case 'commented':
    case 'assigned':
      return 'info'
    default:
      return 'default'
  }
}

function toneColor(theme: Theme, tone: string) {
  if (tone === 'success') return theme.palette.success.main
  if (tone === 'error') return theme.palette.error.main
  if (tone === 'warning') return theme.palette.warning.main
  if (tone === 'info') return theme.palette.info.main
  return theme.palette.text.secondary
}

function ageLabel(firstSeen?: string, resolvedAt?: string | null) {
  if (!firstSeen) return '-'
  const start = new Date(firstSeen).getTime()
  const end = resolvedAt ? new Date(resolvedAt).getTime() : Date.now()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '-'
  const days = Math.floor((end - start) / 86_400_000)
  return `${days}d`
}

function mttrLabel(hours?: number | null) {
  if (hours == null || !Number.isFinite(hours)) return '-'
  if (hours < 24) return `${Math.round(hours)}h`
  return `${Math.round(hours / 24)}d`
}

function label(v?: string) {
  const s = (v || '').replace(/_/g, ' ').trim()
  if (!s) return 'Event'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function emptyDash(v?: string) {
  return v && v.trim() ? v : '-'
}
