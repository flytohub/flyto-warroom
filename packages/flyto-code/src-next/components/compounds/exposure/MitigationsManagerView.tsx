/**
 * MitigationsManagerView — manager-mode surface for compensating
 * controls, centred on TRUST DECAY.
 *
 * The engineer view is the operator catalog (add / edit / verify /
 * evidence ledger). This manager view answers the executive question:
 * "how much of our declared risk-reduction is actually live right now,
 * and how much has decayed into wishful thinking?"
 *
 * Every number is sourced from GET /mitigations — the same endpoint the
 * engineer view reads — using the backend-resolved `evidence_tier`
 * (verified / fading / stale / aspirational) and `freshness_factor`
 * (0..1, what the priority engine actually applies). No client-side
 * re-derivation of the decay math: we render what the engine resolved.
 *
 * Client functions imported by DIRECT FILE PATH per the parallel-safety
 * decoupling rule (not the @lib/engine barrel).
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import { alpha } from '@mui/material/styles'
import { ShieldHalf, ShieldCheck, ShieldAlert, TrendingDown } from 'lucide-react'

import {
  ManagerDashboard,
  ChartCard,
  KpiCard,
  DonutChart,
  StackedBarChart,
  GaugeChart,
  ManagerActionList,
  ManagerHero,
  HeroStat,
  type DonutDatum,
} from '@compounds/_shared'

import {
  listMitigations,
  type Mitigation,
  type EvidenceTier,
} from '@lib/engine/ctem/ctem'
import { qk } from '@lib/queryKeys'
import { t } from '@lib/i18n';
import { colors } from '@/styles/designTokens'

// Decay amber — the warning hue signals "controls erode over time".
const ACCENT = colors.semantic.warning

// Tier presentation order (best → worst) + the severity token each
// tier borrows for color. We map tiers onto the severity palette so
// the dashboard reads at a glance: green = trustworthy, red-ish =
// decayed. Kept in lockstep with the engine thresholds in
// internal/ctem/evidence.go (>=0.999 verified, >=0.5 fading, >0 stale,
// else aspirational).
const TIER_ORDER: EvidenceTier[] = ['verified', 'fading', 'stale', 'aspirational']

// Tier labels for the donut. Slice colors come from the donut's own
// categorical palette — we intentionally don't force severity hues
// because "verified" isn't a severity, it's a trust state.
const TIER_LABEL: Record<EvidenceTier, string> = {
  verified: 'Verified',
  fading: 'Fading',
  stale: 'Stale',
  aspirational: 'Aspirational',
}

function tierOf(m: Mitigation): EvidenceTier {
  return (m.evidence_tier ?? 'aspirational') as EvidenceTier
}

export interface MitigationsManagerViewProps {
  orgId: string
}

export function MitigationsManagerView({ orgId }: MitigationsManagerViewProps) {
  const q = useQuery({
    queryKey: qk.ctem.mitigations(orgId),
    queryFn: () => listMitigations(orgId),
    staleTime: 30_000,
  })

  const items: Mitigation[] = useMemo(() => q.data?.items ?? [], [q.data])
  const loading = q.isLoading

  // ── Aggregate decay metrics ────────────────────────────────────
  const stats = useMemo(() => {
    const total = items.length
    const byTier: Record<EvidenceTier, number> = {
      verified: 0,
      fading: 0,
      stale: 0,
      aspirational: 0,
    }
    let claimedReduction = 0 // Σ severity_reduction (what operators declared)
    let effectiveReduction = 0 // Σ severity_reduction * freshness_factor (what engine applies)
    let liveCount = 0 // tiers the engine still credits (freshness > 0)

    for (const m of items) {
      const tier = tierOf(m)
      byTier[tier] += 1
      const sr = m.severity_reduction ?? 0
      const ff = m.freshness_factor ?? (tier === 'aspirational' ? 0 : 1)
      claimedReduction += sr
      effectiveReduction += sr * ff
      if (ff > 0) liveCount += 1
    }

    // Trust-retained ratio: of all the risk-reduction operators
    // declared, how much is the priority engine still honouring after
    // freshness decay? This is the headline "are our controls real?"
    // number. 100% = every claim is backed by fresh evidence; a low
    // number means the catalog is decorative.
    const trustRetained =
      claimedReduction > 0
        ? Math.round((effectiveReduction / claimedReduction) * 100)
        : 0

    return { total, byTier, claimedReduction, effectiveReduction, liveCount, trustRetained }
  }, [items])

  // Donut: distribution of controls across trust tiers. Slice colors
  // come from the donut's own categorical palette (verified→aspirational
  // reads green→grey there); we don't force severity hues because
  // "verified" isn't a severity.
  const tierDonut: DonutDatum[] = useMemo(
    () =>
      TIER_ORDER.map((t) => ({
        label: TIER_LABEL[t],
        value: stats.byTier[t],
      })).filter((d) => d.value > 0),
    [stats],
  )

  // Stacked bar: claimed vs effective reduction per control type — the
  // "decay gap" made visual. The gap between the two bars in each
  // control-type column is the risk-reduction that has quietly evaporated.
  const decayByType = useMemo(() => {
    const types = Array.from(new Set(items.map((m) => m.control_type)))
    const claimed: number[] = []
    const effective: number[] = []
    for (const ct of types) {
      const rows = items.filter((m) => m.control_type === ct)
      let c = 0
      let e = 0
      for (const m of rows) {
        const sr = m.severity_reduction ?? 0
        const ff = m.freshness_factor ?? (tierOf(m) === 'aspirational' ? 0 : 1)
        c += sr * 100
        e += sr * ff * 100
      }
      claimed.push(Math.round(c))
      effective.push(Math.round(e))
    }
    return { types, claimed, effective }
  }, [items])

  const hasData = stats.total > 0
  const mitigationQueue = useMemo(() => {
    const tierRank: Record<EvidenceTier, number> = { aspirational: 4, stale: 3, fading: 2, verified: 1 }
    const tierSeverity: Record<EvidenceTier, 'critical' | 'high' | 'medium' | 'low'> = {
      aspirational: 'critical',
      stale: 'high',
      fading: 'medium',
      verified: 'low',
    }
    return [...items]
      .sort((a, b) => {
        const score = (m: Mitigation) => tierRank[tierOf(m)] * 100 + (m.severity_reduction ?? 0) * 100
        return score(b) - score(a)
      })
      .slice(0, 6)
      .map((mitigation) => {
        const tier = tierOf(mitigation)
        return {
          id: mitigation.id,
          title: mitigation.name,
          subtitle: [mitigation.control_type, mitigation.applies_to_tag].filter(Boolean).join(' · '),
          meta: `${TIER_LABEL[tier]} · freshness ${Math.round((mitigation.freshness_factor ?? 0) * 100)}%`,
          value: `${Math.round((mitigation.severity_reduction ?? 0) * 100)}%`,
          severity: tierSeverity[tier],
        }
      })
  }, [items])

  return (
    <ManagerDashboard
      title="Compensating Controls — Trust Decay"
      subtitle={t('hardcoded.how.much.declared.risk.reduction.is.still.backed.a20cb0dc')}
      accent={ACCENT}
      titleIcon={<ShieldHalf size={20} />}
      layout="hero-split"
      hero={
        <ManagerHero
          accent={ACCENT}
          icon={<ShieldHalf size={15} />}
          minHeight={200}
          visual={
            hasData ? (
              <GaugeChart
                value={stats.trustRetained}
                max={100}
                label={t('mit.manager.kpiTrustRetained')}
                grade={
                  stats.trustRetained >= 75
                    ? 'good'
                    : stats.trustRetained >= 50
                      ? 'fair'
                      : stats.trustRetained >= 25
                        ? 'warn'
                        : 'bad'
                }
                height={188}
              />
            ) : undefined
          }
          headline={{
            label: t('mit.manager.kpiTrustRetained'),
            value: hasData ? stats.trustRetained : '—',
            unit: hasData ? '%' : undefined,
            sub: hasData
              ? `The priority engine is honouring ${stats.trustRetained}% of declared risk-reduction across ${stats.total} control${
                  stats.total === 1 ? '' : 's'
                } — the rest has decayed past its evidence freshness.`
              : 'No compensating controls declared yet. Register WAF rules, EDR signatures, patch baselines or segmentation with probe-able evidence to track trust over time.',
            delta:
              hasData && stats.claimedReduction - stats.effectiveReduction > 0 ? (
                <Chip
                  size="small"
                  icon={<TrendingDown size={13} />}
                  label={`${100 - stats.trustRetained}% decayed`}
                  sx={{
                    fontWeight: 700,
                    fontSize: 12,
                    bgcolor: alpha(colors.semantic.danger, 0.14),
                    color: colors.semantic.danger,
                    '& .MuiChip-icon': { color: 'inherit' },
                  }}
                />
              ) : undefined,
          }}
          aside={
            <Box>
              <HeroStat
                icon={<ShieldAlert size={14} />}
                tone={ACCENT}
                label={t('mit.manager.heroClaimed')}
                value={hasData ? Math.round(stats.claimedReduction * 100) : '—'}
              />
              <HeroStat
                icon={<ShieldCheck size={14} />}
                tone={colors.semantic.success}
                label={t('mit.manager.heroEffective')}
                value={hasData ? Math.round(stats.effectiveReduction * 100) : '—'}
              />
            </Box>
          }
        />
      }
      kpis={
        <>
          <KpiCard
            label={t('mit.manager.kpiDeclaredControls')}
            value={hasData ? stats.total : null}
            loading={loading}
            empty={!loading && !hasData}
            emptyHint="No controls declared"
          />
          <KpiCard
            label={t('mit.manager.kpiVerifiedControls')}
            value={hasData ? stats.byTier.verified : null}
            unit={hasData ? `of ${stats.total}` : undefined}
            loading={loading}
            empty={!loading && !hasData}
          />
          <KpiCard
            label={t('mit.manager.kpiDecayedAspirational')}
            value={hasData ? stats.byTier.stale + stats.byTier.aspirational : null}
            invertDelta
            loading={loading}
            empty={!loading && !hasData}
            emptyHint="—"
          />
        </>
      }
      charts={
        <>
          <ChartCard title={t('mit.manager.chartTrustTier')}>
            {tierDonut.length > 0 ? (
              <DonutChart data={tierDonut} totalLabel="Controls" height={260} />
            ) : (
              <EmptyCell text="No controls to classify yet" />
            )}
          </ChartCard>

          <ChartCard title={t('mit.manager.chartReductionByType')}>
            {decayByType.types.length > 0 ? (
              <StackedBarChart
                categories={decayByType.types}
                stacked={false}
                height={260}
                series={[
	                  { name: t('hardcoded.claimed.data.decaybytype.claimed.severity.medium.59b768f5'), data: decayByType.claimed, severity: 'medium' },
	                  { name: t('hardcoded.effective.after.decay.data.decaybytype.effective.severity.low.8492b637'), data: decayByType.effective, severity: 'low' },
                ]}
              />
            ) : (
              <EmptyCell text="No control types to chart yet" />
            )}
          </ChartCard>
        </>
      }
      workItems={
        <ManagerActionList
          title={t('mit.manager.queueTitle')}
          subtitle={t('mit.manager.queueSubtitle')}
          items={mitigationQueue}
          emptyText="No controls require evidence refresh"
          actionLabel="Refresh"
        />
      }
      narrative={
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
            Trust posture
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {hasData
              ? `Your team has declared ${stats.total} compensating control${
                  stats.total === 1 ? '' : 's'
                }. The priority engine is currently honouring ${stats.trustRetained}% of the declared risk-reduction — the remainder has decayed because the automated freshness probe hasn't confirmed those controls recently. ${
                  stats.byTier.aspirational > 0
                    ? `${stats.byTier.aspirational} control${
                        stats.byTier.aspirational === 1 ? ' is' : 's are'
                      } aspirational and contribute nothing to scoring until evidence lands.`
                    : 'Every control still carries at least partial evidence credit.'
                } Switch to engineer mode (top bar) to refresh evidence URLs and inspect the append-only ledger per control.`
              : 'No compensating controls declared yet. Once your team registers WAF rules, EDR signatures, patch baselines, or segmentation — and attaches probe-able evidence — this surface tracks how much of that protection stays trustworthy over time.'}
          </Typography>
        </Box>
      }
    />
  )
}

function EmptyCell({ text }: { text: string }) {
  return (
    <Box sx={{ height: 260, display: 'grid', placeItems: 'center' }}>
      <Typography variant="body2" color="text.secondary">
        {text}
      </Typography>
    </Box>
  )
}
