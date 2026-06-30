/**
 * AutofixManagerView — manager-mode AutoFix throughput.
 *
 * Real endpoints only:
 *   - listAutofixRuns(org)      → PRs opened / patches passed-failed
 *                                 over time (throughput + verify rate)
 *   - listAutofixFindings(org)  → eligible backlog by category/severity
 *
 * Direct-path client imports per the decoupling rule. Charts ~240px.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import { alpha } from '@mui/material/styles'
import { Wand2, GitPullRequest, CheckCircle2 } from 'lucide-react'

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
import { type Severity } from '@lib/tokens/severity'

import {
  listAutofixRuns,
  listAutofixFindings,
} from '@lib/engine/code/autofix'
import { autofixStatusCopy } from '@lib/autofix/statusReason'
import { qk } from '@lib/queryKeys'
import { t } from '@lib/i18n';
import { colors } from '@/styles/designTokens'

function ChartEmpty({ text }: { text: string }) {
  return (
    <Box sx={{ height: 240, display: 'grid', placeItems: 'center' }}>
      <Typography variant="body2" color="text.secondary">{text}</Typography>
    </Box>
  )
}

function toSeverity(raw: string): Severity {
  const s = raw.toLowerCase()
  if (s === 'critical' || s === 'high' || s === 'medium' || s === 'low') return s
  if (s === 'moderate') return 'medium'
  return ''
}

function severityLabel(severity: Severity): string {
  switch (severity) {
    case 'critical': return t('severity.critical')
    case 'high': return t('severity.high')
    case 'medium': return t('severity.medium')
    case 'low': return t('severity.low')
    default: return ''
  }
}

function formatI18n(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (out, [key, value]) => out.replaceAll(`{${key}}`, String(value)),
    template,
  )
}

export function AutofixManagerView({ orgId }: { orgId: string | undefined }) {
  const runsQ = useQuery({
    queryKey: qk.autofix.runs(orgId),
    queryFn: () => listAutofixRuns(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
    retry: false,
  })

  const findingsQ = useQuery({
    queryKey: qk.autofix.findings(orgId),
    queryFn: () => listAutofixFindings(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
    retry: false,
  })

  const runs = useMemo(
    () =>
      [...(runsQ.data?.runs ?? [])].sort(
        (a, b) => new Date(a.StartedAt).getTime() - new Date(b.StartedAt).getTime(),
      ),
    [runsQ.data],
  );

  const findings = useMemo(
    () =>
      (findingsQ.data?.findings ?? []).filter(
        (f) => !(f.rule_id === 'tier2-ai' && f.patch_status === 'no_preview'),
      ),
    [findingsQ.data],
  )

  // ── KPI totals ──
  const totals = useMemo(() => {
    let prs = 0, passed = 0, failed = 0
    for (const r of runs) {
      prs += r.PRsOpened ?? 0
      passed += r.PatchesPassed ?? 0
      failed += r.PatchesFailed ?? 0
    }
    const verifyRate = passed + failed > 0 ? Math.round((passed / (passed + failed)) * 100) : null
    return { prs, passed, failed, verifyRate }
  }, [runs])

  // ── Throughput trend (PRs opened + patches passed per run) ──
  const trend = useMemo(() => {
    return {
      categories: runs.map((r) => new Date(r.StartedAt).toLocaleDateString()),
      prs: runs.map((r) => r.PRsOpened ?? 0),
      passed: runs.map((r) => r.PatchesPassed ?? 0),
    }
  }, [runs])

  // ── Eligible backlog by category ──
  const byCategory: DonutDatum[] = useMemo(() => {
    const c: Record<string, number> = {}
    for (const f of findings) {
      const k = f.rule_category || 'other'
      c[k] = (c[k] ?? 0) + 1
    }
    return Object.entries(c).map(([label, value]) => ({ label, value }))
  }, [findings])

  // ── Eligible backlog by severity (stacked single bar) ──
  const bySeverity = useMemo(() => {
    const order: Severity[] = ['critical', 'high', 'medium', 'low']
    const counts: Record<Severity, number> = {
      critical: 0, high: 0, medium: 0, low: 0, '': 0,
    }
    for (const f of findings) counts[toSeverity(f.severity)]++
    const present = order.filter((s) => counts[s] > 0)
    return present.map((s) => ({
      name: severityLabel(s),
      data: [counts[s]],
      severity: s,
    }))
  }, [findings])

  const backlogQueue = useMemo(() => {
    const severityRank: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, '': 0 }
    return [...findings]
      .sort((a, b) => severityRank[toSeverity(b.severity)] - severityRank[toSeverity(a.severity)])
      .slice(0, 6)
      .map((finding) => {
        const sev = toSeverity(finding.severity)
        const statusCopy = autofixStatusCopy(finding)
        return {
          id: finding.id || finding.fingerprint || `${finding.repo_id}-${finding.rule_id}`,
          title: finding.title || finding.rule_id || finding.rule_category || t('autofix.manager.findingFallbackTitle'),
          subtitle: finding.repo_name || finding.repo_id,
          meta: [finding.rule_category, statusCopy.label, finding.file_path].filter(Boolean).join(' · '),
          value: sev ? sev : undefined,
          severity: sev,
        }
      })
  }, [findings])

  const ACCENT = colors.tech
  // Trust gauge tone: >=90 good (green) / 70–90 warn (amber) / <70 bad (red).
  const rateGrade =
    totals.verifyRate == null ? 'neutral'
      : totals.verifyRate >= 90 ? 'good'
        : totals.verifyRate >= 70 ? 'warn'
          : 'bad'
  const hasRate = totals.verifyRate != null

  return (
    <ManagerDashboard
      title={t('autofix.manager.title')}
      subtitle={t('autofix.manager.subtitle')}
      accent={ACCENT}
      titleIcon={<Wand2 size={20} />}
      layout="hero-split"
      hero={
        <ManagerHero
          accent={ACCENT}
          icon={<Wand2 size={15} />}
          minHeight={200}
          visual={
            hasRate ? (
              <GaugeChart
                value={totals.verifyRate!}
                max={100}
                label={t('autofix.manager.kpiVerifyPassRate')}
                grade={rateGrade}
                height={188}
              />
            ) : undefined
          }
          headline={{
            label: t('autofix.manager.kpiVerifyPassRate'),
            value: hasRate ? totals.verifyRate : '—',
            unit: hasRate ? '%' : undefined,
            sub: hasRate
              ? formatI18n(t('autofix.manager.verifiedSummary'), {
                  passed: totals.passed,
                  total: totals.passed + totals.failed,
                  runs: runs.length,
                })
              : t('autofix.manager.emptyHintNoVerified'),
            delta: totals.failed > 0 ? (
              <Chip
                size="small"
                icon={<CheckCircle2 size={13} />}
                label={formatI18n(t('autofix.manager.failedCount'), { count: totals.failed })}
                sx={{
                  fontWeight: 700, fontSize: 12,
                  bgcolor: alpha(colors.semantic.danger, 0.14),
                  color: colors.semantic.danger,
                  '& .MuiChip-icon': { color: 'inherit' },
                }}
              />
            ) : hasRate ? (
              <Chip
                size="small"
                icon={<CheckCircle2 size={13} />}
                label={t('autofix.manager.allPassed')}
                sx={{
                  fontWeight: 700, fontSize: 12,
                  bgcolor: alpha(colors.semantic.success, 0.14),
                  color: colors.semantic.success,
                  '& .MuiChip-icon': { color: 'inherit' },
                }}
              />
            ) : undefined,
          }}
          aside={
            <Box>
              <HeroStat
                icon={<GitPullRequest size={14} />}
                tone={ACCENT}
                label={t('autofix.manager.kpiPRsOpened')}
                value={runsQ.data ? totals.prs : '—'}
              />
              <HeroStat
                icon={<CheckCircle2 size={14} />}
                tone={ACCENT}
                label={t('autofix.manager.kpiPatchesPassed')}
                value={runsQ.data ? totals.passed : '—'}
              />
            </Box>
          }
        />
      }
      kpis={
        <>
          <KpiCard
            label={t('autofix.manager.kpiEligibleBacklog')}
            value={findingsQ.data ? findings.length : null}
            invertDelta
            loading={findingsQ.isLoading}
          />
          <KpiCard
            label={t('autofix.manager.kpiAutofixRuns')}
            value={runsQ.data ? runs.length : null}
            loading={runsQ.isLoading}
          />
        </>
      }
      charts={
        <>
          <ChartCard title={t('autofix.manager.chartThroughput')}>
            {trend.categories.length > 1 ? (
              <TrendChart
                categories={trend.categories}
                series={[
                  { name: t('autofix.manager.seriesPRsOpened'), data: trend.prs, severity: 'low' },
                  { name: t('autofix.manager.seriesPatchesPassed'), data: trend.passed, severity: 'medium' },
                ]}
                height={240}
              />
            ) : (
              <ChartEmpty text={t('autofix.manager.chartEmptyTrendHistory')} />
            )}
          </ChartCard>

          <ChartCard title={t('autofix.manager.chartCategory')}>
            {byCategory.length > 0 ? (
              <DonutChart data={byCategory} totalLabel={t('autofix.manager.chartCategoryLabel')} height={240} />
            ) : (
              <ChartEmpty text={t('autofix.manager.chartEmptyFindings')} />
            )}
          </ChartCard>

          <ChartCard title={t('autofix.manager.chartSeverity')}>
            {bySeverity.length > 0 ? (
              <StackedBarChart
                categories={[t('autofix.manager.chartSeverityLabel')]}
                series={bySeverity}
                horizontal
                stacked
                height={240}
              />
            ) : (
              <ChartEmpty text={t('autofix.manager.chartEmptyFindings')} />
            )}
          </ChartCard>
        </>
      }
      workItems={
        <ManagerActionList
          title={t('autofix.manager.backlogTitle')}
          subtitle={t('autofix.manager.backlogSubtitle')}
          items={backlogQueue}
          emptyText={t('autofix.manager.backlogEmpty')}
          actionLabel={t('autofix.manager.backlogActionLabel')}
        />
      }
      narrative={
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
            {t('autofix.manager.narrativeSummary')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {runsQ.data || findingsQ.data
              ? formatI18n(t('autofix.manager.narrativePopulated'), {
                  prs: totals.prs,
                  runs: runs.length,
                  verify: totals.verifyRate != null
                    ? formatI18n(t('autofix.manager.verifyPhrase'), { rate: totals.verifyRate })
                    : '',
                  findings: findings.length,
                })
              : t('autofix.manager.narrativeEmpty')}
          </Typography>
        </Box>
      }
    />
  )
}
