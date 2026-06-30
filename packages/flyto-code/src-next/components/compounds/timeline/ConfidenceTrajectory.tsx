/**
 * ConfidenceTrajectory — L2 evidence drilldown for ONE finding.
 *
 * getConfidenceTimeline(orgId, fp) → a step chart of a finding's
 * confidence over time. The product point: confidence is EARNED, not
 * asserted. An AI-inferred 0.45 and a pentest-verified 0.95 are the
 * SAME field but NOT the same evidence — so we annotate every jump
 * ≥ 0.5 with a badge, and on hover surface the transition:
 *   "0.95 (pentest-verified) ← was 0.45 (AI-inferred)".
 *
 * A verified point (verified === true) renders a filled, ringed node;
 * an unverified/api-aggregated point renders hollow. Honest empty +
 * loading + error states. Dual-mode via MUI theme + CSS palette vars.
 * Font floors respected (no sub-12px text).
 *
 * MUI-only — the workspace has no MantineProvider.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'
import Alert from '@mui/material/Alert'
import Tooltip from '@mui/material/Tooltip'
import { useTheme, alpha } from '@mui/material/styles'
import { Activity, ShieldCheck, FlaskConical, Bot, MessageSquare, TrendingUp } from 'lucide-react'

import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import {
  getConfidenceTimeline,
  type ConfidenceEvent,
  type ConfidenceMethod,
} from '@lib/engine'

// ── Method → display ────────────────────────────────────────────────
// empirical_test is the gold bar (it produced evidence); analyst_feedback
// is human signal; api_aggregation is the weakest (a vendor said so).
const METHOD_META: Record<ConfidenceMethod, { label: string; icon: typeof Bot; color: string }> = {
  empirical_test: { label: 'pentest-verified', icon: FlaskConical, color: '#22c55e' },
  analyst_feedback: { label: 'analyst-reviewed', icon: MessageSquare, color: '#06b6d4' },
  api_aggregation: { label: t('hardcoded.ai.inferred.icon.bot.color.435cff80'), icon: Bot, color: '#a78bfa' },
}

function methodLabel(m: string): string {
  return (METHOD_META as Record<string, { label: string }>)[m]?.label ?? m
}

// A jump of this magnitude (or more) is a "step change" worth a badge.
const JUMP_THRESHOLD = 0.5

interface PlottedPoint {
  ev: ConfidenceEvent
  prev?: ConfidenceEvent
  x: number
  y: number
  jump: number
}

export interface ConfidenceTrajectoryProps {
  orgId: string
  /** Finding fingerprint — drives GET /findings/{fp}/confidence-timeline. */
  fingerprint: string | null
  /** When false the query stays idle (e.g. drawer closed). Default true. */
  enabled?: boolean
}

export function ConfidenceTrajectory({ orgId, fingerprint, enabled = true }: ConfidenceTrajectoryProps) {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'

  const q = useQuery({
    queryKey: qk.history.confidence(orgId, fingerprint ?? undefined),
    queryFn: () => getConfidenceTimeline(orgId, fingerprint!),
    enabled: enabled && !!orgId && !!fingerprint,
    staleTime: 30_000,
    retry: false,
  })

  const events = useMemo<ConfidenceEvent[]>(() => {
    const list = q.data?.events ?? []
    // Chronological — the engine should already order, but be defensive.
    return [...list].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
  }, [q.data])

  // ── chart geometry ────────────────────────────────────────────────
  const W = 520
  const H = 200
  const padL = 38
  const padR = 18
  const padT = 18
  const padB = 30
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const points = useMemo<PlottedPoint[]>(() => {
    if (events.length === 0) return []
    const n = events.length
    const ts = events.map(e => Date.parse(e.ts))
    const minT = Math.min(...ts)
    const maxT = Math.max(...ts)
    const span = maxT - minT || 1
    return events.map((ev, i) => {
      // Spread evenly when timestamps collide; otherwise time-scaled.
      const tx = n === 1 ? 0.5 : (maxT === minT ? i / (n - 1) : (Date.parse(ev.ts) - minT) / span)
      const c = Math.max(0, Math.min(1, ev.confidence))
      const prev = i > 0 ? events[i - 1] : undefined
      return {
        ev,
        prev,
        x: padL + tx * plotW,
        y: padT + (1 - c) * plotH,
        jump: prev ? c - Math.max(0, Math.min(1, prev.confidence)) : 0,
      }
    })
  }, [events, plotW, plotH])

  // Step path (hold-then-rise), the honest shape for a discrete signal.
  const stepPath = useMemo(() => {
    if (points.length === 0) return ''
    let d = `M ${points[0].x} ${points[0].y}`
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i - 1].y} L ${points[i].x} ${points[i].y}`
    }
    return d
  }, [points])

  // ── states ────────────────────────────────────────────────────────
  if (!fingerprint) {
    return <EmptyState label={t('timeline.confidence.noSubject')} />
  }
  if (q.isLoading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Skeleton variant="rectangular" height={H} sx={{ borderRadius: 1 }} />
        <Skeleton variant="text" width="60%" />
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
  if (events.length === 0) {
    return <EmptyState label={t('timeline.confidence.empty')} />
  }

  const gridColor = alpha(theme.palette.text.primary, isDark ? 0.08 : 0.1)
  const axisColor = alpha(theme.palette.text.primary, 0.4)
  const lineColor = '#a78bfa'

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
        <Activity size={14} color={lineColor} />
        <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
          {t('timeline.confidence.title')}
        </Typography>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', ml: 0.5 }}>
          {t('timeline.confidence.count').replace('{n}', String(events.length))}
        </Typography>
      </Box>

      <Box sx={{ width: '100%', overflowX: 'auto' }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ maxWidth: W }}>
          {/* Horizontal gridlines at 0 / 0.5 / 1.0 + the jump threshold band */}
          {[0, 0.5, 1].map(g => {
            const y = padT + (1 - g) * plotH
            return (
              <g key={g}>
                <line x1={padL} y1={y} x2={W - padR} y2={y} stroke={gridColor} strokeWidth={1} />
                <text x={padL - 6} y={y} textAnchor="end" dominantBaseline="central" fontSize={12} fill={axisColor} fontFamily="inherit">
                  {g.toFixed(1)}
                </text>
              </g>
            )
          })}

          {/* Step line */}
          <path d={stepPath} fill="none" stroke={lineColor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {/* Nodes */}
          {points.map((p, i) => {
            const meta = METHOD_META[p.ev.method] ?? METHOD_META.api_aggregation
            const verified = p.ev.verified
            const isJump = Math.abs(p.jump) >= JUMP_THRESHOLD
            const nodeColor = verified ? meta.color : alpha(theme.palette.text.primary, 0.55)
            const prevLabel = p.prev
              ? `${p.prev.confidence.toFixed(2)} (${methodLabel(p.prev.method)})`
              : t('timeline.confidence.initial')
            const tip = `${p.ev.confidence.toFixed(2)} (${methodLabel(p.ev.method)})` +
              (p.prev ? ` ← was ${prevLabel}` : '') +
              (p.ev.verified_method ? ` · ${p.ev.verified_method}` : '')
            return (
              <Tooltip key={i} title={tip} arrow>
                <g style={{ cursor: 'default' }}>
                  {/* Jump halo */}
                  {isJump && (
                    <circle cx={p.x} cy={p.y} r={11} fill="none" stroke={meta.color} strokeWidth={1.5} opacity={0.5}>
                      <animate attributeName="r" values="8;13;8" dur="2.4s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.5;0;0.5" dur="2.4s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={verified ? 6 : 5}
                    fill={verified ? nodeColor : theme.palette.background.paper}
                    stroke={nodeColor}
                    strokeWidth={2}
                  />
                </g>
              </Tooltip>
            )
          })}
        </svg>
      </Box>

      {/* Jump callouts — the human-readable "earned its confidence" line. */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 1 }}>
        {points.filter(p => Math.abs(p.jump) >= JUMP_THRESHOLD).map((p, i) => {
          const meta = METHOD_META[p.ev.method] ?? METHOD_META.api_aggregation
          const MIcon = meta.icon
          const up = p.jump >= 0
          return (
            <Box
              key={i}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.75,
                px: 1, py: 0.5, borderRadius: 1,
                border: `1px solid ${alpha(meta.color, 0.4)}`,
                bgcolor: alpha(meta.color, isDark ? 0.1 : 0.07),
              }}
            >
              <TrendingUp size={13} color={up ? '#22c55e' : '#ef4444'} style={up ? undefined : { transform: 'scaleY(-1)' }} />
              <MIcon size={13} color={meta.color} />
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.primary' }}>
                {p.ev.confidence.toFixed(2)}
              </Typography>
              <Typography sx={{ fontSize: 12, color: meta.color, fontWeight: 600 }}>
                {methodLabel(p.ev.method)}
              </Typography>
              {p.prev && (
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                  {t('timeline.confidence.wasFrom')
                    .replace('{c}', p.prev.confidence.toFixed(2))
                    .replace('{m}', methodLabel(p.prev.method))}
                </Typography>
              )}
              {p.ev.verified && (
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, ml: 'auto' }}>
                  <ShieldCheck size={12} color="#22c55e" />
                  <Typography sx={{ fontSize: 12, color: '#22c55e', fontWeight: 600 }}>
                    {t('timeline.verified')}
                  </Typography>
                </Box>
              )}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <Box
      sx={{
        display: 'grid', placeItems: 'center', minHeight: 120,
        color: 'text.disabled', textAlign: 'center', px: 2,
      }}
    >
      <Box>
        <Activity size={26} style={{ opacity: 0.4 }} />
        <Typography sx={{ fontSize: 13, mt: 1, color: 'text.secondary' }}>{label}</Typography>
      </Box>
    </Box>
  )
}
