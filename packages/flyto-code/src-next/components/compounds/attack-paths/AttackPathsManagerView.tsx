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
import { Crosshair, Radar, Target, Flame, ChevronRight } from 'lucide-react'

import {
  ManagerDashboard, ChartCard, KpiCard, DonutChart, BubbleChart,
  ManagerActionList, ManagerHero,
  type DonutDatum,
} from '@compounds/_shared'
import {
  getAttackPaths, type AttackPathCandidate, type AttackPathCategory,
} from '@lib/engine/code/attackPaths'
import { useOrg } from '@hooks/useOrg'
import { qk } from '@lib/queryKeys'
import { t } from '@lib/i18n';
import { colors } from '@/styles/designTokens'

const ACCENT = colors.semantic.danger // offense red

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
  const theme = useTheme()

  const { data, isLoading } = useQuery({
    queryKey: qk.ctem.attackPathsManager(orgId),
    queryFn: () => getAttackPaths(orgId!, { limit: 100, minConfidence: 'low', sort: 'confidence' }),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  })

  const candidates = useMemo(() => data?.candidates ?? [], [data])
  const summary = data?.signals_summary

  const stats = useMemo(() => {
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
        ? colors.semantic.danger
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
      layout="hero-split"
      hero={
        <ManagerHero
          accent={ACCENT}
          icon={<Crosshair size={15} />}
          minHeight={200}
          visual={
            top ? (
              <Box
                sx={{
                  width: 168, height: 168, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: 0.25,
                  border: `2px solid ${alpha(topTone, 0.55)}`,
                  bgcolor: alpha(topTone, theme.palette.mode === 'dark' ? 0.12 : 0.08),
                  boxShadow: `0 0 32px ${alpha(topTone, 0.3)}`,
                }}
              >
                <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>
                  {t('attackpath.manager.confidenceLabel')}
                </Typography>
                <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 44, fontWeight: 800, lineHeight: 1, color: topTone }}>
                  {Math.round(top.confidence_score)}
                </Typography>
                <Chip
                  size="small"
                  label={top.confidence.toUpperCase()}
                  sx={{
                    mt: 0.5, fontWeight: 800, fontSize: 12, height: 22,
                    bgcolor: alpha(topTone, 0.18), color: topTone,
                  }}
                />
              </Box>
            ) : undefined
          }
          headline={{
            label: t('attackpath.manager.heroLabel'),
            value: top ? top.title : '—',
            sub: top
              ? `${CATEGORY_LABEL[top.category] ?? top.category} · ${t('attackpath.manager.heroExposure')} ${Math.round(top.exposure)}/40 · ${t('attackpath.manager.heroCorrelation')} ${Math.round(top.correlation)}/60 · ${top.red_team_validation.length} ${t('attackpath.manager.heroValidationSteps')}`
              : t('attackpath.manager.heroEmpty'),
            delta: top && top.validation_readiness === 'high' ? (
              <Chip
                size="small"
                label={t('attackpath.manager.heroValidatable')}
                sx={{
                  fontWeight: 700, fontSize: 12,
                  bgcolor: alpha(colors.semantic.danger, 0.14),
                  color: colors.semantic.danger,
                }}
              />
            ) : undefined,
          }}
          tintValue={false}
          aside={
            killChain ? (
              <Box>
                <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary', mb: 0.75 }}>
                  {t('attackpath.manager.killchain.title')}
                </Typography>
                <KillChainRow icon={<Radar size={14} />} tone={ACCENT}
                  label={t('attackpath.manager.killchain.source')} value={killChain.src} />
                <KillChainConnector />
                <KillChainRow icon={<Target size={14} />} tone={ACCENT}
                  label={t('attackpath.manager.killchain.asset')}
                  value={killChain.assetExtra > 0 ? `${killChain.asset} +${killChain.assetExtra}` : killChain.asset} />
                <KillChainConnector />
                <KillChainRow icon={<Flame size={14} />} tone={topTone}
                  label={t('attackpath.manager.killchain.impact')} value={killChain.impact} />
              </Box>
            ) : undefined
          }
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
          />
          <KpiCard
            label={t('attackpath.manager.kpiHighConfidence')}
            value={isLoading ? null : stats.high}
            invertDelta
            loading={isLoading}
            empty={!isLoading && !hasData}
          />
          <KpiCard
            label={t('attackpath.manager.kpiValidatableNow')}
            value={isLoading ? null : stats.validatable}
            unit={hasData ? `of ${candidates.length}` : undefined}
            loading={isLoading}
          />
          <KpiCard
            label={t('attackpath.manager.kpiRecentSignals')}
            value={isLoading ? null : (summary?.why_now_signals_last_30d ?? stats.whyNow)}
            invertDelta
            loading={isLoading}
          />
        </>
      }
      charts={
        <>
          <ChartCard title={t('attackpath.manager.chartExposureByCategory')}>
            {categoryDonut.length > 0 ? (
              <DonutChart data={categoryDonut} totalLabel="Paths" height={260} />
            ) : (
              <EmptyChart text="No candidates yet" />
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
                height={260}
              />
            ) : (
              <EmptyChart text="No candidates to plot" />
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

function EmptyChart({ text }: { text: string }) {
  return (
    <Box sx={{ height: 260, display: 'grid', placeItems: 'center' }}>
      <Typography variant="body2" color="text.secondary">{text}</Typography>
    </Box>
  )
}

/** One segment of the hero's source → asset → impact kill-chain rail. */
function KillChainRow({
  icon, label, value, tone,
}: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box sx={{ color: tone, display: 'flex', flexShrink: 0 }}>{icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'text.secondary', lineHeight: 1.2 }}>
          {label}
        </Typography>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
          {value}
        </Typography>
      </Box>
    </Box>
  )
}

function KillChainConnector() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', pl: '5px', py: 0.25 }}>
      <ChevronRight size={13} style={{ opacity: 0.45, transform: 'rotate(90deg)' }} />
    </Box>
  )
}
