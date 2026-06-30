/**
 * DomainsManagerView — manager-mode domain inventory surface.
 *
 * KPI + chart summary of the external domain inventory, sourced from
 * GET /external-posture/kernel (asset_count, scored_count, avg score /
 * grade, per-asset score+findings) plus the footprint exposure trend.
 *
 * Client functions imported by DIRECT FILE PATH per decoupling rule.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import { alpha } from '@mui/material/styles'
import { Globe, AlertTriangle } from 'lucide-react'

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
import { type Severity } from '@lib/tokens/severity'
import { qk } from '@lib/queryKeys'
import { t } from '@lib/i18n';
import { colors } from '@/styles/designTokens'

import { getDomainPostureKernel, type DomainKernelAsset } from '@lib/engine/code/footprintSurface'

// Engine grade string → GaugeChart grade bucket.
function gradeToGaugeGrade(g?: string): 'bad' | 'warn' | 'fair' | 'neutral' | 'good' {
  const v = (g ?? '').toUpperCase()
  if (v.startsWith('A')) return 'good'
  if (v.startsWith('B')) return 'fair'
  if (v.startsWith('C')) return 'warn'
  if (v.startsWith('D') || v.startsWith('F')) return 'bad'
  return 'neutral'
}

// Engine letter grade → severity tone bucket for the per-domain donut.
function gradeSeverity(g?: string): Severity {
  const v = (g ?? '').toUpperCase()
  if (v.startsWith('A')) return 'low'
  if (v.startsWith('B')) return 'medium'
  if (v.startsWith('C')) return 'high'
  if (v.startsWith('D') || v.startsWith('F')) return 'critical'
  return ''
}

function findingSeverity(s?: string): Severity {
  const v = (s ?? '').toLowerCase()
  if (v === 'critical') return 'critical'
  if (v === 'high') return 'high'
  if (v === 'medium') return 'medium'
  if (v === 'low') return 'low'
  return ''
}

export function DomainsManagerView() {
  const { orgId } = useParams<{ orgId: string }>()

  const q = useQuery({
    queryKey: qk.domains.managerPostureKernel(orgId),
    queryFn: () => getDomainPostureKernel(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const data = q.data
  const assets: DomainKernelAsset[] = useMemo(() => data?.assets ?? [], [data])

  // Grade distribution donut.
  const gradeDonut: DonutDatum[] = useMemo(() => {
    const buckets: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, '': 0 }
    for (const a of assets) buckets[gradeSeverity(a.grade)] += 1
    const labelOf: Record<Severity, string> = {
      critical: 'D / F', high: 'C', medium: 'B', low: 'A', '': 'Unscored',
    }
    return (Object.keys(buckets) as Severity[])
      .filter((s) => buckets[s] > 0)
      .map((s) => ({ label: labelOf[s], value: buckets[s], severity: s }))
  }, [assets])

  // Findings-by-severity bar (across all domains' projected findings).
  const findingsBar = useMemo(() => {
    const order: Severity[] = ['critical', 'high', 'medium', 'low']
    const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, '': 0 }
    for (const a of assets) for (const f of a.findings ?? []) counts[findingSeverity(f.severity)] += 1
    return {
      categories: order.map((s) => s),
      series: order.map((s) => ({ name: s, data: [counts[s]], severity: s })),
      total: order.reduce((acc, s) => acc + counts[s], 0),
    }
  }, [assets])

  // Top exposed domains (lowest score first) bar.
  const topExposed = useMemo(() => {
    const scored = assets.filter((a) => typeof a.score === 'number')
    scored.sort((a, b) => (a.score ?? 100) - (b.score ?? 100))
    const top = scored.slice(0, 8)
    return {
      categories: top.map((a) => a.canonical_value),
      values: top.map((a) => Math.round(a.score ?? 0)),
    }
  }, [assets])

  // Worst-exposed spotlight (lowest score) + leaderboard of the next
  // worst — derived from the same scored set the exposure bar uses.
  const exposureRank = useMemo(() => {
    const scored = assets.filter((a) => typeof a.score === 'number')
    scored.sort((a, b) => (a.score ?? 100) - (b.score ?? 100))
    return scored
  }, [assets])

  const worstDomain = exposureRank[0] ?? null
  const leaderboard = exposureRank.slice(1, 5)

  const domainQueue = useMemo(() => {
    return [...assets]
      .sort((a, b) => {
        const score = (asset: DomainKernelAsset) =>
          (asset.findings?.length ?? 0) * 25 +
          (gradeSeverity(asset.grade) === 'critical' ? 40 : gradeSeverity(asset.grade) === 'high' ? 24 : 0) +
          (100 - (asset.score ?? 100))
        return score(b) - score(a)
      })
      .slice(0, 6)
      .map((asset) => {
        const worst = (asset.findings ?? []).map((f) => findingSeverity(f.severity)).find(Boolean) || gradeSeverity(asset.grade)
        return {
          id: asset.resource_id,
          title: asset.display_name || asset.canonical_value,
          subtitle: [asset.type, asset.current_tier, asset.grade ? `grade ${asset.grade}` : null].filter(Boolean).join(' · '),
          meta: `${asset.findings?.length ?? 0} findings · confidence ${Math.round((asset.confidence ?? 0) * 100)}%`,
          value: typeof asset.score === 'number' ? `${Math.round(asset.score)}` : undefined,
          severity: worst,
        }
      })
  }, [assets])

  const loading = q.isLoading
  const hasScore = !!data && data.scored_count > 0 && typeof data.avg_score === 'number'

  const ACCENT = colors.section.exposure
  const worstScore = typeof worstDomain?.score === 'number' ? Math.round(worstDomain.score) : null
  const worstName = worstDomain
    ? worstDomain.display_name || worstDomain.canonical_value
    : null

  return (
    <ManagerDashboard
      title={t('domains.manager.inventoryTitle')}
      subtitle={t('domains.manager.inventorySubtitle')}
      accent={ACCENT}
      titleIcon={<Globe size={20} />}
      layout="hero-split"
      hero={
        <ManagerHero
          accent={ACCENT}
          icon={<AlertTriangle size={15} />}
          minHeight={200}
          headline={{
            label: t('domains.manager.worstLabel'),
            value: worstName ?? '—',
            delta: worstDomain ? (
              <Chip
                size="small"
                label={`${worstDomain.grade || 'unscored'}${worstScore != null ? ` · ${worstScore}/100` : ''}`}
                sx={{
                  fontWeight: 700, fontSize: 12,
                  bgcolor: alpha(colors.semantic.danger, 0.14),
                  color: colors.semantic.danger,
                }}
              />
            ) : undefined,
            sub: worstDomain
              ? `Lowest-scoring domain in your inventory — ${worstDomain.findings?.length ?? 0} open finding${(worstDomain.findings?.length ?? 0) === 1 ? '' : 's'}. Triage this first.`
              : 'No scored domains yet — import or discover domains to surface your most exposed asset.',
          }}
          aside={
            <Box>
              {hasScore && (
                <Box sx={{ mb: 1 }}>
                  <GaugeChart
                    value={Math.round(data!.avg_score)}
                    max={100}
                    label={t('domains.manager.scoreLabel')}
                    grade={gradeToGaugeGrade(data!.avg_grade)}
                    height={120}
                  />
                </Box>
              )}
              {leaderboard.map((a) => (
                <HeroStat
                  key={a.resource_id}
                  tone={ACCENT}
                  label={a.display_name || a.canonical_value}
                  value={typeof a.score === 'number' ? Math.round(a.score) : '—'}
                />
              ))}
            </Box>
          }
        />
      }
      kpis={
        <>
          <KpiCard
            label={t('domains.manager.trackedLabel')}
            value={data ? data.asset_count : null}
            loading={loading}
            empty={!loading && (data?.asset_count ?? 0) === 0}
            emptyHint="No domains yet"
          />
          <KpiCard
            label={t('domains.manager.scoredLabel')}
            value={data ? data.scored_count : null}
            unit={data ? `of ${data.asset_count}` : undefined}
            loading={loading}
          />
          <KpiCard
            label={t('domains.manager.avgScoreLabel')}
            value={hasScore ? Math.round(data!.avg_score) : null}
            unit="/ 100"
            loading={loading}
            empty={!loading && !hasScore}
            emptyHint="Pending first scan"
          />
          <KpiCard
            label={t('domains.manager.findingsLabel')}
            value={data ? findingsBar.total : null}
            invertDelta
            loading={loading}
          />
        </>
      }
      charts={
        <>
          <ChartCard title={t('domains.manager.gradeDistTitle')}>
            {gradeDonut.length > 0 ? (
              <DonutChart data={gradeDonut} height={240} totalLabel="Domains" />
            ) : (
              <EmptyChart text="No domains to grade" />
            )}
          </ChartCard>

          <ChartCard title={t('domains.manager.findingsBySeverityTitle')}>
            {findingsBar.total > 0 ? (
              <StackedBarChart height={240} stacked categories={['Findings']} series={findingsBar.series} />
            ) : (
              <EmptyChart text="No open findings" />
            )}
          </ChartCard>

          <ChartCard title={t('domains.manager.exposedDomainsTitle')}>
            {topExposed.values.length > 0 ? (
              <StackedBarChart
                height={240}
                horizontal
                categories={topExposed.categories}
	                series={[{ name: t('hardcoded.score.data.topexposed.values.severity.high.8409ce92'), data: topExposed.values, severity: 'high' }]}
              />
            ) : (
              <EmptyChart text="No scored domains yet" />
            )}
          </ChartCard>
        </>
      }
      workItems={
        <ManagerActionList
          title={t('domains.manager.queueTitle')}
          subtitle={t('domains.manager.queueSubtitle')}
          items={domainQueue}
          emptyText="No domain exposure needs review"
          actionLabel="Review"
        />
      }
      narrative={
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
            Summary
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {data && data.asset_count > 0
              ? `You are tracking ${data.asset_count} external domain${data.asset_count === 1 ? '' : 's'}, ${data.scored_count} scored at an average of ${hasScore ? Math.round(data.avg_score) : '—'}/100 (${data.avg_grade || 'n/a'}). Switch to engineer mode (top bar) to import domains, run scans, and validate ownership.`
              : 'Import or discover domains to populate your external inventory. Once scored, this overview shows grade distribution, open findings, and the most exposed domains.'}
          </Typography>
        </Box>
      }
    />
  )
}

function EmptyChart({ text }: { text: string }) {
  return (
    <Box sx={{ height: 240, display: 'grid', placeItems: 'center' }}>
      <Typography variant="body2" color="text.secondary">
        {text}
      </Typography>
    </Box>
  )
}
