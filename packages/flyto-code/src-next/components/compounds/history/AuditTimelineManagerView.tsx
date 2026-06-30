/**
 * AuditTimelineManagerView — cadence / compliance summary surface.
 *
 * Manager mode of the Audit Timeline page. Where the engineer view is a
 * raw, filterable chronological event log, the manager view answers the
 * auditor's questions at a glance:
 *   - How much audit activity this quarter vs last? (cadence)
 *   - Are we breaching SLAs? (compliance health)
 *   - Which evidence categories are active? (composition)
 *   - What's the score trajectory? (assurance trend)
 *
 * Every number is sourced from the unified org history feed
 * (`getHistoryFeed`) + the prior-period feed for deltas — the same
 * endpoint the engineer log reads, aggregated via the shared
 * `buildStats`. A "Generate report" action reuses the existing
 * weekly/monthly/quarterly/annual PDF pipeline (buildHistoryReportHtml
 * → renderHtmlToPdf), so the manager surface ships the same audit PDFs
 * the engineer toolbar does, one click from the summary.
 *
 * Client functions imported by DIRECT FILE PATH per the parallel-safety
 * decoupling rule (NOT via the @lib/engine barrel).
 */

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Chip from '@mui/material/Chip'
import { alpha } from '@mui/material/styles'
import { useSnackbar } from 'notistack'
import { FileText, ChevronDown, CalendarClock, TrendingUp, TrendingDown, ShieldAlert, ShieldCheck, Activity } from 'lucide-react'

import {
  ManagerDashboard,
  ChartCard,
  KpiCard,
  TrendChart,
  DonutChart,
  DataTable,
  ManagerHero,
  HeroStat,
  type DonutDatum,
  type MRT_ColumnDef,
} from '@compounds/_shared'
import { t, tOr } from '@lib/i18n';
import { colors } from '@/styles/designTokens'
import { qk } from '@lib/queryKeys'
import { getHistoryFeed } from '@lib/engine/history/history-feed'
import type { FeedKind, FeedItem } from '@lib/engine/history/history-feed'
import { renderHtmlToPdf } from '@lib/engine/reports/reports'
import { buildStats, buildHistoryReportHtml } from './historyReport'
import { periodPair, type AuditPeriod } from './periodHelpers'

// Audit kinds the manager summary cares about — same default set as
// the audit-variant engineer view.
const AUDIT_KINDS: FeedKind[] = ['sla_breach', 'asset', 'pentest', 'score']

const KIND_LABEL: Record<string, string> = {
  scan: 'Scans',
  pentest: 'Pentests',
  score: 'Score updates',
  alert: 'Alerts',
  asset: 'Asset changes',
  sla_breach: 'SLA breaches',
}

interface CadenceRow {
  id: AuditPeriod
  cadence: string
  events: number
  critHigh: number
  slaBreaches: number
}

export function AuditTimelineManagerView({ orgId }: { orgId: string }) {
  const { enqueueSnackbar } = useSnackbar()
  const [reportAnchor, setReportAnchor] = useState<HTMLElement | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)

  // Current quarter window + the immediately-preceding quarter for the
  // headline "vs prev" deltas. Quarter is the canonical audit cadence.
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

  // ── Hero focal datum: this-quarter audit volume + QoQ delta + SLA health ──
  const ACCENT = colors.section.history
  const eventsNow = stats ? stats.total : null
  const eventsPrev = prevStats ? prevStats.total : null
  const eventsDelta = eventsNow != null && eventsPrev != null ? eventsNow - eventsPrev : null
  const slaNow = stats ? stats.slaBreaches : null
  const slaBreaching = (slaNow ?? 0) > 0
  const SLA_TONE = slaBreaching ? colors.semantic.danger : colors.semantic.success

  // ── Events-over-time trend (daily buckets across the quarter) ──
  const trend = useMemo(() => {
    const byDay = new Map<string, number>()
    for (const it of items) {
      const d = it.recorded_at.slice(0, 10)
      byDay.set(d, (byDay.get(d) ?? 0) + 1)
    }
    const days = Array.from(byDay.keys()).sort()
    return {
      categories: days.map(d => new Date(d).toLocaleDateString()),
      values: days.map(d => byDay.get(d) ?? 0),
    }
  }, [items])

  // ── Composition donut (by feed kind) ──
  const composition: DonutDatum[] = useMemo(() => {
    const byKind = new Map<string, number>()
    for (const it of items) byKind.set(it.kind, (byKind.get(it.kind) ?? 0) + 1)
    return Array.from(byKind.entries())
      .map(([k, v]) => ({
        label: KIND_LABEL[k] ?? k,
        value: v,
        // SLA breaches are the bad-news slice — tint it.
        severity: k === 'sla_breach' ? ('high' as const) : undefined,
      }))
      .sort((a, b) => b.value - a.value)
  }, [items])

  // ── Per-cadence coverage table (week / month / quarter / year) ──
  // Each row aggregates the events that fall inside that calendar
  // window from the quarter feed (year falls back to "quarter scope"
  // since the feed is quarter-bounded — labelled accordingly).
  const cadenceRows: CadenceRow[] = useMemo(() => {
    if (!stats) return []
    const within = (p: AuditPeriod): FeedItem[] => {
      const w = periodPair(p).current
      const s = new Date(w.startISO).getTime()
      const e = new Date(w.endISO).getTime() + 86_400_000 // inclusive end-of-day
      return items.filter(it => {
        const t = new Date(it.recorded_at).getTime()
        return t >= s && t <= e
      })
    }
    return (['week', 'month', 'quarter'] as AuditPeriod[]).map(p => {
      const sub = within(p)
      const st = buildStats(sub)
      return {
        id: p,
        cadence: tOr(`history.period.${p}`, p[0].toUpperCase() + p.slice(1)),
        events: st.total,
        critHigh: st.critHigh,
        slaBreaches: st.slaBreaches,
      }
    })
  }, [items, stats])

  const cadenceColumns: MRT_ColumnDef<CadenceRow>[] = useMemo(() => [
    { accessorKey: 'cadence', header: t('history.mgr.colCadence'), size: 120 },
    { accessorKey: 'events', header: t('history.mgr.colEvents'), size: 90 },
    { accessorKey: 'critHigh', header: t('history.mgr.colCritHigh'), size: 100 },
    { accessorKey: 'slaBreaches', header: t('history.mgr.colSla'), size: 110 },
  ], [])

  // ── PDF generation — reuse the engineer-side pipeline ──
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
        layout="timeline"
        hero={
          <ManagerHero
            accent={ACCENT}
            icon={<CalendarClock size={15} />}
            minHeight={200}
            visual={
              trend.values.length > 1 ? (
                <Box sx={{ width: '100%', minWidth: { md: 280 } }}>
                  <TrendChart
                    categories={trend.categories}
                    series={[{ name: t('history.mgr.events'), data: trend.values }]}
                    height={172}
                  />
                </Box>
              ) : undefined
            }
            headline={{
              label: t('history.mgr.kpiEvents') + ` · ${windows.current.label}`,
              value: eventsNow != null ? eventsNow : '—',
              unit: eventsNow != null ? t('history.mgr.events') : undefined,
              sub: stats
                ? (eventsNow === 0
                    ? t('history.mgr.quietQuarter')
                    : `${stats.days} ${t('history.mgr.activeDays')} · ${stats.critHigh} ${t('history.mgr.kpiCritHigh')}`)
                : t('history.mgr.summaryEmpty'),
              delta: eventsDelta != null && eventsDelta !== 0 ? (
                <Chip
                  size="small"
                  icon={eventsDelta > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                  label={`${eventsDelta > 0 ? '+' : ''}${eventsDelta} ${t('history.mgr.qoq')}`}
                  sx={{
                    fontWeight: 700, fontSize: 12,
                    // More audit activity is neutral-to-good evidence of cadence;
                    // colour by direction (up = green cadence, down = amber slowdown).
                    bgcolor: alpha(eventsDelta > 0 ? colors.semantic.success : colors.semantic.warning, 0.14),
                    color: eventsDelta > 0 ? colors.semantic.success : colors.semantic.warning,
                    '& .MuiChip-icon': { color: 'inherit' },
                  }}
                />
              ) : undefined,
            }}
            aside={
              <Box>
                <HeroStat
                  icon={slaBreaching ? <ShieldAlert size={14} /> : <ShieldCheck size={14} />}
                  tone={SLA_TONE}
                  label={t('history.mgr.kpiSla')}
                  value={slaNow != null ? slaNow : '—'}
                />
                <HeroStat
                  icon={<Activity size={14} />}
                  tone={ACCENT}
                  label={t('history.mgr.kpiScoreNow')}
                  value={stats && stats.lastScore > 0 ? stats.lastScore : '—'}
                />
                <Box sx={{ mt: 1 }}>
                  <Button
                    variant="contained"
                    size="small"
                    fullWidth
                    startIcon={<FileText size={14} />}
                    endIcon={<ChevronDown size={12} />}
                    onClick={e => setReportAnchor(e.currentTarget)}
                    disabled={pdfBusy || loading}
                    sx={{ textTransform: 'none', fontWeight: 700 }}
                  >
                    {pdfBusy ? t('history.generating') : t('history.generateReport')}
                  </Button>
                </Box>
              </Box>
            }
          />
        }
        actions={
          <>
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
        kpis={
          <>
            <KpiCard
              label={t('history.mgr.kpiEvents')}
              value={stats ? stats.total : null}
              previous={prevStats ? prevStats.total : null}
              invertDelta
              loading={loading}
              empty={!loading && stats?.total === 0}
              emptyHint={t('history.mgr.quietQuarter')}
            />
            <KpiCard
              label={t('history.mgr.kpiSla')}
              value={stats ? stats.slaBreaches : null}
              previous={prevStats ? prevStats.slaBreaches : null}
              invertDelta
              loading={loading}
            />
            <KpiCard
              label={t('history.mgr.kpiCritHigh')}
              value={stats ? stats.critHigh : null}
              previous={prevStats ? prevStats.critHigh : null}
              invertDelta
              loading={loading}
            />
            <KpiCard
              label={t('history.mgr.kpiScoreNow')}
              value={stats && stats.lastScore > 0 ? stats.lastScore : null}
              unit="/ 100"
              previous={prevStats && prevStats.lastScore > 0 ? prevStats.lastScore : null}
              loading={loading}
              empty={!loading && (!stats || stats.lastScore === 0)}
              emptyHint={t('history.mgr.noScore')}
            />
          </>
        }
        charts={
          <>
            <ChartCard title={t('history.mgr.chartComposition')}>
              {composition.length > 0 ? (
                <DonutChart data={composition} totalLabel={t('history.mgr.events')} height={240} />
              ) : (
                <EmptyChart text={t('history.mgr.noEvents')} />
              )}
            </ChartCard>

            <ChartCard
              title={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <CalendarClock size={14} />
                  {t('history.mgr.chartCadence')}
                </Box>
              }
            >
              <DataTable
                columns={cadenceColumns}
                data={cadenceRows}
                isLoading={loading}
                maxBodyHeight={200}
                emptyText={t('history.mgr.noEvents')}
              />
            </ChartCard>
          </>
        }
        narrative={
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
              {t('history.mgr.summaryTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
              {stats
                ? tOr(
                    'history.mgr.summaryBody',
                    `${windows.current.label}: ${stats.total} audit events recorded across ${stats.days} active day(s), ${stats.slaBreaches} SLA breach(es) and ${stats.critHigh} critical/high event(s). ${
                      stats.lastScore > 0 ? `Posture currently ${stats.lastScore}/100 (Δ ${stats.scoreDelta >= 0 ? '+' : ''}${stats.scoreDelta} over the window).` : ''
                    } Switch to engineer mode (top bar) for the full chronological event log, filters and per-event evidence.`,
                  )
                : t('history.mgr.summaryEmpty')}
            </Typography>
          </Box>
        }
      />
  )
}

function EmptyChart({ text }: { text: string }) {
  return (
    <Box sx={{ height: 240, display: 'grid', placeItems: 'center' }}>
      <Typography variant="body2" color="text.secondary">{text}</Typography>
    </Box>
  )
}
