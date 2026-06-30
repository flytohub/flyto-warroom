/**
 * RepoListManagerView — manager-mode org code-security posture.
 *
 * Every number/chart is sourced from a REAL engine endpoint:
 *   - getComputedScore(org)          → posture gauge + grade
 *   - getUnifiedScoreHistory(org)    → 90d score trend + delta
 *   - getOrgHealthSummary(org)       → at-risk/secure repos, MTTR,
 *                                      autofix throughput, grade dist,
 *                                      critical/high totals, top risks
 *
 * Client fns imported by DIRECT FILE PATH per the parallel-safety
 * decoupling rule (no @lib/engine barrel, no index.ts edit).
 *
 * Layout uses ManagerDashboard so chart heights stay modest (~240px)
 * and the grid auto-wraps — no excessive whitespace.
 */

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import { alpha } from '@mui/material/styles'
import { Boxes, Plus, ShieldAlert, ShieldCheck, TrendingUp, TrendingDown } from 'lucide-react'
import { qk } from '@lib/queryKeys'
import { t } from '@lib/i18n';
import { colors } from '@/styles/designTokens'
import { GatedButton } from '@atoms/GatedButton'
import { RepoPickerModal } from '@compounds/_shared/picker'

import {
  ManagerDashboard,
  ChartCard,
  KpiCard,
  GaugeChart,
  TrendChart,
  DonutChart,
  StackedBarChart,
  ManagerActionList,
  ManagerHero,
  HeroStat,
  type DonutDatum,
} from '@compounds/_shared'

import { getComputedScore } from '@lib/engine/scoring/scoring'
import { getUnifiedScoreHistory } from '@lib/engine/scoring/scoring'
import { getOrgHealthSummary } from '@lib/engine/code/repos'

function ChartEmpty({ text }: { text: string }) {
  return (
    <Box sx={{ height: 240, display: 'grid', placeItems: 'center' }}>
      <Typography variant="body2" color="text.secondary">{text}</Typography>
    </Box>
  )
}

export function RepoListManagerView({ orgId }: { orgId: string | undefined }) {
  const qc = useQueryClient()
  const [pickerOpen, setPickerOpen] = useState(false)
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

  const healthQ = useQuery({
    queryKey: qk.repos.healthSummary(orgId),
    queryFn: () => getOrgHealthSummary(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const score = scoreQ.data
  const hasScore =
    !!score && score.score_available !== false && score.overall_display != null

  const agg = healthQ.data?.aggregated
  const repos = healthQ.data?.repos ?? []

  // ── Score trend (oldest → newest) ──
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

  // ── Grade distribution donut (A..F) ──
  const gradeData: DonutDatum[] = useMemo(() => {
    const dist = agg?.grade_dist
    if (!dist) return []
    const order: Array<keyof typeof dist> = ['A', 'B', 'C', 'D', 'F']
    const sevByGrade: Record<string, DonutDatum['severity']> = {
      A: 'low', B: 'low', C: 'medium', D: 'high', F: 'critical',
    }
    return order
      .map((g) => ({ label: g, value: dist[g] ?? 0, severity: sevByGrade[g] }))
      .filter((d) => d.value > 0)
  }, [agg])

  // ── MTTR: org-median across scanned repos (hours → days) ──
  const mttr = useMemo(() => {
    const samples = repos
      .map((r) => r.mttr_median_hours ?? r.mttr_hours)
      .filter((v): v is number => typeof v === 'number' && v > 0)
    if (!samples.length) return null
    const sorted = [...samples].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const median =
      sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
    return Math.round((median / 24) * 10) / 10 // days, 1dp
  }, [repos])

  // ── Autofix throughput: eligible findings across the org ──
  const autofixEligible = useMemo(
    () => repos.reduce((sum, r) => sum + (r.autofix_eligible ?? 0), 0),
    [repos],
  )

  // ── Top-risk repos as a horizontal severity bar (lowest score = worst) ──
  const topRisks = useMemo(() => {
    const rows = [...(agg?.top_risks ?? [])]
      .sort((a, b) => a.score - b.score)
      .slice(0, 6)
    return {
      categories: rows.map((r) => r.repo_id.slice(0, 8)),
      values: rows.map((r) => Math.round(r.score)),
      sev: rows.map((r) =>
        r.score < 40 ? ('critical' as const)
          : r.score < 60 ? ('high' as const)
          : r.score < 75 ? ('medium' as const)
          : ('low' as const),
      ),
    }
  }, [agg])

  const repoQueue = useMemo(() => {
    return [...repos]
      .sort((a, b) => {
        const score = (r: typeof repos[number]) =>
          (r.cve_critical ?? 0) * 40 +
          (r.cve_high ?? 0) * 20 +
          (r.security_findings ?? 0) * 8 +
          (r.secret_count ?? 0) * 12 +
          (r.autofix_eligible ?? 0) * 4 -
          (r.display_score ?? 900) / 50
        return score(b) - score(a)
      })
      .slice(0, 6)
      .map((repo) => {
        const risk = (repo.cve_critical ?? 0) > 0 ? 'critical' : (repo.cve_high ?? 0) > 0 ? 'high' : 'medium'
        return {
          id: repo.repo_id,
          title: repo.repo_id,
          subtitle: [repo.project_type, repo.grade ? `grade ${repo.grade}` : null, repo.display_score ? `${repo.display_score}` : null].filter(Boolean).join(' · '),
          meta: `${repo.cve_critical ?? 0} critical · ${repo.cve_high ?? 0} high · ${repo.autofix_eligible ?? 0} autofixable`,
          value: repo.display_score ? `${repo.display_score}` : undefined,
          severity: risk as 'critical' | 'high' | 'medium',
        }
      })
  }, [repos])

  const loading = scoreQ.isLoading || healthQ.isLoading

  const ACCENT = colors.brand
  const scoreNow = hasScore ? Math.round(score!.overall_display!) : null
  const scoreDelta = scoreNow != null && prevScore != null ? scoreNow - prevScore : null

  return (
    <>
      <ManagerDashboard
        title={t('repos.manager.titleCodeSecurity')}
        subtitle={t('repos.manager.subtitleFleetMetrics')}
        accent={ACCENT}
        titleIcon={<Boxes size={20} />}
        layout="full-bleed"
        hero={
          <ManagerHero
            accent={ACCENT}
            icon={<Boxes size={15} />}
            minHeight={200}
            visual={
              hasScore ? (
                <GaugeChart
                  value={scoreNow!}
                  max={100}
                  label={score!.overall_grade ?? 'Score'}
                  grade={score!.overall_grade ?? undefined}
                  height={188}
                />
              ) : undefined
            }
            headline={{
              label: t('repos.manager.chartFleetPosture'),
              value: hasScore ? (score!.overall_grade ?? scoreNow) : '—',
              sub: hasScore
                ? `${scoreNow}/100 across ${healthQ.data?.scanned_count ?? 0} scanned repositories`
                : 'Connect a repository and run a scan to generate your first fleet posture.',
              delta: scoreDelta != null && scoreDelta !== 0 ? (
                <Chip
                  size="small"
                  icon={scoreDelta > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                  label={`${scoreDelta > 0 ? '+' : ''}${scoreDelta} 90d`}
                  sx={{
                    fontWeight: 700, fontSize: 12,
                    bgcolor: alpha(scoreDelta > 0 ? colors.semantic.success : colors.semantic.danger, 0.14),
                    color: scoreDelta > 0 ? colors.semantic.success : colors.semantic.danger,
                    '& .MuiChip-icon': { color: 'inherit' },
                  }}
                />
              ) : undefined,
            }}
            aside={
              <Box>
                <HeroStat
                  icon={<ShieldAlert size={14} />}
                  tone={colors.semantic.danger}
                  label={t('repos.manager.kpiAtRiskRepos')}
                  value={agg ? agg.at_risk_count : '—'}
                />
                <HeroStat
                  icon={<ShieldCheck size={14} />}
                  tone={colors.semantic.success}
                  label={t('repos.manager.kpiSecureRepos')}
                  value={agg ? agg.secure_count : '—'}
                />
              </Box>
            }
          />
        }
        kpis={
          <>
            <KpiCard
              label={t('repos.manager.kpiOrgPosture')}
              value={hasScore ? Math.round(score!.overall_display!) : null}
              unit="/ 100"
              previous={prevScore}
              sparkline={trend.values.length > 1 ? trend.values : undefined}
              loading={loading}
              empty={!loading && !hasScore}
              emptyHint="No score yet"
            />
            <KpiCard
              label="Grade"
              value={hasScore ? (score!.overall_grade ?? '—') : null}
              loading={loading}
              empty={!loading && !hasScore}
              emptyHint="Pending first scan"
            />
            <KpiCard
              label={t('repos.manager.kpiAtRiskRepos')}
              value={agg ? agg.at_risk_count : null}
              unit={agg ? `of ${healthQ.data?.scanned_count ?? 0}` : undefined}
              invertDelta
              loading={healthQ.isLoading}
            />
            <KpiCard
              label={t('repos.manager.kpiSecureRepos')}
              value={agg ? agg.secure_count : null}
              loading={healthQ.isLoading}
            />
            <KpiCard
              label={t('repos.manager.kpiOpenCritical')}
              value={agg ? agg.critical_count : null}
              invertDelta
              loading={healthQ.isLoading}
            />
            <KpiCard
              label={t('repos.manager.kpiMttrMedian')}
              value={mttr}
              unit="d"
              precision={1}
              invertDelta
              loading={healthQ.isLoading}
              empty={!healthQ.isLoading && mttr == null}
              emptyHint="No resolved findings yet"
            />
            <KpiCard
              label={t('repos.manager.kpiAutofixEligible')}
              value={autofixEligible}
              loading={healthQ.isLoading}
              empty={!healthQ.isLoading && autofixEligible === 0}
              emptyHint="None queued"
            />
            <KpiCard
              label={t('repos.manager.kpiScannedCoverage')}
              value={
                healthQ.data
                  ? Math.round(
                      (healthQ.data.scanned_count /
                        Math.max(1, healthQ.data.total_count)) *
                        100,
                    )
                  : null
              }
              unit="%"
              loading={healthQ.isLoading}
            />
          </>
        }
        charts={
          <>
            <ChartCard title={t('repos.manager.chartPostureTrend90d')}>
              {trend.values.length > 1 ? (
                <TrendChart
                  categories={trend.categories}
                  series={[{ name: 'Posture', data: trend.values }]}
                  yMin={0}
                  yMax={100}
                  height={240}
                />
              ) : (
                <ChartEmpty text="Not enough history to chart a trend" />
              )}
            </ChartCard>

            <ChartCard title={t('repos.manager.chartGradeDistribution')}>
              {gradeData.length > 0 ? (
                <DonutChart data={gradeData} totalLabel="Repos" height={240} />
              ) : (
                <ChartEmpty text="No graded repos yet" />
              )}
            </ChartCard>

            <ChartCard title={t('repos.manager.chartHighestRiskRepos')}>
              {topRisks.values.length > 0 ? (
                <StackedBarChart
                  categories={topRisks.categories}
                  series={[{ name: 'Score', data: topRisks.values }]}
                  horizontal
                  height={240}
                />
              ) : (
                <ChartEmpty text="No risk ranking yet" />
              )}
            </ChartCard>
          </>
        }
        workItems={
          <ManagerActionList
            title={t('repos.manager.workItemsTitle')}
            subtitle={t('repos.manager.workItemsSubtitle')}
            items={repoQueue}
            emptyText="No repository needs management review"
            actionLabel="Open"
          />
        }
        narrative={
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
              Summary
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {agg
                ? `${agg.secure_count} of ${healthQ.data?.scanned_count ?? 0} scanned repositories are secure; ${agg.at_risk_count} are at-risk with ${agg.critical_count} open critical and ${agg.high_count} high findings across the fleet${mttr != null ? `. Median remediation time is ${mttr} day${mttr === 1 ? '' : 's'}` : ''}${autofixEligible > 0 ? `, and ${autofixEligible} findings are eligible for one-click AutoFix` : ''}. Switch to engineer mode (top bar) for per-repo scan controls, findings and the verify timeline.`
                : 'Connect a repository and run a scan to populate fleet posture, remediation velocity and autofix throughput.'}
            </Typography>
            {!loading && (healthQ.data?.total_count ?? 0) === 0 && (
              <GatedButton
                action="repo:connect"
                variant="contained"
                startIcon={<Plus size={16} />}
                onClick={() => setPickerOpen(true)}
                sx={{ mt: 2, textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
              >
                {t('repoList.connectRepos')}
              </GatedButton>
            )}
          </Box>
        }
      />
      <RepoPickerModal
        opened={pickerOpen}
        onClose={() => {
          setPickerOpen(false)
          qc.invalidateQueries({ queryKey: qk.repos.connected(orgId) })
          qc.invalidateQueries({ queryKey: qk.repos.healthSummary(orgId) })
        }}
      />
    </>
  )
}
