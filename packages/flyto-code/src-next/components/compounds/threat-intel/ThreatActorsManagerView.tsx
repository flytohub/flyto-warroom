/**
 * ThreatActorsManagerView — manager-mode strategic view of the threat
 * actor library. Engineer view keeps the searchable actor card grid;
 * the manager view leads with KPIs (tracked actors, distinct origins,
 * most-armed group) + origin-country chart + TTP-vs-arsenal bubble.
 *
 * Every number is real: aggregated from listThreatActors (country +
 * server-projected `*_count` siblings, with a parseJsonArray fallback
 * for pre-migration rows).
 *
 * Client functions imported by DIRECT FILE PATH per the decoupling rule.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Box, Chip } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { Skull, Globe, Bug } from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { t } from '@lib/i18n';
import { colors } from '@/styles/designTokens'
import { qk } from '@lib/queryKeys'
import {
  ManagerDashboard,
  ChartCard,
  KpiCard,
  BubbleChart,
  ManagerActionList,
  ManagerHero,
  HeroStat,
  type BubbleSeries,
} from '@compounds/_shared'
import { listThreatActors, parseJsonArray, type ThreatActor } from '@lib/engine/code/threatIntel'

const SAMPLE = 200

function arrCount(list?: string[], count?: number, raw?: string): number {
  if (typeof count === 'number') return count
  if (Array.isArray(list)) return list.length
  return parseJsonArray(raw).length
}

function topN(counts: Record<string, number>, n: number): [string, number][] {
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n)
}

export function ThreatActorsManagerView() {
  const { org } = useOrg()
  const orgId = org?.id

  const { data, isLoading } = useQuery({
    queryKey: qk.threatIntel.threatActorsManager(orgId),
    queryFn: () => listThreatActors(orgId!, { limit: SAMPLE, offset: 0 }),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  })

  const actors: ThreatActor[] = useMemo(() => data?.actors ?? [], [data])
  const total = data?.total ?? 0

  const enriched = useMemo(() => actors.map(a => ({
    name: a.name,
    country: a.country || t('threatIntel.unknownOrigin'),
    techniques: arrCount(a.techniques_list, a.techniques_count, a.techniques),
    malware: arrCount(a.malware_used_list, a.malware_used_count, a.malware_used),
    targets: arrCount(a.target_countries_list, a.target_countries_count, a.target_countries),
  })), [actors])

  const byCountry = useMemo(() => {
    const m: Record<string, number> = {}
    for (const e of enriched) m[e.country] = (m[e.country] ?? 0) + 1
    return m
  }, [enriched])

  const distinctOrigins = Object.keys(byCountry).length

  // Most-armed actor — the hero's focal subject (重點). Ranked by malware
  // arsenal, with full TTP / malware / targeting detail for the headline.
  const mostArmed = useMemo(() => {
    let best: (typeof enriched)[number] | null = null
    for (const e of enriched) {
      if (!best || e.malware > best.malware) best = e
    }
    return best
  }, [enriched])

  const totalTechniques = useMemo(
    () => enriched.reduce((s, e) => s + e.techniques, 0),
    [enriched],
  )

  const hasData = !isLoading && actors.length > 0

  const ACCENT = colors.semantic.danger

  // Origin leaderboard for the hero aside — top sourcing countries by
  // tracked-actor count (reuses byCountry; no new data).
  const originLeaders = topN(byCountry, 4)

  // Bubble: x = TTP count, y = malware count, z = targets. One point
  // per actor (capped to the most-active to keep the chart legible).
  const bubble: BubbleSeries[] = useMemo(() => {
    const pts = enriched
      .filter(e => e.techniques > 0 || e.malware > 0)
      .sort((a, b) => (b.techniques + b.malware) - (a.techniques + a.malware))
      .slice(0, 40)
      .map(e => ({ x: e.techniques, y: e.malware, z: Math.max(1, e.targets) }))
    return [{ name: t('threatIntel.actors'), data: pts, severity: 'high' }]
  }, [enriched])
  const actorQueue = useMemo(() => {
    return [...enriched]
      .sort((a, b) => (b.techniques + b.malware + b.targets) - (a.techniques + a.malware + a.targets))
      .slice(0, 6)
      .map((actor) => ({
        id: actor.name,
        title: actor.name,
        subtitle: actor.country,
        meta: `${actor.techniques} TTPs · ${actor.malware} malware · ${actor.targets} target countries`,
        value: actor.techniques + actor.malware,
        severity: actor.malware > 10 ? ('critical' as const) : actor.techniques > 15 ? ('high' as const) : ('medium' as const),
      }))
  }, [enriched])

  return (
    <ManagerDashboard
      title={t('threatIntel.actorLibrary')}
      subtitle={t('threatIntel.actorLibraryLede')}
      accent={ACCENT}
      titleIcon={<Skull size={20} />}
      layout="hero-split"
      hero={
        <ManagerHero
          accent={ACCENT}
          icon={<Skull size={15} />}
          minHeight={200}
          headline={{
            label: t('threatIntel.mostArmedActor'),
            value: hasData && mostArmed ? mostArmed.name : '—',
            sub: hasData && mostArmed
              ? `${mostArmed.techniques} ${t('threatIntel.statTechniques')} · ${mostArmed.malware} ${t('threatIntel.statMalware')} · ${mostArmed.targets} ${t('threatIntel.statTargetCountries')} · ${mostArmed.country}`
              : t('threatIntel.actorEmptyShort'),
            delta: hasData ? (
              <Chip
                size="small"
                icon={<Skull size={13} />}
                label={`${total} ${t('threatIntel.actors')}`}
                sx={{
                  fontWeight: 700, fontSize: 12,
                  bgcolor: alpha(ACCENT, 0.14),
                  color: ACCENT,
                  '& .MuiChip-icon': { color: 'inherit' },
                }}
              />
            ) : undefined,
          }}
          aside={
            <Box>
              {originLeaders.length > 0 ? (
                originLeaders.map(([country, n]) => (
                  <HeroStat
                    key={country}
                    icon={<Globe size={14} />}
                    tone={ACCENT}
                    label={country}
                    value={n}
                  />
                ))
              ) : (
                <HeroStat icon={<Bug size={14} />} label={t('threatIntel.distinctOrigins')} value="—" />
              )}
            </Box>
          }
        />
      }
      kpis={
        <>
          <KpiCard
            label={t('threatIntel.trackedActors')}
            value={!isLoading ? total : null}
            loading={isLoading}
            empty={!isLoading && actors.length === 0}
            emptyHint={t('threatIntel.actorEmptyShort')}
          />
          <KpiCard
            label={t('threatIntel.distinctOrigins')}
            value={hasData ? distinctOrigins : null}
            loading={isLoading}
          />
          <KpiCard
            label={t('threatIntel.mostArmedActor')}
            value={hasData && mostArmed ? mostArmed.name : null}
            loading={isLoading}
          />
          <KpiCard
            label={t('threatIntel.ttpsCatalogued')}
            value={hasData ? totalTechniques : null}
            loading={isLoading}
          />
        </>
      }
      charts={
        <>
          <ChartCard title={t('threatIntel.ttpVsArsenal')}>
            {hasData && bubble[0].data.length > 0 ? (
              <BubbleChart
                series={bubble}
                xTitle={t('threatIntel.statTechniques')}
                yTitle={t('threatIntel.statMalware')}
                height={280}
              />
            ) : <EmptyChart loading={isLoading} />}
          </ChartCard>
        </>
      }
      workItems={
        <ManagerActionList
          title={t('threatIntel.actorReviewQueue')}
          subtitle={t('threatIntel.actorReviewQueueLede')}
          items={actorQueue}
          emptyText={t('threatIntel.actorEmptyShort')}
          actionLabel={t('common.review')}
        />
      }
    />
  )
}

function EmptyChart({ loading }: { loading: boolean }) {
  return (
    <Box sx={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary', fontSize: 13 }}>
      {loading ? t('common.loading') : t('threatIntel.actorEmptyShort')}
    </Box>
  )
}
