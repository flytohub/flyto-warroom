/**
 * CTEMManagerView — the manager-mode surface for CTEM Actions.
 *
 * Every number/chart is sourced from a REAL endpoint:
 *   • GET /ctem/priorities?dedup=true  → KPIs + $ impact-at-risk
 *       stacked bar by asset tier + SLA breach gauge/countdown +
 *       attack-path-style bubble (priority × blast/exploit).
 *   • GET /triage-stats                → noise-reduction gauge.
 *
 * Built entirely from the _shared design-system primitives. Client
 * functions imported by DIRECT FILE PATH per the decoupling rule.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import { alpha } from '@mui/material/styles'
import { Clock, DollarSign, ShieldAlert, Percent } from 'lucide-react'

import {
  ManagerDashboard, ChartCard, KpiCard, GaugeChart, StackedBarChart,
  BubbleChart, DonutChart, ManagerActionList, ManagerHero, HeroStat,
  type BubbleSeries, type DonutDatum,
} from '@compounds/_shared'

import { getCTEMPriorities, type CTEMPriorityItem } from '@lib/engine/ctem/ctem'
import { getTriageStats } from '@lib/engine/ctem/findingUnified'
import { qk } from '@lib/queryKeys'
import { SEVERITY_TONE } from '@lib/tokens/severity'
import { t, tOr } from '@lib/i18n';
import { colors } from '@/styles/designTokens'

const ACCENT = colors.section.exposure

const TIER_ORDER: { key: string; label: string; i18nKey: string }[] = [
  { key: 'crown_jewel', label: 'Crown Jewel', i18nKey: 'exposure.ctem.tier.crownJewel' },
  { key: 'customer_facing', label: 'Customer-facing', i18nKey: 'exposure.ctem.tier.customerFacing' },
  { key: 'internal', label: 'Internal', i18nKey: 'exposure.ctem.tier.internal' },
  { key: 'sandbox', label: 'Sandbox', i18nKey: 'exposure.ctem.tier.sandbox' },
]

function fmtUSD(usd: number): string {
  if (!usd || usd <= 0) return '$0'
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(1)}B`
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`
  if (usd >= 1_000) return `$${Math.round(usd / 1_000)}K`
  return `$${Math.round(usd)}`
}

/** Hours until the soonest SLA breach (negative = already breached). */
function hoursUntil(iso?: string): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return (t - Date.now()) / 3_600_000
}

export interface CTEMManagerViewProps {
  orgId: string
}

export function CTEMManagerView({ orgId }: CTEMManagerViewProps) {
  const ctemQ = useQuery({
    queryKey: qk.ctem.priorities(orgId, 'dedup'),
    queryFn: () => getCTEMPriorities(orgId, { dedup: true }),
    staleTime: 60_000,
  })
  const triageQ = useQuery({
    queryKey: qk.exposure.triageStats(orgId),
    queryFn: () => getTriageStats(orgId),
    staleTime: 60_000,
    retry: false,
  })

  const items = useMemo<CTEMPriorityItem[]>(() => ctemQ.data?.items ?? [], [ctemQ.data])
  const loading = ctemQ.isLoading

  // ── KPIs ────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let openCrit = 0, breached = 0, kev = 0
    let lowImpact = 0, midImpact = 0, highImpact = 0
    for (const p of items) {
      if (p.effective_severity === 'critical') openCrit++
      if (p.breached) breached++
      if (p.kev_listed) kev++
      if (p.impact) {
        lowImpact += p.impact.low_usd
        midImpact += p.impact.mid_usd
        highImpact += p.impact.high_usd
      }
    }
    return { openCrit, breached, kev, lowImpact, midImpact, highImpact, total: items.length }
  }, [items])

  // ── $ impact-at-risk stacked bar by asset tier ──────────────────
  // Each tier shows low / mid-incremental / high-incremental USD so
  // the stack reads as the "low→high exposure band" per tier.
  const impactByTier = useMemo(() => {
    const buckets: Record<string, { low: number; mid: number; high: number }> = {}
    for (const t of TIER_ORDER) buckets[t.key] = { low: 0, mid: 0, high: 0 }
    for (const p of items) {
      if (!p.impact) continue
      const b = buckets[p.asset_tier] ?? buckets.internal
      b.low += p.impact.low_usd
      b.mid += p.impact.mid_usd
      b.high += p.impact.high_usd
    }
    const categories = TIER_ORDER.map(t => tOr(t.i18nKey, t.label))
    const lowData = TIER_ORDER.map(t => Math.round(buckets[t.key].low))
    const midInc = TIER_ORDER.map(t => Math.max(0, Math.round(buckets[t.key].mid - buckets[t.key].low)))
    const highInc = TIER_ORDER.map(t => Math.max(0, Math.round(buckets[t.key].high - buckets[t.key].mid)))
    const hasData = lowData.some(v => v > 0) || midInc.some(v => v > 0) || highInc.some(v => v > 0)
    return { categories, lowData, midInc, highInc, hasData }
  }, [items])

  // ── SLA breach gauge + soonest countdown ────────────────────────
  const sla = useMemo(() => {
    const withClock = items.filter(p => p.sla_breach_at || p.breached)
    const breachedCount = items.filter(p => p.breached).length
    const pct = withClock.length > 0 ? Math.round((breachedCount / withClock.length) * 100) : 0
    // Soonest upcoming (not-yet-breached) breach.
    let soonest: number | null = null
    for (const p of items) {
      if (p.breached) continue
      const h = hoursUntil(p.sla_breach_at)
      if (h != null && h > 0 && (soonest == null || h < soonest)) soonest = h
    }
    return { pct, breachedCount, totalWithClock: withClock.length, soonest }
  }, [items])

  // ── Attack-path-style bubble — priority × exploit, sized by impact ─
  // x = priority_score, y = exploit signal (epss% + KEV boost),
  // z = mid_usd impact. Coloured by effective severity.
  const bubble = useMemo<BubbleSeries[]>(() => {
    const bySev: Record<string, { x: number; y: number; z: number }[]> = {}
    for (const p of items) {
      const sev = (p.effective_severity || '') as keyof typeof SEVERITY_TONE
      const key = sev in SEVERITY_TONE ? sev : ''
      const exploit = Math.round((p.epss_score || 0) * 100) + (p.kev_listed ? 100 : 0)
      const z = p.impact ? Math.max(4, Math.round(p.impact.mid_usd / 50_000)) : 6
      ;(bySev[key] ??= []).push({ x: p.priority_score, y: exploit, z })
    }
    return Object.entries(bySev)
      .filter(([, pts]) => pts.length > 0)
      .map(([sev, data]) => ({
        name: sev ? sev[0].toUpperCase() + sev.slice(1) : 'Other',
        data,
        severity: sev as BubbleSeries['severity'],
      }))
  }, [items])

  // ── Severity mix donut ──────────────────────────────────────────
  const sevDonut = useMemo<DonutDatum[]>(() => {
    const counts: Record<string, number> = {}
    for (const p of items) counts[p.effective_severity] = (counts[p.effective_severity] || 0) + 1
    return (['critical', 'high', 'medium', 'low'] as const)
      .filter(s => counts[s])
      .map(s => ({ label: s[0].toUpperCase() + s.slice(1), value: counts[s], severity: s }))
  }, [items])

  const noiseStats = triageQ.data
  const countdownLabel = sla.soonest != null
    ? (sla.soonest < 24 ? `${Math.round(sla.soonest)}h` : `${Math.round(sla.soonest / 24)}d`)
    : null

  // Hero SLA chip warms amber → red as breach pressure climbs.
  const slaChipTone =
    sla.pct >= 50 ? colors.semantic.danger
      : sla.pct >= 20 ? colors.semantic.warning
        : ACCENT
  const heroSub = stats.total === 0
    ? t('exposure.ctem.hero.empty')
    : sla.breachedCount > 0
      ? tOr(
          countdownLabel ? 'exposure.ctem.hero.breachedWithCountdown' : 'exposure.ctem.hero.breached',
          countdownLabel ? '{count} SLA already breached · next breach in {countdown}' : '{count} SLA already breached',
          { count: sla.breachedCount, countdown: countdownLabel ?? '' },
        )
      : countdownLabel
        ? t('exposure.ctem.hero.pressureWithCountdown', { countdown: countdownLabel })
        : t('exposure.ctem.hero.openNoSla', { count: stats.total })
  const priorityItems = useMemo(() => {
    return [...items]
      .sort((a, b) => {
        const pressure = (p: CTEMPriorityItem) =>
          p.priority_score +
          (p.breached ? 30 : 0) +
          (p.kev_listed ? 25 : 0) +
          (p.impact ? Math.min(25, p.impact.mid_usd / 100_000) : 0)
        return pressure(b) - pressure(a)
      })
      .slice(0, 6)
      .map((item) => {
        const owner = item.assigned_to || 'unassigned'
        const clock = item.breached
          ? t('exposure.ctem.sla.breached')
          : item.sla_breach_at
            ? t('exposure.ctem.sla.withCountdown', { countdown: hoursUntil(item.sla_breach_at) != null ? countdownText(hoursUntil(item.sla_breach_at)!) : t('exposure.ctem.sla.scheduled') })
            : t('exposure.ctem.sla.none')
        return {
          id: item.fingerprint || item.id,
          title: item.title,
          subtitle: item.domain || item.repo_id || item.category,
          meta: [owner, clock, item.kev_listed ? t('exposure.ctem.kevShort') : null, item.impact ? t('exposure.ctem.confidenceMeta', { confidence: item.impact.confidence }) : null].filter(Boolean).join(' · '),
          value: item.impact ? fmtUSD(item.impact.mid_usd) : `${Math.round(item.priority_score)}`,
          severity: item.effective_severity as BubbleSeries['severity'],
        }
      })
  }, [items])

  return (
    <ManagerDashboard
      title={t('exposure.ctem.managerTitle')}
      subtitle={t('exposure.ctem.managerSubtitle')}
      accent={ACCENT}
      titleIcon={<DollarSign size={20} />}
      layout="hero-split"
      hero={
        <ManagerHero
          accent={ACCENT}
          icon={<DollarSign size={15} />}
          minHeight={200}
          visual={
            sla.totalWithClock > 0 ? (
              <GaugeChart
                value={sla.pct}
                max={100}
                label={t('exposure.ctem.gaugeBreachedLabel', { breached: sla.breachedCount, total: sla.totalWithClock })}
                grade={sla.pct >= 50 ? 'bad' : sla.pct >= 20 ? 'warn' : 'good'}
                height={188}
              />
            ) : undefined
          }
          headline={{
            label: t('exposure.ctem.kpi.impactAtRiskMid'),
            value: loading ? '—' : fmtUSD(stats.midImpact),
            sub: heroSub,
            delta: countdownLabel ? (
              <Chip
                size="small"
                icon={<Clock size={13} />}
                label={t('exposure.ctem.nextBreachIn', { countdown: countdownLabel })}
                sx={{
                  fontWeight: 700, fontSize: 12,
                  bgcolor: alpha(slaChipTone, 0.16), color: slaChipTone,
                  '& .MuiChip-icon': { color: 'inherit' },
                }}
              />
            ) : undefined,
          }}
          aside={
            <Box>
              <HeroStat
                icon={<Percent size={14} />}
                tone={slaChipTone}
                label={t('exposure.ctem.kpi.slaBreached')}
                value={sla.totalWithClock > 0 ? `${sla.pct}%` : '—'}
              />
              <HeroStat
                icon={<ShieldAlert size={14} />}
                tone={colors.semantic.danger}
                label={t('exposure.ctem.kpi.kevListed')}
                value={loading ? '—' : stats.kev}
              />
            </Box>
          }
        />
      }
      kpis={
        <>
          <KpiCard
            label={t('exposure.ctem.kpi.openFindings')}
            value={loading ? null : stats.total}
            loading={loading}
            empty={!loading && stats.total === 0}
            emptyHint={t('exposure.ctem.empty.openFindings')}
          />
          <KpiCard
            label={t('exposure.ctem.kpi.openCriticals')}
            value={loading ? null : stats.openCrit}
            invertDelta
            loading={loading}
          />
          <KpiCard
            label={t('exposure.ctem.kpi.slaBreached')}
            value={loading ? null : sla.breachedCount}
            invertDelta
            loading={loading}
          />
          <KpiCard
            label={t('exposure.ctem.kpi.impactAtRiskMid')}
            value={loading ? null : fmtUSD(stats.midImpact)}
            loading={loading}
            empty={!loading && stats.midImpact === 0}
            emptyHint={t('exposure.ctem.empty.monetizedImpact')}
          />
          <KpiCard
            label={t('exposure.ctem.kpi.kevListed')}
            value={loading ? null : stats.kev}
            invertDelta
            loading={loading}
          />
        </>
      }
      charts={
        <>
          <ChartCard
            title={
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>{t('exposure.ctem.chart.impactByAssetTier')}</span>
                <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>
                  {t('exposure.ctem.chart.totalBand', { low: fmtUSD(stats.lowImpact), high: fmtUSD(stats.highImpact) })}
                </Typography>
              </Box>
            }
          >
            {impactByTier.hasData ? (
              <StackedBarChart
                categories={impactByTier.categories}
                series={[
                  { name: t('exposure.ctem.series.low'), data: impactByTier.lowData, severity: 'low' },
                  { name: t('exposure.ctem.series.midIncremental'), data: impactByTier.midInc, severity: 'medium' },
                  { name: t('exposure.ctem.series.highIncremental'), data: impactByTier.highInc, severity: 'critical' },
                ]}
                height={260}
              />
            ) : (
              <EmptyCell text={t('exposure.ctem.empty.monetizedImpactOnFindings')} />
            )}
          </ChartCard>

          <ChartCard title={t('exposure.ctem.chart.noiseReduction')}>
            {noiseStats && noiseStats.total_issues > 0 ? (
              <GaugeChart
                value={Math.round(noiseStats.noise_reduction_pct)}
                max={100}
                label={t('exposure.ctem.gaugeSuppressedLabel', { filtered: noiseStats.noise_filtered, total: noiseStats.total_issues })}
                grade={noiseStats.noise_reduction_pct >= 50 ? 'good' : 'neutral'}
              />
            ) : (
              <EmptyCell text={triageQ.isError ? t('exposure.ctem.empty.reachabilityUnavailable') : t('exposure.ctem.empty.reachability')} />
            )}
          </ChartCard>

          <ChartCard title={t('exposure.ctem.chart.attackSurfacePriority')}>
            {bubble.length > 0 ? (
              <BubbleChart
                series={bubble}
                xTitle={t('exposure.ctem.axis.priorityScore')}
                yTitle={t('exposure.ctem.axis.exploitSignal')}
                xMax={100}
                height={260}
              />
            ) : (
              <EmptyCell text={t('exposure.ctem.empty.findingsToPlot')} />
            )}
          </ChartCard>

          <ChartCard title={t('exposure.ctem.chart.severityMix')}>
            {sevDonut.length > 0 ? (
              <DonutChart data={sevDonut} totalLabel={t('common.findings')} />
            ) : (
              <EmptyCell text={t('common.noFindings')} />
            )}
          </ChartCard>
        </>
      }
      workItems={
        <ManagerActionList
          title={t('exposure.ctem.actionList.title')}
          subtitle={t('exposure.ctem.actionList.subtitle')}
          items={priorityItems}
          emptyText={t('exposure.ctem.actionList.empty')}
          actionLabel={t('common.act')}
        />
      }
      narrative={
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
            {t('exposure.ctem.narrative.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {stats.total === 0
              ? t('exposure.ctem.narrative.empty')
              : tOr(
                  impactByTier.hasData ? 'exposure.ctem.narrative.withTierData' : 'exposure.ctem.narrative.withoutTierData',
                  impactByTier.hasData
                    ? '{count} open findings carry an estimated {low}–{high} financial exposure (mid {mid}). {breached} have breached SLA{next}. {kev} are CISA-KEV listed (actively exploited). Crown-jewel and customer-facing tiers carry the heaviest dollar band. Switch to engineer mode (top bar) to triage the queue and drill into any finding.'
                    : '{count} open findings carry an estimated {low}–{high} financial exposure (mid {mid}). {breached} have breached SLA{next}. {kev} are CISA-KEV listed (actively exploited). Switch to engineer mode (top bar) to triage the queue and drill into any finding.',
                  {
                    count: stats.total,
                    low: fmtUSD(stats.lowImpact),
                    high: fmtUSD(stats.highImpact),
                    mid: fmtUSD(stats.midImpact),
                    breached: sla.breachedCount,
                    next: countdownLabel ? t('exposure.ctem.narrative.nextBreachClause', { countdown: countdownLabel }) : '',
                    kev: stats.kev,
                  },
                )}
          </Typography>
          {noiseStats && noiseStats.total_issues > 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {t('exposure.ctem.narrative.reachabilitySuppressed', {
                pct: Math.round(noiseStats.noise_reduction_pct),
                filtered: noiseStats.noise_filtered,
                total: noiseStats.total_issues,
              })}
            </Typography>
          )}
        </Box>
      }
    />
  )
}

function countdownText(hours: number): string {
  if (hours <= 0) return t('common.now')
  return hours < 24 ? t('common.inHoursCompact', { hours: Math.round(hours) }) : t('common.inDaysCompact', { days: Math.round(hours / 24) })
}

function EmptyCell({ text }: { text: string }) {
  return (
    <Box sx={{ height: 260, display: 'grid', placeItems: 'center' }}>
      <Typography variant="body2" color="text.secondary">{text}</Typography>
    </Box>
  )
}
