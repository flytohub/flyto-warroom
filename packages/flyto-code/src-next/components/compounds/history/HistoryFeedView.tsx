// History view — one page per pillar. Audit-cycle aware:
//   - Toggle 24h/7d/30d/90d  OR
//   - Audit cycle chips (Week / Month / Quarter / Year) which align
//     to calendar boundaries and fire a parallel prev-period query
//     for delta KPIs.
//   - "Generate Report" dropdown picks a period-appropriate PDF
//     template (weekly compact → annual comprehensive).
//
// 2026-05-17: audit-cycle support added per the auditor brief
// "會有審計員 會想要看 周報 月報 季報 年報". Replaces the earlier
// 4-page split (Timeline+Insights) — same data, one page, more depth.
//
// MUI-only — workspace has no MantineProvider.

import { useEffect, useMemo, useState } from 'react'
import {
  ToggleButton, ToggleButtonGroup, Alert, CircularProgress, Button,
  TextField, InputAdornment, Popover, IconButton, Menu, MenuItem, Chip,
} from '@mui/material'
import { useSnackbar } from 'notistack'
import {
  History, TrendingUp, TrendingDown, AlertTriangle,
  CalendarDays, Search, X, Globe, Activity,
  FileText, ChevronDown,
} from 'lucide-react'
import { renderHtmlToPdf } from '@lib/engine'
import { t } from '@lib/i18n';
import { colors } from '@/styles/designTokens'
import { useHistoryFilters, type HistoryVariant } from './useHistoryFilters'
import type { AuditPeriod } from './periodHelpers'
import { ScoreSparkline } from './dimensions/ScoreSparkline'
import { CompositionBars } from './dimensions/CompositionBars'
import { FeedRow } from './dimensions/FeedRow'
import { KindFilters } from './dimensions/KindFilters'
import { buildStats, buildHistoryReportHtml, type Stats } from './historyReport'
import { JellyCard } from '@atoms/JellyCard'

// ── Variant metadata ──────────────────────────────────────────

const VARIANT_META: Record<HistoryVariant, {
  title: string
  subtitle: string
  accent: string
  accentEnd: string
  pdfFooterStyle: 'compliance' | 'sprint'
}> = {
  audit: {
    title:    t('history.auditTimelineTitle'),
    subtitle: t('history.auditTimelineSub'),
    accent: '#a78bfa',
    accentEnd: '#c084fc',
    pdfFooterStyle: 'compliance',
  },
  code: {
    title:    t('history.codeActivityTitle'),
    subtitle: t('history.codeActivitySub'),
    accent: '#06b6d4',
    accentEnd: '#22d3ee',
    pdfFooterStyle: 'sprint',
  },
}

const SINCE_PRESETS = [
  { value: '24h', label: '24h' },
  { value: '7d',  label: '7d'  },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
]

const AUDIT_PERIODS: { value: AuditPeriod; label: string }[] = [
  { value: 'week',    label: t('history.period.week') },
  { value: 'month',   label: t('history.period.month') },
  { value: 'quarter', label: t('history.period.quarter') },
  { value: 'year',    label: t('history.period.year') },
]

// ── Helpers ───────────────────────────────────────────────────

// buildStats + Stats moved to ./historyReport — the PDF builder is
// the heavier consumer and the type now serves both surfaces.

function dispatchSectionChange(sectionId: string) {
  window.dispatchEvent(new CustomEvent('flyto:navigate-section', { detail: { sectionId } }))
}

// Compact label like "+12" / "−3" / "—" for delta display.
function deltaLabel(curr: number, prev: number): { text: string; tone: 'good' | 'bad' | 'neutral' } {
  const diff = curr - prev
  if (diff === 0) return { text: '—', tone: 'neutral' }
  if (diff > 0) return { text: `+${diff}`, tone: 'bad' } // more events / more SLAs is bad
  return { text: `${diff}`, tone: 'good' }
}

function scoreDeltaLabel(curr: number, prev: number): { text: string; tone: 'good' | 'bad' | 'neutral' } {
  const diff = curr - prev
  if (diff === 0) return { text: '—', tone: 'neutral' }
  if (diff > 0) return { text: `+${diff}`, tone: 'good' } // higher score is good
  return { text: `${diff}`, tone: 'bad' }
}

// ── Main view ─────────────────────────────────────────────────

interface ViewProps {
  variant: HistoryVariant
  orgId: string
}

export function HistoryView({ variant, orgId }: ViewProps) {
  const state = useHistoryFilters(variant, orgId)
  const meta = VARIANT_META[variant]
  const [pdfLoading, setPdfLoading] = useState(false)
  const [dateAnchor, setDateAnchor] = useState<HTMLElement | null>(null)
  const [reportAnchor, setReportAnchor] = useState<HTMLElement | null>(null)
  const { enqueueSnackbar } = useSnackbar()

  const stats = useMemo(() => state.query.data ? buildStats(state.query.data.items) : null, [state.query.data])
  const prevStats = useMemo(() => state.previousQuery.data ? buildStats(state.previousQuery.data.items) : null, [state.previousQuery.data])

  // generateReport sets this. The effect below watches for query.data
  // matching the requested period and fires the PDF once. Replaces an
  // earlier setTimeout(600) hack that produced stale-period PDFs on
  // slow networks. The export-ready check waits for: (a) the period
  // is the one we asked for, (b) the previous-period query has
  // resolved (so PDF can include vs-prev deltas).
  const [pendingTemplate, setPendingTemplate] = useState<AuditPeriod | null>(null)

  const observedDomains = useMemo(() => {
    if (!state.query.data) return [] as string[]
    const set = new Set<string>()
    for (const it of state.query.data.items) {
      if (it.domain) set.add(it.domain)
    }
    return Array.from(set).sort()
  }, [state.query.data])

  const exportPdf = async (template: 'window' | AuditPeriod = 'window') => {
    if (!state.query.data || pdfLoading || !stats) return
    setPdfLoading(true)
    try {
      const html = buildHistoryReportHtml({
        title: meta.title,
        subtitle: meta.subtitle,
        variant,
        footerStyle: meta.pdfFooterStyle,
        windowLabel: state.windowLabel,
        domainFilter: state.domain,
        searchQ: state.q,
        activeKinds: state.kinds,
        items: state.query.data.items,
        stats,
        prevStats,
        prevItems: state.previousQuery.data?.items,
        prevLabel: state.periodWindows?.previous.label,
        template,
      })
      const blob = await renderHtmlToPdf(orgId, html)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const slug = template === 'window' ? state.windowLabel.replace(/\s+/g, '-').toLowerCase() : template
      a.download = `${variant}-${slug}-report-${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      enqueueSnackbar(t('history.pdfDownloaded'), { variant: 'success' })
    } catch (err) {
      console.error('history PDF export failed', err)
      enqueueSnackbar(t('history.pdfError'), { variant: 'error' })
    } finally {
      setPdfLoading(false)
    }
  }

  // Report menu — picks the period AND queues PDF generation. The
  // PDF fires from a useEffect once query.data reflects the new
  // period (instead of a hard-coded delay).
  const generateReport = (period: AuditPeriod) => {
    setReportAnchor(null)
    state.setPeriod(period)
    setPendingTemplate(period)
  }

  // Fire PDF once data lines up with the requested template.
  useEffect(() => {
    if (!pendingTemplate || !stats) return
    // Wait until the requested period is the active one. After
    // setPeriod the query refetches with a new key, so we know data
    // matches when state.period === pendingTemplate AND the query
    // is no longer loading.
    if (state.period !== pendingTemplate) return
    if (state.query.isFetching) return
    // Prev-period query is also needed for the comparison table —
    // hold the report until it lands, but don't block on errors.
    if (state.previousQuery.isFetching) return
    void exportPdf(pendingTemplate)
    setPendingTemplate(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTemplate, state.period, state.query.isFetching, state.previousQuery.isFetching, stats])

  return (
    <div
      className="exp-root"
      style={{ '--exp-accent': meta.accent, '--exp-accent-end': meta.accentEnd } as React.CSSProperties}
    >
      {/* Header */}
      <div className="exp-header">
        <div
          className="exp-header-icon"
          // audit (engineer) view carries the section.history amber accent so
          // it reads as the same page as its manager counterpart. Hue-only
          // tint over the theme surface — dual-mode safe.
          style={variant === 'audit'
            ? { color: colors.section.history, background: `${colors.section.history}1f`, borderColor: `${colors.section.history}40` }
            : undefined}
        >
          <History size={20} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="exp-header-title">{meta.title}</div>
          <div className="exp-header-sub">{meta.subtitle}</div>
        </div>
        {state.query.data && <span className="exp-count">{state.query.data.count}</span>}

        {/* Generate Report dropdown */}
        <Button
          variant="contained"
          size="small"
          startIcon={<FileText size={13} />}
          endIcon={<ChevronDown size={12} />}
          onClick={e => setReportAnchor(e.currentTarget)}
          disabled={pdfLoading || !state.query.data}
          sx={{
            ml: 1,
            textTransform: 'none', fontWeight: 700, fontSize: 12,
            background: 'linear-gradient(135deg, var(--exp-accent), var(--exp-accent-end))',
            color: '#fff',
            '&:hover': { filter: 'brightness(0.9)' },
          }}
        >
          {pdfLoading ? t('history.generating') : t('history.generateReport')}
        </Button>
        <Menu
          anchorEl={reportAnchor}
          open={!!reportAnchor}
          onClose={() => setReportAnchor(null)}
          MenuListProps={{ dense: true }}
        >
          <MenuItem onClick={() => generateReport('week')}>{t('history.weeklyReport')}</MenuItem>
          <MenuItem onClick={() => generateReport('month')}>{t('history.monthlyReport')}</MenuItem>
          <MenuItem onClick={() => generateReport('quarter')}>{t('history.quarterlyReport')}</MenuItem>
          <MenuItem onClick={() => generateReport('year')}>{t('history.annualReport')}</MenuItem>
          <MenuItem onClick={() => { setReportAnchor(null); void exportPdf('window') }}>
            {t('history.currentWindowReport')}
          </MenuItem>
        </Menu>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', flex: 'none' }}>
        <ToggleButtonGroup
          size="small"
          value={state.period ? '' : (state.customRange ? '' : state.since)}
          exclusive
          onChange={(_, v) => { if (v) { state.setSince(v) } }}
          sx={toggleSx}
        >
          {SINCE_PRESETS.map(o => (
            <ToggleButton key={o.value} value={o.value}>{o.label}</ToggleButton>
          ))}
        </ToggleButtonGroup>

        {/* Audit-cycle chips — sibling row alongside the day-based presets. */}
        <ToggleButtonGroup
          size="small"
          value={state.period || ''}
          exclusive
          onChange={(_, v) => { if (v) state.setPeriod(v as AuditPeriod) }}
          sx={toggleSx}
        >
          {AUDIT_PERIODS.map(o => (
            <ToggleButton key={o.value} value={o.value}>{o.label}</ToggleButton>
          ))}
        </ToggleButtonGroup>

        {state.periodWindows && (
          <Chip
            size="small"
            label={state.periodWindows.current.label}
            onDelete={() => state.clearPeriod()}
            sx={{
              height: 24, fontSize: 13, fontWeight: 600,
              bgcolor: 'rgba(167,139,250,0.12)', color: 'var(--exp-accent)',
              '& .MuiChip-deleteIcon': { color: 'var(--exp-accent)', fontSize: 14 },
            }}
          />
        )}

        <Button
          size="small"
          startIcon={<CalendarDays size={13} />}
          variant={state.customRange ? 'contained' : 'outlined'}
          onClick={e => setDateAnchor(e.currentTarget)}
          sx={{
            textTransform: 'none', fontSize: 12, fontWeight: 600,
            borderColor: 'rgba(148,163,184,0.2)',
            color: state.customRange ? '#fff' : 'var(--color-text-secondary)',
            ...(state.customRange && { bgcolor: 'var(--exp-accent)', boxShadow: 'none', '&:hover': { bgcolor: '#8b5cf6', boxShadow: 'none' } }),
          }}
        >
          {state.customRange ? `${state.from} → ${state.to}` : t('history.customRange')}
        </Button>

        <Popover
          open={!!dateAnchor}
          anchorEl={dateAnchor}
          onClose={() => setDateAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        >
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 220 }}>
            <TextField size="small" type="date" label={t('history.from')}
              value={state.from} onChange={e => state.setFrom(e.target.value)}
              InputLabelProps={{ shrink: true }} />
            <TextField size="small" type="date" label={t('history.to')}
              value={state.to} onChange={e => state.setTo(e.target.value)}
              InputLabelProps={{ shrink: true }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <Button size="small" onClick={() => { state.setFrom(''); state.setTo(''); setDateAnchor(null) }} sx={{ textTransform: 'none' }}>
                {t('history.clear')}
              </Button>
              <Button size="small" variant="contained"
                onClick={() => { state.setCustomRange(state.from, state.to); setDateAnchor(null) }}
                disabled={!state.from || !state.to} sx={{ textTransform: 'none' }}>
                {t('history.apply')}
              </Button>
            </div>
          </div>
        </Popover>

        <TextField
          size="small"
          placeholder={t('history.domainFilter')}
          value={state.domain}
          onChange={e => state.setDomain(e.target.value)}
          inputProps={{ list: `history-domain-options-${variant}` }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><Globe size={13} /></InputAdornment>,
            endAdornment: state.domain && (
              <IconButton
                size="small"
                onClick={() => state.setDomain('')}
                aria-label={t('common.clear')}
                title={t('common.clear')}
                sx={{ p: 0.25 }}
              >
                <X size={12} />
              </IconButton>
            ),
            sx: { fontSize: 12 },
          }}
          sx={{ minWidth: 160, '& .MuiInputBase-root': { height: 32 } }}
        />
        <datalist id={`history-domain-options-${variant}`}>
          {observedDomains.map(d => <option key={d} value={d} />)}
        </datalist>

        <TextField
          size="small"
          placeholder={t('history.searchPlaceholder')}
          value={state.q}
          onChange={e => state.setQ(e.target.value)}
          InputProps={{
            startAdornment: <InputAdornment position="start"><Search size={13} /></InputAdornment>,
            endAdornment: state.q && (
              <IconButton
                size="small"
                onClick={() => state.setQ('')}
                aria-label={t('common.clear')}
                title={t('common.clear')}
                sx={{ p: 0.25 }}
              >
                <X size={12} />
              </IconButton>
            ),
            sx: { fontSize: 12 },
          }}
          sx={{ minWidth: 200, flex: 1, '& .MuiInputBase-root': { height: 32 } }}
        />

        <KindFilters kinds={state.defaultKinds} active={state.kinds} onChange={state.setKinds} />
      </div>

      {/* Loading / error / empty */}
      {state.query.isLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '24px 0', color: 'var(--color-text-secondary)' }}>
          <CircularProgress size={16} />
          <span style={{ fontSize: 12 }}>{t('history.loading')}</span>
        </div>
      )}
      {state.query.isError && (
        <Alert severity="error" sx={{ fontSize: '0.85rem' }}>
          {state.query.error instanceof Error ? state.query.error.message : String(state.query.error)}
        </Alert>
      )}
      {state.query.data && state.query.data.items.length === 0 && (
        <div style={{
          flex: 1, display: 'grid', placeItems: 'center', minHeight: 0,
          color: 'var(--color-text-tertiary)',
        }}>
          <div style={{ textAlign: 'center', padding: 24 }}>
            <History size={28} style={{ opacity: 0.4 }} />
            <div style={{ marginTop: 8, fontSize: 13 }}>
              {t('history.empty')}
            </div>
          </div>
        </div>
      )}

      {state.query.data && stats && state.query.data.items.length > 0 && (
        <div
          className="history-evidence-grid"
          style={{
            flex: 1, minHeight: 0,
          }}
        >
          <Block gridArea="supportStrip" dense>
            <MiniSection label={t('history.composition')}>
              <CompositionBars items={state.query.data.items} />
            </MiniSection>
          </Block>

          <Block gridArea="pillStrip" dense>
            <KPIPills
              stats={stats}
              prevStats={prevStats}
              periodLabel={state.periodWindows?.current.label ?? state.windowLabel}
              prevPeriodLabel={state.periodWindows?.previous.label}
            />
          </Block>

          <Block accent gridArea="hero" title={t('history.sectionScore')}>
            <div style={{ height: '100%', minHeight: 0 }}>
              <ScoreSparkline items={state.query.data.items} />
            </div>
          </Block>

          <JellyCard delay={0} noHover style={{ gridArea: 'timeline', display: 'flex', minHeight: 0 }}>
          <Block gridArea="timeline" title={t('history.timelineLabel')}>
            <div
              className="exp-scroll"
              style={{
                position: 'relative',
                paddingLeft: 30,
                overflowY: 'auto',
                height: '100%',
              }}
            >
              <div
                aria-hidden
                style={{
                  position: 'absolute', left: 14, top: 6, bottom: 6, width: 2,
                  background: 'rgba(148,163,184,0.18)',
                }}
              />
              {state.query.data.items.map((it, index) => (
                <FeedRow
                  key={`${it.kind}:${it.recorded_at}:${it.alert_id || it.repo_id || it.project_id || it.asset_id || 'event'}:${index}`}
                  item={it}
                  currentVariant={variant}
                  onSetDomain={state.setDomain}
                  onNavigateToOtherPillar={dispatchSectionChange}
                />
              ))}
            </div>
          </Block>
          </JellyCard>
        </div>
      )}
    </div>
  )
}

const toggleSx = {
  '& .MuiToggleButton-root': {
    textTransform: 'none', px: 1.5, py: 0.25, fontSize: 12, fontWeight: 600,
    borderColor: 'rgba(148,163,184,0.2)', color: 'var(--color-text-secondary)',
    '&.Mui-selected': {
      bgcolor: 'rgba(167,139,250,0.12)', color: 'var(--exp-accent)', borderColor: 'var(--exp-accent)',
    },
  },
} as const

// ── Subcomponents ─────────────────────────────────────────────

function Block({
  title, children, accent, gridArea, dense,
}: {
  title?: string
  children: React.ReactNode
  accent?: boolean
  gridArea?: string
  dense?: boolean
}) {
  return (
    <div
      className={`exp-card${accent ? ' exp-card-accent' : ''}`}
      style={{
        gridArea,
        display: 'flex', flexDirection: 'column',
        minHeight: 0, overflow: 'hidden',
      }}
    >
      {!dense && title && <div className="exp-card-head">{title}</div>}
      <div style={{ flex: 1, minHeight: 0, padding: dense ? 10 : 14, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

function MiniSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
      <div style={{
        fontSize: 12, letterSpacing: 1, textTransform: 'uppercase',
        color: 'var(--color-text-tertiary)', fontWeight: 700,
      }}>{label}</div>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  )
}

function KPIPills({
  stats, prevStats, periodLabel, prevPeriodLabel,
}: {
  stats: Stats
  prevStats: Stats | null
  periodLabel: string
  prevPeriodLabel?: string
}) {
  const hasPrev = !!prevStats && !!prevPeriodLabel
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <Pill
        label={t('history.kpi.events')}
        value={stats.total}
        sub={periodLabel}
        delta={hasPrev ? deltaLabel(stats.total, prevStats!.total) : undefined}
        deltaSub={hasPrev ? `vs ${prevPeriodLabel}` : undefined}
      />
      <Pill
        label={t('history.kpi.scoreChange')}
        value={stats.lastScore > 0 ? (stats.scoreDelta >= 0 ? `+${stats.scoreDelta}` : `${stats.scoreDelta}`) : '—'}
        sub={stats.lastScore > 0 ? `now ${stats.lastScore}` : ''}
        tone={stats.lastScore === 0 ? undefined : stats.scoreDelta > 0 ? 'good' : stats.scoreDelta < 0 ? 'bad' : undefined}
        icon={stats.scoreDelta > 0 ? TrendingUp : stats.scoreDelta < 0 ? TrendingDown : undefined}
        delta={hasPrev && stats.lastScore > 0 && prevStats!.lastScore > 0
          ? scoreDeltaLabel(stats.lastScore, prevStats!.lastScore)
          : undefined}
        deltaSub={hasPrev ? `vs prev` : undefined}
      />
      <Pill
        label={t('history.kpi.daysActive')}
        value={stats.days}
        sub="days"
        icon={Activity}
      />
      <Pill
        label={t('history.kpi.critHigh')}
        value={stats.critHigh}
        sub={stats.critHigh > 0 ? 'attn.' : 'clean'}
        tone={stats.critHigh > 0 ? 'bad' : 'good'}
        icon={stats.critHigh > 0 ? AlertTriangle : undefined}
        delta={hasPrev ? deltaLabel(stats.critHigh, prevStats!.critHigh) : undefined}
        deltaSub={hasPrev ? `vs prev` : undefined}
      />
      <Pill
        label={t('history.kpi.slaBreaches')}
        value={stats.slaBreaches}
        sub={stats.slaBreaches > 0 ? 'over SLA' : 'on track'}
        tone={stats.slaBreaches > 0 ? 'bad' : 'good'}
        icon={stats.slaBreaches > 0 ? AlertTriangle : undefined}
        delta={hasPrev ? deltaLabel(stats.slaBreaches, prevStats!.slaBreaches) : undefined}
        deltaSub={hasPrev ? `vs prev` : undefined}
      />
    </div>
  )
}

function Pill({
  label, value, sub, tone, icon: Icon, delta, deltaSub,
}: {
  label: string
  value: string | number
  sub?: string
  tone?: 'good' | 'bad'
  icon?: typeof TrendingUp
  delta?: { text: string; tone: 'good' | 'bad' | 'neutral' }
  deltaSub?: string
}) {
  const color = tone === 'good' ? '#22c55e' : tone === 'bad' ? '#ef4444' : 'var(--color-text-primary)'
  const deltaColor = delta?.tone === 'good' ? '#22c55e' : delta?.tone === 'bad' ? '#ef4444' : 'var(--color-text-tertiary)'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 10px', borderRadius: 8,
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      flex: 1, minWidth: 120,
    }}>
      {Icon && <Icon size={13} color={tone === 'good' ? '#22c55e' : tone === 'bad' ? '#ef4444' : 'currentColor'} style={{ opacity: 0.8, flexShrink: 0 }} />}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--color-text-tertiary)', fontWeight: 700 }}>
          {label}
        </div>
        {sub && (
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', opacity: 0.6, lineHeight: 1, marginTop: 2 }}>
            {sub}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          {value}
        </div>
        {delta && (
          <div style={{
            fontSize: 12, lineHeight: 1.1, marginTop: 2,
            color: deltaColor, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
          }}
            title={deltaSub || ''}
          >
            {delta.text}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Public wrappers ───────────────────────────────────────────

export function AuditTimelineView({ orgId }: { orgId: string }) {
  return <HistoryView variant="audit" orgId={orgId} />
}

export function CodeActivityView({ orgId }: { orgId: string }) {
  return <HistoryView variant="code" orgId={orgId} />
}

// Legacy aliases — kept until every importer flips over.
export const CTEMHistoryView = AuditTimelineView
export const VAHistoryView = CodeActivityView
