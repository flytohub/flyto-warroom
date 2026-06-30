/**
 * SLA Monitor — remediation window compliance per severity.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Clock, AlertTriangle, CheckCircle2, Timer, Gauge, TrendingDown } from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { externalIssuesToSLAIssues, ctemPrioritiesToSLAViolations } from './externalModel'
import {
  getCTEMPriorities,
  getSLABudget, getMTTRHistory,
  type BudgetUsage, type MTTRHistoryRow,
} from '@lib/engine'
import { BUFilterDropdown } from '@atoms/BUFilterDropdown'
import { Loading, Empty } from '../scanning/_shared'
import { getOpenExternalIssues, SEVERITY_ORDER, SEV_COLORS } from './shared'

const SLA_WINDOWS: Record<string, { hours: number; label: string }> = {
  critical: { hours: 24, label: '24h' },
  high: { hours: 72, label: '3d' },
  medium: { hours: 336, label: '14d' },
  low: { hours: 720, label: '30d' },
}

export function SLAMonitorView() {
  const { org } = useOrg()
  const orgId = org?.id
  const [buFilter, setBUFilter] = useState<string>('')

  const { data, isLoading } = useQuery({
    queryKey: qk.externalIssues(orgId),
    queryFn: () => getOpenExternalIssues(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  // CTEM priorities carry first_seen_at + sla_hours, which the
  // lighter open_issues shape on external-posture omits. The
  // predictive-breach calc needs both fields. Already cached
  // org-wide via PostureOverview so this is usually a free read.
  const { data: priorityData } = useQuery({
    queryKey: qk.ctem.priorities(orgId, buFilter),
    queryFn: () => getCTEMPriorities(orgId!, buFilter || undefined),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  // SRE-style error budget — per-severity allowed_breaches vs
  // used_breaches in the policy window (90d default). Operator
  // sees "I tolerate 2 critical/quarter, I've used 1, 50% left"
  // instead of just a reactive violation count. Backend math at
  // internal/sla/budget.go. Backend filters by BU when supplied.
  const { data: budgetData } = useQuery({
    queryKey: qk.ctem.slaBudget(orgId, buFilter),
    queryFn: () => getSLABudget(orgId!, buFilter || undefined),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  // MTTR weekly trend rollup — backfilled once + extended weekly
  // by the SLA enforcement worker. Drives the trend strip under
  // the budget panel so operators see whether their MTTR is
  // improving or regressing per severity, not just an average
  // number from the last quarter.
  const { data: mttrData } = useQuery({
    queryKey: qk.ctem.mttrHistory(orgId),
    queryFn: () => getMTTRHistory(orgId!, { weeks: 26 }),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  })

  const issues = externalIssuesToSLAIssues(data?.issues)
  const violations = ctemPrioritiesToSLAViolations(priorityData?.items)

  const bySeverity = Object.entries(SLA_WINDOWS).map(([sev, config]) => {
    const sevIssues = issues.filter(i => i.severity === sev)
    const sevViolations = violations.filter(v => v.severity === sev)
    return { severity: sev, ...config, total: sevIssues.length, violations: sevViolations.length }
  })

  const nonViolated = [...issues]
    .filter(i => !violations.some(v => v.domain === i.domain && v.category === i.category))
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))

  // Predictive breach bucketing — uses the backend-canonical
  // `sla_breach_at` (RFC3339) field that ships on every
  // CTEMPriorityItem. The prior implementation re-derived
  // `breach_at = first_seen_at + sla_hours * 3_600_000` in JS,
  // which silently drifted on browser clock skew. Per
  // FRONTEND_LOGIC_AUDIT_2026_05_24.md B4: backend is canonical;
  // frontend just compares the field to `Date.now()`. The window
  // boundaries (24h / 72h / 7d) ARE display-layer choices and
  // legitimately live here — only the breach moment itself comes
  // from the engine.
  const now = Date.now()
  const upcoming = { in24h: 0, in72h: 0, in7d: 0 }
  for (const p of priorityData?.items ?? []) {
    if (p.kind !== 'external' || p.breached || !p.sla_breach_at) continue
    const breachAt = new Date(p.sla_breach_at).getTime()
    if (Number.isNaN(breachAt)) continue
    const hoursToBreach = (breachAt - now) / 3_600_000
    if (hoursToBreach <= 0) continue // already breached — handled by violations panel
    if (hoursToBreach <= 24) upcoming.in24h++
    else if (hoursToBreach <= 72) upcoming.in72h++
    else if (hoursToBreach <= 168) upcoming.in7d++
  }
  const hasUpcoming = upcoming.in24h + upcoming.in72h + upcoming.in7d > 0

  return (
    <div className="exp-root" style={{ '--exp-accent': '#ef4444', '--exp-accent-end': '#f97316' } as React.CSSProperties}>
      <div className="exp-header">
        <div className="exp-header-icon"><Clock size={20} /></div>
        <div style={{ flex: 1 }}>
          <div className="exp-header-title">{t('external.slaTitle')}</div>
          <div className="exp-header-sub">{t('external.slaSub')}</div>
        </div>
        <BUFilterDropdown orgId={orgId} value={buFilter} onChange={setBUFilter} />
        {violations.length > 0 && <span className="exp-count">{violations.length}</span>}
      </div>

      {isLoading && <Loading />}

      {!isLoading && issues.length === 0 && (
        <Empty icon={CheckCircle2}
          text={t('external.noSLAIssues')}
          description={t('external.noSLAIssuesDesc')}
        />
      )}

      {!isLoading && issues.length > 0 && (
        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateRows: 'auto 1fr', gap: 14 }}>

          {/* Row 0: SRE-style error budget panel — per-severity
              breach allowance vs current usage. Read from
              /api/v1/code/orgs/{id}/sla-budget; backend computes
              from sla_policy × external_issue_tracker.sla_breach_at.
              Hidden when no policies are declared (the panel is
              opt-in; reactive view below covers the no-policy case). */}
          {budgetData && budgetData.items.length > 0 && (
            <ErrorBudgetPanel items={budgetData.items} />
          )}

          {/* Row 0.5: MTTR weekly trend — micro sparklines per
              severity comparing the last 4 weeks to the previous 4.
              Read from /mttr-history; rendered as a small strip so
              the operator sees direction (improving / regressing)
              without leaving the SLA tab. */}
          {mttrData && mttrData.items.length > 0 && (
            <MTTRTrendStrip rows={mttrData.items} />
          )}

          {/* Row 1: Compact severity bar — all 4 in one row, same height */}
          <div className="exp-card" style={{ overflow: 'hidden', flexShrink: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', width: '100%' }}>
              {bySeverity.map((s, i) => (
                <div key={s.severity} style={{
                  padding: '14px 16px',
                  borderRight: i < 3 ? '1px solid var(--mui-palette-divider, rgba(255,255,255,0.06))' : 'none',
                  borderTop: `3px solid ${SEV_COLORS[s.severity]}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: SEV_COLORS[s.severity] }}>
                      {s.severity}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>SLA {s.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{s.total}</span>
                    <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>{t('external.openIssues')}</span>
                  </div>
                  {s.violations > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 13, fontWeight: 700, color: '#ef4444' }}>
                      <AlertTriangle size={11} /> {s.violations} {t('external.breached')}
                    </div>
                  ) : s.total > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 13, fontWeight: 600, color: '#22c55e' }}>
                      <CheckCircle2 size={11} /> {t('external.withinSLA')}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {/* Row 1.5: Predictive breach pipeline — forward-looking
              counts of issues that WILL breach soon. Lets the operator
              act before SLA misses pile up instead of only seeing
              post-hoc violations. Pure client-side math from
              first_seen_at + sla_hours (no backend change). */}
          {hasUpcoming && (
            <div className="exp-card" style={{ overflow: 'hidden', flexShrink: 0, padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Timer size={14} style={{ color: '#f97316' }} />
                <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#f97316' }}>
                  {t('external.upcomingBreaches')}
                </span>
                <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                  {t('external.upcomingHint')}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                <BreachBucket count={upcoming.in24h} label={t('external.breachIn24h')} tone="#ef4444" />
                <BreachBucket count={upcoming.in72h} label={t('external.breachIn72h')} tone="#f97316" />
                <BreachBucket count={upcoming.in7d}  label={t('external.breachIn7d')} tone="#eab308" />
              </div>
            </div>
          )}

          {/* Row 2: Issues table — scrollable */}
          <div className="exp-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            <div className="exp-card-head" style={{ padding: '14px 22px' }}>
              <Timer size={18} style={{ color: '#ef4444' }} />
              <span style={{ fontSize: 15 }}>{violations.length > 0 ? t('external.slaBreaches') : t('external.allIssues')}</span>
              <span className="exp-count">{violations.length + nonViolated.length}</span>
            </div>
            <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
              {/* Violations — red left border */}
              {violations.map((v, i) => (
                <div key={`v-${i}`} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '16px 22px',
                  borderBottom: '1px solid var(--mui-palette-divider, rgba(255,255,255,0.06))',
                  borderLeft: `4px solid ${SEV_COLORS[v.severity] ?? '#ef4444'}`,
                  background: 'rgba(239,68,68,0.04)',
                }}>
                  <AlertTriangle size={16} style={{ color: '#ef4444', flexShrink: 0, filter: 'drop-shadow(0 0 4px rgba(239,68,68,0.4))' }} />
                  <span className={`exp-sev exp-sev-${v.severity}`} style={{ flexShrink: 0 }}>{v.severity}</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {v.description}
                  </span>
                  {v.overdue_by && (
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', flexShrink: 0 }}>
                      {t('external.overdueBy')} {v.overdue_by}
                    </span>
                  )}
                  <span className="exp-mono" style={{ flexShrink: 0, fontSize: 13 }}>{v.domain}</span>
                </div>
              ))}

              {/* Non-violated issues — neutral left border */}
              {nonViolated.map((issue, i) => (
                <div key={`i-${i}`} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 22px',
                  borderBottom: '1px solid var(--mui-palette-divider, rgba(255,255,255,0.04))',
                  borderLeft: `4px solid ${SEV_COLORS[issue.severity] ?? '#94a3b8'}`,
                }}>
                  <span className={`exp-sev exp-sev-${issue.severity}`} style={{ flexShrink: 0 }}>{issue.severity}</span>
                  <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {issue.description}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
                    SLA {SLA_WINDOWS[issue.severity]?.label ?? '?'}
                  </span>
                  <span className="exp-mono" style={{ flexShrink: 0, fontSize: 13 }}>{issue.domain}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// BreachBucket — tile inside the predictive breach panel. Tone
// chosen by urgency: red for <24h, orange for <72h, yellow for
// <7d. Zero counts render dimmed so the operator's eye lands on
// the buckets that actually matter.
function BreachBucket({ count, label, tone }: { count: number; label: string; tone: string }) {
  const isZero = count === 0
  return (
    <div style={{
      padding: '8px 12px',
      borderRadius: 8,
      border: `1px solid ${isZero ? 'var(--mui-palette-divider, rgba(255,255,255,0.06))' : tone}`,
      background: isZero ? 'transparent' : `${tone}14`,
      opacity: isZero ? 0.5 : 1,
    }}>
      <div style={{
        fontSize: 20, fontWeight: 800, lineHeight: 1,
        color: isZero ? 'var(--color-text-tertiary)' : tone,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {count}
      </div>
      <div style={{
        fontSize: 12, fontWeight: 600, marginTop: 4,
        color: 'var(--color-text-secondary)',
        textTransform: 'uppercase', letterSpacing: '0.04em',
      }}>
        {label}
      </div>
    </div>
  )
}

// ErrorBudgetPanel — SRE-style remaining-budget bar per severity.
// Status drives the colour: healthy=green, warning=amber,
// exhausted=red. inactive rows still render so the operator can
// see "this policy is paused" instead of silently missing data.
export function ErrorBudgetPanel({ items }: { items: BudgetUsage[] }) {
  return (
    <div className="exp-card" style={{ overflow: 'hidden', flexShrink: 0, padding: '12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Gauge size={14} style={{ color: '#7c3aed' }} />
        <span style={{
          fontSize: 13, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.06em', color: '#7c3aed',
        }}>
          {t('external.errorBudget')}
        </span>
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          {t('external.errorBudgetHint')}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {items.map((b) => (
          <BudgetRow key={b.severity} budget={b} />
        ))}
      </div>
    </div>
  )
}

function BudgetRow({ budget }: { budget: BudgetUsage }) {
  const tone = STATUS_TONE[budget.status] ?? '#94a3b8'
  const pct = Math.min(100, Math.round(budget.used_percent))
  return (
    <div style={{
      padding: '8px 10px',
      border: '1px solid var(--mui-palette-divider, rgba(255,255,255,0.06))',
      borderLeft: `3px solid ${tone}`,
      borderRadius: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{
          fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.06em', color: SEV_COLORS[budget.severity] ?? tone,
        }}>
          {budget.severity}
        </span>
        <span style={{
          fontSize: 13, fontWeight: 700, color: tone,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {budget.used_breaches} / {budget.allowed_breaches}
        </span>
      </div>
      <div style={{
        height: 6, borderRadius: 3, overflow: 'hidden',
        background: 'var(--mui-palette-divider, rgba(148,163,184,0.18))',
        marginBottom: 4,
      }}>
        <div style={{
          width: `${pct}%`, height: '100%', background: tone,
          transition: 'width 200ms ease',
        }} />
      </div>
      <div style={{
        fontSize: 12, color: 'var(--color-text-tertiary)',
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span>{budget.status === 'inactive'
          ? t('external.budgetInactive')
          : budget.status === 'exhausted'
            ? t('external.budgetExhausted')
            : `${budget.remaining_breaches} ${t('external.budgetRemaining')}`}
        </span>
        <span style={{ opacity: 0.6 }}>{pct}%</span>
      </div>
    </div>
  )
}

const STATUS_TONE: Record<string, string> = {
  healthy: '#22c55e',
  warning: '#f97316',
  exhausted: '#ef4444',
  inactive: '#94a3b8',
  no_policy: '#94a3b8',
}

// MTTRTrendStrip — per-severity 4-week vs prior-4-week direction.
// One tiny row per severity with a P50 sparkline-ish indicator.
// The sparkline is just a delta arrow + delta hours; rendering a
// 6-px-tall SVG would be illegible and the delta number is what
// operators ask for ("are we improving?").
export function MTTRTrendStrip({ rows }: { rows: MTTRHistoryRow[] }) {
  // Group by severity, take last 8 rows newest-first → average
  // first 4 (recent) vs last 4 (prior).
  const bySev = new Map<string, MTTRHistoryRow[]>()
  for (const r of rows) {
    const arr = bySev.get(r.severity) ?? []
    arr.push(r)
    bySev.set(r.severity, arr)
  }
  const out: { severity: string; recent: number; prior: number; delta: number }[] = []
  for (const [sev, list] of bySev) {
    if (list.length < 2) continue
    const recent = list.slice(0, Math.min(4, list.length))
    const prior = list.slice(Math.min(4, list.length), Math.min(8, list.length))
    if (prior.length === 0) continue
    const avgRecent = avg(recent.map(r => r.p50_hours))
    const avgPrior = avg(prior.map(r => r.p50_hours))
    out.push({
      severity: sev,
      recent: avgRecent,
      prior: avgPrior,
      delta: avgRecent - avgPrior,
    })
  }
  if (out.length === 0) return null

  return (
    <div className="exp-card" style={{ overflow: 'hidden', flexShrink: 0, padding: '10px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <TrendingDown size={14} style={{ color: '#06b6d4' }} />
        <span style={{
          fontSize: 13, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.06em', color: '#06b6d4',
        }}>
          {t('external.mttrTrend')}
        </span>
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          {t('external.mttrTrendHint')}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        {out.map(r => (
          <div key={r.severity} style={{
            display: 'flex', alignItems: 'baseline', gap: 8,
            fontSize: 13,
          }}>
            <span style={{
              fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.06em', color: SEV_COLORS[r.severity] ?? '#94a3b8',
              minWidth: 56,
            }}>
              {r.severity}
            </span>
            <span style={{
              fontFamily: 'ui-monospace, monospace', fontWeight: 700,
              color: 'var(--color-text-primary)',
            }}>
              {r.recent.toFixed(1)}h
            </span>
            <span style={{
              fontSize: 12, fontWeight: 700,
              color: r.delta < -0.5 ? '#22c55e' : r.delta > 0.5 ? '#ef4444' : '#94a3b8',
            }}>
              {r.delta > 0 ? '▲' : r.delta < 0 ? '▼' : '–'} {Math.abs(r.delta).toFixed(1)}h
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}
