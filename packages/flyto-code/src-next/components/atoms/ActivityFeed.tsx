import { useMemo, useState } from 'react'
import { Chip, Tooltip } from '@mui/material'
import {
  Activity, ShieldAlert, Radar, Globe, AlertTriangle,
  Clock, CheckCircle2,
} from 'lucide-react'
import { t } from '@lib/i18n';
import { colors, softBg } from '@/styles/designTokens'
import type { MonitoringEvent } from '@lib/engine'

// ActivityFeed — unified chronological feed for ALL exposure-side
// signals. Replaces the previous filler "Recent Activity" tab
// (MonitoringView only) + "Threat Intel" tab (CrossDomain wrapper);
// audit 2026-05-17 v3 flagged the split as theatre — operators
// want one timeline, not two.
//
// Sources merged:
//   • monitoring_events (cert / DNS / port / score changes,
//     SLA breaches, expiry warnings, dangerous-port opens,
//     Shodan new vuln)
//   • Future: threat_intel_history rows (per project_threatcache_pattern)
//     can be folded in as additional EventEntry rows without UI changes.
//
// Sorted newest-first. Severity filter chips collapse the noise.
// Click an entry → drill-link to relevant view (CTEM Actions if
// fingerprint, Brand if domain, etc).

export interface EventEntry {
  id: string
  ts: string // RFC3339
  category: 'monitoring' | 'threat' | 'sla' | 'discovery'
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  title: string
  description: string
  domain?: string
  /** Optional click handler; the atom is presentational otherwise. */
  onClick?: () => void
}

export interface ActivityFeedProps {
  monitoringEvents: MonitoringEvent[]
  /** Optional click handler — fired with the underlying event when
   *  the operator selects a row. Caller routes to the right view. */
  onSelect?: (entry: EventEntry) => void
}

const CATEGORY_ICON = {
  monitoring: Radar,
  threat:     ShieldAlert,
  sla:        Clock,
  discovery:  Globe,
}

const SEVERITY_TONE: Record<EventEntry['severity'], string> = {
  critical: colors.severity.critical,
  high:     colors.severity.high,
  medium:   colors.severity.medium,
  low:      colors.severity.low,
  info:     colors.semantic.neutral,
}

const SEVERITY_RANK: Record<EventEntry['severity'], number> = {
  critical: 0, high: 1, medium: 2, low: 3, info: 4,
}

// monitoringEventCategory maps backend event_type → UI category
// bucket. New event types fall back to 'monitoring' so unknown
// signals still render (better than swallowed).
function monitoringEventCategory(eventType: string): EventEntry['category'] {
  if (eventType === 'sla_breach') return 'sla'
  if (eventType === 'shodan_new_vuln' || eventType.includes('threat')) return 'threat'
  if (eventType === 'new_subdomain' || eventType.includes('discovery')) return 'discovery'
  return 'monitoring'
}

function severityFromString(s: string): EventEntry['severity'] {
  switch (s.toLowerCase()) {
    case 'critical': return 'critical'
    case 'high':     return 'high'
    case 'medium':   return 'medium'
    case 'low':      return 'low'
    default:         return 'info'
  }
}

// BurstWindow is the rolling-window threshold the burst detector
// uses. 5+ events of the same category in <1h is a strong signal
// of attack-like activity (real scan campaigns, sweeping cert
// changes, mass DNS pivots) — surface it loudly so the operator
// doesn't have to scroll N rows to notice.
const BURST_WINDOW_MS = 60 * 60 * 1000
const BURST_THRESHOLD = 5

export interface BurstAlert {
  category: EventEntry['category']
  severity: EventEntry['severity']
  count: number
  oldestTs: string
  newestTs: string
}

// detectBursts walks chronological entries and emits one BurstAlert
// per category that crosses BURST_THRESHOLD inside BURST_WINDOW_MS.
// Returns at most one alert per category (the most recent burst).
function detectBursts(entries: EventEntry[]): BurstAlert[] {
  const out: BurstAlert[] = []
  const byCat = new Map<EventEntry['category'], EventEntry[]>()
  for (const e of entries) {
    const arr = byCat.get(e.category) ?? []
    arr.push(e)
    byCat.set(e.category, arr)
  }
  for (const [cat, list] of byCat) {
    // list is newest-first (entries already sorted). Slide a
    // window of BURST_THRESHOLD and check duration.
    if (list.length < BURST_THRESHOLD) continue
    for (let i = 0; i <= list.length - BURST_THRESHOLD; i++) {
      const newest = new Date(list[i].ts).getTime()
      const oldest = new Date(list[i + BURST_THRESHOLD - 1].ts).getTime()
      if (Number.isNaN(newest) || Number.isNaN(oldest)) continue
      if (newest - oldest <= BURST_WINDOW_MS) {
        const slice = list.slice(i, i + BURST_THRESHOLD)
        // Burst severity = worst severity in the window.
        let worst: EventEntry['severity'] = 'info'
        for (const s of slice) {
          if (SEVERITY_RANK[s.severity] < SEVERITY_RANK[worst]) worst = s.severity
        }
        out.push({
          category: cat,
          severity: worst,
          count: slice.length,
          oldestTs: list[i + BURST_THRESHOLD - 1].ts,
          newestTs: list[i].ts,
        })
        break // one burst per category — most-recent wins
      }
    }
  }
  return out
}

export function ActivityFeed({ monitoringEvents, onSelect }: ActivityFeedProps) {
  const [filter, setFilter] = useState<EventEntry['severity'] | 'all'>('all')

  const entries = useMemo<EventEntry[]>(() => {
    const out: EventEntry[] = monitoringEvents.map(e => ({
      id: e.id,
      ts: e.detected_at,
      category: monitoringEventCategory(e.event_type),
      severity: severityFromString(e.severity),
      title: e.event_type.replace(/_/g, ' '),
      description: e.description,
      domain: e.domain || undefined,
    }))
    out.sort((a, b) => b.ts.localeCompare(a.ts))
    return out
  }, [monitoringEvents])

  // Burst detection — runs over the sorted entry list. Recomputed
  // each render but bounded by 200-event default limit on the
  // monitoring fetch upstream, so cost is trivial.
  const bursts = useMemo(() => detectBursts(entries), [entries])

  const counts = useMemo(() => {
    const acc = { critical: 0, high: 0, medium: 0, low: 0, info: 0, all: entries.length }
    for (const e of entries) acc[e.severity]++
    return acc
  }, [entries])

  const visible = filter === 'all'
    ? entries
    : entries.filter(e => e.severity === filter)

  if (entries.length === 0) {
    return (
      <div className="exp-empty" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: 48, color: 'var(--mui-palette-text-secondary)',
      }}>
        <CheckCircle2 size={32} style={{ color: colors.semantic.success, marginBottom: 12 }} />
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          {t('exposure.activity.empty')}
        </div>
        <div style={{ fontSize: 12, marginTop: 4 }}>
          {t('exposure.activity.emptyHint')}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      {/* Burst alerts — when ≥5 events of the same category fire in
          <1h. Shown above the filter chips so operators see attack-
          like activity without scrolling. Each banner uses the
          worst severity observed inside the window. */}
      {bursts.length > 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 4,
          padding: '8px 12px',
          borderBottom: '1px solid var(--mui-palette-divider, #334155)',
          background: 'var(--mui-palette-background-paper, #1e293b)',
        }}>
          {bursts.map(b => (
            <BurstBanner key={`${b.category}-${b.newestTs}`} burst={b} />
          ))}
        </div>
      )}
      {/* Filter row — severity chips. "all" first, then high-to-low. */}
      <div style={{
        display: 'flex', gap: 6, alignItems: 'center',
        padding: '8px 12px',
        borderBottom: '1px solid var(--mui-palette-divider, #334155)',
        background: 'var(--mui-palette-background-paper, #1e293b)',
      }}>
        <Activity size={14} style={{ color: colors.tech, marginRight: 4 }} />
        <FilterChip
          label={t('exposure.activity.all')}
          count={counts.all}
          active={filter === 'all'}
          tone={colors.semantic.neutral}
          onClick={() => setFilter('all')}
        />
        {(['critical', 'high', 'medium', 'low', 'info'] as const).map(sev => (
          counts[sev] > 0 && (
            <FilterChip
              key={sev}
              label={sev}
              count={counts[sev]}
              active={filter === sev}
              tone={SEVERITY_TONE[sev]}
              onClick={() => setFilter(sev)}
            />
          )
        ))}
      </div>

      {/* Feed list — newest first, scrolls internally */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {[...visible]
          .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.ts.localeCompare(a.ts))
          .map(entry => (
            <FeedRow key={entry.id} entry={entry} onSelect={onSelect} />
          ))}
        {visible.length === 0 && (
          <div style={{
            padding: 24, textAlign: 'center', fontSize: 12,
            color: 'var(--mui-palette-text-secondary, #94a3b8)',
          }}>
            {t('exposure.activity.noMatchingSeverity')}
          </div>
        )}
      </div>
    </div>
  )
}

function FilterChip({ label, count, active, tone, onClick }: {
  label: string; count: number; active: boolean; tone: string; onClick: () => void
}) {
  return (
    <Chip
      size="small"
      label={`${label} ${count}`}
      onClick={onClick}
      sx={{
        height: 22, fontSize: 13, fontWeight: 600,
        cursor: 'pointer',
        bgcolor: active ? softBg(tone, 0.28) : softBg(tone, 0.10),
        color: active ? tone : 'var(--mui-palette-text-secondary, #94a3b8)',
        border: `1px solid ${active ? tone : 'transparent'}`,
        textTransform: 'capitalize',
        '&:hover': { bgcolor: softBg(tone, 0.20) },
      }}
    />
  )
}

function FeedRow({ entry, onSelect }: { entry: EventEntry; onSelect?: (e: EventEntry) => void }) {
  const Icon = CATEGORY_ICON[entry.category] ?? Activity
  const tone = SEVERITY_TONE[entry.severity]
  const isClickable = !!onSelect
  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={() => isClickable && onSelect!(entry)}
      onKeyDown={(e) => {
        if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onSelect!(entry)
        }
      }}
      style={{
        display: 'grid',
        gridTemplateColumns: '14px 80px 1fr auto',
        gap: 12,
        alignItems: 'center',
        padding: '10px 14px',
        borderBottom: '1px solid var(--mui-palette-divider, #334155)',
        borderLeft: `3px solid ${tone}`,
        cursor: isClickable ? 'pointer' : 'default',
      }}
    >
      <Icon size={14} style={{ color: tone }} />
      <Chip
        size="small"
        label={entry.severity}
        sx={{
          height: 18, fontSize: 12, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.04em',
          bgcolor: softBg(tone, 0.18),
          color: tone,
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 600,
          color: 'var(--mui-palette-text-primary, #f8fafc)',
          textTransform: 'capitalize',
        }}>
          {entry.title}
          {entry.domain && (
            <span style={{
              marginLeft: 8, fontSize: 13, fontWeight: 500,
              color: 'var(--mui-palette-text-secondary, #94a3b8)',
              fontFamily: 'var(--font-mono, monospace)',
            }}>
              {entry.domain}
            </span>
          )}
        </div>
        <div style={{
          fontSize: 13, lineHeight: 1.4,
          color: 'var(--mui-palette-text-secondary, #94a3b8)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {entry.description}
        </div>
      </div>
      <Tooltip title={entry.ts}>
        <span style={{
          fontSize: 12, fontVariantNumeric: 'tabular-nums',
          color: 'var(--mui-palette-text-secondary, #94a3b8)',
        }}>
          {relativeTime(entry.ts)}
        </span>
      </Tooltip>
    </div>
  )
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return iso
  const diff = Date.now() - then
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h`
  return `${Math.round(diff / 86_400_000)}d`
}

function BurstBanner({ burst }: { burst: BurstAlert }) {
  const tone = SEVERITY_TONE[burst.severity]
  const Icon = CATEGORY_ICON[burst.category] ?? AlertTriangle
  const windowMin = Math.max(
    1,
    Math.round((new Date(burst.newestTs).getTime() - new Date(burst.oldestTs).getTime()) / 60_000),
  )
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 10px',
      borderRadius: 4,
      background: softBg(tone, 0.16),
      border: `1px solid ${softBg(tone, 0.40)}`,
    }}>
      <AlertTriangle size={14} style={{ color: tone, flexShrink: 0 }} />
      <Icon size={12} style={{ color: tone, flexShrink: 0 }} />
      <div style={{ fontSize: 13, fontWeight: 700, color: tone, textTransform: 'capitalize' }}>
        {t('exposure.activity.burstPrefix')} · {burst.category}
      </div>
      <div style={{
        flex: 1, fontSize: 13,
        color: 'var(--mui-palette-text-primary, #f8fafc)',
      }}>
        {burst.count} {t('exposure.activity.burstEvents')}
        {' '}
        {t('exposure.activity.burstIn')} {windowMin}{t('exposure.activity.burstMinutes')}
        {' — '}
        <span style={{ color: 'var(--mui-palette-text-secondary, #94a3b8)' }}>
          {t('exposure.activity.burstHint')}
        </span>
      </div>
    </div>
  )
}
