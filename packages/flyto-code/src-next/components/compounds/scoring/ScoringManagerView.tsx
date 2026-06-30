/**
 * ScoringManagerView — manager-mode surface for the Scoring Overview.
 *
 * Bitsight-style score hero distilled to the executive essentials:
 * grade gauge, dimension-weight donut, category sub-scores bar, and a
 * weighting-methodology narrative driven by the per-org scoring config.
 *
 *   getComputedScore   → grade / category display scores / weights
 *   getScoringConfig   → weight source (default/custom/auto) + run count
 *
 * Engineer view (the existing <ScoringView/>) is preserved verbatim by
 * the page wrapper via <ModeView/>.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import { Gauge, TrendingDown } from 'lucide-react'

import {
  ManagerDashboard,
  ChartCard,
  KpiCard,
  GaugeChart,
  DonutChart,
  StackedBarChart,
  ManagerActionList,
  ManagerHero,
  HeroStat,
  type DonutDatum,
} from '@compounds/_shared'

import { useOrg } from '@hooks/useOrg'
import { t } from '@lib/i18n';
import { colors } from '@/styles/designTokens'
import { qk } from '@lib/queryKeys'
import { getComputedScore } from '@lib/engine/scoring/scoring'
import { getScoringConfig } from '@lib/engine/scoring/scoringConfig'
import { gradeTone } from './managerShared'

const ACCENT = colors.section.scoring

const EMPTY_CHART = (msg: string) => (
  <Box sx={{ height: 240, display: 'grid', placeItems: 'center' }}>
    <Typography variant="body2" color="text.secondary">{msg}</Typography>
  </Box>
)

const SOURCE_LABEL: Record<string, string> = {
  default: 'Default weights',
  custom: 'Custom weights',
  auto: 'Auto-tuned weights',
}

export function ScoringManagerView() {
  const { org } = useOrg()
  const orgId = org?.id

  const scoreQ = useQuery({
    queryKey: qk.computedScore(orgId),
    queryFn: () => getComputedScore(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const cfgQ = useQuery({
    queryKey: qk.scoring.config(orgId),
    queryFn: () => getScoringConfig(orgId!),
    enabled: !!orgId,
    staleTime: 120_000,
  })

  const score = scoreQ.data
  const hasScore =
    !!score && score.score_available !== false && score.overall_display != null
  const cfg = cfgQ.data

  const weightData: DonutDatum[] = useMemo(() => {
    return (score?.categories ?? [])
      .filter((c) => c.effective_weight > 0)
      .map((c) => ({ label: c.label, value: Math.round(c.effective_weight * 100) }))
  }, [score])

  // Category sub-scores as a single-series horizontal bar (display 0–100).
  const catBar = useMemo(() => {
    const scored = (score?.categories ?? []).filter((c) => c.display != null)
    return {
      categories: scored.map((c) => c.label),
      data: scored.map((c) => Math.round(c.display ?? 0)),
    }
  }, [score])

  const scoreQueue = useMemo(() => {
    return [...(score?.categories ?? [])]
      .filter((category) => category.display != null)
      .sort((a, b) => (a.display ?? 100) - (b.display ?? 100))
      .slice(0, 6)
      .map((category) => {
        const display = Math.round(category.display ?? 0)
        return {
          id: category.id,
          title: category.label,
          subtitle: `${category.sub_vectors?.length ?? 0} sub-vectors · weight ${Math.round(category.effective_weight * 100)}%`,
          meta: category.grade ? `grade ${category.grade}` : 'ungraded',
          value: `${display}/100`,
          severity: display < 40 ? ('critical' as const) : display < 60 ? ('high' as const) : display < 75 ? ('medium' as const) : ('low' as const),
        }
      })
  }, [score])

  // Most-dragging weighted category — the lowest scoring one already
  // surfaced at the top of the drag queue. Used as the hero's spotlight.
  const dragCategory = scoreQueue[0] ?? null

  const loading = scoreQ.isLoading

  return (
    <ManagerDashboard
      title={t('scoring.overview')}
      subtitle={t('scoring.compositionSubtitle')}
      accent={ACCENT}
      titleIcon={<Gauge size={20} />}
      layout="full-bleed"
      hero={
        <ManagerHero
          accent={ACCENT}
          icon={<Gauge size={15} />}
          minHeight={200}
          visual={
            hasScore ? (
              <GaugeChart
                value={Math.round(score!.overall_display!)}
                max={100}
                label={score!.overall_grade ?? 'Score'}
                grade={gradeTone(score!.overall_grade, score!.overall_display)}
                height={188}
              />
            ) : undefined
          }
          headline={{
            label: t('scoring.overallGradeTitle'),
            value: hasScore ? (score!.overall_grade ?? Math.round(score!.overall_display!)) : '—',
            sub: hasScore
              ? `${Math.round(score!.overall_display!)}/100 composite${
                  dragCategory ? ` · ${dragCategory.title} is the biggest drag` : ''
                }`
              : 'Connect a repository or run a scan to compute your first posture score.',
          }}
          aside={
            dragCategory ? (
              <Box>
                <HeroStat
                  icon={<TrendingDown size={14} />}
                  tone={colors.semantic.danger}
                  label={t('scoring.dragCategoryLabel')}
                  value={dragCategory.value}
                />
                <Typography
                  sx={{
                    fontSize: 12,
                    color: 'text.secondary',
                    mt: 0.25,
                    px: 0.25,
                  }}
                >
                  {dragCategory.title}
                </Typography>
                <Chip
                  size="small"
                  label={dragCategory.meta}
                  sx={{
                    mt: 0.75,
                    fontSize: 12,
                    fontWeight: 700,
                    bgcolor: alpha(ACCENT, 0.14),
                    color: ACCENT,
                  }}
                />
              </Box>
            ) : undefined
          }
        />
      }
      actions={
        cfg ? (
          <Chip
            size="small"
            label={`${SOURCE_LABEL[cfg.source] ?? cfg.source} · ${cfg.score_runs} runs`}
            variant="outlined"
          />
        ) : undefined
      }
      kpis={
        <>
          <KpiCard
            label={t('scoring.postureScoreLabel')}
            value={hasScore ? Math.round(score!.overall_display!) : null}
            unit="/ 100"
            loading={loading}
            empty={!loading && !hasScore}
            emptyHint="No score yet"
          />
          <KpiCard
            label="Grade"
            value={hasScore ? (score!.overall_grade ?? '—') : null}
            loading={loading}
            empty={!loading && !hasScore}
          />
          <KpiCard
            label={t('scoring.activeSubVectorsLabel')}
            value={score ? score.active_count : null}
            unit={score ? `of ${score.total_count}` : undefined}
            loading={loading}
          />
          <KpiCard
            label={t('scoring.crossDimensionPenaltyLabel')}
            value={score ? Math.round(score.cross_dim.total) : null}
            invertDelta
            loading={loading}
          />
        </>
      }
      charts={
        <>
          <ChartCard title={t('scoring.dimensionWeightsTitle')}>
            {weightData.length > 0
              ? <DonutChart data={weightData} totalLabel="Weights" height={240} />
              : EMPTY_CHART('No weighted dimensions yet')}
          </ChartCard>

          <ChartCard title={t('scoring.categorySubScoresTitle')}>
            {catBar.categories.length > 0
              ? (
                <StackedBarChart
                  categories={catBar.categories}
                  series={[{ name: 'Score', data: catBar.data }]}
                  horizontal
                  stacked={false}
                  height={240}
                />
              )
              : EMPTY_CHART('No category scores yet')}
          </ChartCard>
        </>
      }
      workItems={
        <ManagerActionList
          title={t('scoring.dragQueueTitle')}
          subtitle={t('scoring.dragQueueSubtitle')}
          items={scoreQueue}
          emptyText="No score categories need review"
          actionLabel="Tune"
        />
      }
      narrative={
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            Methodology
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {hasScore
              ? `Your ${score!.overall_grade ?? ''} grade (${Math.round(
                  score!.overall_display!,
                )}/100) is a weighted roll-up of ${weightData.length} security dimensions in ${
                  score!.mode
                } mode. ${
                  cfg
                    ? cfg.source === 'default'
                      ? 'Weights use the platform default profile — switch to engineer mode to tune them.'
                      : cfg.source === 'custom'
                        ? t('hardcoded.weights.have.been.customized.for.your.organization.c7f57add')
                        : 'Weights are auto-tuned from your scoring history.'
                    : ''
                } Cross-dimension penalties (blast radius, taint adjacency, pentest verdicts) adjust the raw roll-up by ${
                  score ? Math.round(score.cross_dim.total) : 0
                } points.`
              : 'Connect a repository or run a scan to compute your first posture score. The weighting methodology and category breakdown will populate here.'}
          </Typography>
        </Box>
      }
    />
  )
}
