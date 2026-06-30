/**
 * RepoDetailManagerView — manager-mode per-repo posture.
 *
 * Real endpoints only:
 *   - getRepoProfile(repoId)        → health gauge + dimension scores
 *   - getComputedScore(org)         → unified repo grade
 *   - getFixPlan(repoId)            → remediation burndown (cycle-bucketed
 *                                     effort_hours / critical_path / total)
 *   - listRepoWorkflowExecutions    → closed-loop verify outcomes
 *   - listAIProposals(repoId)       → AI CVE-bump roadmap counts
 *
 * Direct-path client imports per the decoupling rule. Chart heights
 * held to ~240px; ManagerDashboard grid auto-wraps.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import { alpha } from '@mui/material/styles'
import { Wrench, AlertOctagon, KeyRound, Layers } from 'lucide-react'

import {
  ManagerDashboard,
  ChartCard,
  KpiCard,
  GaugeChart,
  StackedBarChart,
  DonutChart,
  ManagerHero,
  HeroStat,
  type DonutDatum,
} from '@compounds/_shared'
import { colors } from '@/styles/designTokens'

import {
  getRepoProfile,
  getFixPlan,
  listAIProposals,
  listRepoWorkflowExecutions,
  type ConnectedRepo,
} from '@lib/engine/code/repos'
import { qk } from '@lib/queryKeys'
import { getComputedScore } from '@lib/engine/scoring/scoring'
import { t } from '@lib/i18n';

function ChartEmpty({ text }: { text: string }) {
  return (
    <Box sx={{ height: 240, display: 'grid', placeItems: 'center' }}>
      <Typography variant="body2" color="text.secondary">{text}</Typography>
    </Box>
  )
}

export function RepoDetailManagerView({
  repoId,
  repo,
  orgId,
}: {
  repoId: string
  repo: ConnectedRepo | null
  orgId: string | undefined
}) {
  const profileQ = useQuery({
    queryKey: qk.repos.profile(repoId),
    queryFn: () => getRepoProfile(repoId),
    staleTime: 5 * 60_000,
    retry: false,
  })

  const scoreQ = useQuery({
    queryKey: qk.computedScore(orgId),
    queryFn: () => getComputedScore(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const fixPlanQ = useQuery({
    queryKey: qk.repos.fixPlan(repoId),
    queryFn: () => getFixPlan(repoId),
    staleTime: 60_000,
    retry: false,
  })

  const proposalsQ = useQuery({
    queryKey: qk.autofix.aiProposals(repoId),
    queryFn: () => listAIProposals(repoId),
    staleTime: 60_000,
    retry: false,
  })

  const execQ = useQuery({
    queryKey: qk.security.repoVerifyExecutions(repoId),
    queryFn: () => listRepoWorkflowExecutions(repoId, 25),
    staleTime: 60_000,
    retry: false,
  })

  const profile = profileQ.data
  const overall = profile?.health_dimensions?.overall
  const unifiedRepoScore = scoreQ.data?.repo_scores?.find((r) => r.repo_id === repoId)
  const displayScore = unifiedRepoScore?.display ?? overall?.score ?? null
  const grade = unifiedRepoScore?.grade ?? overall?.grade

  // ── Health dimension bars ──
  const dims = useMemo(() => {
    const hd = profile?.health_dimensions
    if (!hd) return { categories: [] as string[], values: [] as number[] }
    const order: Array<[string, { score: number; max: number } | undefined]> = [
      ['Security', hd.security],
      ['Complexity', hd.complexity],
      ['Dead Code', hd.dead_code],
      ['Coverage', hd.coverage],
    ]
    const present = order.filter(([, d]) => d != null)
    return {
      categories: present.map(([label]) => label),
      values: present.map(([, d]) =>
        d!.max > 0 ? Math.round((d!.score / d!.max) * 100) : 0,
      ),
    }
  }, [profile])

  // ── Fix-plan burndown: cumulative remaining effort across cycles ──
  const plan = fixPlanQ.data?.plan
  const burndown = useMemo(() => {
    if (!plan || !plan.buckets.length) {
      return { categories: [] as (string | number)[], values: [] as number[] }
    }
    const buckets = [...plan.buckets].sort((a, b) => a.week - b.week)
    let remaining = plan.total_effort_hours
    const categories: (string | number)[] = []
    const values: number[] = []
    for (const b of buckets) {
      categories.push(b.label ?? `Cycle ${b.week}`)
      remaining -= b.effort_hours
      values.push(Math.max(0, Math.round(remaining)))
    }
    return { categories, values }
  }, [plan])

  // ── Verify outcomes donut ──
  const verifyData: DonutDatum[] = useMemo(() => {
    const execs = execQ.data?.executions ?? []
    const tally: Record<string, { count: number; severity: DonutDatum['severity'] }> = {}
    for (const e of execs) {
      const v = e.verdict ?? e.status
      const sev: DonutDatum['severity'] =
        v === 'exploitable' || v === 'suspected_exploitable' || v === 'reachable'
          ? 'critical'
          : v === 'sanitized' || v === 'likely_sanitized' || v === 'unreachable' || v === 'passed'
          ? 'low'
          : 'medium'
      if (!tally[v]) tally[v] = { count: 0, severity: sev }
      tally[v].count++
    }
    return Object.entries(tally).map(([label, t]) => ({
      label,
      value: t.count,
      severity: t.severity,
    }))
  }, [execQ.data])

  const openProposals = useMemo(
    () => (proposalsQ.data?.entries ?? []).filter((p) => p.actionable && !p.accepted).length,
    [proposalsQ.data],
  )
  const acceptedProposals = useMemo(
    () => (proposalsQ.data?.entries ?? []).filter((p) => p.accepted).length,
    [proposalsQ.data],
  )

  const loading = profileQ.isLoading

  const repoName = repo?.fullName ?? profile?.summary ?? repoId

  const ACCENT = colors.tech // #06b6d4 — danger red reserved for "still exploitable"

  const totalHours = plan ? Math.round(plan.total_effort_hours) : null
  const cycleCount = plan?.buckets.length ?? 0
  const criticalCount = profile?.cve_critical ?? 0
  const secretCount = profile?.secret_count ?? 0
  // Closed-loop verify outcomes still flagged exploitable/reachable.
  const stillExploitable = useMemo(
    () => verifyData.filter((d) => d.severity === 'critical').reduce((s, d) => s + d.value, 0),
    [verifyData],
  )

  return (
    <ManagerDashboard
      title={repo?.repoName ?? 'Repository'}
      subtitle={`${repoName} — health, remediation roadmap & closed-loop verification`}
      accent={ACCENT}
      titleIcon={<Wrench size={20} />}
      layout="timeline"
      hero={
        <ManagerHero
          accent={ACCENT}
          icon={<Wrench size={15} />}
          minHeight={200}
          visual={
            burndown.values.length > 0 ? (
              <Box sx={{ width: { xs: '100%', md: 300 } }}>
                <StackedBarChart
                  categories={burndown.categories}
	                  series={[{ name: t('hardcoded.remaining.hours.data.burndown.values.severity.high.e3d0f0d8'), data: burndown.values, severity: 'high' }]}
                  stacked={false}
                  height={188}
                />
              </Box>
            ) : undefined
          }
          headline={{
            label: t('repos.manager.hero.label'),
            value: grade ?? (displayScore != null ? Math.round(displayScore) : '—'),
            sub:
              totalHours != null
                ? `${displayScore != null ? `${Math.round(displayScore)}/100 · ` : ''}${totalHours}h across ${cycleCount} cycle${cycleCount === 1 ? '' : 's'}`
                : profile
                ? `${displayScore != null ? `${Math.round(displayScore)}/100` : 'Scanned'} — no fix-plan generated yet`
                : 'Run a scan to populate health and the remediation roadmap.',
            delta:
              criticalCount > 0 || secretCount > 0 || stillExploitable > 0 ? (
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                  {criticalCount > 0 && (
                    <Chip
                      size="small"
                      icon={<AlertOctagon size={13} />}
                      label={`${criticalCount} critical`}
                      sx={{
                        fontWeight: 700, fontSize: 12,
                        bgcolor: alpha(colors.semantic.danger, 0.14),
                        color: colors.semantic.danger,
                        '& .MuiChip-icon': { color: 'inherit' },
                      }}
                    />
                  )}
                  {secretCount > 0 && (
                    <Chip
                      size="small"
                      icon={<KeyRound size={13} />}
                      label={`${secretCount} secret${secretCount === 1 ? '' : 's'}`}
                      sx={{
                        fontWeight: 700, fontSize: 12,
                        bgcolor: alpha(colors.semantic.danger, 0.14),
                        color: colors.semantic.danger,
                        '& .MuiChip-icon': { color: 'inherit' },
                      }}
                    />
                  )}
                  {stillExploitable > 0 && (
                    <Chip
                      size="small"
                      icon={<AlertOctagon size={13} />}
                      label={`${stillExploitable} exploitable`}
                      sx={{
                        fontWeight: 700, fontSize: 12,
                        bgcolor: alpha(colors.semantic.danger, 0.14),
                        color: colors.semantic.danger,
                        '& .MuiChip-icon': { color: 'inherit' },
                      }}
                    />
                  )}
                </Box>
              ) : undefined,
          }}
          aside={
            <Box>
              <HeroStat
                icon={<Wrench size={14} />}
                tone={ACCENT}
                label={t('repos.manager.kpi.remediationEffort')}
                value={totalHours ?? '—'}
              />
              <HeroStat
                icon={<Layers size={14} />}
                tone={ACCENT}
                label={t('repos.manager.hero.cycles')}
                value={cycleCount > 0 ? cycleCount : '—'}
              />
            </Box>
          }
        />
      }
      kpis={
        <>
          <KpiCard
            label={t('repos.manager.kpi.healthScore')}
            value={displayScore != null ? Math.round(displayScore) : null}
            unit="/ 100"
            loading={loading}
            empty={!loading && displayScore == null}
            emptyHint="No scan yet"
          />
          <KpiCard
            label="Grade"
            value={grade ?? null}
            loading={loading}
            empty={!loading && !grade}
            emptyHint="Pending scan"
          />
          <KpiCard
            label={t('repos.manager.kpi.openCriticals')}
            value={profile ? (profile.cve_critical ?? 0) : null}
            invertDelta
            loading={loading}
          />
          <KpiCard
            label={t('repos.manager.kpi.secrets')}
            value={profile ? profile.secret_count : null}
            invertDelta
            loading={loading}
          />
          <KpiCard
            label={t('repos.manager.kpi.remediationEffort')}
            value={plan ? Math.round(plan.total_effort_hours) : null}
            unit="h"
            invertDelta
            loading={fixPlanQ.isLoading}
            empty={!fixPlanQ.isLoading && !plan}
            emptyHint="No plan yet"
          />
          <KpiCard
            label={t('repos.manager.kpi.pendingCvePrs')}
            value={proposalsQ.data ? openProposals : null}
            loading={proposalsQ.isLoading}
            empty={!proposalsQ.isLoading && !proposalsQ.data}
            emptyHint="None"
          />
          <KpiCard
            label={t('repos.manager.kpi.acceptedFixes')}
            value={proposalsQ.data ? acceptedProposals : null}
            loading={proposalsQ.isLoading}
          />
          <KpiCard
            label={t('repos.manager.kpi.verifyRuns')}
            value={execQ.data ? execQ.data.count : null}
            loading={execQ.isLoading}
          />
        </>
      }
      charts={
        <>
          <ChartCard title={t('repos.manager.chart.health')}>
            {displayScore != null ? (
              <GaugeChart
                value={Math.round(displayScore)}
                max={100}
                label="Score"
                grade={grade ?? undefined}
                height={240}
              />
            ) : (
              <ChartEmpty text="No scan results yet" />
            )}
          </ChartCard>

          <ChartCard title={t('repos.manager.chart.healthDimensions')}>
            {dims.categories.length > 0 ? (
              <StackedBarChart
                categories={dims.categories}
                series={[{ name: 'Score %', data: dims.values }]}
                horizontal
                height={240}
              />
            ) : (
              <ChartEmpty text="No dimension scores yet" />
            )}
          </ChartCard>

          <ChartCard title={t('repos.manager.chart.verifyOutcomes')}>
            {verifyData.length > 0 ? (
              <DonutChart data={verifyData} totalLabel="Runs" height={240} />
            ) : (
              <ChartEmpty text="No verifications run yet" />
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
            {profile
              ? `${repo?.repoName ?? t('hardcoded.this.repo.66f3c95a')} holds a ${grade ?? '—'} grade${displayScore != null ? ` at ${Math.round(displayScore)}/100` : ''}, with ${profile.cve_critical ?? 0} critical and ${profile.cve_high ?? 0} high CVEs and ${profile.secret_count} exposed secrets.${plan ? ` The AI fix-plan estimates ${Math.round(plan.total_effort_hours)}h of remediation across ${plan.buckets.length} cycle${plan.buckets.length === 1 ? '' : 's'}${plan.critical_path.length ? `, with a ${plan.critical_path.length}-step critical path` : ''}.` : ''}${openProposals > 0 ? ` ${openProposals} CVE-bump PRs are ready to open.` : ''} Switch to engineer mode for scan controls, findings and the verify timeline.`
              : 'Run a scan to populate this repository’s health, remediation roadmap and verification outcomes.'}
          </Typography>
        </Box>
      }
    />
  )
}
