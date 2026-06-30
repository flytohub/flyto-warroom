import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Chip, Tooltip } from '@mui/material'
import { TrendingUp, TrendingDown, AlertTriangle, Clock, ShieldAlert, Users, Sparkles } from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { t, tOr } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import {
  listMonitoringEvents, type MonitoringEvent,
  getPeerBaseline, getScoreForecast,
} from '@lib/engine'
import { displayScore, GRADE_COLORS } from '@compounds/_shared/scoring'
import { GradeCircle } from '@compounds/_shared/GradeCircle'
import { Loading, Empty } from '../scanning/_shared'
import { getExternalPosture, SEV_COLORS } from './shared'

export function ScoreTrends() {
  const { org } = useOrg()
  const orgId = org?.id

  const { data, isLoading } = useQuery({
    queryKey: qk.externalPosture(orgId),
    queryFn: () => getExternalPosture(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  // Monitoring events feed the causality overlay — pin markers on
  // the trend chart at the date each cert/DNS/port/score change was
  // detected so the operator sees WHY the score moved instead of
  // only the slope. Audit 2026-05-17: ScoreTrends was rated 6/10
  // "passive observation"; the overlay closes that gap.
  const { data: eventsData } = useQuery({
    queryKey: qk.exposure.monitoringEvents(orgId),
    queryFn: () => listMonitoringEvents(orgId!, 200),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  // Peer baseline — sector P50 / P90 / etc. from
  // peer_baseline_snapshots (populated daily by the worker from
  // config/peer_corpus.yaml). Only fetched when the org has
  // declared an industry sector; org without one renders without
  // the comparison line and falls back to absolute scores.
  const orgSector = (org as { industrySector?: string } | undefined)?.industrySector?.toLowerCase()
  const { data: peerData } = useQuery({
    queryKey: qk.scoring.peerBaseline(orgId, orgSector),
    queryFn: () => getPeerBaseline(orgId!, orgSector!),
    enabled: !!orgId && !!orgSector,
    staleTime: 5 * 60_000,
  })

  // Forecast — linear + 7-day seasonal projection over the next
  // 30 days. Empty/short history returns null from the backend;
  // we render the chip only when a confident prediction is
  // available (point + band).
  const { data: forecastData } = useQuery({
    queryKey: qk.scoring.scoreForecast(orgId),
    queryFn: () => getScoreForecast(orgId!, 30),
    enabled: !!orgId,
    staleTime: 10 * 60_000,
  })

  const points = data?.score_trend ?? []
  const violations = data?.sla_violations ?? []
  const rs = data?.risk_summary

  // TODO(backend-truth, M1): per-domain delta (latest - earliest)
  // is computed here from a flat score_trend list. Backend already
  // returns `score_change_7d` overall — should extend to per-domain
  // (domain_trends[]: { domain, points, delta_7d, delta_30d, latest })
  // so the frontend renders verbatim. See
  // FRONTEND_LOGIC_AUDIT_2026_05_24.md#M1
  const domainTrends = useMemo(() => {
    if (!data) return []
    const byDomain = new Map<string, { date: string; score: number }[]>()
    for (const p of points) {
      if (!p.domain) continue
      if (!byDomain.has(p.domain)) byDomain.set(p.domain, [])
      byDomain.get(p.domain)!.push({ date: p.date, score: p.score })
    }
    return Array.from(byDomain.entries()).map(([domain, pts]) => {
      const latest = pts[0]?.score ?? 0
      const earliest = pts[pts.length - 1]?.score ?? latest
      return { domain, points: pts, delta: latest - earliest, latest }
    }).sort((a, b) => a.latest - b.latest) // worst first
  }, [points, data])

  return (
    <div className="exp-root" style={{ '--exp-accent': '#38bdf8', '--exp-accent-end': '#818cf8' } as React.CSSProperties}>
      {/* Header */}
      <div className="exp-header">
        <div className="exp-header-icon"><TrendingUp size={20} /></div>
        <div>
          <div className="exp-header-title">{t('external.trendsTitle')}</div>
          <div className="exp-header-sub">{t('external.trendsSub')}</div>
        </div>
      </div>

      {isLoading && <Loading />}

      {!isLoading && points.length < 2 && (
        <Empty
          icon={TrendingUp}
          text={t('external.noTrends')}
          description={t('external.noTrendsDesc')}
        />
      )}

      {!isLoading && points.length >= 2 && (
        <div style={{
          flex: 1, minHeight: 0,
          display: 'flex', flexDirection: 'column',
          gap: 14, overflow: 'auto',
        }}>
          {/* Row 1: Summary badges (pinned) */}
          <div style={{ display: 'flex', gap: 10 }}>
            {rs && rs.score_change_7d !== 0 && (
              <Chip
                icon={rs.score_change_7d > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                label={`${rs.score_change_7d > 0 ? '+' : ''}${rs.score_change_7d} pts (7d)`}
                sx={{ fontWeight: 600, color: rs.score_change_7d > 0 ? '#22c55e' : '#ef4444' }}
              />
            )}
            {rs && rs.score_change_30d !== 0 && (
              <Chip
                icon={rs.score_change_30d > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                label={`${rs.score_change_30d > 0 ? '+' : ''}${rs.score_change_30d} pts (30d)`}
                variant="outlined"
                sx={{ fontWeight: 600, color: rs.score_change_30d > 0 ? '#22c55e' : '#ef4444' }}
              />
            )}
            {/* Peer benchmark chip — only renders when the org has
                declared an industry sector AND the worker has
                populated baseline snapshots for that sector. The
                corpus_size is exposed in the tooltip so operators
                see this is "n=64 well-known public domains" — not
                a real customer baseline yet. */}
            {peerData && peerData.latest?.[50] && (
              <Tooltip title={
                tOr('external.peerBenchmarkHint',
                  `Sector benchmark from ${peerData.latest[50].corpus_size} public ${peerData.sector} domains, corpus ${peerData.latest[50].corpus_version}. Updated daily.`)
              }>
                <Chip
                  icon={<Users size={14} />}
                  label={
                    `${t('external.peerSectorPrefix')} ${peerData.sector} · ` +
                    `P50 ${Math.round(peerData.latest[50].value)}` +
                    (peerData.latest[90] ? ` · P90 ${Math.round(peerData.latest[90].value)}` : '')
                  }
                  variant="outlined"
                  sx={{ fontWeight: 600, fontSize: 12 }}
                />
              </Tooltip>
            )}
            {/* Forecast chip — central estimate + 95% band 30 days
                out. Hidden when the backend returns null (history
                too short for a useful forecast). */}
            {forecastData?.forecast && forecastData.forecast.length > 0 && (() => {
              const last = forecastData.forecast[forecastData.forecast.length - 1]
              return (
                <Tooltip title={
                  tOr('external.forecastHint',
                    `30-day projection from linear trend + 7-day seasonal. 95% confidence band: ${Math.round(last.lower)}–${Math.round(last.upper)}. Bands widen with horizon; near-term is more reliable.`)
                }>
                  <Chip
                    icon={<Sparkles size={14} />}
                    label={
                      `${t('external.forecast30d')} · ` +
                      `${Math.round(last.value)} (${Math.round(last.lower)}–${Math.round(last.upper)})`
                    }
                    variant="outlined"
                    sx={{ fontWeight: 600, fontSize: 12, color: '#a78bfa', borderColor: '#a78bfa' }}
                  />
                </Tooltip>
              )
            })()}
            {violations.length > 0 && (
              <Chip
                icon={<AlertTriangle size={14} />}
                label={`${violations.length} SLA breaches`}
                sx={{ fontWeight: 600, bgcolor: '#ef444418', color: '#ef4444' }}
              />
            )}
          </div>

          {/* Row 2: Full-size trend chart (pinned) — with causality
              markers overlaying significant monitoring events on the
              same timeline as the score curve. */}
          <div className="exp-card" style={{ padding: 20 }}>
            <TrendChartFull points={points} events={eventsData?.events ?? []} />
          </div>

          {/* Row 3: SLA Violations + Per-domain trends side by side (scrollable) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: violations.length > 0 && domainTrends.length > 0 ? '1fr 1fr' : '1fr',
            gap: 14,
            minHeight: 0,
          }}>
            {/* SLA Violations */}
            {violations.length > 0 && (
              <div className="exp-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
                <div className="exp-card-head" style={{ padding: '14px 22px' }}>
                  <ShieldAlert size={16} style={{ color: '#ef4444' }} />
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#ef4444' }}>
                    {t('external.slaViolations')} — {t('external.exceededWindow')}
                  </span>
                </div>
                <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                  {violations.map((v, i) => (
                    <div key={i} style={{
                      display: 'flex', flexDirection: 'column', gap: 4,
                      padding: '16px 22px',
                      borderBottom: '1px solid var(--mui-palette-divider, rgba(255,255,255,0.06))',
                      borderLeft: `4px solid ${SEV_COLORS[v.severity] ?? '#ef4444'}`,
                      background: 'rgba(239,68,68,0.04)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                        <span className={`exp-sev exp-sev-${v.severity}`}>{v.severity}</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{v.description}</span>
                        <span className="exp-mono" style={{ marginLeft: 'auto' }}>{v.domain}</span>
                      </div>
                      <div style={{ paddingLeft: 24, display: 'flex', gap: 12, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={10} /> SLA: {v.sla_hours}h
                        </span>
                        {v.overdue_by && (
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#ef4444' }}>
                            {t('external.overdueBy')} {v.overdue_by}
                          </span>
                        )}
                      </div>
                      {v.fix_guide && (
                        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', paddingLeft: 24, lineHeight: 1.5 }}>
                          {v.fix_guide}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Per-domain trends */}
            {domainTrends.length > 0 && (
              <div className="exp-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
                <div className="exp-card-head" style={{ padding: '14px 22px' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                    {t('external.perDomainTrend')}
                  </span>
                </div>
                <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                  {domainTrends.map(d => (
                    <div key={d.domain} className="exp-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px' }}>
                      <GradeCircle
                        grade={data!.domains.find(dd => dd.domain === d.domain)?.grade ?? null}
                        color={GRADE_COLORS[data!.domains.find(dd => dd.domain === d.domain)?.grade ?? ''] ?? '#94a3b8'}
                        size={24}
                      />
                      <span className="exp-mono" style={{ flex: 1, fontWeight: 600 }}>
                        {d.domain}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        {displayScore(d.latest)}
                      </span>
                      {d.points.length > 1 && (
                        <span style={{ fontSize: 12, fontWeight: 600, color: d.delta >= 0 ? '#22c55e' : '#ef4444', minWidth: 60, textAlign: 'right' }}>
                          {d.delta >= 0 ? '+' : ''}{d.delta} pts
                        </span>
                      )}
                      {d.points.length > 1 && <MiniSparkline points={d.points} width={80} height={20} />}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// EVENT_TYPE_COLOR — semantic palette for monitoring-event marker
// pins on the trend chart. Per feedback_ui_grounded_palette: event
// kind isn't severity, so all neutral non-alarming events render as
// `text.secondary`. Only events that ARE severity-bearing (a dangerous
// port opens, an SLA breaches, a CVE lands, a regression appears)
// take the severity-red. Net-positive events (a subdomain added,
// cert renewed) use the success green. The operator scans the strip
// for red dots — that's the entire signal we need.
const EVENT_TYPE_COLOR: Record<string, string> = {
  cert_change:           '#94a3b8', // neutral — not severity, just an observation
  cert_expiry_warning:   '#eab308', // medium — auditor needs attention
  dns_change:            '#94a3b8',
  port_change:           '#94a3b8',
  dangerous_port_open:   '#ef4444', // critical
  score_change:          '#94a3b8',
  sla_breach:            '#ef4444', // critical
  shodan_new_vuln:       '#ef4444', // critical — new CVE on a public IP
  new_subdomain:         '#22c55e', // positive — fresh asset discovered
  regression:            '#ef4444', // critical — what was fixed broke again
}

function TrendChartFull({ points, events }: {
  points: { date: string; score: number }[]
  events: MonitoringEvent[]
}) {
  const width = 800
  const height = 220 // bumped from 200 to make room for event markers
  const padding = 24
  const markerRow = height - 12 // pixel row at bottom for event markers

  const scores = points.map(p => p.score)
  const minScore = Math.min(...scores) - 5
  const maxScore = Math.max(...scores) + 5
  const range = maxScore - minScore || 1

  const pathPoints = points.map((p, i) => {
    const x = padding + (i / (points.length - 1)) * (width - 2 * padding)
    const y = padding + (1 - (p.score - minScore) / range) * (height - 2 * padding - 20)
    return { x, y, ...p }
  })

  const pathD = 'M ' + pathPoints.map(p => `${p.x},${p.y}`).join(' L ')
  const areaD = pathD + ` L ${pathPoints[pathPoints.length - 1].x},${height - padding - 20} L ${pathPoints[0].x},${height - padding - 20} Z`

  const lastPoint = points[points.length - 1]
  const firstPoint = points[0]
  const trend = lastPoint.score - firstPoint.score
  const strokeColor = trend >= 0 ? '#22c55e' : '#ef4444'

  // Map each event onto the chart's X axis by date proximity. The
  // trend points are date-stamped (one per day usually), so we find
  // the nearest point and place the marker at that X.
  const eventMarkers = useMemo(() => {
    if (points.length < 2) return []
    const out: Array<{ x: number; event: MonitoringEvent }> = []
    for (const e of events) {
      const eDate = e.detected_at.slice(0, 10)
      let closestI = -1
      for (let i = 0; i < points.length; i++) {
        if (points[i].date <= eDate) closestI = i
        else break
      }
      if (closestI < 0 || closestI >= pathPoints.length) continue
      out.push({ x: pathPoints[closestI].x, event: e })
    }
    return out
  }, [events, pathPoints, points])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          {firstPoint.date} — {lastPoint.date}
        </span>
        <span style={{ fontSize: 18, fontWeight: 700, color: strokeColor }}>
          {trend >= 0 ? '+' : ''}{trend} pts
        </span>
      </div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity={0.15} />
            <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#trendFill)" />
        <path d={pathD} fill="none" stroke={strokeColor} strokeWidth={2.5} />
        {pathPoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill={strokeColor} />
        ))}
        {/* Causality overlay — one short vertical tick per
            monitoring event plus a coloured dot in a dedicated row
            below the chart. Tooltip on hover (via foreignObject is
            heavy in pure SVG — emit a <title> child for native
            browser tooltips, plenty for a glance signal). */}
        {eventMarkers.map((m, i) => {
          const color = EVENT_TYPE_COLOR[m.event.event_type] ?? '#94a3b8'
          return (
            <g key={`evt-${i}`}>
              <line x1={m.x} x2={m.x}
                y1={padding} y2={height - padding - 20}
                stroke={color} strokeWidth={1} strokeOpacity={0.4}
                strokeDasharray="2 3" />
              <circle cx={m.x} cy={markerRow} r={4} fill={color}>
                <title>{`${m.event.detected_at.slice(0,10)} · ${m.event.event_type}: ${m.event.description}`}</title>
              </circle>
            </g>
          )
        })}
      </svg>
      {eventMarkers.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-tertiary)', marginRight: 4 }}>
            {t('external.causality')}
          </span>
          {[...new Set(eventMarkers.map(m => m.event.event_type))].slice(0, 6).map(t => (
            <Tooltip key={t} title={t}>
              <Chip
                size="small"
                label={`${t.replace(/_/g, ' ')} (${eventMarkers.filter(m => m.event.event_type === t).length})`}
                sx={{
                  height: 18, fontSize: 12, fontWeight: 600,
                  bgcolor: `${EVENT_TYPE_COLOR[t] ?? '#94a3b8'}1a`,
                  color: EVENT_TYPE_COLOR[t] ?? '#94a3b8',
                }}
              />
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  )
}

function MiniSparkline({ points, width, height }: { points: { score: number }[]; width: number; height: number }) {
  const scores = points.map(p => p.score)
  const min = Math.min(...scores) - 2
  const max = Math.max(...scores) + 2
  const range = max - min || 1
  const d = 'M ' + points.map((p, i) => {
    const x = (i / (points.length - 1)) * width
    const y = (1 - (p.score - min) / range) * height
    return `${x},${y}`
  }).join(' L ')
  const trend = scores[0] - scores[scores.length - 1]
  return (
    <svg width={width} height={height}>
      <path d={d} fill="none" stroke={trend >= 0 ? '#22c55e' : '#ef4444'} strokeWidth={1.5} />
    </svg>
  )
}
