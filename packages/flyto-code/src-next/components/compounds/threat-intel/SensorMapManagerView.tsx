/**
 * SensorMapManagerView - manager-mode sensor intelligence command board.
 *
 * Engineer mode keeps the interactive 3D globe and raw observation ledger.
 * Manager mode should answer a tighter SOC question: where are signals
 * concentrated, is the feed healthy, and what observations deserve review?
 *
 * All counts are rendered from getSensorMap / listSensorObservations /
 * listFeedStatus. The frontend only derives ratios for visual emphasis.
 */
import { useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Box, Chip, Skeleton, Typography } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import {
  Activity,
  AlertTriangle,
  DatabaseZap,
  Globe2,
  MapPin,
  RadioTower,
  Radar,
  Route,
  SatelliteDish,
  Signal,
} from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { t, tOr } from '@lib/i18n'
import { qk } from '@lib/queryKeys'
import {
  ManagerDashboard,
  ChartCard,
  KpiCard,
  DonutChart,
  StackedBarChart,
  type DonutDatum,
} from '@compounds/_shared'
import { colors } from '@/styles/designTokens'
import {
  getSensorMap,
  listFeedStatus,
  listSensorObservations,
  type FeedStatus,
  type ThreatSensorObservation,
} from '@lib/engine/code/threatIntel'

const ACCENT = colors.section.exposure
const CONTROL = colors.brand
const ALERT = colors.semantic.danger
const UNKNOWN_COUNTRY = 'ZZ'

const COUNTRY_NAME: Record<string, string> = {
  US: 'United States',
  CN: 'China',
  RU: 'Russia',
  DE: 'Germany',
  GB: 'United Kingdom',
  FR: 'France',
  JP: 'Japan',
  BR: 'Brazil',
  IN: 'India',
  KR: 'South Korea',
  NL: 'Netherlands',
  CA: 'Canada',
  TW: 'Taiwan',
  SG: 'Singapore',
  AU: 'Australia',
  IT: 'Italy',
  ES: 'Spain',
  UA: 'Ukraine',
  VN: 'Vietnam',
  ID: 'Indonesia',
  HK: 'Hong Kong',
  TR: 'Turkey',
  PL: 'Poland',
  IR: 'Iran',
}

type QueueSeverity = 'critical' | 'high' | 'medium' | 'low'

interface SensorQueueItem {
  id: string
  title: ReactNode
  subtitle?: ReactNode
  meta?: ReactNode
  value?: ReactNode
  severity: QueueSeverity
}

function countryLabel(code: string): string {
  if (code === UNKNOWN_COUNTRY) return 'Unknown origin'
  return COUNTRY_NAME[code] ?? code
}

function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  if (value < 1000) return String(Math.round(value))
  if (value < 10_000) return `${(value / 1000).toFixed(1)}k`
  if (value < 1_000_000) return `${Math.round(value / 1000)}k`
  return `${(value / 1_000_000).toFixed(1)}m`
}

function confidencePct(value?: number | null): number {
  if (value == null || Number.isNaN(Number(value))) return 0
  const n = Number(value)
  return Math.round(n <= 1 ? n * 100 : n)
}

function ageMinutes(iso?: string | null): number | null {
  if (!iso) return null
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return null
  return Math.max(0, Math.round((Date.now() - ts) / 60000))
}

function queueTone(severity: QueueSeverity): string {
  if (severity === 'critical') return ALERT
  if (severity === 'high') return colors.semantic.warning
  if (severity === 'medium') return ACCENT
  return colors.semantic.success
}

function severityForObservation(row: ThreatSensorObservation): QueueSeverity {
  const category = `${row.threat_category ?? ''}`.toLowerCase()
  const confidence = confidencePct(row.confidence)
  const count = Number(row.observed_count ?? 0)
  if (category.includes('c2') || category.includes('botnet') || category.includes('malware')) return 'critical'
  if (confidence >= 85 || count >= 10) return 'high'
  if (confidence >= 60 || count >= 3) return 'medium'
  return 'low'
}

export function SensorMapManagerView() {
  const { org } = useOrg()
  const orgId = org?.id

  const mapQ = useQuery({
    queryKey: qk.threatIntel.sensorMap(orgId),
    queryFn: () => getSensorMap(orgId!),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  })

  const observationsQ = useQuery({
    queryKey: qk.threatIntel.sensorObservations(orgId, 8, 0),
    queryFn: () => listSensorObservations(orgId!, { limit: 8, offset: 0 }),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const feedQ = useQuery({
    queryKey: qk.threatIntel.feedStatus(orgId),
    queryFn: () => listFeedStatus(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const byCountry = mapQ.data?.by_country ?? {}
  const unknownCount = byCountry[UNKNOWN_COUNTRY] ?? 0

  const ranked = useMemo(() => {
    return Object.entries(byCountry)
      .filter(([code, count]) => code !== UNKNOWN_COUNTRY && count > 0)
      .sort((a, b) => b[1] - a[1])
  }, [byCountry])

  const total = useMemo(
    () => Object.values(byCountry).reduce((sum, count) => sum + count, 0),
    [byCountry],
  )
  const geoTotal = Math.max(0, total - unknownCount)
  const topCountry = ranked[0]
  const topShare = total > 0 && topCountry ? Math.round((topCountry[1] / total) * 100) : 0
  const hasGeoData = !mapQ.isLoading && total > 0

  const observations = observationsQ.data?.observations ?? []
  const stats = observationsQ.data?.stats
  const feedHealth = useMemo(() => summarizeFeeds(feedQ.data?.feeds ?? []), [feedQ.data])

  const categories = useMemo(() => {
    const source = stats?.by_category ?? {}
    return Object.entries(source)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
  }, [stats])

  const kinds = useMemo(() => {
    const source = stats?.by_kind ?? {}
    return Object.entries(source)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
  }, [stats])

  const donutData: DonutDatum[] = useMemo(
    () => kinds.map(([kind, count]) => ({ label: kind || 'unknown', value: count })),
    [kinds],
  )

  const recentQueue = useMemo<SensorQueueItem[]>(() => {
    return observations.slice(0, 6).map((row) => {
      const severity = severityForObservation(row)
      const confidence = confidencePct(row.confidence)
      return {
        id: row.id,
        title: row.indicator,
        subtitle: [
          row.indicator_kind || 'indicator',
          row.threat_category || 'uncategorized',
          row.country_code ? countryLabel(row.country_code) : null,
        ].filter(Boolean).join(' · '),
        meta: [
          row.source || 'sensor feed',
          row.as_name || (row.asn ? `ASN ${row.asn}` : null),
          row.last_seen_at ? new Date(row.last_seen_at).toLocaleDateString() : null,
        ].filter(Boolean).join(' · '),
        value: `${confidence}%`,
        severity,
      }
    })
  }, [observations])

  const guidanceQueue: SensorQueueItem[] = [
    {
      id: 'connect-sensor-feed',
      title: '接上感測 feed',
      subtitle: '沒有 feed 就只會看到空地圖，管理端不應假裝有情資。',
      meta: '確認匯入 rows、last_ok_at 與錯誤狀態',
      value: '1',
      severity: 'high',
    },
    {
      id: 'build-attack-surface',
      title: '先完成攻擊面盤點',
      subtitle: '地理命中要能連回組織 surface，才有決策價值。',
      meta: 'domain / IP / URL scope',
      value: '2',
      severity: 'medium',
    },
    {
      id: 'triage-observations',
      title: '用 confidence 分流',
      subtitle: '高信心、多次觀測、C2 類型才推進處置佇列。',
      meta: '避免把雜訊當成攻擊',
      value: '3',
      severity: 'low',
    },
  ]

  return (
    <ManagerDashboard
      title={t('threatIntel.sensorMap')}
      subtitle={t('threatIntel.sensorMapLede2')}
      accent={ACCENT}
      titleIcon={<SatelliteDish size={20} />}
      layout="dashboard"
      chartMinWidth={320}
      hero={
        <SensorCommandHero
          hasData={hasGeoData}
          total={total}
          geoTotal={geoTotal}
          unknownCount={unknownCount}
          ranked={ranked.slice(0, 7)}
          topShare={topShare}
          observationCount={observationsQ.data?.count ?? 0}
          feedHealth={feedHealth}
        />
      }
      kpis={
        <>
          <KpiCard
            label={t('threatIntel.totalObservations')}
            value={hasGeoData ? total : null}
            invertDelta
            loading={mapQ.isLoading}
            empty={!mapQ.isLoading && total === 0}
            emptyHint={tOr('threatIntel.noGeoObs', '尚無地理觀測')}
            icon={<Radar size={15} />}
            tone={total > 0 ? ALERT : ACCENT}
          />
          <KpiCard
            label={t('threatIntel.countries')}
            value={hasGeoData ? ranked.length : null}
            loading={mapQ.isLoading}
            empty={!mapQ.isLoading && ranked.length === 0}
            emptyHint="待解析"
            icon={<Globe2 size={15} />}
            tone={ACCENT}
          />
          <KpiCard
            label="未知來源"
            value={hasGeoData ? unknownCount : null}
            invertDelta
            loading={mapQ.isLoading}
            empty={!mapQ.isLoading && total === 0}
            emptyHint="無資料"
            icon={<AlertTriangle size={15} />}
            tone={unknownCount > 0 ? colors.semantic.warning : colors.semantic.success}
          />
          <KpiCard
            label="Feed 健康"
            value={feedQ.isLoading ? null : `${feedHealth.ready}/${feedHealth.total || 0}`}
            loading={feedQ.isLoading}
            empty={!feedQ.isLoading && feedHealth.total === 0}
            emptyHint="未接入"
            icon={<RadioTower size={15} />}
            tone={feedHealth.errored > 0 ? ALERT : colors.semantic.success}
          />
        </>
      }
      charts={
        <>
          <ChartCard title={t('threatIntel.hostingDistribution')}>
            {hasGeoData && ranked.length > 0 ? (
              <StackedBarChart
                categories={ranked.slice(0, 10).map(([code]) => countryLabel(code))}
                series={[{
                  name: t('threatIntel.observations'),
                  data: ranked.slice(0, 10).map(([, count]) => count),
                  severity: 'high',
                }]}
                horizontal
                stacked={false}
                height={240}
              />
            ) : (
              <SensorEmptyChart loading={mapQ.isLoading} mode="countries" />
            )}
          </ChartCard>

          <ChartCard title="觀測類型分布">
            {donutData.length > 0 ? (
              <DonutChart data={donutData} totalLabel="Signals" height={240} />
            ) : (
              <SensorEmptyChart loading={observationsQ.isLoading} mode="kinds" />
            )}
          </ChartCard>
        </>
      }
      workItems={
        <SensorOperationsBoard
          hasData={hasGeoData || observations.length > 0}
          items={recentQueue.length > 0 ? recentQueue : guidanceQueue}
          ranked={ranked.slice(0, 8)}
          categories={categories}
          total={total}
          observationCount={observationsQ.data?.count ?? 0}
          feedHealth={feedHealth}
          feeds={feedQ.data?.feeds ?? []}
        />
      }
    />
  )
}

function summarizeFeeds(feeds: FeedStatus[]) {
  let ready = 0
  let errored = 0
  let stale = 0
  let oldestOk: number | null = null
  let rows = 0

  for (const feed of feeds) {
    rows += feed.rows_ingested ?? 0
    if (feed.last_error) {
      errored += 1
      continue
    }
    const age = ageMinutes(feed.last_ok_at)
    if (age === null) {
      stale += 1
      continue
    }
    if (age < 120) ready += 1
    else stale += 1
    if (oldestOk === null || age > oldestOk) oldestOk = age
  }

  return {
    total: feeds.length,
    ready,
    errored,
    stale,
    oldestOk,
    rows,
  }
}

function SensorCommandHero({
  hasData,
  total,
  geoTotal,
  unknownCount,
  ranked,
  topShare,
  observationCount,
  feedHealth,
}: {
  hasData: boolean
  total: number
  geoTotal: number
  unknownCount: number
  ranked: [string, number][]
  topShare: number
  observationCount: number
  feedHealth: ReturnType<typeof summarizeFeeds>
}) {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  const top = ranked[0]
  const topName = top ? countryLabel(top[0]) : '待建立感測資料'
  const tone = topShare >= 50 ? ALERT : topShare >= 25 ? colors.semantic.warning : ACCENT

  return (
    <Box sx={{
      minHeight: { xs: 360, lg: 226 },
      borderRadius: 1,
      border: '1px solid',
      borderColor: alpha(ACCENT, dark ? 0.4 : 0.28),
      bgcolor: alpha(theme.palette.background.paper, dark ? 0.58 : 0.95),
      backgroundImage: `
        linear-gradient(90deg, ${alpha(ACCENT, dark ? 0.08 : 0.04)} 1px, transparent 1px),
        linear-gradient(0deg, ${alpha(CONTROL, dark ? 0.055 : 0.026)} 1px, transparent 1px),
        radial-gradient(circle at 14% 20%, ${alpha(tone, dark ? 0.2 : 0.1)} 0%, transparent 30%),
        radial-gradient(circle at 88% 14%, ${alpha(colors.tech, dark ? 0.14 : 0.07)} 0%, transparent 24%)
      `,
      backgroundSize: '38px 38px, 38px 38px, auto, auto',
      p: { xs: 1.25, md: 1.5 },
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', lg: '232px minmax(0, 1.5fr) 260px' },
      gap: 1.25,
      alignItems: 'stretch',
      minWidth: 0,
      overflow: 'hidden',
    }}>
      <Box sx={{
        borderRadius: 1,
        border: '1px solid',
        borderColor: alpha(theme.palette.text.primary, dark ? 0.14 : 0.08),
        bgcolor: alpha(theme.palette.background.paper, dark ? 0.46 : 0.74),
        p: 1.2,
        display: 'grid',
        placeItems: 'center',
        minWidth: 0,
      }}>
        <SensorRadar total={total} geoTotal={geoTotal} unknownCount={unknownCount} topShare={topShare} tone={tone} />
      </Box>

      <Box sx={{
        minWidth: 0,
        borderRadius: 1,
        border: '1px solid',
        borderColor: alpha(ACCENT, dark ? 0.28 : 0.18),
        bgcolor: alpha(theme.palette.background.paper, dark ? 0.42 : 0.68),
        p: { xs: 1.25, md: 1.5 },
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr) auto',
        gap: 1.1,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 950, color: ACCENT, display: 'flex', alignItems: 'center', gap: 0.7 }}>
              <SatelliteDish size={14} />
              感測熱區焦點
            </Typography>
            <Typography sx={{
              mt: 0.35,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: { xs: 22, md: 30 },
              fontWeight: 950,
              lineHeight: 1.05,
              color: 'text.primary',
              overflowWrap: 'anywhere',
            }}>
              {hasData ? topName : '尚未形成地理熱區'}
            </Typography>
          </Box>
          <Chip
            size="small"
            icon={<MapPin size={13} />}
            label={hasData ? `${topShare}% concentration` : '待接資料'}
            sx={{
              height: 26,
              borderRadius: 1,
              fontWeight: 950,
              color: tone,
              bgcolor: alpha(tone, 0.12),
              '& .MuiChip-icon': { color: 'inherit' },
            }}
          />
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 0.9 }}>
          <HeroNode icon={<Radar size={16} />} label="總觀測" value={compactNumber(total)} detail={`${compactNumber(observationCount)} ledger rows`} tone={total > 0 ? ALERT : ACCENT} />
          <HeroNode icon={<Globe2 size={16} />} label="地理解析" value={compactNumber(geoTotal)} detail={`${ranked.length} countries`} tone={ACCENT} />
          <HeroNode icon={<AlertTriangle size={16} />} label="未知來源" value={compactNumber(unknownCount)} detail={unknownCount > 0 ? '需補 GeoIP / ASN' : '無未知桶'} tone={unknownCount > 0 ? colors.semantic.warning : colors.semantic.success} />
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 0.8 }}>
          <SignalMeter label="Top share" value={topShare} max={100} tone={tone} />
          <SignalMeter label="Feed ready" value={feedHealth.ready} max={Math.max(1, feedHealth.total)} tone={feedHealth.errored > 0 ? ALERT : colors.semantic.success} />
          <SignalMeter label="Rows ingested" value={feedHealth.rows} max={Math.max(1, feedHealth.rows)} tone={CONTROL} />
        </Box>
      </Box>

      <Box sx={{
        minWidth: 0,
        borderRadius: 1,
        border: '1px solid',
        borderColor: alpha(theme.palette.text.primary, dark ? 0.14 : 0.08),
        bgcolor: alpha(theme.palette.background.paper, dark ? 0.5 : 0.78),
        p: 1.25,
        display: 'grid',
        gap: 0.75,
        alignContent: 'start',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 0.15 }}>
          <RadioTower size={15} color={ACCENT} />
          <Typography sx={{ fontSize: 13, fontWeight: 950 }}>感測管線</Typography>
        </Box>
        <CommandMetric icon={<DatabaseZap size={14} />} label="Feed 狀態" value={`${feedHealth.ready}/${feedHealth.total || 0}`} tone={feedHealth.errored > 0 ? ALERT : colors.semantic.success} />
        <CommandMetric icon={<Activity size={14} />} label="最舊成功刷新" value={feedHealth.oldestOk != null ? `${feedHealth.oldestOk}m` : '待刷新'} tone={feedHealth.oldestOk != null && feedHealth.oldestOk < 120 ? colors.semantic.success : colors.semantic.warning} />
        <CommandMetric icon={<Route size={14} />} label="匯入 rows" value={compactNumber(feedHealth.rows)} tone={CONTROL} />
        <CommandMetric icon={<Signal size={14} />} label="Stale / Error" value={`${feedHealth.stale}/${feedHealth.errored}`} tone={feedHealth.errored > 0 ? ALERT : ACCENT} />
      </Box>
    </Box>
  )
}

function SensorRadar({
  total,
  geoTotal,
  unknownCount,
  topShare,
  tone,
}: {
  total: number
  geoTotal: number
  unknownCount: number
  topShare: number
  tone: string
}) {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  const radius = 47
  const circumference = 2 * Math.PI * radius
  const dash = circumference * Math.max(0, Math.min(100, topShare)) / 100

  return (
    <Box sx={{ width: '100%', display: 'grid', justifyItems: 'center', gap: 1 }}>
      <Box sx={{ position: 'relative', width: 152, height: 152 }}>
        <Box component="svg" viewBox="0 0 152 152" sx={{ width: 152, height: 152 }}>
          <circle cx="76" cy="76" r="66" fill="none" stroke={alpha(ACCENT, dark ? 0.22 : 0.15)} strokeWidth="1" strokeDasharray="4 9" />
          <circle cx="76" cy="76" r="51" fill="none" stroke={alpha(CONTROL, dark ? 0.16 : 0.1)} strokeWidth="1" />
          <circle cx="76" cy="76" r={radius} fill="none" stroke={alpha(theme.palette.text.primary, dark ? 0.16 : 0.09)} strokeWidth="10" />
          <circle
            cx="76"
            cy="76"
            r={radius}
            fill="none"
            stroke={tone}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            transform="rotate(-90 76 76)"
          />
          <circle cx="76" cy="76" r="31" fill={alpha(theme.palette.background.paper, dark ? 0.9 : 0.96)} stroke={alpha(tone, 0.28)} strokeWidth="1" />
        </Box>
        <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          <Typography sx={{ fontSize: 10, fontWeight: 900, color: 'text.secondary' }}>集中度</Typography>
          <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 33, fontWeight: 950, lineHeight: 1, color: tone }}>
            {topShare}
          </Typography>
          <Typography sx={{ fontSize: 10.5, fontWeight: 850, color: 'text.secondary' }}>%</Typography>
        </Box>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 0.65, width: '100%' }}>
        <MiniBadge label="觀測" value={compactNumber(total)} tone={total > 0 ? ALERT : ACCENT} />
        <MiniBadge label="解析" value={compactNumber(geoTotal)} tone={ACCENT} />
        <MiniBadge label="未知" value={compactNumber(unknownCount)} tone={unknownCount > 0 ? colors.semantic.warning : colors.semantic.success} />
      </Box>
    </Box>
  )
}

function HeroNode({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ReactNode
  label: string
  value: string
  detail: string
  tone: string
}) {
  return (
    <Box sx={{
      minWidth: 0,
      borderRadius: 1,
      border: `1px solid ${alpha(tone, 0.24)}`,
      bgcolor: alpha(tone, 0.065),
      p: 1,
      display: 'grid',
      gridTemplateColumns: '30px minmax(0, 1fr)',
      gap: 0.85,
      alignItems: 'center',
      minHeight: 74,
    }}>
      <Box sx={{ width: 30, height: 30, borderRadius: 1, display: 'grid', placeItems: 'center', bgcolor: alpha(tone, 0.12), color: tone }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 900, color: tone }}>{label}</Typography>
        <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 20, fontWeight: 950, lineHeight: 1.1 }} noWrap>{value}</Typography>
        <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }} noWrap title={detail}>{detail}</Typography>
      </Box>
    </Box>
  )
}

function MiniBadge({ label, value, tone }: { label: string; value: ReactNode; tone: string }) {
  return (
    <Box sx={{ borderRadius: 1, px: 0.8, py: 0.65, bgcolor: alpha(tone, 0.09), border: `1px solid ${alpha(tone, 0.2)}`, minWidth: 0 }}>
      <Typography sx={{ fontSize: 10.5, fontWeight: 850, color: 'text.secondary' }} noWrap>{label}</Typography>
      <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 16, fontWeight: 950, color: tone, lineHeight: 1.15 }}>
        {value}
      </Typography>
    </Box>
  )
}

function CommandMetric({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  tone: string
}) {
  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: '28px minmax(0, 1fr) auto',
      gap: 0.8,
      alignItems: 'center',
      borderRadius: 1,
      p: 0.9,
      border: (theme) => `1px solid ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.13 : 0.08)}`,
      bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.32 : 0.66),
      minWidth: 0,
    }}>
      <Box sx={{ color: tone, display: 'flex' }}>{icon}</Box>
      <Typography sx={{ fontSize: 12, fontWeight: 850, color: 'text.secondary' }} noWrap>{label}</Typography>
      <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 14, fontWeight: 950, color: tone, whiteSpace: 'nowrap' }}>
        {value}
      </Typography>
    </Box>
  )
}

function SignalMeter({
  label,
  value,
  max,
  tone,
}: {
  label: string
  value: number
  max: number
  tone: string
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.35 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 900, color: 'text.secondary' }}>{label}</Typography>
        <Typography sx={{ fontSize: 11, fontWeight: 950, color: tone }}>{compactNumber(value)}/{compactNumber(max)}</Typography>
      </Box>
      <Box sx={{ height: 7, borderRadius: 999, bgcolor: alpha(tone, 0.11), overflow: 'hidden' }}>
        <Box sx={{ width: `${pct}%`, height: '100%', borderRadius: 999, bgcolor: tone }} />
      </Box>
    </Box>
  )
}

function SensorEmptyChart({ loading, mode }: { loading: boolean; mode: 'countries' | 'kinds' }) {
  if (loading) return <Skeleton variant="rectangular" height={240} />

  const labels = mode === 'countries'
    ? ['US', 'TW', 'SG', 'JP']
    : ['ip', 'domain', 'url', 'c2']

  return (
    <Box sx={{
      height: 240,
      display: 'grid',
      placeItems: 'center',
      borderRadius: 1,
      border: (theme) => `1px dashed ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.2 : 0.14)}`,
      background: (theme) => `linear-gradient(135deg, ${alpha(ACCENT, theme.palette.mode === 'dark' ? 0.08 : 0.045)}, transparent 60%)`,
    }}>
      <Box sx={{ width: '76%', maxWidth: 420 }}>
        <Box sx={{ display: 'grid', gap: 1 }}>
          {labels.map((label, index) => (
            <Box key={label} sx={{ display: 'grid', gridTemplateColumns: '92px 1fr 28px', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 850, color: 'text.secondary' }}>{label}</Typography>
              <Box sx={{ height: 10, borderRadius: 999, bgcolor: (theme) => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.16 : 0.08), overflow: 'hidden' }}>
                <Box sx={{
                  width: `${Math.max(5, 18 - index * 3)}%`,
                  height: '100%',
                  borderRadius: 999,
                  bgcolor: alpha(mode === 'countries' ? ACCENT : CONTROL, 0.72),
                }} />
              </Box>
              <Typography sx={{ fontSize: 12, fontWeight: 950, color: ACCENT }}>0</Typography>
            </Box>
          ))}
        </Box>
        <Typography sx={{ mt: 1.5, fontSize: 13, fontWeight: 750, color: 'text.secondary', textAlign: 'center' }}>
          感測 feed 與攻擊面完成後，這裡才會形成可判讀的熱區圖。
        </Typography>
      </Box>
    </Box>
  )
}

function SensorOperationsBoard({
  hasData,
  items,
  ranked,
  categories,
  total,
  observationCount,
  feedHealth,
  feeds,
}: {
  hasData: boolean
  items: SensorQueueItem[]
  ranked: [string, number][]
  categories: [string, number][]
  total: number
  observationCount: number
  feedHealth: ReturnType<typeof summarizeFeeds>
  feeds: FeedStatus[]
}) {
  return (
    <Box sx={{
      borderRadius: 1,
      border: '1px solid',
      borderColor: (theme) => alpha(ACCENT, theme.palette.mode === 'dark' ? 0.38 : 0.28),
      bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.54 : 0.95),
      backgroundImage: (theme) => `
        linear-gradient(90deg, ${alpha(ACCENT, theme.palette.mode === 'dark' ? 0.06 : 0.032)} 1px, transparent 1px),
        linear-gradient(0deg, ${alpha(CONTROL, theme.palette.mode === 'dark' ? 0.05 : 0.025)} 1px, transparent 1px)
      `,
      backgroundSize: '36px 36px',
      overflow: 'hidden',
      minWidth: 0,
    }}>
      <Box sx={{
        px: { xs: 1.5, md: 2 },
        py: 1.35,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1.25,
        flexWrap: 'wrap',
        borderBottom: '1px solid',
        borderColor: (theme) => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.12 : 0.08),
        bgcolor: (theme) => alpha(ACCENT, theme.palette.mode === 'dark' ? 0.08 : 0.045),
      }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 950, letterSpacing: 0 }}>
            感測處置工作台
          </Typography>
          <Typography sx={{ mt: 0.25, fontSize: 12.5, color: 'text.secondary' }}>
            把地理熱區、最近命中與 feed 健康放在同一個可判讀工作區，地圖不再撐爆版面。
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          <Chip size="small" label={`觀測 ${compactNumber(total)}`} sx={{ borderRadius: 1, fontWeight: 900, bgcolor: alpha(ALERT, 0.11), color: total > 0 ? ALERT : ACCENT }} />
          <Chip size="small" label={`Ledger ${compactNumber(observationCount)}`} sx={{ borderRadius: 1, fontWeight: 900, bgcolor: alpha(ACCENT, 0.12), color: ACCENT }} />
          <Chip size="small" label={`Feed ${feedHealth.ready}/${feedHealth.total || 0}`} sx={{ borderRadius: 1, fontWeight: 900, bgcolor: alpha(feedHealth.errored > 0 ? ALERT : colors.semantic.success, 0.12), color: feedHealth.errored > 0 ? ALERT : colors.semantic.success }} />
        </Box>
      </Box>

      <Box sx={{
        p: { xs: 1.25, md: 1.6 },
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.45fr) minmax(304px, 0.75fr)' },
        gap: 1.25,
        alignItems: 'stretch',
      }}>
        <Box sx={{ display: 'grid', gap: 0.85, minWidth: 0 }}>
          {items.map((item, index) => {
            const tone = queueTone(item.severity)
            return (
              <Box
                key={item.id}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '34px minmax(0, 1fr)', md: '34px minmax(0, 1fr) minmax(92px, 0.18fr)' },
                  gap: 1,
                  alignItems: 'center',
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: alpha(tone, 0.22),
                  bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.52 : 0.8),
                  px: 1,
                  py: 0.92,
                  boxShadow: (theme) => `inset 3px 0 0 ${alpha(tone, theme.palette.mode === 'dark' ? 0.78 : 0.72)}`,
                  minWidth: 0,
                }}
              >
                <Box sx={{
                  width: 28,
                  height: 28,
                  borderRadius: 1,
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: alpha(tone, 0.13),
                  color: tone,
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: 13,
                  fontWeight: 950,
                }}>
                  {index + 1}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 950, color: 'text.primary', overflowWrap: 'anywhere' }} title={String(item.title)}>
                    {item.title}
                  </Typography>
                  {item.subtitle && (
                    <Typography sx={{ mt: 0.25, fontSize: 12, color: 'text.secondary', overflowWrap: 'anywhere' }}>
                      {item.subtitle}
                    </Typography>
                  )}
                  {item.meta && (
                    <Typography sx={{ mt: 0.35, fontSize: 11.5, color: tone, fontWeight: 850, overflowWrap: 'anywhere' }}>
                      {item.meta}
                    </Typography>
                  )}
                </Box>
                <Box sx={{ display: { xs: 'none', md: 'grid' }, justifyItems: 'end', gap: 0.35 }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 850, color: 'text.secondary' }}>
                    {hasData ? '信心度' : '順序'}
                  </Typography>
                  <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 18, fontWeight: 950, color: tone }}>
                    {item.value ?? index + 1}
                  </Typography>
                </Box>
              </Box>
            )
          })}
        </Box>

        <Box sx={{
          borderRadius: 1,
          border: '1px solid',
          borderColor: (theme) => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.12 : 0.08),
          bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.52 : 0.82),
          p: 1.25,
          display: 'grid',
          gap: 1,
          alignContent: 'start',
          minWidth: 0,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
            <Globe2 size={16} color={ACCENT} />
            <Typography sx={{ fontSize: 14, fontWeight: 950 }}>熱區與資料健康</Typography>
          </Box>
          <Box sx={{
            borderRadius: 1,
            p: 1,
            border: `1px solid ${alpha(hasData ? ACCENT : CONTROL, 0.24)}`,
            bgcolor: alpha(hasData ? ACCENT : CONTROL, 0.07),
          }}>
            <Typography sx={{ fontSize: 11.5, fontWeight: 900, color: 'text.secondary' }}>
              可判讀觀測
            </Typography>
            <Typography sx={{ mt: 0.25, fontFamily: 'ui-monospace, monospace', fontSize: hasData ? 32 : 24, fontWeight: 950, lineHeight: 1, color: hasData ? ACCENT : CONTROL }}>
              {hasData ? compactNumber(total) : '待建立'}
            </Typography>
          </Box>

          {ranked.length > 0 ? (
            <Box sx={{ display: 'grid', gap: 0.65 }}>
              {ranked.slice(0, 5).map(([code, count]) => (
                <MiniSignal
                  key={code}
                  label={countryLabel(code)}
                  value={count}
                  max={Math.max(1, ranked[0]?.[1] ?? count)}
                  tone={code === ranked[0]?.[0] ? ALERT : ACCENT}
                />
              ))}
            </Box>
          ) : (
            <Typography sx={{ fontSize: 12.2, lineHeight: 1.55, color: 'text.secondary' }}>
              目前沒有可判讀的地理熱區。先確認 feed 匯入與 GeoIP 解析，避免把空地圖誤讀為安全。
            </Typography>
          )}

          {categories.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
              {categories.slice(0, 6).map(([category, count]) => (
                <Chip
                  key={category}
                  size="small"
                  label={`${category || 'unknown'} ${compactNumber(count)}`}
                  variant="outlined"
                  sx={{ height: 22, borderRadius: 1, fontSize: 11.5, fontWeight: 750, color: ACCENT, borderColor: alpha(ACCENT, 0.42), bgcolor: alpha(ACCENT, 0.06) }}
                />
              ))}
            </Box>
          )}

          {feeds.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
              {feeds.slice(0, 6).map((feed) => {
                const age = ageMinutes(feed.last_ok_at)
                const hasError = !!feed.last_error
                const tone = hasError
                  ? ALERT
                  : age != null && age < 120
                    ? colors.semantic.success
                    : colors.semantic.warning
                return (
                  <Chip
                    key={feed.source}
                    size="small"
                    label={`${feed.source} · ${compactNumber(feed.rows_ingested)} · ${age != null ? `${age}m` : hasError ? 'err' : 'pending'}`}
                    variant="outlined"
                    sx={{ height: 22, borderRadius: 1, fontSize: 11.5, fontWeight: 750, color: tone, borderColor: alpha(tone, 0.42) }}
                    title={hasError ? feed.last_error : undefined}
                  />
                )
              })}
            </Box>
          )}

          <Typography sx={{ fontSize: 12.2, lineHeight: 1.55, color: 'text.secondary' }}>
            管理端只呈現熱區、最近命中與資料健康；互動地球、完整 ledger 與篩選操作留在工程模式。
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}

function MiniSignal({
  label,
  value,
  max,
  tone,
}: {
  label: string
  value: number
  max: number
  tone: string
}) {
  const pct = max > 0 ? Math.max(4, Math.min(100, (value / max) * 100)) : 4
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 1, alignItems: 'center' }}>
      <Typography sx={{ fontSize: 12, fontWeight: 850, color: 'text.secondary' }} noWrap title={label}>
        {label}
      </Typography>
      <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 14, fontWeight: 950, color: tone }}>
        {compactNumber(value)}
      </Typography>
      <Box sx={{ gridColumn: '1 / -1', height: 6, borderRadius: 999, bgcolor: alpha(tone, 0.1), overflow: 'hidden' }}>
        <Box sx={{ width: `${pct}%`, height: '100%', borderRadius: 999, bgcolor: tone }} />
      </Box>
    </Box>
  )
}
