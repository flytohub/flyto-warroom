/**
 * SystemEventsTab — operator-facing diagnostic log viewer.
 *
 * Backed by GET /api/v1/system/events. Filters compose at the
 * backend; the table refreshes every 10s so live events appear
 * without manual reload.
 *
 * User concept (2026-05-22): 「查問題查得好累」. Cloud Run logs
 * are operator-hostile + rotate; this table is queryable from
 * anywhere with a Firebase ID token.
 */
import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import {
  Box, Typography, Select, MenuItem, TextField, Chip, Stack,
  Table, TableHead, TableBody, TableRow, TableCell, IconButton, Tooltip,
} from '@mui/material'
import { RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'
import { BASE, authHeader, request } from '@lib/engine/client'
import { t } from '@lib/i18n';
import { useOrg } from '@hooks/useOrg'
import { qk } from '@lib/queryKeys'
import { queryFailed, queryResolved, querySucceeded } from '@lib/queryState'

interface SystemEvent {
  id: string
  occurred_at: string
  level: 'info' | 'warn' | 'error' | 'critical'
  category: string
  event: string
  org_id?: string
  resource_type?: string
  resource_id?: string
  message: string
  detail: string
  // Observability columns (migration 026)
  trace_id?: string
  parent_id?: string
  duration_ms?: number
  outcome?: string
  actor_type?: string
  actor_id?: string
  tags?: string
  source?: string
  env?: string
}

interface EventResponse {
  events: SystemEvent[]
  count: number
}

interface EventTotals {
  info: number
  warn: number
  error: number
  critical: number
}

const LEVEL_COLORS: Record<string, string> = {
  info: '#64748b',
  warn: '#f59e0b',
  error: '#ef4444',
  critical: '#7f1d1d',
}

const CATEGORY_OPTIONS = ['', 'scan', 'credential', 'scanner', 'footprint', 'pipeline', 'system', 'maintenance']
const LEVEL_OPTIONS = ['', 'info', 'warn', 'error', 'critical']
const OUTCOME_OPTIONS = ['', 'success', 'failed', 'partial', 'aborted', 'skipped', 'unknown']
const ACTOR_TYPE_OPTIONS = ['', 'user', 'system', 'scheduler', 'webhook', 'api_client']

export function SystemEventsTab() {
  const { org } = useOrg()
  // Scope check — backend tells us if the current user is a
  // platform admin. Admins hit /system/events (cross-org);
  // members hit /code/orgs/{id}/events (scoped). The
  // is_platform_admin flag also drives whether the org_id
  // filter is editable.
  const scopeQ = useQuery({
    queryKey: qk.platform.eventScope(),
    queryFn: () => request<{ is_platform_admin: boolean }>('GET', '/api/v1/events/scope'),
    staleTime: 5 * 60_000,
  })
  const scopeReady = queryResolved(scopeQ)
  const scopeData = scopeQ.data
  const isPlatformAdmin = !!scopeData?.is_platform_admin

  const [filter, setFilter] = useState({
    org_id: '',
    category: '',
    level: '',
    event: '',
    outcome: '',
    actor_type: '',
    trace_id: '',
    search: '',
  })
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Build endpoint URL based on scope. Non-admins are forced to
  // the per-org endpoint; the URL itself carries the org id so
  // backend can't be tricked with a different org_id query
  // param.
  const basePath = !scopeReady
    ? ''
    : isPlatformAdmin
    ? '/api/v1/system/events'
    : org?.id
      ? `/api/v1/code/orgs/${org.id}/events`
      : ''
  const aggPath = !scopeReady
    ? ''
    : isPlatformAdmin
    ? '/api/v1/system/events/aggregates'
    // Backend registers the org-scoped route as `event-log/aggregates`
    // (router.go) — the handler's doc-comment saying `events/aggregates`
    // is stale. Calling the latter 404s. (Caught by apiPathContract.)
    : org?.id
      ? `/api/v1/code/orgs/${org.id}/event-log/aggregates`
      : ''

  const qs = new URLSearchParams()
  Object.entries(filter).forEach(([k, v]) => {
    // Don't pass org_id when we're on the scoped endpoint —
    // the path already binds it.
    if (!isPlatformAdmin && k === 'org_id') return
    if (v) qs.set(k, v)
  })
  qs.set('limit', '200')
  const eventsQ = useQuery({
    queryKey: qk.platform.systemEvents(basePath, filter),
    queryFn: () => request<EventResponse>('GET', `${basePath}?${qs.toString()}`),
    enabled: !!basePath,
    refetchInterval: 10_000,
    staleTime: 5_000,
  })
  const { data, refetch, isFetching } = eventsQ
  const aggQS = new URLSearchParams()
  if (isPlatformAdmin && filter.org_id) aggQS.set('org_id', filter.org_id)
  if (filter.category) aggQS.set('category', filter.category)
  const aggQ = useQuery({
    queryKey: qk.platform.systemEventsAgg(aggPath, filter.org_id, filter.category),
    queryFn: () => request<{ totals: EventTotals }>('GET', `${aggPath}?${aggQS.toString()}`),
    enabled: !!aggPath,
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
  const aggData = aggQ.data
  const totalsReady = querySucceeded(aggQ, !!aggPath)
  const eventsReady = querySucceeded(eventsQ, !!basePath)
  const eventsFailed = queryFailed(scopeQ) || queryFailed(eventsQ, !!basePath)
  const totals = totalsReady ? aggData?.totals ?? { info: 0, warn: 0, error: 0, critical: 0 } : null
  const events = eventsReady ? data?.events ?? [] : []

  // SSE live stream — push beats poll. Uses fetch-event-source rather
  // than native EventSource so auth stays in the Authorization header,
  // not in browser history / reverse-proxy logs as a query parameter.
  // Mounts on /system/events/stream (admin) or with ?org_id=... (org).
  // On new events, invalidates the polling cache so the UI
  // shows the row within ~1s instead of 10s.
  const qc = useQueryClient()
  useEffect(() => {
    if (!basePath) return
    const streamPath = isPlatformAdmin
      ? '/api/v1/system/events/stream'
      : org?.id
        ? `/api/v1/system/events/stream?org_id=${org.id}`
        : ''
    if (!streamPath) return
    const ctrl = new AbortController()
    let closed = false
    const initStream = async () => {
      try {
        await fetchEventSource(`${BASE}${streamPath}`, {
          signal: ctrl.signal,
          openWhenHidden: true,
          async onopen(res) {
            if (res.ok && res.headers.get('content-type')?.includes('text/event-stream')) return
            closed = true
            throw new Error(`system events stream failed: ${res.status}`)
          },
          onmessage(msg) {
            if (msg.event && msg.event !== 'system.event') return
            // Throttle invalidations — multiple events in same
            // 500ms batch produce one refetch.
            qc.invalidateQueries({ queryKey: qk.platform.systemEventsPath(basePath) })
            qc.invalidateQueries({ queryKey: qk.platform.systemEventsAggPath(aggPath) })
          },
          onerror(err) {
            if (closed) throw err
            if (import.meta.env.DEV) console.debug('[system-events] reconnecting:', err)
          },
          fetch: async (input, init) => {
            const bearer = await authHeader()
            const headers = new Headers(init?.headers)
            if (bearer) headers.set('Authorization', bearer)
            return fetch(input, { ...init, headers })
          },
        })
      } catch {
        // Stream unavailable; polling still works at 10s cadence.
      }
    }
    void initStream()
    return () => { closed = true; ctrl.abort() }
  }, [basePath, aggPath, isPlatformAdmin, org?.id, qc])

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Box>
	      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
	        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, minWidth: 0 }}>
	          <Typography component="h2" sx={{ fontSize: 18, fontWeight: 700 }}>
	            {t('settings.events.title')}
	          </Typography>
	          <Chip
	            size="small"
	            label={isPlatformAdmin
	              ? t('settings.events.scope.admin')
	              : t('settings.events.scope.org')}
	            sx={{ fontSize: 12, height: 20 }}
	            color={isPlatformAdmin ? 'primary' : 'default'}
	          />
	        </Box>
	        <Tooltip title={t('settings.events.refresh')}>
	          <span>
	            <IconButton
	              onClick={() => refetch()}
	              disabled={isFetching}
	              size="small"
	              aria-label={t('settings.events.refresh')}
	            >
	              <RefreshCw size={16} />
	            </IconButton>
	          </span>
	        </Tooltip>
	      </Box>
      <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 2 }}>
        {isPlatformAdmin
          ? t('settings.events.subtitle.admin')
          : t('settings.events.subtitle.org')}
      </Typography>

      {/* Stats bar — at-a-glance level totals for the visible
          window. Click a tile to filter by that level. */}
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        {(['critical', 'error', 'warn', 'info'] as const).map(lv => (
          <Box
            key={lv}
            onClick={() => setFilter({ ...filter, level: filter.level === lv ? '' : lv })}
            sx={{
              flex: 1, p: 1.5, borderRadius: 1.5, cursor: 'pointer',
              border: 1,
              borderColor: filter.level === lv ? LEVEL_COLORS[lv] : 'divider',
              bgcolor: filter.level === lv ? `${LEVEL_COLORS[lv]}22` : 'transparent',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <Typography sx={{
              fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: LEVEL_COLORS[lv],
            }}>
              {lv}
            </Typography>
            <Typography sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>
              {totals ? totals[lv] : '…'}
            </Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
              {t('settings.events.statLast24h')}
            </Typography>
          </Box>
        ))}
      </Stack>

      {/* Filters */}
      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Select
          size="small" displayEmpty
          value={filter.category}
          onChange={e => setFilter({ ...filter, category: e.target.value })}
          sx={{ minWidth: 140, fontSize: 13 }}
        >
          {CATEGORY_OPTIONS.map(c => (
            <MenuItem key={c || 'all-cat'} value={c} sx={{ fontSize: 13 }}>
              {c || t('settings.events.allCategories')}
            </MenuItem>
          ))}
        </Select>
        <Select
          size="small" displayEmpty
          value={filter.level}
          onChange={e => setFilter({ ...filter, level: e.target.value })}
          sx={{ minWidth: 120, fontSize: 13 }}
        >
          {LEVEL_OPTIONS.map(l => (
            <MenuItem key={l || 'all-lev'} value={l} sx={{ fontSize: 13 }}>
              {l || t('settings.events.allLevels')}
            </MenuItem>
          ))}
        </Select>
        {isPlatformAdmin && (
          <TextField
            size="small" placeholder="org_id (admin only)"
            value={filter.org_id}
            onChange={e => setFilter({ ...filter, org_id: e.target.value })}
            sx={{ minWidth: 200, '& .MuiInputBase-input': { fontSize: 13 } }}
          />
        )}
        <TextField
          size="small" placeholder="event (e.g. auth_invalid)"
          value={filter.event}
          onChange={e => setFilter({ ...filter, event: e.target.value })}
          sx={{ minWidth: 200, '& .MuiInputBase-input': { fontSize: 13 } }}
        />
        <Select
          size="small" displayEmpty
          value={filter.outcome}
          onChange={e => setFilter({ ...filter, outcome: e.target.value })}
          sx={{ minWidth: 140, fontSize: 13 }}
        >
          {OUTCOME_OPTIONS.map(o => (
            <MenuItem key={o || 'all-out'} value={o} sx={{ fontSize: 13 }}>
              {o || t('settings.events.allOutcomes')}
            </MenuItem>
          ))}
        </Select>
        <Select
          size="small" displayEmpty
          value={filter.actor_type}
          onChange={e => setFilter({ ...filter, actor_type: e.target.value })}
          sx={{ minWidth: 140, fontSize: 13 }}
        >
          {ACTOR_TYPE_OPTIONS.map(a => (
            <MenuItem key={a || 'all-actor'} value={a} sx={{ fontSize: 13 }}>
              {a || t('settings.events.allActors')}
            </MenuItem>
          ))}
        </Select>
        <TextField
          size="small" placeholder={t('settings.events.searchMessage')}
          value={filter.search}
          onChange={e => setFilter({ ...filter, search: e.target.value })}
          sx={{ minWidth: 200, '& .MuiInputBase-input': { fontSize: 13 } }}
        />
        {filter.trace_id && (
          <Chip
            size="small" label={`trace: ${filter.trace_id}`}
            onDelete={() => setFilter({ ...filter, trace_id: '' })}
            sx={{ alignSelf: 'center', fontSize: 12 }}
          />
        )}
        <Typography sx={{ fontSize: 12, color: 'text.secondary', alignSelf: 'center', ml: 'auto' }}>
          {eventsReady ? data?.count ?? 0 : '…'} {t('settings.events.events')}
        </Typography>
      </Stack>

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontSize: 12, fontWeight: 700, width: 32 }}></TableCell>
            <TableCell sx={{ fontSize: 12, fontWeight: 700, width: 160 }}>
              {t('settings.events.col.time')}
            </TableCell>
            <TableCell sx={{ fontSize: 12, fontWeight: 700, width: 80 }}>
              {t('settings.events.col.level')}
            </TableCell>
            <TableCell sx={{ fontSize: 12, fontWeight: 700, width: 130 }}>
              {t('settings.events.col.category')}
            </TableCell>
            <TableCell sx={{ fontSize: 12, fontWeight: 700, width: 200 }}>
              {t('settings.events.col.event')}
            </TableCell>
            <TableCell sx={{ fontSize: 12, fontWeight: 700 }}>
              {t('settings.events.col.message')}
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {eventsFailed && (
            <TableRow>
              <TableCell colSpan={6} sx={{ fontSize: 13, color: 'error.main', textAlign: 'center', py: 4 }}>
                {t('settings.events.loadError')}
              </TableCell>
            </TableRow>
          )}
          {!eventsFailed && (!scopeReady || !eventsReady) && (
            <TableRow>
              <TableCell colSpan={6} sx={{ fontSize: 13, color: 'text.secondary', textAlign: 'center', py: 4 }}>
                {t('settings.events.loading')}
              </TableCell>
            </TableRow>
          )}
          {eventsReady && events.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} sx={{ fontSize: 13, color: 'text.secondary', textAlign: 'center', py: 4 }}>
                {t('settings.events.empty')}
              </TableCell>
            </TableRow>
          )}
          {eventsReady && events.map(ev => {
            const open = expanded.has(ev.id)
            return (
              <>
                <TableRow key={ev.id} sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }} onClick={() => toggleExpand(ev.id)}>
                  <TableCell sx={{ width: 32 }}>
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </TableCell>
                  <TableCell sx={{ fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace' }}>
                    {new Date(ev.occurred_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small" label={ev.level}
                      sx={{
                        fontSize: 12, fontWeight: 700,
                        bgcolor: LEVEL_COLORS[ev.level] ?? LEVEL_COLORS.info,
                        color: '#fff', height: 20,
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{ev.category}</TableCell>
                  <TableCell sx={{ fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace' }}>
                    {ev.event}
                  </TableCell>
                  <TableCell sx={{ fontSize: 13 }}>{ev.message}</TableCell>
                </TableRow>
                {open && (
                  <TableRow key={ev.id + '-detail'}>
                    <TableCell colSpan={6} sx={{ bgcolor: 'action.hover', p: 1.5 }}>
                      <Box sx={{ fontSize: 12 }}>
                        {/* Compact metadata grid — every present
                            field gets its own line so the operator
                            can copy-paste any value. */}
                        {ev.org_id && (
                          <DetailLine label="org_id" value={ev.org_id} />
                        )}
                        {ev.resource_type && (
                          <DetailLine label="resource" value={`${ev.resource_type} / ${ev.resource_id}`} />
                        )}
                        {ev.trace_id && (
                          <Box sx={{ mb: 0.5 }}>
                            <strong>trace_id:</strong>{' '}
                            <Box
                              component="span"
                              onClick={() => setFilter({ ...filter, trace_id: ev.trace_id! })}
                              sx={{
                                fontFamily: 'ui-monospace, Menlo, monospace',
                                cursor: 'pointer', color: 'primary.main',
                                textDecoration: 'underline dotted',
                              }}
                            >
                              {ev.trace_id}
                            </Box>{' '}
                            <Box component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>
                              (click to see all events in this trace)
                            </Box>
                          </Box>
                        )}
                        {ev.outcome && <DetailLine label="outcome" value={ev.outcome} />}
                        {ev.actor_type && (
                          <DetailLine label="actor" value={`${ev.actor_type}${ev.actor_id ? ' / ' + ev.actor_id : ''}`} />
                        )}
                        {typeof ev.duration_ms === 'number' && (
                          <DetailLine label="duration" value={`${ev.duration_ms} ms`} />
                        )}
                        {ev.source && <DetailLine label="source" value={ev.source} />}
                        {ev.env && <DetailLine label="env" value={ev.env} />}
                        {ev.tags && ev.tags !== '{}' && (
                          <DetailLine label="tags" value={ev.tags} />
                        )}
                        <Box sx={{ mb: 0.5, mt: 1 }}>
                          <strong>detail:</strong>
                        </Box>
                        <Box component="pre" sx={{
                          fontFamily: 'ui-monospace, Menlo, monospace',
                          fontSize: 12, p: 1, borderRadius: 1,
                          bgcolor: 'background.paper',
                          overflow: 'auto', maxHeight: 200,
                        }}>
                          {ev.detail}
                        </Box>
                      </Box>
                    </TableCell>
                  </TableRow>
                )}
              </>
            )
          })}
        </TableBody>
      </Table>
    </Box>
  )
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ mb: 0.5 }}>
      <strong>{label}:</strong>{' '}
      <Box component="span" sx={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>
        {value}
      </Box>
    </Box>
  )
}
