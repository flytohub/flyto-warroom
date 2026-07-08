/**
 * AttackPathsManagerView — manager lens for the attacker's-eye view.
 *
 * Converts the same attack-path candidate feed the engineer table reads
 * into an executive risk picture: how many credible initial-access
 * hypotheses exist, how many are high-confidence, how many the red team
 * can validate right now, and where exposure concentrates by category.
 *
 * Every number comes from GET /orgs/{id}/attack-paths (full feed at
 * minConfidence=low). No fabricated metrics — empty states fall through
 * to the primitives' em-dash / placeholder rendering.
 *
 * Foundation rule: engine client functions imported by DIRECT FILE PATH.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import { alpha, useTheme } from '@mui/material/styles'
import { Activity, Crosshair, Flame, GitBranch, Radar, ShieldCheck, Target } from 'lucide-react'

import {
  ManagerDashboard, ChartCard, KpiCard, DonutChart, BubbleChart,
  ManagerActionList,
  type DonutDatum,
} from '@compounds/_shared'
import {
  getAttackPaths, type AttackPathCandidate, type AttackPathCategory, type AttackPathSignalsSummary,
} from '@lib/engine/code/attackPaths'
import { useOrg } from '@hooks/useOrg'
import { qk } from '@lib/queryKeys'
import { t } from '@lib/i18n';
import { colors } from '@/styles/designTokens'

const ACCENT = colors.section.exposure
const ATTACK = colors.semantic.danger

interface AttackPathStats {
  high: number
  medium: number
  low: number
  validatable: number
  whyNow: number
  byCategory: Record<string, number>
}

interface KillChainSummary {
  src: string
  asset: string
  impact: string
  assetExtra: number
}

const EVIDENCE_SOURCE_LABEL: Record<string, string> = {
  attack_surface: 'Attack surface',
  dns_security: 'DNS security',
  code_alert: 'Code alert',
  repo_pr_cache: 'Open PR',
  github_exposure: 'GitHub exposure',
  breach_exposure: 'Breach leak',
  threat_intel: 'Threat intel',
  external_issue_tracker: 'Tracked issue',
}

const CATEGORY_LABEL: Record<AttackPathCategory, string> = {
  initial_access: 'Initial Access',
  web_app: 'Web Portal',
  information_exposure: 'Public Exposure',
  email_spoofing: 'Email Spoofing',
  supply_chain: 'Supply Chain',
}

function confidenceSeverity(c: AttackPathCandidate): 'critical' | 'high' | 'medium' | 'low' {
  if (c.confidence === 'high') return 'critical'
  if (c.confidence === 'medium') return 'high'
  return 'medium'
}

export function AttackPathsManagerView() {
  const { org } = useOrg()
  const orgId = org?.id

  const { data, isLoading } = useQuery({
    queryKey: qk.ctem.attackPathsManager(orgId),
    queryFn: () => getAttackPaths(orgId!, { limit: 100, minConfidence: 'low', sort: 'confidence' }),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  })

  const candidates = useMemo(() => data?.candidates ?? [], [data])
  const summary = data?.signals_summary

  const stats: AttackPathStats = useMemo(() => {
    let high = 0, medium = 0, low = 0
    let validatable = 0
    let whyNow = 0
    const byCategory: Record<string, number> = {}
    candidates.forEach(c => {
      if (c.confidence === 'high') high++
      else if (c.confidence === 'medium') medium++
      else low++
      if (c.validation_readiness === 'high') validatable++
      if (c.why_now && c.why_now.length > 0) whyNow++
      byCategory[c.category] = (byCategory[c.category] ?? 0) + 1
    })
    return { high, medium, low, validatable, whyNow, byCategory }
  }, [candidates])

  const categoryDonut: DonutDatum[] = useMemo(() =>
    Object.entries(stats.byCategory).map(([cat, n]) => ({
      label: CATEGORY_LABEL[cat as AttackPathCategory] ?? cat,
      value: n,
    })),
    [stats.byCategory],
  )

  // Exposure (x, 0-40) vs Correlation (y, 0-60), bubble size = overall
  // confidence score. Severity colours the cloud by confidence band so
  // a manager sees the "real & exposed" upper-right quadrant at a glance.
  const bubbleSeries = useMemo(() => {
    const bands: Record<'critical' | 'high' | 'medium' | 'low', { x: number; y: number; z: number }[]> = {
      critical: [], high: [], medium: [], low: [],
    }
    candidates.forEach(c => {
      bands[confidenceSeverity(c)].push({
        x: c.exposure,
        y: c.correlation,
        z: Math.max(4, Math.round(c.confidence_score / 5)),
      })
    })
    const out = []
    if (bands.critical.length) out.push({ name: t('attackpath.manager.bubble.highConfidence'), data: bands.critical, severity: 'critical' as const })
    if (bands.high.length) out.push({ name: t('autofix.confidenceMedium'), data: bands.high, severity: 'high' as const })
    if (bands.medium.length) out.push({ name: t('autofix.confidenceLow'), data: bands.medium, severity: 'medium' as const })
    return out
  }, [candidates])

  const hasData = candidates.length > 0

  // Single ranked ordering shared by the hero (top path) and the queue.
  const ranked = useMemo(() => {
    const score = (candidate: AttackPathCandidate) =>
      candidate.confidence_score +
      candidate.validation_readiness_score +
      (candidate.why_now?.length ?? 0) * 10
    return [...candidates].sort((a, b) => score(b) - score(a))
  }, [candidates])

  // The 重點: the most-reachable path at the top of the queue, plus a
  // source → asset → impact kill-chain derived from its own evidence,
  // targets and category. No new data — all read off the candidate.
  const top = ranked[0]
  const killChain = useMemo(() => {
    if (!top) return null
    const src = top.evidence.length > 0
      ? (EVIDENCE_SOURCE_LABEL[top.evidence[0].source] ?? top.evidence[0].source)
      : t('attackpath.manager.killchain.recon')
    const asset = top.targets.length > 0
      ? top.targets[0].value
      : '—'
    const impact = CATEGORY_LABEL[top.category] ?? top.category
    return { src, asset, impact, assetExtra: Math.max(0, top.targets.length - 1) }
  }, [top])

  const pathQueue = useMemo(() => {
    return ranked
      .slice(0, 6)
      .map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
        subtitle: CATEGORY_LABEL[candidate.category] ?? candidate.category,
        meta: `${candidate.targets.length} targets · ${candidate.evidence.length} evidence · ${candidate.red_team_validation.length} validation steps`,
        value: `${Math.round(candidate.confidence_score)}`,
        severity: confidenceSeverity(candidate),
      }))
  }, [ranked])

  // Confidence badge colour band for the hero's headline value.
  const topTone = top
    ? (top.confidence === 'high'
        ? ATTACK
        : top.confidence === 'medium'
          ? colors.semantic.warning
          : colors.semantic.success)
    : ACCENT

  return (
    <ManagerDashboard
      title={t('attackpath.manager.title')}
      subtitle={t('attackpath.manager.subtitle')}
      accent={ACCENT}
      titleIcon={<Crosshair size={20} />}
      layout="dashboard"
      chartMinWidth={300}
      hero={
        <AttackPathCommandHero
          top={top}
          killChain={killChain}
          stats={stats}
          summary={summary}
          topTone={topTone}
          isLoading={isLoading}
        />
      }
      kpis={
        <>
          <KpiCard
            label={t('attackpath.title')}
            value={isLoading ? null : candidates.length}
            invertDelta
            loading={isLoading}
            empty={!isLoading && !hasData}
            emptyHint="No candidates surfaced"
            tone={ATTACK}
            icon={<GitBranch size={15} />}
          />
          <KpiCard
            label={t('attackpath.manager.kpiHighConfidence')}
            value={isLoading ? null : stats.high}
            invertDelta
            loading={isLoading}
            empty={!isLoading && !hasData}
            tone={stats.high > 0 ? ATTACK : colors.semantic.success}
            icon={<Flame size={15} />}
          />
          <KpiCard
            label={t('attackpath.manager.kpiValidatableNow')}
            value={isLoading ? null : stats.validatable}
            unit={hasData ? `of ${candidates.length}` : undefined}
            loading={isLoading}
            tone={colors.semantic.success}
            icon={<ShieldCheck size={15} />}
          />
          <KpiCard
            label={t('attackpath.manager.kpiRecentSignals')}
            value={isLoading ? null : (summary?.why_now_signals_last_30d ?? stats.whyNow)}
            invertDelta
            loading={isLoading}
            tone={colors.tech}
            icon={<Activity size={15} />}
          />
        </>
      }
      charts={
        <>
          <ChartCard title={t('attackpath.manager.chartExposureByCategory')}>
            {categoryDonut.length > 0 ? (
              <DonutChart data={categoryDonut} totalLabel="Paths" height={220} />
            ) : (
              <AttackPathEmptyChart text="尚未形成可信攻擊路徑" />
            )}
          </ChartCard>

          <ChartCard title={t('hardcoded.exposure.correlation.1840d45e')}>
            {bubbleSeries.length > 0 ? (
              <BubbleChart
                series={bubbleSeries}
                xTitle="Exposure"
                yTitle="Correlation"
                xMax={40}
                yMax={60}
                height={220}
              />
            ) : (
              <AttackPathEmptyChart text="偵察訊號尚未收斂成路徑群" />
            )}
          </ChartCard>
        </>
      }
      workItems={
        <ManagerActionList
          title={t('attackpath.manager.validationQueueTitle')}
          subtitle={t('attackpath.manager.validationQueueSubtitle')}
          items={pathQueue}
          emptyText="No attack paths need validation"
          actionLabel="Validate"
        />
      }
      narrative={
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
            Where an Attacker Would Start
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {!hasData
              ? 'No attack-path hypotheses have surfaced yet. Run discovery scans or connect repositories to feed the signal collectors, then this view ranks the most credible initial-access routes.'
              : `${candidates.length} initial-access hypothesis(es) converged from recon — ${stats.high} at high confidence, ${stats.validatable} ready for red-team validation today${summary ? `. Signal base: ${summary.external_assets} external assets, ${summary.leak_signals} leak signal(s), DMARC ${summary.dmarc_status || 'unknown'}.` : '.'} Switch to engineer mode for per-candidate evidence, red-team steps, and recon-mode restrictions.`}
          </Typography>
        </Box>
      }
    />
  )
}

function AttackPathCommandHero({
  top,
  killChain,
  stats,
  summary,
  topTone,
  isLoading,
}: {
  top?: AttackPathCandidate
  killChain: KillChainSummary | null
  stats: AttackPathStats
  summary?: AttackPathSignalsSummary
  topTone: string
  isLoading: boolean
}) {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  const score = top ? Math.round(top.confidence_score) : 0
  const readiness = top ? Math.round(top.validation_readiness_score) : 0
  const source = killChain?.src ?? 'Recon pending'
  const asset = killChain ? (killChain.assetExtra > 0 ? `${killChain.asset} +${killChain.assetExtra}` : killChain.asset) : 'No target'
  const impact = killChain?.impact ?? 'No impact path'

  return (
    <Box sx={{
      position: 'relative',
      overflow: 'hidden',
      minHeight: { xs: 360, lg: 236 },
      borderRadius: 1,
      border: '1px solid',
      borderColor: alpha(ACCENT, dark ? 0.42 : 0.28),
      bgcolor: alpha(theme.palette.background.paper, dark ? 0.62 : 0.94),
      backgroundImage: `
        linear-gradient(90deg, ${alpha(ACCENT, dark ? 0.08 : 0.045)} 1px, transparent 1px),
        linear-gradient(0deg, ${alpha(ACCENT, dark ? 0.07 : 0.04)} 1px, transparent 1px),
        radial-gradient(circle at 18% 18%, ${alpha(topTone, dark ? 0.22 : 0.12)} 0%, transparent 31%),
        radial-gradient(circle at 88% 12%, ${alpha(colors.tech, dark ? 0.16 : 0.08)} 0%, transparent 24%)
      `,
      backgroundSize: '38px 38px, 38px 38px, auto, auto',
      p: { xs: 1.25, md: 1.5 },
      display: 'grid',
      gap: 1.25,
      gridTemplateColumns: {
        xs: 'minmax(0, 1fr)',
        lg: 'minmax(210px, 0.72fr) minmax(0, 1.45fr) minmax(210px, 0.78fr)',
      },
      alignItems: 'stretch',
      '&::after': {
        content: '""',
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        borderTop: `1px solid ${alpha(colors.tech, dark ? 0.32 : 0.18)}`,
      },
    }}>
      <Box sx={{
        position: 'relative',
        zIndex: 1,
        borderRadius: 1,
        border: '1px solid',
        borderColor: alpha(theme.palette.text.primary, dark ? 0.14 : 0.08),
        bgcolor: alpha(theme.palette.background.paper, dark ? 0.54 : 0.72),
        p: 1.25,
        display: 'grid',
        gridTemplateRows: '1fr auto',
        gap: 1,
        minWidth: 0,
      }}>
        <ConfidenceRadar score={score} readiness={readiness} tone={topTone} loading={isLoading} />
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 0.75 }}>
          <CommandMetric label="高信心" value={isLoading ? '—' : stats.high} tone={ATTACK} />
          <CommandMetric label="中/低" value={isLoading ? '—' : `${stats.medium}/${stats.low}`} tone={colors.semantic.warning} />
        </Box>
      </Box>

      <Box sx={{
        position: 'relative',
        zIndex: 1,
        minWidth: 0,
        borderRadius: 1,
        border: '1px solid',
        borderColor: alpha(ACCENT, dark ? 0.26 : 0.16),
        bgcolor: alpha(theme.palette.background.paper, dark ? 0.42 : 0.66),
        p: { xs: 1.25, md: 1.5 },
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr) auto',
        gap: 1.2,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 900, color: ATTACK, display: 'flex', alignItems: 'center', gap: 0.7 }}>
              <Crosshair size={14} />
              最可達初始存取路徑
            </Typography>
            <Typography sx={{
              mt: 0.35,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: { xs: 22, md: 28 },
              fontWeight: 950,
              lineHeight: 1.08,
              letterSpacing: 0,
              color: 'text.primary',
              overflowWrap: 'anywhere',
            }}>
              {top ? top.title : '尚未形成可信攻擊路徑'}
            </Typography>
          </Box>
          {top && (
            <Chip
              size="small"
              label={top.validation_readiness === 'high' ? '今日可驗證' : `${top.validation_readiness} readiness`}
              icon={<ShieldCheck size={13} />}
              sx={{
                height: 26,
                borderRadius: 1,
                fontWeight: 900,
                color: top.validation_readiness === 'high' ? ATTACK : topTone,
                bgcolor: alpha(top.validation_readiness === 'high' ? ATTACK : topTone, 0.12),
                '& .MuiChip-icon': { color: 'inherit' },
              }}
            />
          )}
        </Box>

        <Box sx={{
          display: 'grid',
          alignItems: 'center',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 38px minmax(0, 1.2fr) 38px minmax(0, 1fr)' },
          gap: { xs: 0.8, md: 0.9 },
          minWidth: 0,
        }}>
          <RouteNode icon={<Radar size={16} />} label="來源" value={source} detail={top?.evidence[0]?.kind ?? 'signal'} tone={ACCENT} />
          <RouteConnector />
          <RouteNode icon={<Target size={16} />} label="資產" value={asset} detail={top ? `${top.targets.length} target${top.targets.length === 1 ? '' : 's'}` : 'pending'} tone={colors.tech} />
          <RouteConnector />
          <RouteNode icon={<Flame size={16} />} label="影響" value={impact} detail={top ? `${top.red_team_validation.length} steps` : 'pending'} tone={topTone} />
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 0.8 }}>
          <SignalMeter label="Exposure" value={top ? Math.round(top.exposure) : 0} max={40} tone={ATTACK} />
          <SignalMeter label="Correlation" value={top ? Math.round(top.correlation) : 0} max={60} tone={colors.tech} />
          <SignalMeter label="Readiness" value={readiness} max={100} tone={topTone} />
        </Box>
      </Box>

      <Box sx={{
        position: 'relative',
        zIndex: 1,
        minWidth: 0,
        borderRadius: 1,
        border: '1px solid',
        borderColor: alpha(theme.palette.text.primary, dark ? 0.14 : 0.08),
        bgcolor: alpha(theme.palette.background.paper, dark ? 0.54 : 0.72),
        p: 1.25,
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr)',
        gap: 1,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
          <Activity size={15} color={colors.tech} />
          <Typography sx={{ fontSize: 13, fontWeight: 950 }}>
            指揮訊號
          </Typography>
        </Box>
        <Box sx={{ display: 'grid', gap: 0.75, alignContent: 'start' }}>
          <CommandMetric label="路徑總數" value={isLoading ? '—' : stats.high + stats.medium + stats.low} tone={ATTACK} detail="candidate feed" />
          <CommandMetric label="可驗證" value={isLoading ? '—' : `${stats.validatable}/${stats.high + stats.medium + stats.low}`} tone={colors.semantic.success} detail="red-team ready" />
          <CommandMetric label="30 天訊號" value={isLoading ? '—' : (summary?.why_now_signals_last_30d ?? stats.whyNow)} tone={colors.tech} detail={summary ? `${summary.external_assets} assets / ${summary.leak_signals} leaks` : 'signal base'} />
        </Box>
      </Box>
    </Box>
  )
}

function ConfidenceRadar({
  score,
  readiness,
  tone,
  loading,
}: {
  score: number
  readiness: number
  tone: string
  loading: boolean
}) {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  const radius = 48
  const circumference = 2 * Math.PI * radius
  const dash = circumference * Math.max(0, Math.min(100, score)) / 100
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 142, position: 'relative' }}>
      <Box component="svg" viewBox="0 0 150 150" sx={{ width: 150, height: 150 }}>
        <circle cx="75" cy="75" r="66" fill="none" stroke={alpha(tone, dark ? 0.22 : 0.16)} strokeWidth="1" strokeDasharray="4 8" />
        <circle cx="75" cy="75" r="48" fill="none" stroke={alpha(theme.palette.text.primary, dark ? 0.16 : 0.1)} strokeWidth="10" />
        <circle
          cx="75"
          cy="75"
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform="rotate(-90 75 75)"
        />
        <circle cx="75" cy="75" r="31" fill={alpha(theme.palette.background.paper, dark ? 0.88 : 0.94)} stroke={alpha(tone, 0.24)} strokeWidth="1" />
      </Box>
      <Box sx={{ position: 'absolute', textAlign: 'center' }}>
        <Typography sx={{ fontSize: 10, fontWeight: 900, color: 'text.secondary' }}>
          信心度
        </Typography>
        <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 34, fontWeight: 950, lineHeight: 1, color: tone }}>
          {loading ? '—' : score}
        </Typography>
        <Typography sx={{ mt: 0.3, fontSize: 11, fontWeight: 850, color: 'text.secondary' }}>
          ready {loading ? '—' : readiness}
        </Typography>
      </Box>
    </Box>
  )
}

function RouteNode({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  detail: string
  tone: string
}) {
  const theme = useTheme()
  return (
    <Box sx={{
      minWidth: 0,
      borderRadius: 1,
      border: '1px solid',
      borderColor: alpha(tone, 0.3),
      bgcolor: alpha(tone, theme.palette.mode === 'dark' ? 0.11 : 0.065),
      p: 1,
      display: 'grid',
      gridTemplateColumns: '30px minmax(0, 1fr)',
      gap: 0.8,
      alignItems: 'center',
      minHeight: 72,
    }}>
      <Box sx={{
        width: 30,
        height: 30,
        borderRadius: 1,
        display: 'grid',
        placeItems: 'center',
        color: tone,
        bgcolor: alpha(tone, 0.12),
        border: `1px solid ${alpha(tone, 0.28)}`,
      }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 900, color: tone }}>
          {label}
        </Typography>
        <Typography sx={{ fontSize: 13, fontWeight: 950 }} noWrap title={value}>
          {value}
        </Typography>
        <Typography sx={{ fontSize: 11, color: 'text.secondary' }} noWrap title={detail}>
          {detail}
        </Typography>
      </Box>
    </Box>
  )
}

function RouteConnector() {
  return (
    <Box sx={{
      display: { xs: 'none', md: 'grid' },
      placeItems: 'center',
      minWidth: 0,
    }}>
      <Box sx={{ width: '100%', height: 2, bgcolor: alpha(ACCENT, 0.18), position: 'relative' }}>
        <Box sx={{
          position: 'absolute',
          right: -2,
          top: -4,
          width: 10,
          height: 10,
          borderTop: `2px solid ${alpha(ACCENT, 0.45)}`,
          borderRight: `2px solid ${alpha(ACCENT, 0.45)}`,
          transform: 'rotate(45deg)',
        }} />
      </Box>
    </Box>
  )
}

function SignalMeter({
  label,
  value,
  max,
  tone,
}: {
  label: string
  value: number
  max: number
  tone: string
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.35 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 900, color: 'text.secondary' }}>{label}</Typography>
        <Typography sx={{ fontSize: 11, fontWeight: 950, color: tone }}>{value}/{max}</Typography>
      </Box>
      <Box sx={{ height: 7, borderRadius: 999, bgcolor: alpha(tone, 0.11), overflow: 'hidden' }}>
        <Box sx={{ width: `${pct}%`, height: '100%', borderRadius: 999, bgcolor: tone }} />
      </Box>
    </Box>
  )
}

function CommandMetric({
  label,
  value,
  tone,
  detail,
}: {
  label: string
  value: React.ReactNode
  tone: string
  detail?: string
}) {
  const theme = useTheme()
  return (
    <Box sx={{
      minWidth: 0,
      borderRadius: 1,
      border: '1px solid',
      borderColor: alpha(tone, 0.22),
      bgcolor: alpha(tone, theme.palette.mode === 'dark' ? 0.09 : 0.055),
      px: 1,
      py: 0.75,
    }}>
      <Typography sx={{ fontSize: 11, fontWeight: 900, color: 'text.secondary' }} noWrap>
        {label}
      </Typography>
      <Typography sx={{ mt: 0.2, fontFamily: 'ui-monospace, monospace', fontSize: 20, fontWeight: 950, color: tone, lineHeight: 1 }}>
        {value}
      </Typography>
      {detail && (
        <Typography sx={{ mt: 0.35, fontSize: 10.5, color: 'text.secondary' }} noWrap title={detail}>
          {detail}
        </Typography>
      )}
    </Box>
  )
}

function AttackPathEmptyChart({ text }: { text: string }) {
  return (
    <Box sx={{
      height: 220,
      display: 'grid',
      placeItems: 'center',
      borderRadius: 1,
      border: (theme) => `1px dashed ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.18 : 0.14)}`,
      background: (theme) => `linear-gradient(135deg, ${alpha(ACCENT, theme.palette.mode === 'dark' ? 0.08 : 0.045)}, transparent 60%)`,
    }}>
      <Box sx={{ width: '78%', maxWidth: 380 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 42px 1fr 42px 1fr', alignItems: 'center', mb: 2 }}>
          {['偵察', '資產', '影響'].map((label, idx) => (
            <Box key={label} sx={{
              height: 54,
              borderRadius: 1,
              display: 'grid',
              placeItems: 'center',
              border: `1px solid ${alpha(idx === 2 ? ATTACK : colors.semantic.info, 0.26)}`,
              bgcolor: alpha(idx === 2 ? ATTACK : colors.semantic.info, 0.08),
              color: idx === 2 ? ATTACK : colors.semantic.info,
              fontSize: 12,
              fontWeight: 800,
            }}>
              {label}
            </Box>
          )).flatMap((node, idx, arr) => (
            idx === arr.length - 1 ? [node] : [
              node,
              <Box key={`line-${idx}`} sx={{ height: 2, bgcolor: alpha(ACCENT, 0.22) }} />,
            ]
          ))}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
          <GitBranch size={16} color={ACCENT} />
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.secondary', textAlign: 'center' }}>
            {text}
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}
