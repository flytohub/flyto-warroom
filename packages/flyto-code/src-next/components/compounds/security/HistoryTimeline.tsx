import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import { Clock, ArrowRight, CheckCircle, AlertCircle, User, FileEdit, RefreshCw, Eye, Trash2 } from 'lucide-react'
import { t } from '@lib/i18n';
import { formatTimestamp } from '@lib/time'
import { qk } from '@lib/queryKeys'
import {
  getAlertHistory, getAttackSurfaceHistory, getVerifyHistory,
  type AlertHistoryEvent, type AssetHistoryEvent, type VerifyHistoryEvent,
} from '@lib/engine'

// HistoryTimeline — read-only timeline of audit-trail events. One
// component handles all three timeline shapes (alert / asset /
// verify) by union-typing the rendered rows; the only thing that
// changes per source is the icon + colour + the human-readable
// title we synthesise from the event payload.
//
// Audit-grade product: even when nothing's changing for the user
// today, the timeline tells SOC2 auditors "this is when we observed
// the value last", which is the lower bound of 'unmonitored window'.

type Source = 'alert' | 'asset' | 'verify'

interface AlertProps {
  kind: 'alert'
  alertId: string
}

interface AssetProps {
  kind: 'asset'
  assetId: string
}

interface VerifyProps {
  kind: 'verify'
  repoId: string
  cveId: string
  packageName: string
}

type Props = (AlertProps | AssetProps | VerifyProps) & {
  limit?: number
  emptyHint?: string
}

// All three history responses share an `{ events, count }` shape and
// the row renderer only needs `events`. Narrowing to a structural type
// here keeps the useQuery generic happy without a third-party adapter.
type HistoryResponse = { events: AnyEvent[]; count: number }

export function HistoryTimeline(props: Props) {
  const { kind, limit = 50 } = props
  const q = useQuery<HistoryResponse>({
    queryKey: qk.security.history(kind, deriveQueryKey(props)),
    queryFn: () => fetchFor(props) as Promise<HistoryResponse>,
    staleTime: 30_000,
    enabled: !!deriveQueryKey(props),
  })

  if (q.isLoading) {
    return (
      <Box className="flex items-center gap-2 py-4 text-bone-300">
        <CircularProgress size={14} />
        <Typography variant="caption">{t('security.history.loading')}</Typography>
      </Box>
    )
  }
  if (q.isError) {
    return (
      <Alert severity="error" sx={{ fontSize: 13 }}>
        {q.error instanceof Error ? q.error.message : String(q.error)}
      </Alert>
    )
  }
  const events = q.data?.events ?? []
  if (events.length === 0) {
    return (
      <Box className="py-4 text-center">
        <Typography variant="caption" color="text.secondary">
          {props.emptyHint ?? t('security.history.empty')}
        </Typography>
      </Box>
    )
  }

  // Limit client-side just to be safe; server already capped.
  const shown = events.slice(0, limit)

  return (
    <Box className="hist-timeline" sx={{ position: 'relative', pl: 3 }}>
      {/* Vertical rail */}
      <Box
        sx={{
          position: 'absolute',
          left: 9,
          top: 6,
          bottom: 6,
          width: 1,
          bgcolor: 'rgba(148,163,184,0.25)',
        }}
        aria-hidden
      />
      {shown.map((e) => (
        <TimelineRow key={getId(e)} row={describe(kind, e)} />
      ))}
    </Box>
  )
}

// ── row renderer ─────────────────────────────────────────────────

interface RowSpec {
  id: string
  iconColor: string
  Icon: typeof Clock
  title: string
  detail?: string
  actor?: string
  recordedAt: string
  badge?: { label: string; color: string }
}

function TimelineRow({ row }: { row: RowSpec }) {
  return (
    <Box sx={{ position: 'relative', mb: 2, pb: 1 }}>
      <Box
        sx={{
          position: 'absolute',
          left: -22,
          top: 2,
          width: 18,
          height: 18,
          borderRadius: '50%',
          bgcolor: 'var(--mantine-color-dark-7, #0f172a)',
          border: `2px solid ${row.iconColor}`,
          display: 'grid',
          placeItems: 'center',
          color: row.iconColor,
        }}
        aria-hidden
      >
        <row.Icon size={10} />
      </Box>
      <Box className="flex items-center gap-2 flex-wrap">
        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
          {row.title}
        </Typography>
        {row.badge && (
          <Chip
            size="small"
            label={row.badge.label}
            sx={{
              height: 18, fontSize: 12, fontWeight: 600,
              bgcolor: `${row.badge.color}20`, color: row.badge.color,
            }}
          />
        )}
      </Box>
      {row.detail && (
        <Typography
          variant="caption"
          sx={{
            display: 'block', color: 'text.secondary', mt: 0.25,
            fontFamily: row.detail.startsWith('{') ? 'monospace' : undefined,
            whiteSpace: 'pre-wrap',
          }}
        >
          {row.detail}
        </Typography>
      )}
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
        <Clock size={10} /> {formatTimestamp(row.recordedAt)}
        {row.actor && <> · <User size={10} /> {row.actor}</>}
      </Typography>
    </Box>
  )
}

// ── source-specific describe() ───────────────────────────────────

type AnyEvent = AlertHistoryEvent | AssetHistoryEvent | VerifyHistoryEvent

function describe(kind: Source, e: AnyEvent): RowSpec {
  if (kind === 'alert') return describeAlert(e as AlertHistoryEvent)
  if (kind === 'asset') return describeAsset(e as AssetHistoryEvent)
  return describeVerify(e as VerifyHistoryEvent)
}

function describeAlert(e: AlertHistoryEvent): RowSpec {
  // Annotate as `string` so the case branches can reassign to a
  // human-readable label without TS narrowing `title` to the original
  // eventType literal union.
  let title: string = e.eventType
  let Icon: typeof Clock = Clock
  let iconColor = '#94a3b8'
  const detail = e.note || undefined
  let badge: RowSpec['badge'] | undefined

  switch (e.eventType) {
    case 'created':
      title = t('history.event.created')
      Icon = AlertCircle
      iconColor = '#f97316'
      badge = e.newStatus ? { label: e.newStatus, color: '#f97316' } : undefined
      break
    case 'status_changed':
      title = `${t('history.event.statusPrefix')}: ${e.oldStatus || '?'} → ${e.newStatus || '?'}`
      Icon = ArrowRight
      iconColor = '#3b82f6'
      break
    case 'resolved':
      title = t('history.event.resolved')
      Icon = CheckCircle
      iconColor = '#22c55e'
      badge = { label: t('history.event.resolvedBadge'), color: '#22c55e' }
      break
    case 'reopened':
      title = t('history.event.reopened')
      Icon = RefreshCw
      iconColor = '#eab308'
      break
    case 'assigned':
      title = `${t('history.event.assignedTo')} ${e.newAssignee || '?'}`
      Icon = User
      iconColor = '#8b5cf6'
      break
    case 'snoozed':
      title = t('history.event.snoozed')
      Icon = Clock
      iconColor = '#94a3b8'
      break
  }
  return {
    id: e.id, Icon, iconColor, title, detail, actor: e.actor,
    recordedAt: e.recordedAt, badge,
  }
}

function describeAsset(e: AssetHistoryEvent): RowSpec {
  const ICONS: Record<string, typeof Clock> = {
    created: AlertCircle,
    metadata_changed: FileEdit,
    status_changed: ArrowRight,
    rediscovered: Eye,
    validated: CheckCircle,
    removed: Trash2,
  }
  const COLORS: Record<string, string> = {
    created: '#22c55e',
    metadata_changed: '#3b82f6',
    status_changed: '#eab308',
    rediscovered: '#94a3b8',
    validated: '#22c55e',
    removed: '#ef4444',
  }
  let detail: string | undefined
  if (e.changeType === 'metadata_changed' && e.previousMetadata) {
    // Try to surface a small diff hint
    detail = `${t('security.history.assetMetadataChanged')} (${e.previousMetadata.length} → ${e.metadata.length} ${t('security.history.charsLabel')})`
  }
  return {
    id: e.id,
    Icon: ICONS[e.changeType] ?? Clock,
    iconColor: COLORS[e.changeType] ?? '#94a3b8',
    title: humanizeAssetChange(e),
    detail,
    actor: e.actor,
    recordedAt: e.recordedAt,
  }
}

function humanizeAssetChange(e: AssetHistoryEvent): string {
  switch (e.changeType) {
    case 'created': return `${t('security.history.assetDiscovered')}: ${e.assetType} = ${truncate(e.value, 60)}`
    case 'metadata_changed': return `${t('security.history.assetMetadataUpdated')}: ${truncate(e.value, 60)}`
    case 'status_changed': return `${t('security.history.assetStatusChanged')}: ${e.status || '?'}`
    case 'rediscovered': return `${t('security.history.assetRediscovered')}: ${truncate(e.value, 60)}`
    case 'validated': return `${t('security.history.assetValidated')} (${e.validationStatus || 'verified'})`
    case 'removed': return `${t('security.history.assetRemoved')}: ${truncate(e.value, 60)}`
  }
  return e.changeType
}

function describeVerify(e: VerifyHistoryEvent): RowSpec {
  const COLORS: Record<string, string> = {
    exploitable: '#ef4444',
    sanitized: '#22c55e',
    unreachable: '#94a3b8',
    unknown: '#eab308',
  }
  return {
    id: e.id,
    Icon: e.verdict === 'sanitized' ? CheckCircle : AlertCircle,
    iconColor: COLORS[e.verdict] ?? '#94a3b8',
    title: `${e.cveId} (${e.packageName}): ${e.verdict.toUpperCase()}`,
    detail: e.method ? `${e.method} · ${t('security.history.confidenceLabel')} ${(e.confidence * 100).toFixed(0)}%` : undefined,
    actor: e.actor,
    recordedAt: e.recordedAt,
    badge: { label: e.verdict, color: COLORS[e.verdict] ?? '#94a3b8' },
  }
}

// ── helpers ──────────────────────────────────────────────────────

function deriveQueryKey(p: Props): string | undefined {
  if (p.kind === 'alert') return p.alertId
  if (p.kind === 'asset') return p.assetId
  if (p.kind === 'verify') return `${p.repoId}|${p.cveId}|${p.packageName}`
  return undefined
}

function fetchFor(p: Props) {
  if (p.kind === 'alert') return getAlertHistory(p.alertId, p.limit ?? 100)
  if (p.kind === 'asset') return getAttackSurfaceHistory(p.assetId, p.limit ?? 100)
  return getVerifyHistory(p.repoId, p.cveId, p.packageName, p.limit ?? 100)
}

function getId(e: AnyEvent): string {
  return e.id
}


function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n - 1) + '…'
}
