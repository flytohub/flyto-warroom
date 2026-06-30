/**
 * ComplianceManagerView — manager-mode surface for the Compliance hub.
 *
 * Executive compliance posture: overall gauge, per-framework pass-rate
 * bars, a pass/fail/partial breakdown donut, and a worst-controls
 * callout — the board-ready "are we compliant" answer.
 *
 *   getOrgCompliance → frameworks[] + overall_score + per-control status
 *
 * Engineer view (the existing <ComplianceDashboardView/>) is preserved
 * verbatim by the page wrapper via <ModeView/>.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import { alpha, useTheme } from '@mui/material/styles'
import { ShieldCheck, ShieldAlert, ListChecks } from 'lucide-react'

import {
  ManagerDashboard,
  ChartCard,
  KpiCard,
  GaugeChart,
  DonutChart,
  StackedBarChart,
  SeverityChip,
  ManagerActionList,
  ManagerHero,
  HeroStat,
  type DonutDatum,
} from '@compounds/_shared'

import { useOrg } from '@hooks/useOrg'
import { t } from '@lib/i18n';
import { colors } from '@/styles/designTokens'
import { qk } from '@lib/queryKeys'
import {
  getOrgCompliance,
  summarizeFrameworkControls,
  type FrameworkResult,
} from '@lib/engine/ctem/compliance'
import { gradeTone } from './managerShared'

const EMPTY_CHART = (msg: string) => (
  <Box sx={{ height: 240, display: 'grid', placeItems: 'center' }}>
    <Typography variant="body2" color="text.secondary">{msg}</Typography>
  </Box>
)

export function ComplianceManagerView() {
  const { org } = useOrg()
  const orgId = org?.id
  const theme = useTheme()

  const q = useQuery({
    queryKey: qk.scoring.compliance(orgId),
    queryFn: () => getOrgCompliance(orgId!),
    enabled: !!orgId,
    staleTime: 120_000,
  })

  const data = q.data
  const frameworks: FrameworkResult[] = (data?.frameworks ?? []).map((framework) => ({
    ...framework,
    controls: Array.isArray(framework.controls) ? framework.controls : [],
  }))
  const hasData = frameworks.length > 0
  const overall = data?.overall_score ?? null

  // Per-framework pass rate (%) bar.
  const fwBar = useMemo(() => ({
    categories: frameworks.map((f) => f.framework),
    data: frameworks.map((f) => {
      const summary = summarizeFrameworkControls(f)
      return summary.evaluated_count > 0
        ? Math.round((summary.pass_count / summary.evaluated_count) * 100)
        : 0
    }),
  }), [frameworks])

  // Aggregate pass/partial/fail control counts across frameworks.
  const controlBreakdown = useMemo(() => {
    let pass = 0, partial = 0, fail = 0
    for (const f of frameworks) {
      const summary = summarizeFrameworkControls(f)
      pass += summary.pass_count
      partial += summary.partial_count
      fail += summary.fail_count
    }
    const donut: DonutDatum[] = ([
      { label: t('compliance.donut.pass'), value: pass, severity: 'low' },
      { label: t('compliance.donut.partial'), value: partial, severity: 'medium' },
      { label: t('compliance.donut.fail'), value: fail, severity: 'critical' },
    ] as DonutDatum[]).filter((d) => d.value > 0)
    return { pass, partial, fail, donut }
  }, [frameworks])

  // Worst frameworks (lowest score first).
  const worstFrameworks = useMemo(() => {
    return [...frameworks].sort((a, b) => a.score - b.score).slice(0, 4)
  }, [frameworks])

  const frameworkQueue = useMemo(() => {
    return [...frameworks]
      .sort((a, b) => {
        const gap = (f: FrameworkResult) => {
          const summary = summarizeFrameworkControls(f)
          return (100 - f.score) + summary.non_pass_count * 5
        }
        return gap(b) - gap(a)
      })
      .slice(0, 6)
      .map((framework) => {
        const summary = summarizeFrameworkControls(framework)
        const sev = framework.score >= 90 ? 'low' : framework.score >= 70 ? 'medium' : framework.score >= 50 ? 'high' : 'critical'
        return {
          id: framework.framework,
          title: framework.framework,
          subtitle: `${summary.pass_count}/${summary.evaluated_count} controls passing`,
          meta: `${summary.fail_count} failing · ${summary.partial_count} partial`,
          value: `${Math.round(framework.score)}%`,
          severity: sev as 'critical' | 'high' | 'medium' | 'low',
        }
      })
  }, [frameworks])

  const loading = q.isLoading
  const totalControls = controlBreakdown.pass + controlBreakdown.partial + controlBreakdown.fail

  // Hero focal datum: the WORST framework + its failing-control count.
  const ACCENT = colors.brandDeep
  const worst = worstFrameworks[0] ?? null
  const worstSummary = worst ? summarizeFrameworkControls(worst) : null

  return (
    <ManagerDashboard
      title={t('scoring.complianceManager.title')}
      subtitle={t('scoring.complianceManager.subtitle')}
      accent={ACCENT}
      titleIcon={<ShieldCheck size={20} />}
      layout="hero-split"
      hero={
        <ManagerHero
          accent={ACCENT}
          icon={<ShieldCheck size={15} />}
          minHeight={200}
          visual={
            overall != null ? (
              <GaugeChart
                value={Math.round(overall)}
                max={100}
                label={t('scoring.complianceManager.gaugeLabel')}
                grade={gradeTone(null, overall)}
                height={188}
              />
            ) : undefined
          }
          headline={{
            label: t('scoring.complianceManager.heroLabel'),
            value: worst ? worst.framework : '—',
            sub: worst && worstSummary
              ? `${Math.round(worst.score)}% compliant · ${worstSummary.pass_count}/${worstSummary.evaluated_count} controls passing`
              : 'Run a scan to evaluate your compliance frameworks.',
            delta: worst && worstSummary && worstSummary.fail_count > 0 ? (
              <Chip
                size="small"
                icon={<ShieldAlert size={13} />}
                label={`${worstSummary.fail_count} failing`}
                sx={{
                  fontWeight: 700, fontSize: 12,
                  bgcolor: alpha(colors.semantic.danger, 0.14),
                  color: colors.semantic.danger,
                  '& .MuiChip-icon': { color: 'inherit' },
                }}
              />
            ) : undefined,
          }}
          aside={
            <Box>
              {worstFrameworks.slice(0, 3).map((f) => (
                <HeroStat
                  key={f.framework}
                  icon={<ListChecks size={14} />}
                  tone={f.score >= 70 ? ACCENT : colors.semantic.danger}
                  label={f.framework}
                  value={`${Math.round(f.score)}%`}
                />
              ))}
            </Box>
          }
        />
      }
      kpis={
        <>
          <KpiCard
            label={t('scoring.complianceManager.kpiOverallCompliance')}
            value={overall != null ? Math.round(overall) : null}
            unit="%"
            loading={loading}
            empty={!loading && overall == null}
            emptyHint="No evaluation yet"
          />
          <KpiCard
            label={t('scoring.complianceManager.kpiFrameworks')}
            value={hasData ? frameworks.length : null}
            loading={loading}
          />
          <KpiCard
            label={t('scoring.complianceManager.kpiControlsPassing')}
            value={totalControls > 0 ? controlBreakdown.pass : null}
            unit={totalControls > 0 ? `of ${totalControls}` : undefined}
            loading={loading}
          />
          <KpiCard
            label={t('scoring.complianceManager.kpiControlsNotPassing')}
            value={totalControls > 0 ? controlBreakdown.fail + controlBreakdown.partial : null}
            invertDelta
            loading={loading}
          />
        </>
      }
      charts={
        <>
          <ChartCard title={t('scoring.complianceManager.chartFrameworkPassRate')}>
            {fwBar.categories.length > 0
              ? (
                <StackedBarChart
                  categories={fwBar.categories}
                  series={[{ name: 'Pass rate %', data: fwBar.data }]}
                  horizontal
                  stacked={false}
                  height={240}
                />
              )
              : EMPTY_CHART('No frameworks evaluated')}
          </ChartCard>

          <ChartCard title={t('scoring.complianceManager.chartControlOutcomes')}>
            {controlBreakdown.donut.length > 0
              ? <DonutChart data={controlBreakdown.donut} totalLabel="Controls" height={240} />
              : EMPTY_CHART('No control results yet')}
          </ChartCard>
        </>
      }
      workItems={
        <ManagerActionList
          title={t('scoring.complianceManager.gapQueueTitle')}
          subtitle={t('scoring.complianceManager.gapQueueSubtitle')}
          items={frameworkQueue}
          emptyText="No compliance gaps need review"
          actionLabel="Remediate"
        />
      }
      narrative={
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            Compliance Summary
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: worstFrameworks.length > 0 ? 2 : 0 }}>
            {overall != null
              ? `Overall compliance sits at ${Math.round(overall)}% across ${frameworks.length} framework${
                  frameworks.length === 1 ? '' : 's'
                }${
                  totalControls > 0
                    ? `, with ${controlBreakdown.pass}/${totalControls} controls passing${
                        controlBreakdown.fail + controlBreakdown.partial > 0
                          ? ` and ${controlBreakdown.fail + controlBreakdown.partial} not passing`
                          : ''
                      }`
                    : ''
                }. Switch to engineer mode for per-control mappings and remediation detail.`
              : 'Run a scan to evaluate your compliance frameworks. Once results land, framework scores and control mappings appear here.'}
          </Typography>

          {worstFrameworks.length > 0 && (
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: theme.palette.text.secondary }}>
                Lowest-scoring Frameworks
              </Typography>
              <Stack spacing={1}>
                {worstFrameworks.map((f) => {
                  const summary = summarizeFrameworkControls(f)
                  const sev = f.score >= 90 ? 'low' : f.score >= 70 ? 'medium' : f.score >= 50 ? 'high' : 'critical'
                  return (
                    <Box
                      key={f.framework}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: 1.5, p: 1,
                        borderRadius: 1.5, bgcolor: alpha(theme.palette.text.primary, 0.03),
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
                        {f.framework}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {summary.pass_count}/{summary.evaluated_count} passing · {summary.non_pass_count} not passing
                      </Typography>
                      <SeverityChip severity={sev} label={`${Math.round(f.score)}%`} size="sm" />
                    </Box>
                  )
                })}
              </Stack>
            </Box>
          )}
        </Box>
      }
    />
  )
}
