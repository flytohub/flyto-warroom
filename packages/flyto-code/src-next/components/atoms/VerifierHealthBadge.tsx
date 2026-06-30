import { t } from '@lib/i18n';
import { useMemo, useState } from 'react'
import { Chip, Tooltip } from '@mui/material'
import { ShieldCheck, ShieldAlert, ChevronDown, ChevronUp } from 'lucide-react'
import { colors, softBg } from '@/styles/designTokens'
import type { SourceHealthRow } from '@lib/engine'

// VerifierHealthBadge — operator-facing trust indicator for the
// multi-source observation verifier. Rolls up raw_observations
// per (source, verdict) over the last 24h into a single status:
//
//   "Healthy" (green)    — every source has > 5% of its calls
//                          producing PASS or FAIL (not all
//                          inconclusive/error).
//   "Degraded" (amber)   — 1 source is mostly inconclusive/error.
//   "Critical" (red)     — 2+ sources mostly inconclusive/error
//                          (only 3-of-5 left for consensus).
//
// Click expands to a per-source breakdown so the operator can see
// exactly which source is dead and decide whether to retry, alert
// network ops, or accept the partial coverage.

const KNOWN_SOURCES = ['dns_google', 'dns_cloudflare', 'dns_sb', 'dns_local', 'crtsh']
const HEALTHY_THRESHOLD = 0.05 // > 5% of calls must produce PASS or FAIL

interface SourceStats {
  name: string
  pass: number
  fail: number
  inconclusive: number
  total: number
  healthy: boolean
}

export interface VerifierHealthBadgeProps {
  rows: SourceHealthRow[]
}

export function VerifierHealthBadge({ rows }: VerifierHealthBadgeProps) {
  const [open, setOpen] = useState(false)

  const stats = useMemo(() => computeStats(rows), [rows])
  if (stats.length === 0) return null

  const unhealthy = stats.filter(s => !s.healthy && s.total > 0)
  const status = unhealthy.length === 0
    ? 'healthy'
    : unhealthy.length === 1 ? 'degraded' : 'critical'

  const tone = status === 'healthy'
    ? colors.semantic.success
    : status === 'degraded' ? colors.semantic.warning : colors.semantic.danger
  const Icon = status === 'healthy' ? ShieldCheck : ShieldAlert
  const label = status === 'healthy'
    ? `Verifier healthy (${stats.length}/5 sources)`
    : status === 'degraded'
      ? `Verifier degraded: ${unhealthy[0].name} mostly silent`
      : `Verifier critical: ${unhealthy.length} sources degraded`

  return (
    // width: 100%, minWidth: 0 forces this badge to live inside the
    // parent card's content box (and not stretch to fit the table).
    // Without this, the badge picks up its intrinsic content width
    // (the 520px-min table) and pushes the card out of shape.
    <div style={{ width: '100%', minWidth: 0 }}>
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
        <Icon size={14} style={{ color: tone }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          {t('atoms.verifierHealth')}
        </span>
        <Tooltip title="Last 24h of raw_observations across the 5 verification sources">
          <Chip
            size="small"
            label={label}
            sx={{
              height: 20, fontSize: 12, fontWeight: 600,
              bgcolor: softBg(tone, 0.18),
              color: tone,
            }}
          />
        </Tooltip>
        <span style={{
          marginLeft: 'auto',
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 13, color: 'var(--mui-palette-text-secondary, #94a3b8)',
        }}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {open && (
        <div style={{
          borderTop: '1px solid var(--mui-palette-divider, #334155)',
          // Horizontal scroll for narrow containers. The 6-col table
          // (Source / Pass / Fail / Inconclusive / Total / Verdict)
          // doesn't fit the PostureOverview right-column ~360px;
          // without overflow-x the cells crammed and "Inconclusive"
          // chopped. Operator 2026-05-23: "驗證來源健康度 應該要
          // 可以左右滾動".
          overflowX: 'auto',
          // WebKit-style thin scrollbar so it doesn't dominate the
          // expanded panel.
          scrollbarWidth: 'thin',
        }}>
          <table style={{ minWidth: 520, borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{
                color: 'var(--mui-palette-text-secondary, #94a3b8)',
                fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                <th style={cellStyle}>{t('atoms.verifierHealth.tableHeaderSource')}</th>
                <th style={{ ...cellStyle, textAlign: 'right' }}>Pass</th>
                <th style={{ ...cellStyle, textAlign: 'right' }}>Fail</th>
                <th style={{ ...cellStyle, textAlign: 'right' }}>{t('atoms.verifierHealth.tableHeaderInconclusive')}</th>
                <th style={{ ...cellStyle, textAlign: 'right' }}>Total</th>
                <th style={cellStyle}>{t('atoms.verifierHealth.tableHeaderVerdict')}</th>
              </tr>
            </thead>
            <tbody>
              {stats.map(s => (
                <tr key={s.name} style={{ borderTop: '1px solid var(--mui-palette-divider, #334155)' }}>
                  <td style={{ ...cellStyle, fontFamily: 'var(--font-mono, monospace)', fontSize: 13, fontWeight: 600 }}>
                    {s.name}
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: colors.semantic.success }}>
                    {s.pass}
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: colors.semantic.danger }}>
                    {s.fail}
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--mui-palette-text-secondary)' }}>
                    {s.inconclusive}
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {s.total}
                  </td>
                  <td style={cellStyle}>
                    <Chip
                      size="small"
                      label={s.healthy ? 'healthy' : 'degraded'}
                      sx={{
                        height: 18, fontSize: 12, fontWeight: 700,
                        bgcolor: softBg(s.healthy ? colors.semantic.success : colors.semantic.warning, 0.18),
                        color: s.healthy ? colors.semantic.success : colors.semantic.warning,
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const cellStyle: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'left',
  whiteSpace: 'nowrap',
}

function computeStats(rows: SourceHealthRow[]): SourceStats[] {
  const byName = new Map<string, { pass: number; fail: number; inconclusive: number }>()
  for (const r of rows) {
    if (!byName.has(r.source)) {
      byName.set(r.source, { pass: 0, fail: 0, inconclusive: 0 })
    }
    const s = byName.get(r.source)!
    if (r.verdict === 'pass') s.pass += r.count
    else if (r.verdict === 'fail') s.fail += r.count
    else s.inconclusive += r.count
  }
  // Ensure every known source appears even if it had zero observations
  // (a totally-silent source IS the signal — it's dead).
  for (const name of KNOWN_SOURCES) {
    if (!byName.has(name)) {
      byName.set(name, { pass: 0, fail: 0, inconclusive: 0 })
    }
  }
  const out: SourceStats[] = []
  for (const [name, s] of byName) {
    const total = s.pass + s.fail + s.inconclusive
    const decisive = s.pass + s.fail
    // "Healthy" = source contributed decisive verdicts (PASS or FAIL)
    // for > 5% of its calls. Pure-inconclusive output = dead source.
    // Zero total = no observations at all in window = dead source.
    const healthy = total > 0 && (decisive / total) > HEALTHY_THRESHOLD
    out.push({ name, pass: s.pass, fail: s.fail, inconclusive: s.inconclusive, total, healthy })
  }
  // Sort: degraded first (operator wants to act), then healthy.
  out.sort((a, b) => {
    if (a.healthy !== b.healthy) return a.healthy ? 1 : -1
    return a.name.localeCompare(b.name)
  })
  return out
}
