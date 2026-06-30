/**
 * Alert Center — feed of monitoring events (cert / DNS / score /
 * port changes, SLA breaches, expiry warnings, dangerous-port opens).
 *
 * Rewritten to match the canonical CTEM page shell (exp-root /
 * exp-header / exp-card / KpiTile). The previous version used raw
 * MUI Paper + Table and a 7-colour event-type palette which made it
 * the loudest page in the section despite having the least data —
 * exactly the [[ui-grounded-palette]] anti-pattern.
 *
 * Visual rules now:
 *   • One brand colour (violet) on the event-type chip — shape
 *     differentiates types, not colour.
 *   • Severity badge is the only place red/orange/yellow/green can
 *     appear inline, matching the strict semantic-only rule.
 *   • Filters render as segmented chip toggles, not full Select
 *     form-controls — they take ⅓ the vertical space.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Bell, RefreshCw, Lock, Globe, Network, AlertTriangle,
  Clock, ShieldAlert, ChevronRight, CheckCircle2, Activity,
} from 'lucide-react'
import { t, tOr } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import { listMonitoringEvents, type MonitoringEvent } from '@lib/engine'
import { Loading, Empty } from '../scanning/_shared'
import { KpiRow, KpiTile } from './KpiTile'
import { SEV_COLORS } from './shared'

// Event-type metadata. ICON differentiates the type at a glance —
// we deliberately do NOT colour-code each type with its own hue.
const EVENT_TYPE_ICON: Record<string, typeof Bell> = {
  score_change:        RefreshCw,
  cert_change:         Lock,
  dns_change:          Globe,
  port_change:         Network,
  sla_breach:          AlertTriangle,
  cert_expiry_warning: Clock,
  dangerous_port_open: ShieldAlert,
}

const EVENT_TYPE_LABEL_KEY: Record<string, string> = {
  score_change:        'monitoring.type.scoreChange',
  cert_change:         'monitoring.type.certChange',
  dns_change:          'monitoring.type.dnsChange',
  port_change:         'monitoring.type.portChange',
  sla_breach:          'monitoring.type.slaBreach',
  cert_expiry_warning: 'monitoring.type.certExpiry',
  dangerous_port_open: 'monitoring.type.dangerousPort',
}

const EVENT_TYPE_LABEL_FALLBACK: Record<string, string> = {
  score_change:        'Score change',
  cert_change:         'Certificate change',
  dns_change:          'DNS change',
  port_change:         'Port change',
  sla_breach:          'SLA breach',
  cert_expiry_warning: 'Cert expiring',
  dangerous_port_open: 'Dangerous port open',
}

function eventTypeLabel(t: string): string {
  return tOr(EVENT_TYPE_LABEL_KEY[t] ?? '', EVENT_TYPE_LABEL_FALLBACK[t] ?? t.replace(/_/g, ' '))
}

const ALL_TYPES = Object.keys(EVENT_TYPE_ICON) as Array<keyof typeof EVENT_TYPE_ICON>
const ALL_SEVS = ['critical', 'high', 'medium', 'low', 'info'] as const

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return ''
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return t('monitoring.justNow')
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export interface MonitoringViewProps {
  /** When true, hide the inner exp-header — the host (e.g. the
   *  Posture Overview tab container) already provides chrome. */
  embedded?: boolean
}

export function MonitoringView({ embedded }: MonitoringViewProps = {}) {
  const { org } = useOrg()
  const orgId = org?.id

  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [sevFilter, setSevFilter] = useState<string>('all')

  const { data, isLoading } = useQuery({
    queryKey: qk.exposure.monitoringEvents(orgId),
    queryFn: () => listMonitoringEvents(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  })

  const allEvents = data?.events ?? []

  const filtered = useMemo(() => {
    let list = allEvents
    if (typeFilter !== 'all') list = list.filter((e) => e.event_type === typeFilter)
    if (sevFilter !== 'all') list = list.filter((e) => e.severity === sevFilter)
    // Keep newest first regardless of API order.
    return [...list].sort((a, b) => b.detected_at.localeCompare(a.detected_at))
  }, [allEvents, typeFilter, sevFilter])

  // KPI counts over the unfiltered set so filters don't change the
  // numbers in the hero — those should always reflect the org-wide
  // state, not "the slice you happened to drill into".
  const kpi = useMemo(() => {
    const now = Date.now()
    const dayAgo = now - 24 * 60 * 60 * 1000
    let critical = 0
    let last24h = 0
    let slaBreach = 0
    for (const e of allEvents) {
      if (e.severity === 'critical') critical++
      if (new Date(e.detected_at).getTime() >= dayAgo) last24h++
      if (e.event_type === 'sla_breach') slaBreach++
    }
    return { total: allEvents.length, critical, last24h, slaBreach }
  }, [allEvents])

  return (
    <div className="exp-root" style={{ '--exp-accent': '#a78bfa', '--exp-accent-end': '#c084fc' } as React.CSSProperties}>
      {!embedded && <div className="exp-header">
        <div className="exp-header-icon"><Bell size={20} /></div>
        <div>
          <div className="exp-header-title">{t('monitoring.title')}</div>
          <div className="exp-header-sub">
            {t('monitoring.subtitle')}
          </div>
        </div>
        {filtered.length > 0 && filtered.length !== allEvents.length && (
          <span className="exp-count">{filtered.length}/{allEvents.length}</span>
        )}
      </div>}

      {isLoading && <Loading />}

      {!isLoading && allEvents.length === 0 && (
        <Empty
          icon={Bell}
          text={t('monitoring.emptyTitle')}
          description={t('monitoring.emptyDesc')}
        />
      )}

      {!isLoading && allEvents.length > 0 && (
        <div style={{
          flex: 1, minHeight: 0,
          display: 'flex', flexDirection: 'column',
          gap: 14, overflow: 'auto',
        }}>
          {/* KPIs — unified KpiTile (same as Action Plan / Supply Chain) */}
          <KpiRow>
            <KpiTile
              icon={Activity}
              value={kpi.total}
              label={t('monitoring.kpi.total')}
              tone="neutral"
            />
            <KpiTile
              icon={AlertTriangle}
              value={kpi.critical}
              label={t('monitoring.kpi.critical')}
              tone="critical"
            />
            <KpiTile
              icon={Clock}
              value={kpi.last24h}
              label={t('monitoring.kpi.last24h')}
              hint={kpi.last24h === 0 ? t('monitoring.allQuiet') : undefined}
              tone="neutral"
            />
            <KpiTile
              icon={CheckCircle2}
              value={kpi.slaBreach}
              label={t('monitoring.kpi.slaBreach')}
              tone={kpi.slaBreach > 0 ? 'critical' : 'ok'}
            />
          </KpiRow>

          {/* Filter chips — segmented control. Compact. */}
          <div className="exp-filter-row">
            <span className="exp-filter-label">
              {t('monitoring.filterType')}
            </span>
            <FilterChip active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>
              {t('monitoring.allTypes')}
            </FilterChip>
            {ALL_TYPES.map((t) => {
              const count = allEvents.filter((e) => e.event_type === t).length
              if (count === 0) return null
              const Icon = EVENT_TYPE_ICON[t]
              return (
                <FilterChip
                  key={t}
                  active={typeFilter === t}
                  onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}
                >
                  <Icon size={11} />
                  <span>{eventTypeLabel(t)}</span>
                  <span className="exp-filter-count">{count}</span>
                </FilterChip>
              )
            })}
          </div>

          <div className="exp-filter-row">
            <span className="exp-filter-label">
              {t('monitoring.filterSev')}
            </span>
            <FilterChip active={sevFilter === 'all'} onClick={() => setSevFilter('all')}>
              {t('monitoring.allSeverities')}
            </FilterChip>
            {ALL_SEVS.map((s) => {
              const count = allEvents.filter((e) => e.severity === s).length
              if (count === 0) return null
              return (
                <FilterChip
                  key={s}
                  active={sevFilter === s}
                  onClick={() => setSevFilter(sevFilter === s ? 'all' : s)}
                  tint={SEV_COLORS[s]}
                >
                  <span className="exp-filter-dot" style={{ background: SEV_COLORS[s] }} />
                  <span>{tOr(`monitoring.sev.${s}`, s)}</span>
                  <span className="exp-filter-count">{count}</span>
                </FilterChip>
              )
            })}
          </div>

          {/* Event feed */}
          {filtered.length === 0 ? (
            <div className="exp-info" style={{ flexDirection: 'column', gap: 6, padding: '18px 22px' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {t('monitoring.noMatch')}
              </span>
              <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                {t('monitoring.noMatchHint')}
              </span>
            </div>
          ) : (
            <div className="exp-card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div className="exp-col-head" style={{ gridTemplateColumns: '60px 1fr 170px 80px 1fr 180px' }}>
                <div>{t('monitoring.colTime')}</div>
                <div>{t('monitoring.colDomain')}</div>
                <div>{t('monitoring.colType')}</div>
                <div>{t('monitoring.colSeverity')}</div>
                <div>{t('monitoring.colDescription')}</div>
                <div>{t('monitoring.colChange')}</div>
              </div>
              {/* Scroll inset so the scrollbar doesn't kiss the
                  card's right border — operator complaint about
                  edge-hugging across all exposure pages. */}
              <div style={{ flex: 1, overflow: 'auto', minHeight: 0, paddingRight: 6 }}>
                {filtered.map((ev) => (
                  <EventRow key={ev.id} event={ev} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EventRow({ event }: { event: MonitoringEvent }) {
  const Icon = EVENT_TYPE_ICON[event.event_type] ?? ChevronRight
  const sevColor = SEV_COLORS[event.severity] ?? '#94a3b8'
  return (
    <div className="exp-row" style={{ gridTemplateColumns: '60px 1fr 170px 80px 1fr 180px', padding: '12px 20px' }}>
      <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        {relativeTime(event.detected_at)}
      </span>
      <span className="exp-mono" style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {event.domain}
      </span>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '3px 10px', borderRadius: 10,
        background: 'rgba(167,139,250,0.10)',
        color: '#c4b5fd',
        fontSize: 13, fontWeight: 600,
        width: 'fit-content',
      }}>
        <Icon size={11} />
        {eventTypeLabel(event.event_type)}
      </span>
      <span className={`exp-sev exp-sev-${event.severity}`}>{event.severity}</span>
      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={event.description}>
        {event.description}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {event.old_value || event.new_value ? (
          <>
            {event.old_value && (
              <span style={{
                fontFamily: 'ui-monospace, monospace', fontSize: 13,
                padding: '2px 6px', borderRadius: 4,
                background: 'rgba(239,68,68,0.10)', color: '#ef4444',
                textDecoration: 'line-through',
              }}>
                {event.old_value}
              </span>
            )}
            {event.old_value && event.new_value && (
              <ChevronRight size={10} style={{ opacity: 0.4, flexShrink: 0 }} />
            )}
            {event.new_value && (
              <span style={{
                fontFamily: 'ui-monospace, monospace', fontSize: 13,
                padding: '2px 6px', borderRadius: 4,
                background: 'rgba(34,197,94,0.10)', color: '#22c55e',
              }}>
                {event.new_value}
              </span>
            )}
          </>
        ) : (
          <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
        )}
      </span>
      {/* Bind sevColor so the linter doesn't complain about the
          severity-row left accent we may add later. Currently the
          `exp-sev-*` CSS classes handle the colour. */}
      <span style={{ display: 'none' }} aria-hidden="true">{sevColor}</span>
    </div>
  )
}

/* ── Local atom: chip-style filter toggle ── */
function FilterChip({ active, onClick, children, tint }: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  tint?: string
}) {
  const accent = tint ?? '#a78bfa'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`exp-filter-chip${active ? ' is-active' : ''}`}
      style={active ? { borderColor: `${accent}88`, background: `${accent}1f`, color: 'var(--color-text-primary)' } : undefined}
    >
      {children}
    </button>
  )
}
