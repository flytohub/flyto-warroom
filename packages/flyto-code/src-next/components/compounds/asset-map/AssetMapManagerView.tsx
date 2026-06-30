/**
 * AssetMapManagerView — manager-mode cross-surface asset summary.
 *
 * KPI + chart roll-up of the kernel asset map (GET /asset-map/kernel):
 * resource/relationship counts, surface mix, tier mix, scored ratio,
 * and finding-bearing nodes. The dense per-node card grid + relationship
 * inspector stay in the engineer view.
 *
 * Client function imported by DIRECT FILE PATH per decoupling rule.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import { Network, Share2, Cloud, Code2, Globe } from 'lucide-react'

import {
  ManagerDashboard,
  ChartCard,
  KpiCard,
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

import { getKernelAssetMap } from '@lib/engine/ctem/asset-map'

const ACCENT = colors.brand // architecture violet

// Per-surface legend hue — external→cyan / code→green / cloud→amber.
const SURFACE_TINT: Record<string, string> = {
  external: colors.semantic.info,
  code: colors.semantic.success,
  cloud: colors.semantic.warning,
  container: colors.semantic.warning,
}
const SURFACE_ICON: Record<string, typeof Globe> = {
  external: Globe,
  code: Code2,
  cloud: Cloud,
  container: Cloud,
}

// Stable color intent per surface via severity tone slots (no inline hex).
const SURFACE_SEVERITY: Record<string, Severity> = {
  external: 'high',
  code: 'low',
  container: 'medium',
  cloud: 'medium',
  unknown: '',
}

export function AssetMapManagerView() {
  const { orgId } = useParams<{ orgId: string }>()

  const q = useQuery({
    queryKey: qk.assetMapKernel(orgId),
    queryFn: () => getKernelAssetMap(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const data = q.data
  const summary = data?.summary

  const surfaceDonut: DonutDatum[] = useMemo(() => {
    const bySurface = summary?.by_surface ?? {}
    return Object.entries(bySurface)
      .map(([surface, count]) => ({
        label: surface,
        value: count,
        severity: SURFACE_SEVERITY[surface] ?? '',
      }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [summary])

  const tierBar = useMemo(() => {
    const byTier = summary?.by_tier ?? {}
    const entries = Object.entries(byTier).sort((a, b) => b[1] - a[1])
    return {
      categories: entries.map((e) => e[0] || 'untiered'),
      values: entries.map((e) => e[1]),
    }
  }, [summary])

  const categoryBar = useMemo(() => {
    const byCat = summary?.by_category ?? {}
    const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 8)
    return {
      categories: entries.map((e) => e[0]),
      values: entries.map((e) => e[1]),
    }
  }, [summary])

  const nodes = useMemo(() => data?.nodes ?? [], [data])
  const relationshipCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const edge of data?.edges ?? []) {
      counts[edge.source_resource_id] = (counts[edge.source_resource_id] ?? 0) + 1
      counts[edge.target_resource_id] = (counts[edge.target_resource_id] ?? 0) + 1
    }
    return counts
  }, [data])
  const scoredNodes = useMemo(() => nodes.filter((n) => (n.asset_scores?.length ?? 0) > 0).length, [nodes])
  const findingNodes = useMemo(() => nodes.filter((n) => (n.finding_count ?? 0) > 0).length, [nodes])
  const priorityAssets = useMemo(() => {
    return [...nodes]
      .sort((a, b) => {
        const score = (n: typeof nodes[number]) =>
          (n.finding_count ?? 0) * 20 +
          (n.asset_scores?.length ?? 0) * 4 +
          (relationshipCounts[n.resource_id] ?? 0)
        return score(b) - score(a)
      })
      .slice(0, 6)
      .map((node) => ({
        id: node.resource_id,
        title: node.display_name || node.canonical_value || node.resource_id,
        subtitle: [node.surface, node.category, node.current_tier].filter(Boolean).join(' · '),
        meta: `${relationshipCounts[node.resource_id] ?? 0} relationships · ${node.asset_scores?.length ?? 0} scores`,
        value: node.finding_count ? `${node.finding_count} findings` : undefined,
        severity: node.finding_count ? ('high' as const) : ('low' as const),
      }))
  }, [nodes, relationshipCounts])

  // Highest-connectivity node = the blast hub the topology pivots around.
  const blastHub = useMemo(() => {
    let best: { name: string; rels: number; surface: string } | null = null
    for (const n of nodes) {
      const rels = relationshipCounts[n.resource_id] ?? 0
      if (!best || rels > best.rels) {
        best = {
          name: n.display_name || n.canonical_value || n.resource_id,
          rels,
          surface: n.surface || 'unknown',
        }
      }
    }
    return best && best.rels > 0 ? best : null
  }, [nodes, relationshipCounts])

  const loading = q.isLoading

  return (
    <ManagerDashboard
      title={t('assetMap.managerView.title')}
      subtitle={t('assetMap.managerView.subtitle')}
      accent={ACCENT}
      titleIcon={<Network size={20} />}
      layout="full-bleed"
      hero={
        <ManagerHero
          accent={ACCENT}
          icon={<Network size={15} />}
          minHeight={200}
          visual={
            surfaceDonut.length > 0 ? (
              <DonutChart data={surfaceDonut} height={188} totalLabel="Assets" />
            ) : undefined
          }
          headline={{
            label: t('assetMap.managerView.hero.label'),
            value: data ? data.node_count : '—',
            unit: data ? t('assetMap.managerView.hero.unit') : undefined,
            sub:
              data && data.node_count > 0
                ? `${surfaceDonut.length} surface${surfaceDonut.length === 1 ? '' : 's'} · ${data.edge_count} relationships${
                    blastHub
                      ? ` · blast hub "${blastHub.name}" (${blastHub.rels} links)`
                      : ''
                  }`
                : t('assetMap.managerView.hero.empty'),
          }}
          aside={
            <Box>
              {surfaceDonut.map((s) => {
                const tint = SURFACE_TINT[s.label] ?? colors.semantic.neutral
                const Icon = SURFACE_ICON[s.label] ?? Globe
                return (
                  <HeroStat
                    key={s.label}
                    icon={<Icon size={14} />}
                    tone={tint}
                    label={s.label}
                    value={s.value}
                  />
                )
              })}
              {blastHub && (
                <Box sx={{ mt: 1, pt: 1, borderTop: `1px solid ${alpha(ACCENT, 0.18)}` }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Share2 size={14} color={ACCENT} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        sx={{ fontSize: 12, fontWeight: 700, color: ACCENT, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}
                        title={blastHub.name}
                      >
                        {blastHub.name}
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                        {blastHub.rels} links · {blastHub.surface}
                      </Typography>
                    </Box>
                  </Stack>
                </Box>
              )}
            </Box>
          }
        />
      }
      kpis={
        <>
          <KpiCard
            label={t('assetMap.managerView.kpi.resources')}
            value={data ? data.node_count : null}
            loading={loading}
            empty={!loading && (data?.node_count ?? 0) === 0}
            emptyHint="No assets yet"
          />
          <KpiCard label={t('assetMap.managerView.kpi.relationships')} value={data ? data.edge_count : null} loading={loading} />
          <KpiCard
            label={t('assetMap.managerView.kpi.scored')}
            value={data ? scoredNodes : null}
            unit={data ? `of ${data.node_count}` : undefined}
            loading={loading}
          />
          <KpiCard label={t('assetMap.managerView.kpi.withFindings')} value={data ? findingNodes : null} invertDelta loading={loading} />
        </>
      }
      charts={
        <>
          <ChartCard title={t('assetMap.managerView.chart.tier')}>
            {tierBar.values.length > 0 ? (
              <StackedBarChart
                height={240}
                horizontal
                categories={tierBar.categories}
	                series={[{ name: t('hardcoded.assets.data.tierbar.values.severity.medium.fea8e72e'), data: tierBar.values, severity: 'medium' }]}
              />
            ) : (
              <EmptyChart text="No tier data" />
            )}
          </ChartCard>

          <ChartCard title={t('assetMap.managerView.chart.category')}>
            {categoryBar.values.length > 0 ? (
              <StackedBarChart
                height={240}
                horizontal
                categories={categoryBar.categories}
	                series={[{ name: t('hardcoded.assets.data.categorybar.values.severity.low.da0ff2a6'), data: categoryBar.values, severity: 'low' }]}
              />
            ) : (
              <EmptyChart text="No category data" />
            )}
          </ChartCard>
        </>
      }
      workItems={
        <ManagerActionList
          title={t('assetMap.managerView.exceptions.title')}
          subtitle={t('assetMap.managerView.exceptions.subtitle')}
          items={priorityAssets}
          emptyText="No asset exceptions found"
          actionLabel="Inspect"
        />
      }
      narrative={
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
            Summary
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {data && data.node_count > 0
              ? `Your asset map spans ${data.node_count} resources across ${surfaceDonut.length} surface${surfaceDonut.length === 1 ? '' : 's'} with ${data.edge_count} relationships; ${scoredNodes} are scored and ${findingNodes} carry findings.${data.truncated ? ' Results are truncated — narrow by surface in engineer mode.' : ''} Switch to engineer mode (top bar) for the per-resource cards and relationship inspector.`
              : 'Connect repositories, run external discovery, or import domains to populate the cross-surface asset map. Once resources land, this overview shows surface, tier, and category breakdowns.'}
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
