/**
 * IssuesManagerView — manager-mode summary for the code security
 * Issues queue. Rolls up the same enriched issues the engineer table
 * drills into, sourced live from:
 *   • GET /issues?enrich=true → severity / type / KEV / EPSS / status
 *
 * No fake numbers — every figure is computed from the enriched issue
 * list. Built from the _shared primitives; client imported by direct
 * path per the decoupling rule.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import { alpha } from '@mui/material/styles'
import { ShieldCheck, Wand2, Crosshair } from 'lucide-react'

import {
  ManagerDashboard, ChartCard, KpiCard, DonutChart, StackedBarChart,
  ManagerActionList,
  BubbleChart, GaugeChart,
  ManagerHero, HeroStat,
  type DonutDatum, type BubbleSeries,
} from '@compounds/_shared'

import { getEnrichedOrgIssues, type EnrichedSecurityIssue } from '@lib/engine/code/issues'
import { type Severity } from '@lib/tokens/severity'
import { qk } from '@lib/queryKeys'
import { t } from '@lib/i18n';
import { colors } from '@/styles/designTokens'

// Engine severity strings are upper-case; normalize to the token union.
function normSev(s: string): Severity {
  switch ((s || '').toLowerCase()) {
    case 'critical': return 'critical'
    case 'high': return 'high'
    case 'moderate':
    case 'medium': return 'medium'
    case 'low': return 'low'
    default: return ''
  }
}

export function IssuesManagerView() {
  const { orgId } = useParams<{ orgId: string }>()

  const issuesQ = useQuery({
    queryKey: qk.ctem.enrichedIssues(orgId, 'manager'),
    queryFn: () => getEnrichedOrgIssues(orgId!, { status: 'open' }),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const rows = useMemo<EnrichedSecurityIssue[]>(() => issuesQ.data?.issues ?? [], [issuesQ.data])
  const counts = issuesQ.data?.counts
  const loading = issuesQ.isLoading

  // ── KPIs ────────────────────────────────────────────────────────
  // Headline total + percentage denominators come from the server-
  // authoritative `counts.open` (the whole org's open issues), NOT
  // rows.length — `rows` is the capped page, so deriving the total or
  // the fix-ready % from it would understate the org. Per-severity /
  // KEV / autofixable / exposed breakdowns aren't in the server counts,
  // so those remain computed from `rows`; they're clearly secondary to
  // the count-based headline.
  const stats = useMemo(() => {
    let crit = 0, high = 0, kev = 0, autofixable = 0, exposed = 0, kevExposed = 0
    for (const i of rows) {
      const sev = normSev(i.severity)
      if (sev === 'critical') crit++
      if (sev === 'high') high++
      if (i.in_kev) kev++
      if (i.autofix_eligible) autofixable++
      if (i.external_exposed) exposed++
      if (i.in_kev && i.external_exposed) kevExposed++
    }
    // Total = server open count (falls back to page size only if absent).
    const total = counts?.open ?? rows.length
    // Denominator is the server total so the headline "X of Y · Z% ready"
    // stays internally consistent with the count-based total above.
    const autofixPct = total > 0 ? Math.round((autofixable / total) * 100) : 0
    return { total, crit, high, kev, autofixable, exposed, kevExposed, autofixPct }
  }, [rows, counts])

  // ── Severity donut ──────────────────────────────────────────────
  const sevDonut = useMemo<DonutDatum[]>(() => {
    const c: Record<string, number> = {}
    for (const i of rows) {
      const s = normSev(i.severity)
      if (!s) continue
      c[s] = (c[s] || 0) + 1
    }
    return (['critical', 'high', 'medium', 'low'] as const)
      .filter(s => c[s])
      .map(s => ({ label: s[0].toUpperCase() + s.slice(1), value: c[s], severity: s }))
  }, [rows])

  // ── Issue-type mix horizontal bar ───────────────────────────────
  const typeMix = useMemo(() => {
    const c: Record<string, number> = {}
    for (const i of rows) c[i.type || 'other'] = (c[i.type || 'other'] || 0) + (i.count || 1)
    const entries = Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 8)
    return {
      categories: entries.map(([t]) => t),
      data: entries.map(([, n]) => n),
      hasData: entries.length > 0,
    }
  }, [rows])

  // ── Exploitability bubble — risk × EPSS, sized by blast radius ──
  const bubble = useMemo<BubbleSeries[]>(() => {
    const bySev: Record<string, { x: number; y: number; z: number }[]> = {}
    for (const i of rows) {
      const sev = normSev(i.severity)
      const key = sev || ''
      const risk = i.risk_score ?? 0
      const epss = Math.round((i.epss ?? 0) * 100) + (i.in_kev ? 100 : 0)
      const z = Math.max(4, i.blast_radius ?? 6)
      ;(bySev[key] ??= []).push({ x: risk, y: epss, z })
    }
    return Object.entries(bySev)
      .filter(([, pts]) => pts.length > 0 && pts.some(p => p.x > 0 || p.y > 0))
      .map(([sev, data]) => ({
        name: sev ? sev[0].toUpperCase() + sev.slice(1) : 'Other',
        data,
        severity: (sev || '') as Severity,
      }))
  }, [rows])

  const hasBubble = bubble.length > 0

  const priorityItems = useMemo(() => {
    return [...rows]
      .sort((a, b) => {
        const scoreA = (a.risk_score ?? 0) + (a.in_kev ? 40 : 0) + (a.external_exposed ? 20 : 0) + (a.autofix_eligible ? 8 : 0)
        const scoreB = (b.risk_score ?? 0) + (b.in_kev ? 40 : 0) + (b.external_exposed ? 20 : 0) + (b.autofix_eligible ? 8 : 0)
        return scoreB - scoreA
      })
      .slice(0, 6)
      .map((issue) => {
        const sev = normSev(issue.severity)
        const tags = [
          issue.in_kev ? 'KEV' : null,
          issue.external_exposed ? 'externally exposed' : null,
          issue.autofix_eligible ? 'autofixable' : null,
        ].filter(Boolean).join(' · ')
        return {
          id: issue.fingerprint || issue.id,
          title: issue.title || issue.cve_id || issue.type,
          subtitle: issue.repo_name || issue.repo_id,
          meta: tags || `${issue.type}${issue.package ? ` · ${issue.package}` : ''}`,
          value: issue.risk_score != null ? `${Math.round(issue.risk_score)}` : undefined,
          severity: sev,
        }
      })
  }, [rows])

  const ACCENT = colors.brand

  return (
    <ManagerDashboard
      title={t('exposure.issuesManager.managerTitle')}
      subtitle={t('exposure.issuesManager.managerSubtitle')}
      accent={ACCENT}
      titleIcon={<ShieldCheck size={20} />}
      layout="hero-split"
      hero={
        <ManagerHero
          accent={ACCENT}
          icon={<Wand2 size={15} />}
          minHeight={200}
          visual={
            !loading && stats.total > 0 ? (
              <GaugeChart
                value={stats.autofixPct}
                max={100}
                label={t('exposure.issuesManager.autofixCoverage')}
                grade={stats.autofixPct >= 50 ? 'good' : stats.autofixPct >= 20 ? 'fair' : 'warn'}
                height={188}
              />
            ) : undefined
          }
          headline={{
            label: t('exposure.issuesManager.autofixableLabel'),
            value: loading ? '—' : stats.autofixable,
            unit: stats.total > 0 ? t('common.ofCount', { count: stats.total }) : undefined,
            sub: stats.total === 0
              ? t('exposure.issuesManager.heroEmpty')
              : t('exposure.issuesManager.heroSummary', {
                  autofixable: stats.autofixable,
                  total: stats.total,
                  pct: stats.autofixPct,
                }),
            delta: !loading && stats.autofixable > 0 ? (
              <Chip
                size="small"
                icon={<Wand2 size={13} />}
                label={t('exposure.issuesManager.readyPct', { pct: stats.autofixPct })}
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
                icon={<Crosshair size={14} />}
                tone={stats.kevExposed > 0 ? colors.semantic.danger : ACCENT}
                label={t('exposure.issuesManager.kevExposed')}
                value={loading ? '—' : stats.kevExposed}
              />
              <HeroStat
                icon={<ShieldCheck size={14} />}
                tone={ACCENT}
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
            label={t('exposure.issuesManager.openIssuesLabel')}
            value={loading ? null : stats.total}
            loading={loading}
            empty={!loading && stats.total === 0}
            emptyHint={t('exposure.issuesManager.empty.openIssues')}
          />
          <KpiCard label={t('common.critical')} value={loading ? null : stats.crit} invertDelta loading={loading} />
          <KpiCard label={t('common.high')} value={loading ? null : stats.high} invertDelta loading={loading} />
          <KpiCard label={t('exposure.ctem.kpi.kevListed')} value={loading ? null : stats.kev} invertDelta loading={loading} />
          <KpiCard label={t('exposure.issuesManager.autofixableLabel')} value={loading ? null : stats.autofixable} loading={loading} />
        </>
      }
      charts={
        <>
          <ChartCard title={t('exposure.issuesManager.severityMixTitle')}>
            {sevDonut.length > 0 ? (
              <DonutChart data={sevDonut} totalLabel={t('common.issues')} />
            ) : (
              <EmptyCell text={t('exposure.issuesManager.empty.openIssues')} />
            )}
          </ChartCard>

          <ChartCard title={t('reports.preset.issueTypes')}>
            {typeMix.hasData ? (
              <StackedBarChart
                categories={typeMix.categories}
                series={[{ name: t('common.issues'), data: typeMix.data, severity: 'high' }]}
                horizontal
                stacked={false}
                height={260}
              />
            ) : (
              <EmptyCell text={t('exposure.issuesManager.empty.categorize')} />
            )}
          </ChartCard>

          <ChartCard title={t('exposure.issuesManager.chart.riskExploitability')}>
            {hasBubble ? (
              <BubbleChart
                series={bubble}
                xTitle={t('exposure.issuesManager.axis.riskScore')}
                yTitle={t('exposure.issuesManager.axis.exploitSignal')}
                xMax={100}
                height={260}
              />
            ) : (
              <EmptyCell text={t('exposure.issuesManager.empty.riskScored')} />
            )}
          </ChartCard>
        </>
      }
      workItems={
        <ManagerActionList
          title={t('exposure.issuesManager.priorityQueueTitle')}
          subtitle={t('exposure.issuesManager.priorityQueueSubtitle')}
          items={priorityItems}
          emptyText={t('exposure.issuesManager.empty.priorityQueue')}
          actionLabel={t('common.triage')}
        />
      }
      narrative={
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
            {t('exposure.issuesManager.narrative.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {stats.total === 0
              ? t('exposure.issuesManager.narrative.empty')
              : t('exposure.issuesManager.narrative.summary', {
                  total: stats.total,
                  critical: stats.crit,
                  high: stats.high,
                  kev: stats.kev,
                  exposed: stats.exposed,
                  autofixable: stats.autofixable,
                })}
          </Typography>
        </Box>
      }
    />
  )
}

function EmptyCell({ text }: { text: string }) {
  return (
    <Box sx={{ height: 260, display: 'grid', placeItems: 'center' }}>
      <Typography variant="body2" color="text.secondary">{text}</Typography>
    </Box>
  )
}
