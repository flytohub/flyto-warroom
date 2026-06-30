/**
 * ExecOverviewView — the manager-mode executive landing surface.
 *
 * The top-of-funnel board view: org posture grade + score, modelled
 * financial exposure at risk, SLA pressure, KEV-listed exposure, the
 * 90-day posture trend, and a security-dimension breakdown. Every
 * number comes from a real engine endpoint — when the org has no data
 * yet the primitives fall back to their empty/skeleton states (no fake
 * zeros).
 *
 * Data sources:
 *   - getComputedScore        → grade gauge + dimension donut
 *   - getUnifiedScoreHistory  → 90-day trend + sparkline + prev period
 *   - getCTEMPriorities       → $ at-risk / SLA breaches / KEV (rollup)
 *
 * Client functions are imported by DIRECT FILE PATH (decoupling rule).
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'

import {
  ManagerDashboard,
  ChartCard,
  KpiCard,
  GaugeChart,
  TrendChart,
  DonutChart,
  type DonutDatum,
} from '@compounds/_shared'

import { getComputedScore } from '@lib/engine/scoring/scoring'
import { getUnifiedScoreHistory } from '@lib/engine/scoring/scoring'
import { getCTEMPriorities } from '@lib/engine/ctem/ctem'
import { qk } from '@lib/queryKeys'
import {
  rollupManagerKpis,
  formatUsdCompact,
} from '@lib/engine/ctem/managerRollup'
import { t } from '@lib/i18n';

export function ExecOverviewView() {
  const { orgId } = useParams<{ orgId: string }>()

  const scoreQ = useQuery({
    queryKey: qk.computedScore(orgId),
    queryFn: () => getComputedScore(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const histQ = useQuery({
    queryKey: qk.scoring.scoreHistory(orgId, 90),
    queryFn: () => getUnifiedScoreHistory(orgId!, 90),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const ctemQ = useQuery({
    queryKey: qk.ctem.priorities(orgId),
    queryFn: () => getCTEMPriorities(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  })
  const rollup = useMemo(() => rollupManagerKpis(ctemQ.data), [ctemQ.data])

  const score = scoreQ.data
  const hasScore = !!score && score.score_available !== false && score.overall_display != null

  // Score trend from unified-score history (oldest → newest).
  const trend = useMemo(() => {
    const entries = [...(histQ.data?.entries ?? [])].sort(
      (a, b) => new Date(a.computedAt).getTime() - new Date(b.computedAt).getTime(),
    )
    return {
      categories: entries.map((e) => new Date(e.computedAt).toLocaleDateString()),
      values: entries.map((e) => Math.round(e.overallDisplay)),
    }
  }, [histQ.data])

  const prevScore = useMemo(() => {
    const e = histQ.data?.entries
    if (!e || e.length < 2) return null
    const sorted = [...e].sort(
      (a, b) => new Date(b.computedAt).getTime() - new Date(a.computedAt).getTime(),
    )
    return Math.round(sorted[1].overallDisplay)
  }, [histQ.data])

  // Category breakdown donut (active categories only).
  const categoryData: DonutDatum[] = useMemo(() => {
    return (score?.categories ?? [])
      .filter((c) => c.display != null)
      .map((c) => ({ label: c.label, value: Math.round(c.display ?? 0) }))
  }, [score])

  const loading = scoreQ.isLoading

  return (
    <ManagerDashboard
      title={t('exec.overview.title')}
      subtitle={t('exec.overview.subtitle')}
      kpis={
        <>
          <KpiCard
            label={t('exec.kpi.postureScore')}
            value={hasScore ? Math.round(score!.overall_display!) : null}
            unit="/ 100"
            previous={prevScore}
            sparkline={trend.values.length > 1 ? trend.values : undefined}
            loading={loading}
            empty={!loading && !hasScore}
            emptyHint={t('exec.kpi.emptyScoreHint')}
          />
          <KpiCard
            label="Grade"
            value={hasScore ? (score!.overall_grade ?? '—') : null}
            loading={loading}
            empty={!loading && !hasScore}
            emptyHint={t('exec.kpi.pendingFirstScan')}
          />
          <KpiCard
            label={t('exec.kpi.financialExposure')}
            value={rollup.withImpactCount > 0 ? formatUsdCompact(rollup.atRiskMidUsd) : null}
            loading={ctemQ.isLoading}
            empty={!ctemQ.isLoading && rollup.withImpactCount === 0}
            emptyHint={t('exec.kpi.emptyExposureHint')}
          />
          <KpiCard
            label={t('exec.kpi.slaBreaches')}
            value={ctemQ.isLoading ? null : rollup.slaBreaches}
            invertDelta
            loading={ctemQ.isLoading}
          />
          <KpiCard
            label={t('exec.kpi.kevExposure')}
            value={ctemQ.isLoading ? null : rollup.kevCount}
            invertDelta
            loading={ctemQ.isLoading}
          />
        </>
      }
      charts={
        <>
          <ChartCard title={t('exec.chart.posture')}>
            {hasScore ? (
              <GaugeChart
                value={Math.round(score!.overall_display!)}
                max={100}
                label="Score"
                grade={score!.overall_grade ?? undefined}
                height={240}
              />
            ) : (
              <EmptyCell text="No score available yet" />
            )}
          </ChartCard>

          <ChartCard title={t('exec.chart.scoreTrend')}>
            {trend.values.length > 1 ? (
              <TrendChart
                categories={trend.categories}
                series={[{ name: 'Posture', data: trend.values }]}
                yMin={0}
                yMax={100}
                height={240}
              />
            ) : (
              <EmptyCell text="Not enough history to chart a trend" />
            )}
          </ChartCard>

          <ChartCard title={t('exec.chart.dimensionBreakdown')}>
            {categoryData.length > 0 ? (
              <DonutChart data={categoryData} totalLabel="Dims" height={240} />
            ) : (
              <EmptyCell text="No category scores yet" />
            )}
          </ChartCard>
        </>
      }
      narrative={
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
            Summary
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {hasScore
              ? `Your organization currently holds a ${score!.overall_grade ?? ''} grade at ${Math.round(
                  score!.overall_display!,
                )}/100 across ${score!.active_count} active security dimensions.${
                  rollup.withImpactCount > 0
                    ? ` Modelled financial exposure across ${rollup.withImpactCount} open critical/high findings ranges ${formatUsdCompact(
                        rollup.atRiskLowUsd,
                      )}–${formatUsdCompact(rollup.atRiskHighUsd)} (mid ${formatUsdCompact(rollup.atRiskMidUsd)}).`
                    : ''
                }${
                  rollup.slaBreaches > 0 ? ` ${rollup.slaBreaches} finding(s) are past their remediation SLA.` : ''
                } Switch to engineer mode (top bar) for the underlying findings and evidence.`
              : 'Connect a repository or run a scan to generate your first posture score. Once data lands, this overview populates automatically.'}
          </Typography>
        </Box>
      }
    />
  )
}

function EmptyCell({ text }: { text: string }) {
  return (
    <Box sx={{ height: 240, display: 'grid', placeItems: 'center' }}>
      <Typography variant="body2" color="text.secondary">
        {text}
      </Typography>
    </Box>
  )
}
