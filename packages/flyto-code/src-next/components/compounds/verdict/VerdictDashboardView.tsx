/**
 * VerdictDashboardView — the verdict-first war-room homepage.
 *
 * PRODUCT PRINCIPLE: "security isn't only bad — GOOD posture is surfaced
 * as good (green), bad as bad (red), and a green is held to the SAME
 * evidence bar as a red." The hero leads with Verified Attack Paths +
 * Verified Safe (the red/green duality) + MTTV/MTTR — NOT a single
 * Bitsight score. Never fabricate data; honest empty/zero states.
 *
 * Reuses the manager-mode layout primitive (ManagerDashboard: kpis |
 * charts | narrative) + KpiCard tiles + the dashboard SVG sparkline
 * substrate. Data comes from getVerdictDashboard (the evidence-gated
 * verdict endpoint — `verified_attack_paths` counts ONLY paths at
 * RedTeamConfirmed via empirical_pentest/live_probe; a 'mitigated'
 * operator claim never counts).
 */

import { useMemo } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { alpha, useTheme } from '@mui/material/styles'
import { useQuery } from '@tanstack/react-query'
import {
  ShieldAlert,
  ShieldCheck,
  AlertOctagon,
  SearchCheck,
  CheckCircle2,
  Timer,
  Wrench,
} from 'lucide-react'

import { ManagerDashboard, ChartCard } from '@compounds/_shared/ManagerDashboard'
import { KpiCard } from '@compounds/_shared/KpiCard'
import { getVerdictDashboard } from '@lib/engine'
import { qk } from '@lib/queryKeys'
import { t } from '@lib/i18n';
import { SEVERITY_TONE, GRADE_TONE } from '@lib/tokens/severity'

const RED = SEVERITY_TONE.critical.tone
const GREEN = GRADE_TONE.good.tone

export interface VerdictDashboardViewProps {
  orgId: string
  /** Drill-in: route a tile/sparkline to the deeper surface. */
  onNavigate?: (section: string) => void
}

/**
 * Tiny inline SVG sparkline — themed area trend. Self-contained so the
 * verdict hero doesn't depend on Apex for the two hero trends. Returns
 * an honest empty state when there isn't enough data to draw a trend.
 */
function MiniSparkline({ points, color }: { points: number[]; color: string }) {
  const theme = useTheme()
  if (points.length < 2) {
    // Honest empty — but render a dashed baseline so the card reads as
    // "a trend awaiting data" rather than a blank white void.
    return (
      <Box
        sx={{
          height: 72,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '50%',
            borderTop: `1px dashed ${alpha(color, 0.35)}`,
          }}
        />
        <Typography
          variant="caption"
          sx={{
            position: 'relative',
            px: 1.25,
            py: 0.25,
            borderRadius: 1,
            color: theme.palette.text.disabled,
            bgcolor: theme.palette.background.paper,
          }}
        >
          {t('verdict.noTrend')}
        </Typography>
      </Box>
    )
  }
  const w = 320
  const h = 72
  const pad = 6
  const max = Math.max(...points, 1)
  const min = Math.min(...points, 0)
  const span = max - min || 1
  const step = (w - pad * 2) / (points.length - 1)
  const coords = points.map((p, i) => {
    const x = pad + i * step
    const y = h - pad - ((p - min) / span) * (h - pad * 2)
    return [x, y] as const
  })
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const area = `${line} L ${coords[coords.length - 1][0].toFixed(1)} ${h - pad} L ${coords[0][0].toFixed(1)} ${h - pad} Z`
  const gid = `verdict-spark-${color.replace('#', '')}`
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function VerdictDashboardView({ orgId, onNavigate }: VerdictDashboardViewProps) {
  const theme = useTheme()
  const q = useQuery({
    queryKey: qk.history.verdict(orgId),
    queryFn: () => getVerdictDashboard(orgId),
    enabled: !!orgId,
  })

  const d = q.data
  const loading = q.isLoading

  // Honest empty: the endpoint returns zeros (not nulls) when there's no
  // data — we render the literal zero. `empty` only fires on a true
  // fetch error so the operator never sees a fabricated metric.
  const errored = q.isError && !d

  // Round float hours for display; keep one decimal for sub-day values.
  const fmtHours = (hours: number | undefined): string => {
    if (hours == null) return '—'
    if (hours <= 0) return '0'
    return hours < 10 ? hours.toFixed(1) : Math.round(hours).toString()
  }

  // Two hero sparklines: path-resolution + MTTR trend. The verdict
  // endpoint is a point-in-time snapshot (no series), so until a trend
  // feed exists we render the honest "not enough history" empty state
  // rather than fabricating a curve.
  const pathResolutionTrend = useMemo<number[]>(() => [], [])
  const mttrTrend = useMemo<number[]>(() => [], [])

  const goRoute = (section: string) => () => onNavigate?.(section)

  return (
    <ManagerDashboard
      title={t('verdict.title')}
      subtitle={t('verdict.subtitle')}
      kpis={
        <>
          {/* The red/green duality leads — Verified Attack Paths (bad,
              empirically confirmed) beside Verified Safe (good, same
              evidence bar). Both carry a tone accent + icon so the
              duality reads at a glance. */}
          <KpiCard
            label={t('verdict.verifiedAttackPaths')}
            value={loading ? undefined : d?.verified_attack_paths ?? 0}
            loading={loading}
            empty={errored}
            emptyHint={t('verdict.unavailable')}
            invertDelta
            tone={RED}
            icon={<ShieldAlert size={16} />}
            onClick={onNavigate ? goRoute('_attack_paths') : undefined}
          />
          <KpiCard
            label={t('verdict.verifiedSafe')}
            value={loading ? undefined : d?.verified_safe ?? 0}
            loading={loading}
            empty={errored}
            emptyHint={t('verdict.unavailable')}
            tone={GREEN}
            icon={<ShieldCheck size={16} />}
            onClick={onNavigate ? goRoute('_attack_paths') : undefined}
          />

          <KpiCard
            label={t('verdict.critical')}
            value={loading ? undefined : d?.critical ?? 0}
            loading={loading}
            empty={errored}
            invertDelta
            // Only alarm-red when there's actually an open critical; a
            // zero critical stays neutral so the page reads honest.
            tone={!loading && (d?.critical ?? 0) > 0 ? RED : undefined}
            icon={<AlertOctagon size={16} />}
          />
          <KpiCard
            label={t('verdict.underValidation')}
            value={loading ? undefined : d?.under_validation ?? 0}
            loading={loading}
            empty={errored}
            icon={<SearchCheck size={16} />}
          />
          <KpiCard
            label={t('verdict.fixedThisMonth')}
            value={loading ? undefined : d?.fixed_this_month ?? 0}
            loading={loading}
            empty={errored}
            tone={!loading && (d?.fixed_this_month ?? 0) > 0 ? GREEN : undefined}
            icon={<CheckCircle2 size={16} />}
          />
          <KpiCard
            label={t('verdict.mttv')}
            value={loading ? undefined : fmtHours(d?.mttv_hours)}
            unit={t('verdict.hoursUnit')}
            loading={loading}
            empty={errored}
            icon={<Timer size={16} />}
          />
          <KpiCard
            label={t('verdict.mttr')}
            value={loading ? undefined : fmtHours(d?.mttr_hours)}
            unit={t('verdict.hoursUnit')}
            loading={loading}
            empty={errored}
            icon={<Wrench size={16} />}
          />
        </>
      }
      charts={
        <>
          <ChartCard title={t('verdict.pathResolutionTrend')}>
            <MiniSparkline points={pathResolutionTrend} color={GREEN} />
          </ChartCard>
          <ChartCard title={t('verdict.mttrTrend')}>
            <MiniSparkline points={mttrTrend} color={theme.palette.primary.main} />
          </ChartCard>
        </>
      }
      narrative={
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ShieldAlert size={18} color={RED} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {t('verdict.narrativeTitle')}
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ color: theme.palette.text.secondary, lineHeight: 1.55 }}>
            {t('verdict.narrativeBody')}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2.5, mt: 0.5 }}>
            <LegendChip icon={<ShieldAlert size={14} color={RED} />} label={t('verdict.legend.attackPaths')} color={RED} />
            <LegendChip icon={<ShieldCheck size={14} color={GREEN} />} label={t('verdict.legend.safe')} color={GREEN} />
            <LegendChip icon={<SearchCheck size={14} color={theme.palette.text.secondary} />} label={t('verdict.legend.validating')} color={theme.palette.text.secondary} />
            <LegendChip icon={<CheckCircle2 size={14} color={GREEN} />} label={t('verdict.legend.fixed')} color={GREEN} />
            <LegendChip icon={<AlertOctagon size={14} color={RED} />} label={t('verdict.legend.critical')} color={RED} />
            <LegendChip icon={<Timer size={14} color={theme.palette.text.secondary} />} label={t('verdict.legend.mttv')} color={theme.palette.text.secondary} />
            <LegendChip icon={<Wrench size={14} color={theme.palette.text.secondary} />} label={t('verdict.legend.mttr')} color={theme.palette.text.secondary} />
          </Box>
        </Box>
      }
    />
  )
}

function LegendChip({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
      {icon}
      <Typography variant="caption" sx={{ color, fontWeight: 600 }}>
        {label}
      </Typography>
    </Box>
  )
}

export default VerdictDashboardView
