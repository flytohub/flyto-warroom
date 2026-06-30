/**
 * SensorMapManagerView — manager-mode threat-exposure surface for the
 * Sensor Map. Engineer view keeps the full ranked list + always-on
 * globe; the manager view leads with KPIs + a country bar chart and
 * makes the (heavy) 3D globe OPT-IN behind a toggle, capped in height
 * so it never eats the whole viewport.
 *
 * Every number is real: per-country GeoIP rollup from getSensorMap.
 *
 * Client functions imported by DIRECT FILE PATH per the decoupling
 * rule.
 */
import { lazy, Suspense, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Box, Skeleton, Typography } from '@mui/material'
import { Globe, MapPin } from 'lucide-react'
import { alpha, useTheme } from '@mui/material/styles'
import { useOrg } from '@hooks/useOrg'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { colors } from '@/styles/designTokens'
import {
  ManagerDashboard,
  ChartCard,
  KpiCard,
  ManagerActionList,
  StackedBarChart,
  ManagerHero,
  HeroStat,
} from '@compounds/_shared'
import { getSensorMap } from '@lib/engine/code/threatIntel'

const ACCENT = colors.section.exposure

const WorldHeatGlobe = lazy(() =>
  import('./WorldHeatGlobe').then(m => ({ default: m.WorldHeatGlobe })),
)

const COUNTRY_NAME: Record<string, string> = {
  US: 'United States', CN: 'China', RU: 'Russia', DE: 'Germany',
  GB: 'United Kingdom', FR: 'France', JP: 'Japan', BR: 'Brazil',
  IN: 'India', KR: 'South Korea', NL: 'Netherlands', CA: 'Canada',
  TW: 'Taiwan', SG: 'Singapore', AU: 'Australia', IT: 'Italy',
  ES: 'Spain', UA: 'Ukraine', VN: 'Vietnam', ID: 'Indonesia',
  HK: 'Hong Kong', TR: 'Turkey', PL: 'Poland', IR: 'Iran',
}

function countryLabel(code: string): string {
  return COUNTRY_NAME[code] ?? code
}

export function SensorMapManagerView() {
  const { org } = useOrg()
  const orgId = org?.id

  const { data, isLoading } = useQuery({
    queryKey: qk.threatIntel.sensorMap(orgId),
    queryFn: () => getSensorMap(orgId!),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  })

  const ranked = useMemo(() => {
    const entries = Object.entries(data?.by_country ?? {})
    entries.sort((a, b) => b[1] - a[1])
    return entries
  }, [data])

  const total = ranked.reduce((sum, [, n]) => sum + n, 0)
  const topN = ranked.slice(0, 10)

  // Concentration: share of observations from the single top country.
  const topShare = total > 0 && topN[0] ? Math.round((topN[0][1] / total) * 100) : 0

  const barCategories = topN.map(([code]) => countryLabel(code))
  const barData = topN.map(([, n]) => n)
  const countryQueue = topN.slice(0, 6).map(([code, count], index) => {
    const share = total > 0 ? Math.round((count / total) * 100) : 0
    return {
      id: code,
      title: countryLabel(code),
      subtitle: code,
      meta: `${share}% ${t('threatIntel.ofObservations')}`,
      value: count.toLocaleString(),
      severity: index === 0 && share >= 50 ? 'critical' : index < 3 ? 'high' : 'medium',
    } as const
  })

  const hasData = !isLoading && ranked.length > 0

  // Hero heat-rank leaderboard — top 5 origins with share + a danger
  // tint that deepens toward the #1 source.
  const heatRank = topN.slice(0, 5).map(([code, count]) => ({
    code,
    name: countryLabel(code),
    count,
    share: total > 0 ? Math.round((count / total) * 100) : 0,
  }))
  const topCountryName = hasData ? countryLabel(topN[0][0]) : null

  return (
    <ManagerDashboard
      title={t('threatIntel.sensorMap')}
      subtitle={t('threatIntel.sensorMapLede2')}
      accent={ACCENT}
      titleIcon={<Globe size={20} />}
      layout="full-bleed"
      hero={
        <ManagerHero
          accent={ACCENT}
          icon={<Globe size={15} />}
          minHeight={220}
          visual={
            hasData ? (
              <Box sx={{ width: { xs: '100%', md: 320 }, height: 200, overflow: 'hidden', borderRadius: 2 }}>
                <Suspense fallback={<Skeleton variant="rectangular" width="100%" height={200} />}>
                  <WorldHeatGlobe byCountry={data?.by_country ?? {}} />
                </Suspense>
              </Box>
            ) : undefined
          }
          headline={{
            label: t('threatIntel.topConcentration'),
            value: hasData ? topCountryName : '—',
            delta: hasData ? (
              <Box
                component="span"
                sx={{
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: 22, fontWeight: 800,
                  color: colors.semantic.danger,
                }}
              >
                {topShare}%
              </Box>
            ) : undefined,
            sub: hasData
              ? `${topN[0][1].toLocaleString()} ${t('threatIntel.ofObservations')} · ${ranked.length} ${t('threatIntel.countries')}`
              : t('threatIntel.noGeoObs'),
          }}
          aside={
            <Box>
              {heatRank.map((r, i) => (
                <HeroStat
                  key={r.code}
                  icon={<MapPin size={14} />}
                  tone={i === 0 ? colors.semantic.danger : ACCENT}
                  label={`${r.name} · ${r.share}%`}
                  value={r.count.toLocaleString()}
                />
              ))}
            </Box>
          }
        />
      }
      kpis={
        <>
          <KpiCard
            label={t('threatIntel.totalObservations')}
            value={hasData ? total : null}
            invertDelta
            loading={isLoading}
            empty={!isLoading && ranked.length === 0}
            emptyHint={t('threatIntel.noGeoObs')}
          />
          <KpiCard
            label={t('threatIntel.countries')}
            value={hasData ? ranked.length : null}
            loading={isLoading}
            empty={!isLoading && ranked.length === 0}
          />
          <KpiCard
            label={t('threatIntel.topHosting')}
            value={hasData ? countryLabel(topN[0][0]) : null}
            loading={isLoading}
            empty={!isLoading && ranked.length === 0}
          />
          <KpiCard
            label={t('threatIntel.topConcentration')}
            value={hasData ? topShare : null}
            unit="%"
            invertDelta
            loading={isLoading}
            empty={!isLoading && ranked.length === 0}
          />
        </>
      }
      charts={
        <>
          <ChartCard title={t('threatIntel.hostingDistribution')}>
            {hasData ? (
              <StackedBarChart
                categories={barCategories}
                series={[{ name: t('threatIntel.observations'), data: barData, severity: 'high' }]}
                horizontal
                stacked={false}
                height={Math.max(240, topN.length * 26)}
              />
            ) : (
              <EmptyChart loading={isLoading} />
            )}
          </ChartCard>
        </>
      }
      workItems={
        <ManagerActionList
          title={t('threatIntel.originQueue')}
          subtitle={t('threatIntel.originQueueLede')}
          items={countryQueue}
          emptyText={t('threatIntel.noGeoObs')}
          actionLabel={t('common.review')}
        />
      }
      narrative={
        hasData ? (
          <ConcentrationNarrative
            topCountry={topCountryName!}
            topShare={topShare}
            countries={ranked.length}
            total={total}
          />
        ) : undefined
      }
    />
  )
}

/** ConcentrationNarrative — plain-language read of where malicious
 *  infrastructure clusters. Surfaces stay theme palette; accent/danger
 *  are hue-only tints (dual-mode safe). */
function ConcentrationNarrative({
  topCountry, topShare, countries, total,
}: { topCountry: string; topShare: number; countries: number; total: number }) {
  const theme = useTheme()
  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
        {t('threatIntel.concentrationTitle')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
        {`${total.toLocaleString()} `}
        {t('threatIntel.geoObsAcross')}
        {` ${countries} `}
        {t('threatIntel.countries')}
        {'. '}
        <Box
          component="span"
          sx={{
            fontWeight: 700,
            color: topShare >= 50 ? colors.semantic.danger : ACCENT,
            bgcolor: alpha(topShare >= 50 ? colors.semantic.danger : ACCENT, theme.palette.mode === 'dark' ? 0.16 : 0.1),
            px: 0.75, py: 0.1, borderRadius: 1,
          }}
        >
          {`${topCountry} — ${topShare}%`}
        </Box>
        {topShare >= 50
          ? ` ${t('threatIntel.concentratedHigh')}`
          : ` ${t('threatIntel.concentratedSpread')}`}
      </Typography>
    </Box>
  )
}

function EmptyChart({ loading }: { loading: boolean }) {
  if (loading) return <Skeleton variant="rectangular" height={240} />
  return (
    <Box sx={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary', fontSize: 13 }}>
      {t('threatIntel.noGeoObs')}
    </Box>
  )
}
