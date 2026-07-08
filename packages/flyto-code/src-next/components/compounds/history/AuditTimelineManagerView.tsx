import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import { alpha, useTheme } from '@mui/material/styles'
import { useSnackbar } from 'notistack'
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  Clock3,
  Database,
  FileCheck2,
  FileText,
  GitCommit,
  ListChecks,
  Radar,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Timer,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'

import {
  ChartCard,
  KpiCard,
  ManagerDashboard,
} from '@compounds/_shared'
import { t, tOr } from '@lib/i18n'
import { colors } from '@/styles/designTokens'
import { qk } from '@lib/queryKeys'
import { getHistoryFeed } from '@lib/engine/history/history-feed'
import type { FeedKind, FeedItem } from '@lib/engine/history/history-feed'
import { renderHtmlToPdf } from '@lib/engine/reports/reports'
import { buildStats, buildHistoryReportHtml } from './historyReport'
import { periodPair, type AuditPeriod } from './periodHelpers'

const AUDIT_KINDS: FeedKind[] = ['sla_breach', 'asset', 'pentest', 'score']
const ACCENT = colors.section.history
const CONTROL = colors.brand
const INFO = colors.section.exposure
const ALERT = colors.semantic.danger
const WARNING = colors.semantic.warning

const KIND_LABEL: Record<string, string> = {
  scan: 'Scans',
  pentest: 'Pentests',
  score: 'Score updates',
  alert: 'Alerts',
  asset: 'Asset changes',
  sla_breach: 'SLA breaches',
}

const KIND_ICON: Record<string, typeof Activity> = {
  scan: Radar,
  pentest: ShieldAlert,
  score: Activity,
  alert: AlertTriangle,
  asset: Database,
  sla_breach: Timer,
}

interface CadenceRow {
  id: AuditPeriod
  cadence: string
  events: number
  activeDays: number
  critHigh: number
  slaBreaches: number
}

interface AuditQueueItem {
  id: string
  title: string
  subtitle: string
  meta: string[]
  kind: FeedKind
  severity: FeedItem['severity']
  recordedAt: string
  tone: string
}

function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  if (Math.abs(value) < 1000) return String(Math.round(value))
  if (Math.abs(value) < 10_000) return `${(value / 1000).toFixed(1)}k`
  return `${Math.round(value / 1000)}k`
}

function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind
}

function kindTone(kind: string): string {
  if (kind === 'sla_breach') return ALERT
  if (kind === 'pentest') return WARNING
  if (kind === 'score') return CONTROL
  if (kind === 'asset') return INFO
  return ACCENT
}

function severityTone(severity?: FeedItem['severity'], kind?: FeedKind): string {
  if (kind === 'sla_breach' || severity === 'critical') return ALERT
  if (severity === 'high') return WARNING
  if (severity === 'medium') return ACCENT
  if (severity === 'low') return INFO
  return colors.semantic.success
}

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function scoreLabel(value: number | null): string {
  return value && value > 0 ? `${value}/100` : '--'
}

function eventIdentity(item: FeedItem, index: number): string {
  return `${item.kind}-${item.recorded_at}-${item.title}-${index}`
}

export function AuditTimelineManagerView({ orgId }: { orgId: string }) {
  const { enqueueSnackbar } = useSnackbar()
  const [reportAnchor, setReportAnchor] = useState<HTMLElement | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const windows = useMemo(() => periodPair('quarter'), [])

  const currentQ = useQuery({
    queryKey: qk.history.auditManagerFeed(orgId, windows.current.startISO, windows.current.endISO),
    queryFn: () => getHistoryFeed(orgId, {
      from: windows.current.startISO,
      to: windows.current.endISO,
      kinds: AUDIT_KINDS,
      limit: 500,
    }),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const prevQ = useQuery({
    queryKey: qk.history.auditManagerPreviousFeed(orgId, windows.previous.startISO, windows.previous.endISO),
    queryFn: () => getHistoryFeed(orgId, {
      from: windows.previous.startISO,
      to: windows.previous.endISO,
      kinds: AUDIT_KINDS,
      limit: 500,
    }),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const items = currentQ.data?.items ?? []
  const stats = useMemo(() => (currentQ.data ? buildStats(items) : null), [currentQ.data, items])
  const prevStats = useMemo(() => (prevQ.data ? buildStats(prevQ.data.items) : null), [prevQ.data])
  const loading = currentQ.isLoading

  const trend = useMemo(() => {
    const byDay = new Map<string, number>()
    for (const item of items) {
      const day = item.recorded_at.slice(0, 10)
      byDay.set(day, (byDay.get(day) ?? 0) + 1)
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-18)
      .map(([day, count]) => ({ day, count }))
  }, [items])

  const composition = useMemo(() => {
    const byKind = new Map<FeedKind, number>()
    for (const item of items) byKind.set(item.kind, (byKind.get(item.kind) ?? 0) + 1)
    return Array.from(byKind.entries())
      .map(([kind, count]) => ({ kind, count, tone: kindTone(kind) }))
      .sort((a, b) => b.count - a.count)
  }, [items])

  const cadenceRows: CadenceRow[] = useMemo(() => {
    const within = (period: AuditPeriod): FeedItem[] => {
      const window = periodPair(period).current
      const start = new Date(window.startISO).getTime()
      const end = new Date(window.endISO).getTime() + 86_400_000
      return items.filter(item => {
        const timestamp = new Date(item.recorded_at).getTime()
        return timestamp >= start && timestamp <= end
      })
    }

    return (['week', 'month', 'quarter'] as AuditPeriod[]).map(period => {
      const scoped = within(period)
      const scopedStats = buildStats(scoped)
      return {
        id: period,
        cadence: tOr(`history.period.${period}`, period[0].toUpperCase() + period.slice(1)),
        events: scopedStats.total,
        activeDays: scopedStats.days,
        critHigh: scopedStats.critHigh,
        slaBreaches: scopedStats.slaBreaches,
      }
    })
  }, [items])

  const queue = useMemo<AuditQueueItem[]>(() => {
    const priority = (item: FeedItem): number => {
      if (item.kind === 'sla_breach') return 5
      if (item.severity === 'critical') return 4
      if (item.severity === 'high') return 3
      if (item.kind === 'pentest') return 2
      return 1
    }

    return [...items]
      .sort((a, b) => priority(b) - priority(a) || Date.parse(b.recorded_at) - Date.parse(a.recorded_at))
      .slice(0, 7)
      .map((item, index) => {
        const tone = severityTone(item.severity, item.kind)
        return {
          id: eventIdentity(item, index),
          title: item.title || kindLabel(item.kind),
          subtitle: item.summary || item.domain || kindLabel(item.kind),
          meta: [
            kindLabel(item.kind),
            item.domain || item.pillar,
            formatDateTime(item.recorded_at),
          ].filter(Boolean),
          kind: item.kind,
          severity: item.severity,
          recordedAt: item.recorded_at,
          tone,
        }
      })
  }, [items])

  const healthTone = (stats?.slaBreaches ?? 0) > 0 || (stats?.critHigh ?? 0) > 0 ? ALERT : colors.semantic.success
  const eventsNow = stats?.total ?? 0
  const eventsPrev = prevStats?.total ?? 0
  const eventsDelta = stats && prevStats ? eventsNow - eventsPrev : null
  const scoreNow = stats && stats.lastScore > 0 ? stats.lastScore : null
  const scoreDelta = stats?.scoreDelta ?? 0

  const generateReport = async (period: AuditPeriod) => {
    setReportAnchor(null)
    if (pdfBusy) return
    setPdfBusy(true)
    try {
      const pair = periodPair(period)
      const [curRes, prevRes] = await Promise.all([
        getHistoryFeed(orgId, {
          from: pair.current.startISO, to: pair.current.endISO,
          kinds: AUDIT_KINDS, limit: 500,
        }),
        getHistoryFeed(orgId, {
          from: pair.previous.startISO, to: pair.previous.endISO,
          kinds: AUDIT_KINDS, limit: 500,
        }).catch(() => null),
      ])
      const curStats = buildStats(curRes.items)
      const prevS = prevRes ? buildStats(prevRes.items) : null
      const html = buildHistoryReportHtml({
        title: t('history.auditTimelineTitle'),
        subtitle: t('history.auditTimelineSub'),
        variant: 'audit',
        footerStyle: 'compliance',
        windowLabel: pair.current.label,
        domainFilter: '',
        searchQ: '',
        activeKinds: AUDIT_KINDS,
        items: curRes.items,
        stats: curStats,
        prevStats: prevS,
        prevItems: prevRes?.items,
        prevLabel: pair.previous.label,
        template: period,
      })
      const blob = await renderHtmlToPdf(orgId, html)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-${period}-report-${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      enqueueSnackbar(t('history.pdfDownloaded'), { variant: 'success' })
    } catch (err) {
      console.error('audit manager PDF export failed', err)
      enqueueSnackbar(t('history.pdfError'), { variant: 'error' })
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <ManagerDashboard
      title={t('history.mgr.title')}
      subtitle={t('history.mgr.subtitle')}
      accent={ACCENT}
      titleIcon={<CalendarClock size={20} />}
      layout="dashboard"
      chartMinWidth={360}
      actions={
        <>
          <Button
            variant="contained"
            size="small"
            startIcon={<FileText size={14} />}
            endIcon={<ChevronDown size={12} />}
            onClick={event => setReportAnchor(event.currentTarget)}
            disabled={pdfBusy || loading}
            sx={{ textTransform: 'none', fontWeight: 800, borderRadius: 1 }}
          >
            {pdfBusy ? t('history.generating') : t('history.generateReport')}
          </Button>
          <Menu
            anchorEl={reportAnchor}
            open={!!reportAnchor}
            onClose={() => setReportAnchor(null)}
            MenuListProps={{ dense: true }}
          >
            <MenuItem onClick={() => void generateReport('week')}>{t('history.weeklyReport')}</MenuItem>
            <MenuItem onClick={() => void generateReport('month')}>{t('history.monthlyReport')}</MenuItem>
            <MenuItem onClick={() => void generateReport('quarter')}>{t('history.quarterlyReport')}</MenuItem>
            <MenuItem onClick={() => void generateReport('year')}>{t('history.annualReport')}</MenuItem>
          </Menu>
        </>
      }
      hero={
        <AuditCommandHero
          loading={loading}
          windowLabel={windows.current.label}
          eventsNow={eventsNow}
          eventsDelta={eventsDelta}
          scoreNow={scoreNow}
          scoreDelta={scoreDelta}
          stats={stats}
          trend={trend}
          healthTone={healthTone}
        />
      }
      kpis={
        <>
          <KpiCard
            label={t('history.mgr.kpiEvents')}
            value={stats ? stats.total : null}
            previous={prevStats ? prevStats.total : null}
            loading={loading}
            icon={<Clock3 size={15} />}
            tone={ACCENT}
          />
          <KpiCard
            label={t('history.mgr.kpiSla')}
            value={stats ? stats.slaBreaches : null}
            previous={prevStats ? prevStats.slaBreaches : null}
            invertDelta
            loading={loading}
            icon={<ShieldAlert size={15} />}
            tone={(stats?.slaBreaches ?? 0) > 0 ? ALERT : colors.semantic.success}
          />
          <KpiCard
            label={t('history.mgr.kpiCritHigh')}
            value={stats ? stats.critHigh : null}
            previous={prevStats ? prevStats.critHigh : null}
            invertDelta
            loading={loading}
            icon={<AlertTriangle size={15} />}
            tone={(stats?.critHigh ?? 0) > 0 ? WARNING : colors.semantic.success}
          />
          <KpiCard
            label={t('history.mgr.kpiScoreNow')}
            value={scoreNow}
            unit="/ 100"
            previous={prevStats && prevStats.lastScore > 0 ? prevStats.lastScore : null}
            loading={loading}
            empty={!loading && !scoreNow}
            emptyHint={t('history.mgr.noScore')}
            icon={<Activity size={15} />}
            tone={scoreDelta >= 0 ? colors.semantic.success : ALERT}
          />
        </>
      }
      charts={
        <>
          <ChartCard title={t('history.mgr.chartComposition')}>
            <AuditComposition composition={composition} loading={loading} total={eventsNow} />
          </ChartCard>
          <ChartCard title={t('history.mgr.chartCadence')}>
            <CadenceMatrix rows={cadenceRows} loading={loading} />
          </ChartCard>
        </>
      }
      workItems={
        <AuditEvidenceBoard
          items={queue}
          loading={loading}
          stats={stats}
          windowLabel={windows.current.label}
        />
      }
      narrative={
        <AuditRunbook
          stats={stats}
          prevStats={prevStats}
          windowLabel={windows.current.label}
          loading={loading}
        />
      }
    />
  )
}

function AuditCommandHero({
  loading,
  windowLabel,
  eventsNow,
  eventsDelta,
  scoreNow,
  scoreDelta,
  stats,
  trend,
  healthTone,
}: {
  loading: boolean
  windowLabel: string
  eventsNow: number
  eventsDelta: number | null
  scoreNow: number | null
  scoreDelta: number
  stats: ReturnType<typeof buildStats> | null
  trend: Array<{ day: string; count: number }>
  healthTone: string
}) {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  const maxTrend = Math.max(1, ...trend.map(item => item.count))

  return (
    <Box sx={{
      minHeight: { xs: 360, lg: 222 },
      borderRadius: 1,
      border: '1px solid',
      borderColor: alpha(ACCENT, dark ? 0.44 : 0.3),
      bgcolor: alpha(theme.palette.background.paper, dark ? 0.58 : 0.96),
      backgroundImage: `
        linear-gradient(90deg, ${alpha(ACCENT, dark ? 0.075 : 0.035)} 1px, transparent 1px),
        linear-gradient(0deg, ${alpha(CONTROL, dark ? 0.055 : 0.024)} 1px, transparent 1px),
        radial-gradient(circle at 20% 18%, ${alpha(healthTone, dark ? 0.16 : 0.08)} 0%, transparent 31%)
      `,
      backgroundSize: '38px 38px, 38px 38px, auto',
      p: { xs: 1.25, md: 1.5 },
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', lg: 'minmax(260px, 0.78fr) minmax(0, 1.42fr) minmax(280px, 0.76fr)' },
      gap: 1.15,
      alignItems: 'stretch',
      minWidth: 0,
      overflow: 'hidden',
    }}>
      <CommandPanel tone={healthTone}>
        <Typography sx={{ fontSize: 12, fontWeight: 950, color: healthTone, display: 'flex', alignItems: 'center', gap: 0.7 }}>
          <Scale size={14} />
          {tOr('history.mgr.auditAssurance', 'Audit assurance')}
        </Typography>
        {loading ? (
          <Skeleton variant="text" height={64} width="72%" />
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 0.3 }}>
            <Typography sx={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: { xs: 42, md: 54 },
              fontWeight: 950,
              lineHeight: 0.95,
              color: healthTone,
            }}>
              {eventsNow}
            </Typography>
            <Typography sx={{ fontSize: 13, color: 'text.secondary', fontWeight: 800 }}>
              {t('history.mgr.events')}
            </Typography>
          </Box>
        )}
        <Typography sx={{ mt: 0.4, fontSize: 12.5, color: 'text.secondary' }}>
          {windowLabel}
        </Typography>
        <Box sx={{ mt: 'auto', display: 'grid', gap: 0.7 }}>
          <SignalMeter label={t('history.mgr.kpiSla')} value={stats?.slaBreaches ?? 0} max={Math.max(1, eventsNow)} tone={(stats?.slaBreaches ?? 0) > 0 ? ALERT : colors.semantic.success} />
          <SignalMeter label={t('history.mgr.kpiCritHigh')} value={stats?.critHigh ?? 0} max={Math.max(1, eventsNow)} tone={(stats?.critHigh ?? 0) > 0 ? WARNING : colors.semantic.success} />
        </Box>
      </CommandPanel>

      <CommandPanel tone={ACCENT}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 950, color: ACCENT, display: 'flex', alignItems: 'center', gap: 0.7 }}>
              <Radar size={14} />
              {tOr('history.mgr.cadenceCommand', 'Cadence command')}
            </Typography>
            <Typography sx={{ mt: 0.45, fontSize: { xs: 22, md: 30 }, fontWeight: 950, lineHeight: 1.08 }}>
              {eventsNow > 0
                ? tOr('history.mgr.activeAuditWindow', 'Audit activity is visible and reviewable')
                : t('history.mgr.quietQuarter')}
            </Typography>
          </Box>
          {eventsDelta != null && eventsDelta !== 0 && (
            <Chip
              size="small"
              icon={eventsDelta > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              label={`${eventsDelta > 0 ? '+' : ''}${eventsDelta} ${t('history.mgr.qoq')}`}
              sx={{
                height: 26,
                borderRadius: 1,
                fontWeight: 950,
                color: eventsDelta > 0 ? colors.semantic.success : WARNING,
                bgcolor: alpha(eventsDelta > 0 ? colors.semantic.success : WARNING, 0.12),
                '& .MuiChip-icon': { color: 'inherit' },
              }}
            />
          )}
        </Box>

        <Box sx={{ mt: 1.1, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 0.85 }}>
          <HeroNode icon={<Clock3 size={16} />} label={t('history.mgr.activeDays')} value={stats?.days ?? 0} tone={ACCENT} />
          <HeroNode icon={<Activity size={16} />} label={t('history.mgr.kpiScoreNow')} value={scoreLabel(scoreNow)} tone={scoreDelta >= 0 ? colors.semantic.success : ALERT} />
          <HeroNode icon={<GitCommit size={16} />} label={tOr('history.mgr.scoreDelta', 'Score delta')} value={scoreNow ? `${scoreDelta >= 0 ? '+' : ''}${scoreDelta}` : '--'} tone={scoreDelta >= 0 ? colors.semantic.success : ALERT} />
        </Box>

        <Box sx={{ mt: 1.2, minHeight: 62, display: 'flex', alignItems: 'end', gap: 0.5, borderRadius: 1, border: `1px solid ${alpha(ACCENT, 0.18)}`, p: 0.8, bgcolor: alpha(ACCENT, 0.045) }}>
          {loading ? (
            <Skeleton variant="rounded" height={44} width="100%" />
          ) : trend.length > 0 ? (
            trend.map(item => (
              <Box
                key={item.day}
                title={`${item.day}: ${item.count}`}
                sx={{
                  flex: 1,
                  minWidth: 3,
                  height: `${Math.max(12, (item.count / maxTrend) * 48)}px`,
                  borderRadius: '5px 5px 2px 2px',
                  bgcolor: ACCENT,
                  opacity: 0.38 + (item.count / maxTrend) * 0.52,
                }}
              />
            ))
          ) : (
            <Typography sx={{ fontSize: 12.5, color: 'text.secondary', alignSelf: 'center', mx: 'auto' }}>
              {t('history.mgr.noEvents')}
            </Typography>
          )}
        </Box>
      </CommandPanel>

      <CommandPanel tone={CONTROL}>
        <Typography sx={{ fontSize: 12, fontWeight: 950, color: CONTROL, display: 'flex', alignItems: 'center', gap: 0.7 }}>
          <FileCheck2 size={14} />
          {tOr('history.mgr.complianceReadout', 'Compliance readout')}
        </Typography>
        <Box sx={{ mt: 0.85, display: 'grid', gap: 0.75 }}>
          <ReadoutLine
            icon={(stats?.slaBreaches ?? 0) > 0 ? <ShieldAlert size={14} /> : <ShieldCheck size={14} />}
            label={t('history.mgr.kpiSla')}
            value={stats?.slaBreaches ?? 0}
            tone={(stats?.slaBreaches ?? 0) > 0 ? ALERT : colors.semantic.success}
          />
          <ReadoutLine
            icon={<AlertTriangle size={14} />}
            label={t('history.mgr.kpiCritHigh')}
            value={stats?.critHigh ?? 0}
            tone={(stats?.critHigh ?? 0) > 0 ? WARNING : colors.semantic.success}
          />
          <ReadoutLine
            icon={<ListChecks size={14} />}
            label={tOr('history.mgr.openedResolved', 'Opened / resolved')}
            value={`${stats?.opened ?? 0}/${stats?.resolved ?? 0}`}
            tone={INFO}
          />
          <ReadoutLine
            icon={<CalendarClock size={14} />}
            label={tOr('history.mgr.previousWindow', 'Previous window')}
            value={eventsDelta == null ? '--' : `${eventsDelta >= 0 ? '+' : ''}${eventsDelta}`}
            tone={eventsDelta != null && eventsDelta > 0 ? colors.semantic.success : WARNING}
          />
        </Box>
      </CommandPanel>
    </Box>
  )
}

function CommandPanel({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <Box sx={{
      borderRadius: 1,
      border: '1px solid',
      borderColor: alpha(tone, 0.24),
      bgcolor: theme => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.46 : 0.78),
      p: 1.25,
      display: 'flex',
      flexDirection: 'column',
      gap: 0.7,
      minWidth: 0,
      boxShadow: `inset 3px 0 0 ${alpha(tone, 0.66)}`,
    }}>
      {children}
    </Box>
  )
}

function HeroNode({ icon, label, value, tone }: { icon: ReactNode; label: string; value: ReactNode; tone: string }) {
  return (
    <Box sx={{
      minWidth: 0,
      borderRadius: 1,
      border: `1px solid ${alpha(tone, 0.22)}`,
      bgcolor: alpha(tone, 0.07),
      p: 0.9,
      display: 'grid',
      gridTemplateColumns: '30px minmax(0, 1fr)',
      gap: 0.8,
      alignItems: 'center',
      minHeight: 66,
    }}>
      <Box sx={{ width: 30, height: 30, borderRadius: 1, display: 'grid', placeItems: 'center', bgcolor: alpha(tone, 0.13), color: tone }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 11.5, fontWeight: 900, color: tone }} noWrap>{label}</Typography>
        <Typography sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 20, fontWeight: 950, lineHeight: 1.1 }} noWrap>
          {value}
        </Typography>
      </Box>
    </Box>
  )
}

function ReadoutLine({ icon, label, value, tone }: { icon: ReactNode; label: string; value: ReactNode; tone: string }) {
  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: '28px minmax(0, 1fr) auto',
      gap: 0.75,
      alignItems: 'center',
      borderRadius: 1,
      border: theme => `1px solid ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.13 : 0.08)}`,
      bgcolor: theme => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.32 : 0.66),
      p: 0.8,
      minWidth: 0,
    }}>
      <Box sx={{ color: tone, display: 'flex' }}>{icon}</Box>
      <Typography sx={{ fontSize: 12, fontWeight: 850, color: 'text.secondary' }} noWrap>{label}</Typography>
      <Typography sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13.5, fontWeight: 950, color: tone, whiteSpace: 'nowrap' }}>
        {value}
      </Typography>
    </Box>
  )
}

function SignalMeter({ label, value, max, tone }: { label: string; value: number; max: number; tone: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.3 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 900, color: 'text.secondary' }}>{label}</Typography>
        <Typography sx={{ fontSize: 11, fontWeight: 950, color: tone }}>{compactNumber(value)}/{compactNumber(max)}</Typography>
      </Box>
      <Box sx={{ height: 7, borderRadius: 999, bgcolor: alpha(tone, 0.12), overflow: 'hidden' }}>
        <Box sx={{ width: `${pct}%`, height: '100%', borderRadius: 999, bgcolor: tone }} />
      </Box>
    </Box>
  )
}

function AuditComposition({
  composition,
  loading,
  total,
}: {
  composition: Array<{ kind: FeedKind; count: number; tone: string }>
  loading: boolean
  total: number
}) {
  if (loading) return <Skeleton variant="rounded" height={246} />

  if (composition.length === 0) {
    return <EmptyPanel icon={<ShieldCheck size={18} />} title={t('history.mgr.noEvents')} body={t('history.mgr.quietQuarter')} />
  }

  return (
    <Box sx={{ minHeight: 246, display: 'grid', gridTemplateRows: 'auto 1fr', gap: 1.1 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 0.8 }}>
        {composition.slice(0, 4).map(item => {
          const Icon = KIND_ICON[item.kind] ?? Activity
          return (
            <Box
              key={item.kind}
              sx={{
                borderRadius: 1,
                border: `1px solid ${alpha(item.tone, 0.22)}`,
                bgcolor: alpha(item.tone, 0.065),
                p: 0.9,
                minWidth: 0,
                display: 'grid',
                gridTemplateColumns: '30px minmax(0, 1fr) auto',
                gap: 0.8,
                alignItems: 'center',
              }}
            >
              <Box sx={{ width: 30, height: 30, borderRadius: 1, display: 'grid', placeItems: 'center', bgcolor: alpha(item.tone, 0.13), color: item.tone }}>
                <Icon size={15} />
              </Box>
              <Typography sx={{ fontSize: 12.3, fontWeight: 900, color: 'text.secondary' }} noWrap>
                {kindLabel(item.kind)}
              </Typography>
              <Typography sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 18, fontWeight: 950, color: item.tone }}>
                {item.count}
              </Typography>
            </Box>
          )
        })}
      </Box>

      <Box sx={{ display: 'grid', gap: 0.75, alignContent: 'center' }}>
        {composition.map(item => {
          const pct = total > 0 ? Math.max(4, (item.count / total) * 100) : 4
          return (
            <Box key={item.kind} sx={{ display: 'grid', gridTemplateColumns: '118px 1fr 42px', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 850, color: 'text.secondary' }} noWrap>{kindLabel(item.kind)}</Typography>
              <Box sx={{ height: 8, borderRadius: 999, bgcolor: alpha(item.tone, 0.1), overflow: 'hidden' }}>
                <Box sx={{ width: `${pct}%`, height: '100%', borderRadius: 999, bgcolor: item.tone }} />
              </Box>
              <Typography sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5, fontWeight: 950, color: item.tone, textAlign: 'right' }}>
                {item.count}
              </Typography>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

function CadenceMatrix({ rows, loading }: { rows: CadenceRow[]; loading: boolean }) {
  if (loading) return <Skeleton variant="rounded" height={246} />
  const maxEvents = Math.max(1, ...rows.map(row => row.events))

  return (
    <Box sx={{ minHeight: 246, display: 'grid', gap: 0.8, alignContent: 'start' }}>
      {rows.map(row => {
        const tone = row.slaBreaches > 0 ? ALERT : row.critHigh > 0 ? WARNING : ACCENT
        const pct = Math.max(4, (row.events / maxEvents) * 100)
        return (
          <Box
            key={row.id}
            sx={{
              borderRadius: 1,
              border: `1px solid ${alpha(tone, 0.2)}`,
              bgcolor: alpha(tone, 0.055),
              p: 0.95,
              minWidth: 0,
            }}
          >
            <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 1, alignItems: 'center' }}>
              <Typography sx={{ fontSize: 13, fontWeight: 950 }} noWrap>{row.cadence}</Typography>
              <Typography sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 17, fontWeight: 950, color: tone }}>
                {row.events}
              </Typography>
            </Box>
            <Box sx={{ mt: 0.65, height: 8, borderRadius: 999, bgcolor: alpha(tone, 0.1), overflow: 'hidden' }}>
              <Box sx={{ width: `${pct}%`, height: '100%', borderRadius: 999, bgcolor: tone }} />
            </Box>
            <Box sx={{ mt: 0.65, display: 'flex', gap: 0.55, flexWrap: 'wrap' }}>
              <MiniPill tone={ACCENT} label={`${row.activeDays} ${t('history.mgr.activeDays')}`} />
              <MiniPill tone={row.critHigh > 0 ? WARNING : colors.semantic.success} label={`${row.critHigh} ${t('history.mgr.kpiCritHigh')}`} />
              <MiniPill tone={row.slaBreaches > 0 ? ALERT : colors.semantic.success} label={`${row.slaBreaches} ${t('history.mgr.kpiSla')}`} />
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

function MiniPill({ tone, label }: { tone: string; label: string }) {
  return (
    <Box sx={{ px: 0.75, py: 0.25, borderRadius: 1, bgcolor: alpha(tone, 0.1), color: tone, fontSize: 11, fontWeight: 850 }}>
      {label}
    </Box>
  )
}

function AuditEventQueue({ items, loading }: { items: AuditQueueItem[]; loading: boolean }) {
  if (loading) {
    return (
      <Box sx={{ minHeight: 246, display: 'grid', gap: 0.8 }}>
        {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} variant="rounded" height={52} />)}
      </Box>
    )
  }

  if (items.length === 0) {
    return <EmptyPanel icon={<ShieldCheck size={18} />} title={t('history.mgr.noEvents')} body={t('history.mgr.quietQuarter')} />
  }

  return (
    <Box sx={{ minHeight: 246, display: 'grid', gap: 0.7, alignContent: 'start' }}>
      {items.map(item => {
        const Icon = KIND_ICON[item.kind] ?? Activity
        return (
          <Box
            key={item.id}
            sx={{
              display: 'grid',
              gridTemplateColumns: '30px minmax(0, 1fr) auto',
              gap: 0.85,
              alignItems: 'center',
              borderRadius: 1,
              border: `1px solid ${alpha(item.tone, 0.2)}`,
              bgcolor: alpha(item.tone, 0.055),
              px: 0.9,
              py: 0.75,
              minWidth: 0,
            }}
          >
            <Box sx={{ width: 28, height: 28, borderRadius: 1, display: 'grid', placeItems: 'center', bgcolor: alpha(item.tone, 0.12), color: item.tone }}>
              <Icon size={14} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 12.8, fontWeight: 950, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.title}>
                {item.title}
              </Typography>
              <Typography sx={{ mt: 0.2, fontSize: 11.5, color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.subtitle}>
                {item.subtitle}
              </Typography>
            </Box>
            <Box sx={{ display: 'grid', justifyItems: 'end', gap: 0.25 }}>
              <Typography sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5, fontWeight: 950, color: item.tone }}>
                {formatDateTime(item.recordedAt)}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.35 }}>
                {item.meta.slice(0, 2).map(meta => <MiniPill key={meta} tone={item.tone} label={meta} />)}
              </Box>
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

function AuditEvidenceBoard({
  items,
  loading,
  stats,
  windowLabel,
}: {
  items: AuditQueueItem[]
  loading: boolean
  stats: ReturnType<typeof buildStats> | null
  windowLabel: string
}) {
  const focal = items[0]
  const focalTone = focal?.tone ?? ACCENT

  return (
    <Box sx={{
      borderRadius: 1,
      border: '1px solid',
      borderColor: theme => alpha(ACCENT, theme.palette.mode === 'dark' ? 0.4 : 0.3),
      bgcolor: theme => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.54 : 0.96),
      backgroundImage: theme => `
        linear-gradient(90deg, ${alpha(ACCENT, theme.palette.mode === 'dark' ? 0.055 : 0.024)} 1px, transparent 1px),
        linear-gradient(0deg, ${alpha(CONTROL, theme.palette.mode === 'dark' ? 0.045 : 0.02)} 1px, transparent 1px)
      `,
      backgroundSize: '34px 34px',
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
        borderColor: theme => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.12 : 0.08),
        bgcolor: theme => alpha(ACCENT, theme.palette.mode === 'dark' ? 0.08 : 0.04),
      }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 950, letterSpacing: 0 }}>
            {tOr('history.mgr.evidenceQueueTitle', 'Evidence queue')}
          </Typography>
          <Typography sx={{ mt: 0.25, fontSize: 12.5, color: 'text.secondary' }}>
            {tOr('history.mgr.evidenceQueueSub', 'Audit-relevant events ordered by breach, severity, and recency.')}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.7, flexWrap: 'wrap' }}>
          <Chip size="small" label={`${t('history.mgr.kpiSla')} ${stats?.slaBreaches ?? 0}`} sx={{ borderRadius: 1, fontWeight: 900, bgcolor: alpha((stats?.slaBreaches ?? 0) > 0 ? ALERT : colors.semantic.success, 0.1), color: (stats?.slaBreaches ?? 0) > 0 ? ALERT : colors.semantic.success }} />
          <Chip size="small" label={`${t('history.mgr.kpiCritHigh')} ${stats?.critHigh ?? 0}`} sx={{ borderRadius: 1, fontWeight: 900, bgcolor: alpha((stats?.critHigh ?? 0) > 0 ? WARNING : colors.semantic.success, 0.1), color: (stats?.critHigh ?? 0) > 0 ? WARNING : colors.semantic.success }} />
          <Chip size="small" label={windowLabel} sx={{ borderRadius: 1, fontWeight: 900, bgcolor: alpha(ACCENT, 0.1), color: ACCENT }} />
        </Box>
      </Box>

      <Box sx={{
        p: { xs: 1.25, md: 1.6 },
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.42fr) minmax(310px, 0.72fr)' },
        gap: 1.25,
        alignItems: 'start',
      }}>
        <AuditEventQueue items={items} loading={loading} />

        <Box sx={{
          borderRadius: 1,
          border: theme => `1px solid ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.13 : 0.08)}`,
          bgcolor: theme => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.52 : 0.82),
          p: 1.25,
          display: 'grid',
          gap: 1,
          alignContent: 'start',
          minWidth: 0,
        }}>
          <Typography sx={{ fontSize: 14, fontWeight: 950, display: 'flex', alignItems: 'center', gap: 0.8 }}>
            <FileCheck2 size={16} color={ACCENT} />
            {tOr('history.mgr.auditReadout', 'Audit readout')}
          </Typography>
          {focal ? (
            <>
              <Box sx={{ borderRadius: 1, p: 1, border: `1px solid ${alpha(focalTone, 0.24)}`, bgcolor: alpha(focalTone, 0.07), minWidth: 0 }}>
                <Typography sx={{ fontSize: 11.5, fontWeight: 900, color: 'text.secondary' }}>
                  {kindLabel(focal.kind)}
                </Typography>
                <Typography sx={{ mt: 0.25, fontSize: 17, fontWeight: 950, overflowWrap: 'anywhere' }}>
                  {focal.title}
                </Typography>
                <Typography sx={{ mt: 0.35, fontSize: 12, color: 'text.secondary', overflowWrap: 'anywhere' }}>
                  {focal.subtitle}
                </Typography>
              </Box>
              <SignalMeter label={t('history.mgr.kpiSla')} value={stats?.slaBreaches ?? 0} max={Math.max(1, stats?.total ?? 0)} tone={(stats?.slaBreaches ?? 0) > 0 ? ALERT : colors.semantic.success} />
              <SignalMeter label={t('history.mgr.kpiCritHigh')} value={stats?.critHigh ?? 0} max={Math.max(1, stats?.total ?? 0)} tone={(stats?.critHigh ?? 0) > 0 ? WARNING : colors.semantic.success} />
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 0.75 }}>
                <ReadoutTile label={t('history.mgr.kpiEvents')} value={stats?.total ?? 0} tone={ACCENT} />
                <ReadoutTile label={t('history.mgr.activeDays')} value={stats?.days ?? 0} tone={CONTROL} />
                <ReadoutTile label={tOr('history.mgr.opened', 'Opened')} value={stats?.opened ?? 0} tone={WARNING} />
                <ReadoutTile label={tOr('history.mgr.resolved', 'Resolved')} value={stats?.resolved ?? 0} tone={colors.semantic.success} />
              </Box>
            </>
          ) : (
            <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
              {t('history.mgr.noEvents')}
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  )
}

function ReadoutTile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Box sx={{
      borderRadius: 1,
      border: `1px solid ${alpha(tone, 0.2)}`,
      bgcolor: alpha(tone, 0.06),
      p: 0.8,
      minWidth: 0,
    }}>
      <Typography sx={{ fontSize: 11.3, fontWeight: 850, color: 'text.secondary' }} noWrap>{label}</Typography>
      <Typography sx={{ mt: 0.25, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 18, fontWeight: 950, color: tone }}>
        {compactNumber(value)}
      </Typography>
    </Box>
  )
}

function AuditRunbook({
  stats,
  prevStats,
  windowLabel,
  loading,
}: {
  stats: ReturnType<typeof buildStats> | null
  prevStats: ReturnType<typeof buildStats> | null
  windowLabel: string
  loading: boolean
}) {
  const eventDelta = stats && prevStats ? stats.total - prevStats.total : 0
  const steps = [
    {
      label: tOr('history.mgr.runbookEvidence', 'Evidence custody'),
      value: stats?.total ?? 0,
      body: stats && stats.total > 0
        ? tOr('history.mgr.runbookEvidenceBody', 'Every visible event is available in engineer mode with its timestamp and source context.')
        : t('history.mgr.quietQuarter'),
      tone: stats && stats.total > 0 ? ACCENT : colors.semantic.neutral,
    },
    {
      label: tOr('history.mgr.runbookBreach', 'Breach watch'),
      value: stats?.slaBreaches ?? 0,
      body: (stats?.slaBreaches ?? 0) > 0
        ? tOr('history.mgr.runbookBreachBody', 'SLA rows should be reviewed before generating an external audit packet.')
        : tOr('history.mgr.noSlaNarrative', 'No SLA breach is visible in this window.'),
      tone: (stats?.slaBreaches ?? 0) > 0 ? ALERT : colors.semantic.success,
    },
    {
      label: tOr('history.mgr.runbookCadence', 'Cadence drift'),
      value: eventDelta,
      body: `${windowLabel} / ${eventDelta >= 0 ? '+' : ''}${eventDelta} ${t('history.mgr.qoq')}`,
      tone: eventDelta >= 0 ? colors.semantic.success : WARNING,
    },
  ]

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1 }}>
      {steps.map((step, index) => (
        <Box
          key={step.label}
          sx={{
            borderRadius: 1,
            border: `1px solid ${alpha(step.tone, 0.22)}`,
            bgcolor: alpha(step.tone, 0.055),
            p: 1.15,
            minWidth: 0,
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'baseline' }}>
            <Typography sx={{ fontSize: 12, fontWeight: 950, color: step.tone }}>
              {loading ? '--' : `${index + 1}. ${step.label}`}
            </Typography>
            <Typography sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 17, fontWeight: 950, color: step.tone }}>
              {loading ? '--' : typeof step.value === 'number' && step.value > 0 ? `+${compactNumber(step.value)}` : compactNumber(step.value)}
            </Typography>
          </Box>
          <Typography sx={{ mt: 0.4, fontSize: 12.4, color: 'text.secondary', lineHeight: 1.45 }}>
            {step.body}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}

function EmptyPanel({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <Box sx={{
      minHeight: 246,
      display: 'grid',
      placeItems: 'center',
      borderRadius: 1,
      border: theme => `1px dashed ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.2 : 0.14)}`,
      bgcolor: theme => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.35 : 0.68),
      textAlign: 'center',
      p: 2,
    }}>
      <Box sx={{ maxWidth: 360 }}>
        <Box sx={{ mx: 'auto', width: 38, height: 38, borderRadius: 1, display: 'grid', placeItems: 'center', bgcolor: alpha(ACCENT, 0.12), color: ACCENT, mb: 1 }}>
          {icon}
        </Box>
        <Typography sx={{ fontSize: 14, fontWeight: 950 }}>{title}</Typography>
        <Typography sx={{ mt: 0.5, fontSize: 12.5, color: 'text.secondary' }}>{body}</Typography>
      </Box>
    </Box>
  )
}
