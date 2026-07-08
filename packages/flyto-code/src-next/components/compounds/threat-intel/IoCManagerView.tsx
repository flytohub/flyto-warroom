/**
 * IoCManagerView - manager-mode IOC command board.
 *
 * Engineer mode owns the raw indicator table. Manager mode answers:
 * which IOC types hit this org, is the intel pipeline healthy, and what
 * should be reviewed next. No score math is invented here; UI ratios are
 * derived only from backend counts for visual weight.
 */
import { useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Box, Chip, Skeleton, Typography } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import {
  Activity,
  AlertTriangle,
  Bug,
  Crosshair,
  Database,
  DatabaseZap,
  Fingerprint,
  Globe2,
  KeyRound,
  RadioTower,
  Radar,
  Route,
  Server,
  ShieldAlert,
  ShieldCheck,
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
  listFeedStatus,
  listIoCs,
  type FeedStatus,
  type IoCRow,
} from '@lib/engine/code/threatIntel'

const ACCENT = colors.section.exposure
const CONTROL = colors.brand
const ALERT = colors.semantic.danger

const KIND_LABEL: Record<string, string> = {
  c2: 'C2',
  url: 'URL',
  ip: 'IP',
  phishing: 'Phishing',
  credential: 'Credential',
  stealer: 'Stealer',
  breach: 'Breach',
  hash: 'Hash',
  cve: 'CVE',
}

const KIND_ICON: Record<string, typeof Database> = {
  c2: Server,
  url: Globe2,
  ip: ShieldAlert,
  phishing: Bug,
  credential: KeyRound,
  stealer: Bug,
  breach: Database,
  hash: Fingerprint,
  cve: AlertTriangle,
}

const FOCAL_KINDS = ['c2', 'credential', 'stealer']
const EXPOSURE_KINDS = ['c2', 'credential', 'stealer', 'breach', 'phishing']

type QueueSeverity = 'critical' | 'high' | 'medium' | 'low'

interface IoCQueueItem {
  id: string
  title: ReactNode
  subtitle?: ReactNode
  meta?: ReactNode
  value?: ReactNode
  severity: QueueSeverity
  kind?: string
}

function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? (kind || 'Unknown')
}

function kindIcon(kind?: string): typeof Database {
  return KIND_ICON[kind || ''] ?? Database
}

function sumStats(stats: Record<string, number>): number {
  return Object.values(stats).reduce((total, value) => total + value, 0)
}

function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  if (value < 1000) return String(Math.round(value))
  if (value < 10_000) return `${(value / 1000).toFixed(1)}k`
  if (value < 1_000_000) return `${Math.round(value / 1000)}k`
  return `${(value / 1_000_000).toFixed(1)}m`
}

function ageMinutes(iso?: string | null): number | null {
  if (!iso) return null
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return null
  return Math.max(0, Math.round((Date.now() - ts) / 60000))
}

function queueSeverity(kind: string): QueueSeverity {
  if (kind === 'c2' || kind === 'stealer') return 'critical'
  if (EXPOSURE_KINDS.includes(kind)) return 'high'
  if (kind === 'url' || kind === 'ip' || kind === 'cve') return 'medium'
  return 'low'
}

function queueTone(severity: QueueSeverity): string {
  if (severity === 'critical') return ALERT
  if (severity === 'high') return colors.semantic.warning
  if (severity === 'medium') return ACCENT
  return colors.semantic.success
}

function isActionableIoC(row: IoCRow): boolean {
  return !/not assessed|\(missing:|not indexed by shodan|\bclean\)|risk:\s*low\s*\(0\/100\)/i.test(row.ioc)
}

export function IoCManagerView() {
  const { org } = useOrg()
  const orgId = org?.id

  const { data, isLoading } = useQuery({
    queryKey: qk.threatIntel.iocManagerStats(orgId),
    queryFn: () => listIoCs(orgId!, { scope: 'both', limit: 10, offset: 0 }),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const { data: feedStatus, isLoading: feedLoading } = useQuery({
    queryKey: qk.threatIntel.iocFeedStatus(orgId),
    queryFn: () => listFeedStatus(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const orgStats = data?.stats ?? {}
  const globalStats = data?.global_stats ?? {}
  const samples = useMemo(() => (data?.iocs ?? []).filter(isActionableIoC), [data?.iocs])

  const orgTotal = sumStats(orgStats)
  const globalTotal = sumStats(globalStats)
  const orgExposure = EXPOSURE_KINDS.reduce((total, kind) => total + (orgStats[kind] ?? 0), 0)
  const orgFocalHits = FOCAL_KINDS.reduce((total, kind) => total + (orgStats[kind] ?? 0), 0)
  const globalFocalHits = FOCAL_KINDS.reduce((total, kind) => total + (globalStats[kind] ?? 0), 0)
  const c2Count = orgStats.c2 ?? 0
  const orgSharePct = globalTotal > 0 ? Math.round((orgTotal / globalTotal) * 1000) / 10 : 0
  const hasData = !isLoading && (orgTotal > 0 || globalTotal > 0)
  const feedHealth = useMemo(() => summarizeFeeds(feedStatus?.feeds ?? []), [feedStatus])

  const kinds = useMemo(() => {
    const set = new Set([...Object.keys(orgStats), ...Object.keys(globalStats)])
    return [...set].sort((a, b) => (orgStats[b] ?? 0) - (orgStats[a] ?? 0) || (globalStats[b] ?? 0) - (globalStats[a] ?? 0))
  }, [globalStats, orgStats])

  const donutData: DonutDatum[] = useMemo(
    () => Object.entries(orgStats)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([kind, count]) => ({ label: kindLabel(kind), value: count })),
    [orgStats],
  )

  const reviewQueue = useMemo<IoCQueueItem[]>(() => {
    if (samples.length > 0) {
      return samples.slice(0, 6).map((row, index) => ({
        id: `${row.kind}-${row.ioc}-${index}`,
        title: row.ioc,
        subtitle: [kindLabel(row.kind), row.source || 'source unknown'].join(' · '),
        meta: [
          row.confidence != null ? `confidence ${row.confidence}%` : 'confidence pending',
          row.last_seen_at ? `last seen ${new Date(row.last_seen_at).toLocaleDateString()}` : 'last seen unknown',
        ].join(' · '),
        value: orgStats[row.kind] ?? 0,
        severity: queueSeverity(row.kind),
        kind: row.kind,
      }))
    }

    return Object.entries(orgStats)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([kind, count]) => ({
        id: kind,
        title: kindLabel(kind),
        subtitle: `${globalStats[kind] ?? 0} global catalog entries`,
        meta: EXPOSURE_KINDS.includes(kind) || kind === 'c2' ? 'org exposure signal' : 'monitoring signal',
        value: count,
        severity: queueSeverity(kind),
        kind,
      }))
  }, [globalStats, orgStats, samples])

  const guidanceQueue: IoCQueueItem[] = [
    {
      id: 'attack-surface',
      title: '先建立攻擊面',
      subtitle: '網域與資產掃描後才知道哪些 IOC 與本組織有關。',
      meta: '沒有 surface 就不應該顯示假命中',
      value: '1',
      severity: 'medium',
      kind: 'ip',
    },
    {
      id: 'feed-health',
      title: '確認情資來源刷新',
      subtitle: '檢查 feed 是否成功匯入 rows，避免 stale 情資誤導判斷。',
      meta: 'feed stale 時只顯示資料缺口',
      value: '2',
      severity: 'high',
      kind: 'breach',
    },
    {
      id: 'triage',
      title: '命中後分流處置',
      subtitle: 'C2 / credential / stealer 優先進入事件流程。',
      meta: '只把高訊號項目推到管理視圖',
      value: '3',
      severity: 'critical',
      kind: 'c2',
    },
  ]

  return (
    <ManagerDashboard
      title={t('threatIntel.iocLookup')}
      subtitle={t('threatIntel.iocLookupLede')}
      accent={ACCENT}
      titleIcon={<Crosshair size={20} />}
      layout="dashboard"
      chartMinWidth={320}
      hero={
        <IoCCommandHero
          hasData={hasData}
          orgTotal={orgTotal}
          globalTotal={globalTotal}
          orgFocalHits={orgFocalHits}
          globalFocalHits={globalFocalHits}
          orgExposure={orgExposure}
          c2Count={c2Count}
          orgSharePct={orgSharePct}
          feedHealth={feedHealth}
        />
      }
      kpis={
        <>
          <KpiCard
            label={tOr('threatIntel.orgExposureHits', '本組織曝險命中')}
            value={hasData ? orgExposure : null}
            invertDelta
            loading={isLoading}
            empty={!isLoading && orgTotal === 0}
            emptyHint={tOr('threatIntel.noOrgHits', '尚無本組織命中')}
            icon={<ShieldAlert size={15} />}
            tone={orgExposure > 0 ? ALERT : colors.semantic.success}
          />
          <KpiCard
            label={tOr('threatIntel.orgC2', 'C2 命中')}
            value={hasData ? c2Count : null}
            invertDelta
            loading={isLoading}
            icon={<Server size={15} />}
            tone={c2Count > 0 ? ALERT : ACCENT}
          />
          <KpiCard
            label={tOr('threatIntel.orgIndicators', '本組織指標')}
            value={hasData ? orgTotal : null}
            loading={isLoading}
            icon={<Radar size={15} />}
            tone={ACCENT}
          />
          <KpiCard
            label="Feed 健康"
            value={feedLoading ? null : `${feedHealth.ready}/${feedHealth.total || 0}`}
            loading={feedLoading}
            empty={!feedLoading && feedHealth.total === 0}
            emptyHint="未接入"
            icon={<RadioTower size={15} />}
            tone={feedHealth.errored > 0 ? ALERT : colors.semantic.success}
          />
        </>
      }
      charts={
        <>
          <ChartCard title="IOC 類型命中">
            {hasData && kinds.length > 0 ? (
              <StackedBarChart
                categories={kinds.map(kindLabel)}
                series={[
                  { name: tOr('threatIntel.scopeOrg', '本組織'), data: kinds.map((kind) => orgStats[kind] ?? 0), severity: 'high' },
                  { name: tOr('threatIntel.scopeGlobal', '全球目錄'), data: kinds.map((kind) => globalStats[kind] ?? 0), severity: 'low' },
                ]}
                stacked={false}
                height={230}
              />
            ) : (
              <IoCEmptyChart loading={isLoading} mode="bars" />
            )}
          </ChartCard>

          <ChartCard title="本組織 IOC 占比">
            {hasData && donutData.length > 0 ? (
              <DonutChart data={donutData} totalLabel="IOC" height={230} />
            ) : (
              <IoCEmptyChart loading={isLoading} mode="radar" />
            )}
          </ChartCard>
        </>
      }
      workItems={
        <IoCReviewBoard
          hasData={hasData}
          items={hasData ? reviewQueue : guidanceQueue}
          orgTotal={orgTotal}
          globalTotal={globalTotal}
          orgFocalHits={orgFocalHits}
          orgExposure={orgExposure}
          feedHealth={feedHealth}
          feedStatus={feedStatus?.feeds ?? []}
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

function IoCCommandHero({
  hasData,
  orgTotal,
  globalTotal,
  orgFocalHits,
  globalFocalHits,
  orgExposure,
  c2Count,
  orgSharePct,
  feedHealth,
}: {
  hasData: boolean
  orgTotal: number
  globalTotal: number
  orgFocalHits: number
  globalFocalHits: number
  orgExposure: number
  c2Count: number
  orgSharePct: number
  feedHealth: ReturnType<typeof summarizeFeeds>
}) {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  const tone = orgFocalHits > 0 ? ALERT : ACCENT

  return (
    <Box sx={{
      minHeight: { xs: 320, lg: 198 },
      borderRadius: 1,
      border: '1px solid',
      borderColor: alpha(ACCENT, dark ? 0.38 : 0.26),
      bgcolor: alpha(theme.palette.background.paper, dark ? 0.6 : 0.96),
      backgroundImage: `
        linear-gradient(90deg, ${alpha(ACCENT, dark ? 0.07 : 0.032)} 1px, transparent 1px),
        linear-gradient(0deg, ${alpha(CONTROL, dark ? 0.055 : 0.024)} 1px, transparent 1px),
        radial-gradient(circle at 18% 18%, ${alpha(tone, dark ? 0.18 : 0.08)} 0%, transparent 30%)
      `,
      backgroundSize: '40px 40px, 40px 40px, auto',
      p: { xs: 1.25, md: 1.5 },
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', lg: 'minmax(260px, 0.9fr) minmax(0, 1.45fr) minmax(250px, 0.72fr)' },
      gap: 1.15,
      alignItems: 'stretch',
      minWidth: 0,
      overflow: 'hidden',
    }}>
      <Box sx={{
        borderRadius: 1,
        border: '1px solid',
        borderColor: alpha(tone, dark ? 0.28 : 0.18),
        bgcolor: alpha(theme.palette.background.paper, dark ? 0.42 : 0.78),
        p: 1.25,
        display: 'grid',
        alignContent: 'space-between',
        gap: 1,
        minWidth: 0,
      }}>
        <Box>
          <Typography sx={{ fontSize: 12, fontWeight: 950, color: ACCENT, display: 'flex', alignItems: 'center', gap: 0.7 }}>
            <Crosshair size={14} />
            IOC Threat Pulse
          </Typography>
          <Typography sx={{ mt: 0.4, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 34, fontWeight: 950, lineHeight: 1, color: tone }}>
            {compactNumber(orgFocalHits)}
          </Typography>
          <Typography sx={{ mt: 0.35, fontSize: 12.5, color: 'text.secondary' }}>
            {hasData ? '高訊號命中，需要保持處置視野。' : '尚未形成本組織 IOC 命中。'}
          </Typography>
        </Box>
        <Box sx={{ display: 'grid', gap: 0.65 }}>
          <SignalMeter label="曝險命中" value={orgExposure} max={Math.max(1, orgTotal)} tone={orgExposure > 0 ? ALERT : colors.semantic.success} />
          <SignalMeter label="高訊號基準" value={orgFocalHits} max={Math.max(1, globalFocalHits || orgFocalHits)} tone={tone} />
        </Box>
      </Box>

      <Box sx={{
        minWidth: 0,
        borderRadius: 1,
        border: '1px solid',
        borderColor: alpha(ACCENT, dark ? 0.28 : 0.18),
        bgcolor: alpha(theme.palette.background.paper, dark ? 0.42 : 0.72),
        p: { xs: 1.25, md: 1.5 },
        display: 'grid',
        gap: 1,
        alignContent: 'start',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 950, color: ACCENT, display: 'flex', alignItems: 'center', gap: 0.7 }}>
              <ShieldAlert size={14} />
              管理焦點
            </Typography>
            <Typography sx={{
              mt: 0.35,
              fontSize: { xs: 22, md: 29 },
              fontWeight: 950,
              lineHeight: 1.08,
              color: 'text.primary',
              overflowWrap: 'anywhere',
            }}>
              {orgFocalHits > 0 ? `${orgFocalHits} 個高訊號 IOC 命中` : '未命中高訊號 IOC'}
            </Typography>
          </Box>
          <Chip
            size="small"
            icon={orgFocalHits > 0 ? <AlertTriangle size={13} /> : <ShieldCheck size={13} />}
            label={orgFocalHits > 0 ? '需要分流' : '監控中'}
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

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 0.85 }}>
          <HeroNode icon={<Radar size={16} />} label="本組織" value={compactNumber(orgTotal)} detail={`${orgSharePct}% of global`} tone={orgTotal > 0 ? ACCENT : colors.semantic.neutral} />
          <HeroNode icon={<Database size={16} />} label="全球目錄" value={compactNumber(globalTotal)} detail={`${compactNumber(globalFocalHits)} 高訊號基準`} tone={CONTROL} />
          <HeroNode icon={<Server size={16} />} label="C2" value={String(c2Count)} detail={c2Count > 0 ? '優先事件流程' : '未命中'} tone={c2Count > 0 ? ALERT : colors.semantic.success} />
        </Box>
      </Box>

      <Box sx={{
        minWidth: 0,
        borderRadius: 1,
        border: '1px solid',
        borderColor: alpha(theme.palette.text.primary, dark ? 0.14 : 0.08),
        bgcolor: alpha(theme.palette.background.paper, dark ? 0.5 : 0.78),
        p: 1.15,
        display: 'grid',
        gap: 0.75,
        alignContent: 'start',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
          <RadioTower size={15} color={ACCENT} />
          <Typography sx={{ fontSize: 13, fontWeight: 950 }}>情資管線</Typography>
        </Box>
        <CommandMetric icon={<DatabaseZap size={14} />} label="Feed 狀態" value={`${feedHealth.ready}/${feedHealth.total || 0}`} tone={feedHealth.errored > 0 ? ALERT : colors.semantic.success} />
        <CommandMetric icon={<Activity size={14} />} label="最舊成功刷新" value={feedHealth.oldestOk != null ? `${feedHealth.oldestOk}m` : '待刷新'} tone={feedHealth.oldestOk != null && feedHealth.oldestOk < 120 ? colors.semantic.success : colors.semantic.warning} />
        <CommandMetric icon={<Route size={14} />} label="匯入 rows" value={compactNumber(feedHealth.rows)} tone={ACCENT} />
        <CommandMetric icon={<Signal size={14} />} label="Stale / Error" value={`${feedHealth.stale}/${feedHealth.errored}`} tone={feedHealth.errored > 0 ? ALERT : CONTROL} />
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
      border: `1px solid ${alpha(tone, 0.22)}`,
      bgcolor: alpha(tone, 0.06),
      p: 0.95,
      display: 'grid',
      gridTemplateColumns: '30px minmax(0, 1fr)',
      gap: 0.85,
      alignItems: 'center',
      minHeight: 70,
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
      p: 0.85,
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

function IoCEmptyChart({ loading, mode }: { loading: boolean; mode: 'bars' | 'radar' }) {
  if (loading) return <Skeleton variant="rectangular" height={230} />

  const labels = mode === 'bars'
    ? ['C2', 'Credential', 'Stealer', 'Phishing']
    : ['Org', 'Global', 'Feed', 'Review']

  return (
    <Box sx={{
      height: 230,
      display: 'grid',
      placeItems: 'center',
      borderRadius: 1,
      border: (theme) => `1px dashed ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.2 : 0.14)}`,
      background: (theme) => `linear-gradient(135deg, ${alpha(ACCENT, theme.palette.mode === 'dark' ? 0.08 : 0.045)}, transparent 60%)`,
    }}>
      <Box sx={{ width: '76%', maxWidth: 420 }}>
        <Box sx={{ display: 'grid', gap: 1 }}>
          {labels.map((label, index) => (
            <Box key={label} sx={{ display: 'grid', gridTemplateColumns: '96px 1fr 28px', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 850, color: 'text.secondary' }}>{label}</Typography>
              <Box sx={{ height: 10, borderRadius: 999, bgcolor: (theme) => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.16 : 0.08), overflow: 'hidden' }}>
                <Box sx={{
                  width: `${Math.max(5, 18 - index * 3)}%`,
                  height: '100%',
                  borderRadius: 999,
                  bgcolor: alpha(index === 0 ? ALERT : ACCENT, 0.65),
                }} />
              </Box>
              <Typography sx={{ fontSize: 12, fontWeight: 950, color: ACCENT }}>0</Typography>
            </Box>
          ))}
        </Box>
        <Typography sx={{ mt: 1.5, fontSize: 13, fontWeight: 750, color: 'text.secondary', textAlign: 'center' }}>
          {tOr('threatIntel.iocManagerEmpty', '攻擊面與情資 feed 接上後，這裡才會形成可用的 IOC 判讀圖。')}
        </Typography>
      </Box>
    </Box>
  )
}

function IoCReviewBoard({
  hasData,
  items,
  orgTotal,
  globalTotal,
  orgFocalHits,
  orgExposure,
  feedHealth,
  feedStatus,
}: {
  hasData: boolean
  items: IoCQueueItem[]
  orgTotal: number
  globalTotal: number
  orgFocalHits: number
  orgExposure: number
  feedHealth: ReturnType<typeof summarizeFeeds>
  feedStatus: FeedStatus[]
}) {
  return (
    <Box sx={{
      borderRadius: 1,
      border: '1px solid',
      borderColor: (theme) => alpha(ACCENT, theme.palette.mode === 'dark' ? 0.38 : 0.28),
      bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.54 : 0.96),
      backgroundImage: (theme) => `
        linear-gradient(90deg, ${alpha(ACCENT, theme.palette.mode === 'dark' ? 0.06 : 0.028)} 1px, transparent 1px),
        linear-gradient(0deg, ${alpha(CONTROL, theme.palette.mode === 'dark' ? 0.045 : 0.02)} 1px, transparent 1px)
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
        bgcolor: (theme) => alpha(ACCENT, theme.palette.mode === 'dark' ? 0.08 : 0.04),
      }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 950, letterSpacing: 0 }}>
            IOC 處置隊列
          </Typography>
          <Typography sx={{ mt: 0.25, fontSize: 12.5, color: 'text.secondary' }}>
            只呈現本組織命中、feed 健康與高訊號分類，避免目錄數字淹沒重點。
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          <Chip size="small" label={`本組織 ${compactNumber(orgTotal)}`} sx={{ borderRadius: 1, fontWeight: 900, bgcolor: alpha(ACCENT, 0.12), color: ACCENT }} />
          <Chip size="small" label={`高訊號 ${compactNumber(orgFocalHits)}`} sx={{ borderRadius: 1, fontWeight: 900, bgcolor: alpha(orgFocalHits > 0 ? ALERT : colors.semantic.success, 0.12), color: orgFocalHits > 0 ? ALERT : colors.semantic.success }} />
          <Chip size="small" label={`Feed ${feedHealth.ready}/${feedHealth.total || 0}`} sx={{ borderRadius: 1, fontWeight: 900, bgcolor: alpha(feedHealth.errored > 0 ? ALERT : colors.semantic.success, 0.12), color: feedHealth.errored > 0 ? ALERT : colors.semantic.success }} />
        </Box>
      </Box>

      <Box sx={{
        p: { xs: 1.25, md: 1.6 },
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.45fr) minmax(304px, 0.72fr)' },
        gap: 1.25,
        alignItems: 'stretch',
      }}>
        <Box sx={{ display: 'grid', gap: 0.85, minWidth: 0 }}>
          {items.map((item, index) => {
            const tone = queueTone(item.severity)
            const Icon = kindIcon(item.kind)
            return (
              <Box
                key={item.id}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '34px minmax(0, 1fr)', md: '34px minmax(0, 1fr) minmax(88px, 0.18fr)' },
                  gap: 1,
                  alignItems: 'center',
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: alpha(tone, 0.22),
                  bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.52 : 0.82),
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
                }}>
                  <Icon size={15} />
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
                    {hasData ? '命中' : '順序'}
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
            <RadioTower size={16} color={ACCENT} />
            <Typography sx={{ fontSize: 14, fontWeight: 950 }}>情資可用度</Typography>
          </Box>
          <Box sx={{
            borderRadius: 1,
            p: 1,
            border: `1px solid ${alpha(hasData ? ACCENT : CONTROL, 0.24)}`,
            bgcolor: alpha(hasData ? ACCENT : CONTROL, 0.07),
          }}>
            <Typography sx={{ fontSize: 11.5, fontWeight: 900, color: 'text.secondary' }}>
              可判讀命中
            </Typography>
            <Typography sx={{ mt: 0.25, fontFamily: 'ui-monospace, monospace', fontSize: hasData ? 32 : 24, fontWeight: 950, lineHeight: 1, color: hasData ? ACCENT : CONTROL }}>
              {hasData ? compactNumber(orgTotal) : '待建立'}
            </Typography>
          </Box>
          <Box sx={{ display: 'grid', gap: 0.65 }}>
            <MiniSignal label="曝險命中" value={orgExposure} max={Math.max(1, orgTotal)} tone={orgExposure > 0 ? ALERT : colors.semantic.success} />
            <MiniSignal label="全球基準" value={globalTotal} max={Math.max(1, globalTotal)} tone={CONTROL} />
            <MiniSignal label="Feed rows" value={feedHealth.rows} max={Math.max(1, feedHealth.rows)} tone={ACCENT} />
          </Box>
          {feedStatus.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
              {feedStatus.slice(0, 6).map((feed) => {
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
            {hasData
              ? '管理端只呈現本組織相關命中與 feed 健康狀態；原始搜尋、kind 篩選與完整 indicator 表放在工程模式。'
              : '目前沒有可判讀 IOC 命中。先完成攻擊面掃描並確認情資來源刷新，才會形成管理端處置隊列。'}
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
      <Typography sx={{ fontSize: 12, fontWeight: 850, color: 'text.secondary' }}>
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
