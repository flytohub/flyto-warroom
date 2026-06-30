/**
 * RansomwareManagerView — manager-mode landscape view of the
 * ransomware victim feed. Engineer view keeps the searchable victim
 * table; the manager view leads with KPIs (90-day victim count, most
 * active group, recent surge) + top-group / top-country charts +
 * monthly trend.
 *
 * Every number is real: derived from a recent slice of listRansomware
 * (group_name / victim_country / published_at are all server fields).
 *
 * Client functions imported by DIRECT FILE PATH per the decoupling rule.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Box, Chip } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { Skull, TrendingUp, TrendingDown, Users, Globe } from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import {
  ManagerDashboard,
  ChartCard,
  KpiCard,
  StackedBarChart,
  TrendChart,
  DonutChart,
  ManagerHero,
  HeroStat,
  type DonutDatum,
} from '@compounds/_shared'
import { colors } from '@/styles/designTokens'
import { listRansomware, type RansomwareIncident } from '@lib/engine/code/threatIntel'

const ACCENT = colors.semantic.danger

const SAMPLE = 500

function monthKey(iso?: string | null): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function topN(counts: Record<string, number>, n: number): [string, number][] {
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n)
}

export function RansomwareManagerView() {
  const { org } = useOrg()
  const orgId = org?.id

  const { data, isLoading } = useQuery({
    queryKey: qk.threatIntel.ransomwareManager(orgId),
    queryFn: () => listRansomware(orgId!, { limit: SAMPLE, offset: 0 }),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const incidents: RansomwareIncident[] = useMemo(() => data?.incidents ?? [], [data])
  const total = data?.total ?? 0

  const agg = useMemo(() => {
    const byGroup: Record<string, number> = {}
    const byCountry: Record<string, number> = {}
    const bySector: Record<string, number> = {}
    const byMonth: Record<string, number> = {}
    for (const r of incidents) {
      if (r.group_name) byGroup[r.group_name] = (byGroup[r.group_name] ?? 0) + 1
      if (r.victim_country) byCountry[r.victim_country] = (byCountry[r.victim_country] ?? 0) + 1
      if (r.victim_sector) bySector[r.victim_sector] = (bySector[r.victim_sector] ?? 0) + 1
      const mk = monthKey(r.published_at)
      if (mk) byMonth[mk] = (byMonth[mk] ?? 0) + 1
    }
    return { byGroup, byCountry, bySector, byMonth }
  }, [incidents])

  // Last-30-day victim count within the sample.
  const last30 = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400_000
    return incidents.filter(r => {
      const t = r.published_at ? Date.parse(r.published_at) : NaN
      return !Number.isNaN(t) && t >= cutoff
    }).length
  }, [incidents])

  const topGroup = topN(agg.byGroup, 1)[0]
  const distinctGroups = Object.keys(agg.byGroup).length

  // Most active group in the trailing 7 days (the "this week" spotlight).
  const weekTopGroup = useMemo(() => {
    const cutoff = Date.now() - 7 * 86400_000
    const byGroup: Record<string, number> = {}
    for (const r of incidents) {
      if (!r.group_name) continue
      const t = r.published_at ? Date.parse(r.published_at) : NaN
      if (Number.isNaN(t) || t < cutoff) continue
      byGroup[r.group_name] = (byGroup[r.group_name] ?? 0) + 1
    }
    return topN(byGroup, 1)[0]
  }, [incidents])

  // Surge direction — latest full month vs the month before it.
  const monthSurge = useMemo(() => {
    const months = Object.keys(agg.byMonth).sort()
    if (months.length < 2) return null
    const cur = agg.byMonth[months[months.length - 1]] ?? 0
    const prev = agg.byMonth[months[months.length - 2]] ?? 0
    return { delta: cur - prev, cur, prev }
  }, [agg.byMonth])

  const topCountry = topN(agg.byCountry, 1)[0]

  const hasData = !isLoading && incidents.length > 0

  const groupBars = topN(agg.byGroup, 10)
  const countryBars = topN(agg.byCountry, 10)

  // Trailing tempo for the hero sparkline (last 8 months of claims).
  const tempo = useMemo(() => {
    const months = Object.keys(agg.byMonth).sort().slice(-8)
    return { categories: months, values: months.map(m => agg.byMonth[m]) }
  }, [agg.byMonth])

  const sectorDonut: DonutDatum[] = useMemo(() => {
    const top = topN(agg.bySector, 6).map(([label, value]) => ({ label, value }))
    return top
  }, [agg.bySector])

  return (
    <ManagerDashboard
      title={t('threatIntel.ransomware')}
      subtitle={t('threatIntel.ransomwareManagerLede')}
      accent={ACCENT}
      titleIcon={<Skull size={20} />}
      layout="full-bleed"
      hero={
        <ManagerHero
          accent={ACCENT}
          icon={<Skull size={15} />}
          minHeight={200}
          visual={
            hasData && tempo.values.length > 1 ? (
              <Box sx={{ width: { xs: '100%', md: 320 } }}>
                <TrendChart
                  categories={tempo.categories}
                  series={[{ name: t('threatIntel.victims'), data: tempo.values, severity: 'critical' }]}
                  area
                  height={150}
                />
              </Box>
            ) : undefined
          }
          headline={{
            label: t('threatIntel.victimsLast30'),
            value: hasData ? last30 : '—',
            delta: monthSurge && monthSurge.delta !== 0 ? (
              <Chip
                size="small"
                icon={monthSurge.delta > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                label={`${monthSurge.delta > 0 ? '+' : ''}${monthSurge.delta} ${t('threatIntel.surgeMoM')}`}
                sx={{
                  fontWeight: 700, fontSize: 12,
                  // For ransomware, MORE victims is BAD — up = danger, down = success.
                  bgcolor: alpha(monthSurge.delta > 0 ? colors.semantic.danger : colors.semantic.success, 0.14),
                  color: monthSurge.delta > 0 ? colors.semantic.danger : colors.semantic.success,
                  '& .MuiChip-icon': { color: 'inherit' },
                }}
              />
            ) : undefined,
            sub: hasData && weekTopGroup
              ? `${t('threatIntel.mostActiveThisWeek')}: ${weekTopGroup[0]} (${weekTopGroup[1]})`
              : hasData && topGroup
                ? `${t('threatIntel.mostActiveGroup')}: ${topGroup[0]} (${topGroup[1]})`
                : t('threatIntel.ransomEmptyShort'),
          }}
          aside={
            <Box>
              <HeroStat
                icon={<Skull size={14} />}
                tone={ACCENT}
                label={t('threatIntel.activeGroups')}
                value={hasData ? distinctGroups : '—'}
              />
              <HeroStat
                icon={<Users size={14} />}
                tone={ACCENT}
                label={t('threatIntel.totalVictims')}
                value={!isLoading ? total : '—'}
              />
              <HeroStat
                icon={<Globe size={14} />}
                tone={ACCENT}
                label={t('threatIntel.topCountry')}
                value={hasData && topCountry ? topCountry[0] : '—'}
              />
            </Box>
          }
        />
      }
      kpis={
        <>
          <KpiCard
            label={t('threatIntel.totalVictims')}
            value={!isLoading ? total : null}
            invertDelta
            loading={isLoading}
            empty={!isLoading && incidents.length === 0}
            emptyHint={t('threatIntel.ransomEmptyShort')}
          />
          <KpiCard
            label={t('threatIntel.victimsLast30')}
            value={hasData ? last30 : null}
            invertDelta
            loading={isLoading}
          />
          <KpiCard
            label={t('threatIntel.mostActiveGroup')}
            value={hasData && topGroup ? topGroup[0] : null}
            loading={isLoading}
          />
          <KpiCard
            label={t('threatIntel.activeGroups')}
            value={hasData ? distinctGroups : null}
            loading={isLoading}
          />
        </>
      }
      charts={
        <>
          <ChartCard title={t('threatIntel.topGroups')}>
            {hasData ? (
              <StackedBarChart
                categories={groupBars.map(([g]) => g)}
                series={[{ name: t('threatIntel.victims'), data: groupBars.map(([, n]) => n), severity: 'critical' }]}
                horizontal
                stacked={false}
                height={Math.max(240, groupBars.length * 26)}
              />
            ) : <EmptyChart loading={isLoading} />}
          </ChartCard>
          <ChartCard title={t('threatIntel.topVictimCountries')}>
            {hasData ? (
              <StackedBarChart
                categories={countryBars.map(([c]) => c)}
                series={[{ name: t('threatIntel.victims'), data: countryBars.map(([, n]) => n), severity: 'high' }]}
                horizontal
                stacked={false}
                height={Math.max(240, countryBars.length * 26)}
              />
            ) : <EmptyChart loading={isLoading} />}
          </ChartCard>
          <ChartCard title={t('threatIntel.victimsBySector')}>
            {hasData && sectorDonut.length > 0 ? (
              <DonutChart data={sectorDonut} totalLabel={t('threatIntel.victims')} height={260} />
            ) : <EmptyChart loading={isLoading} />}
          </ChartCard>
        </>
      }
    />
  )
}

function EmptyChart({ loading }: { loading: boolean }) {
  return (
    <Box sx={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary', fontSize: 13 }}>
      {loading ? t('common.loading') : t('threatIntel.ransomEmptyShort')}
    </Box>
  )
}
