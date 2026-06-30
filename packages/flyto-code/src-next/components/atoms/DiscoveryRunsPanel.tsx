import { t } from '@lib/i18n';
import { useState } from 'react'
import { Chip, Tooltip } from '@mui/material'
import {
  Activity, CheckCircle2, XCircle, Clock, AlertTriangle, ChevronDown, ChevronUp,
} from 'lucide-react'
import { colors, softBg } from '@/styles/designTokens'
import type { DiscoveryRun } from '@lib/engine'

// DiscoveryRunsPanel — operator-facing observability for the
// proactive collection loops (CT log sweep, Shodan enrichment).
//
// Default state: collapsed summary chip showing latest run's
// freshness ("Last sweep 2h ago · 3 new"). Click to expand → table
// of last N runs with status / counts / error / duration.
//
// Why this exists: the worker silently accumulates data daily; if
// the operator can't see "the sweep ran at 03:14 today, found 47
// subdomains, 3 were new", they have no proof the platform is
// actually working. Logs aren't enough.

const SOURCE_LABEL: Record<string, string> = {
  ct_log: 'CT Log',
  shodan: 'Shodan',
}

export function DiscoveryRunsPanel({ runs }: { runs: DiscoveryRun[] }) {
  const [open, setOpen] = useState(false)

  const latest = runs[0]
  const lastOk = runs.find(r => r.status === 'ok')
  const errorCount = runs.filter(r => r.status === 'error' || r.status === 'rate_limited').length
  const totalNew24h = sumNewLast24h(runs)

  return (
    <div>
      {/* Header — always visible, click to expand */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', padding: '12px 16px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'inherit', textAlign: 'left',
        }}
      >
        <Activity size={14} style={{ color: colors.tech }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          {t('atoms.proactiveCollection')}
        </span>
        <Chip
          size="small"
          label={summaryLabel(latest, lastOk, totalNew24h)}
          variant="outlined"
          sx={{
            height: 20, fontSize: 12,
            borderColor: 'var(--mui-palette-divider, #334155)',
            color: 'var(--mui-palette-text-secondary, #94a3b8)',
          }}
        />
        {errorCount > 0 && (
          <Chip
            size="small"
            icon={<AlertTriangle size={12} />}
            label={`${errorCount} issue${errorCount > 1 ? 's' : ''}`}
            sx={{
              height: 20, fontSize: 12,
              bgcolor: softBg(colors.semantic.warning, 0.18),
              color: colors.semantic.warning,
              '& .MuiChip-icon': { color: colors.semantic.warning },
            }}
          />
        )}
        <span style={{
          marginLeft: 'auto',
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 13, color: 'var(--mui-palette-text-secondary, #94a3b8)',
        }}>
          {runs.length} run{runs.length > 1 ? 's' : ''}
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {/* Expanded table */}
      {open && (
        <div style={{
          borderTop: '1px solid var(--mui-palette-divider, #334155)',
          maxHeight: 320, overflow: 'auto',
        }}>
          <table style={{
            width: '100%', borderCollapse: 'collapse',
            fontSize: 12,
          }}>
            <thead>
              <tr style={{
                color: 'var(--mui-palette-text-secondary, #94a3b8)',
                fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em',
                position: 'sticky', top: 0,
                background: 'var(--mui-palette-background-paper, #1e293b)',
              }}>
                <th style={cellStyle}>{t('warroom.colWhen')}</th>
                <th style={cellStyle}>{t('warroom.colSource')}</th>
                <th style={cellStyle}>{t('discovery.runsPanel.colRoot')}</th>
                <th style={{ ...cellStyle, textAlign: 'right' }}>{t('discovery.runsPanel.colFound')}</th>
                <th style={{ ...cellStyle, textAlign: 'right' }}>{t('discovery.runsPanel.colNew')}</th>
                <th style={cellStyle}>{t('common.status')}</th>
                <th style={cellStyle}>{t('discovery.runsPanel.colDuration')}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(r => (
                <RunRow key={r.id} run={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function RunRow({ run }: { run: DiscoveryRun }) {
  const dur = computeDuration(run)
  return (
    <tr style={{
      borderTop: '1px solid var(--mui-palette-divider, #334155)',
    }}>
      <td style={cellStyle} title={run.started_at}>{relativeTime(run.started_at)}</td>
      <td style={cellStyle}>
        <span style={{
          fontSize: 12, fontWeight: 700, padding: '2px 6px',
          borderRadius: 4,
          background: softBg(colors.tech, 0.18),
          color: colors.tech,
        }}>{SOURCE_LABEL[run.source] || run.source}</span>
      </td>
      <td style={{ ...cellStyle, fontFamily: 'var(--font-mono, monospace)', fontSize: 13 }}>
        {run.root_domain}
      </td>
      <td style={{ ...cellStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {run.discovered_count}
      </td>
      <td style={{
        ...cellStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
        fontWeight: run.new_count > 0 ? 700 : 400,
        color: run.new_count > 0 ? colors.semantic.success : 'var(--mui-palette-text-secondary, #94a3b8)',
      }}>
        {run.new_count > 0 ? `+${run.new_count}` : '0'}
      </td>
      <td style={cellStyle}>
        <StatusBadge run={run} />
      </td>
      <td style={{ ...cellStyle, color: 'var(--mui-palette-text-secondary, #94a3b8)' }}>
        {dur}
      </td>
    </tr>
  )
}

function StatusBadge({ run }: { run: DiscoveryRun }) {
  switch (run.status) {
    case 'ok':
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: colors.semantic.success }}>
        <CheckCircle2 size={12} /> ok
      </span>
    case 'rate_limited':
      return (
        <Tooltip title={t('discovery.runsPanel.rateLimitedTooltip')}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: colors.semantic.warning }}>
            <Clock size={12} /> rate-limited
          </span>
        </Tooltip>
      )
    case 'error':
      return (
        <Tooltip title={run.error || 'unknown error'}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: colors.semantic.danger }}>
            <XCircle size={12} /> error
          </span>
        </Tooltip>
      )
    case 'running':
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: colors.tech }}>
        <Activity size={12} /> running
      </span>
    default:
      return <span style={{ fontSize: 13, color: 'var(--mui-palette-text-secondary)' }}>{run.status}</span>
  }
}

const cellStyle: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'left',
  whiteSpace: 'nowrap',
}

function summaryLabel(latest: DiscoveryRun | undefined, lastOk: DiscoveryRun | undefined, totalNew24h: number): string {
  if (!latest) return t('hardcoded.no.sweeps.yet.bcd3ef55')
  const when = relativeTime(latest.started_at)
  if (lastOk && totalNew24h > 0) {
    return `Last sweep ${when} · +${totalNew24h} new (24h)`
  }
  return `Last sweep ${when}`
}

function computeDuration(r: DiscoveryRun): string {
  if (!r.finished_at) return '—'
  const start = new Date(r.started_at).getTime()
  const end = new Date(r.finished_at).getTime()
  const ms = end - start
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms / 60000)}m`
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return iso
  const diff = Date.now() - then
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  return `${Math.round(diff / 86_400_000)}d ago`
}

function sumNewLast24h(runs: DiscoveryRun[]): number {
  const since = Date.now() - 24 * 3_600_000
  let total = 0
  for (const r of runs) {
    if (new Date(r.started_at).getTime() >= since && r.status === 'ok') {
      total += r.new_count
    }
  }
  return total
}
