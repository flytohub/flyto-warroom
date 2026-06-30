// historyReport.ts — PDF-bound HTML builder for the History view.
//
// Extracted from HistoryFeedView.tsx (2026-05-19) because the report
// renderer was ~430 lines of string concatenation living next to a
// ~660-line React component, blowing the file past 1100 lines and
// burying the actual UI under PDF css. The render is pure data → HTML
// string (no JSX, no React state), so it lives as a plain .ts module.
//
// Inputs come from useHistoryFilters + the view's local state and get
// piped to engine's renderHtmlToPdf() via the "Generate Report"
// dropdown. All English copy is intentional — the PDF is for auditor
// / sprint-report consumers and stays English-only by design.

import type { FeedKind, FeedItem } from '@lib/engine'
import type { HistoryVariant } from './useHistoryFilters'
import type { AuditPeriod } from './periodHelpers'

// ── Stats shape ───────────────────────────────────────────────
// Computed once from the visible feed items + consumed by both the
// in-view KPI tiles and the PDF summary cards. Co-located here
// because the PDF is the heavier reader of these fields.

export interface Stats {
  total: number
  days: number
  scoreDelta: number
  lastScore: number
  critHigh: number
  slaBreaches: number
  opened: number
  resolved: number
}

// TODO(backend-truth, M14): this entire stats aggregation should
// land server-side — the audit-PDF endpoint should return a
// `summary: Stats` payload alongside `items[]` so the client
// renders without downloading 1000s of feed events just to count
// them. Same for the HTML section assembly further down. See
// FRONTEND_LOGIC_AUDIT_2026_05_24.md#M14 + M15
export function buildStats(items: FeedItem[]): Stats {
  const scores = items
    .filter(i => i.kind === 'score' && typeof i.payload?.score === 'number')
    .map(i => Number(i.payload!.score))
  const firstScore = scores.length > 0 ? scores[scores.length - 1] : 0
  const lastScore = scores.length > 0 ? scores[0] : 0
  const scoreDelta = lastScore - firstScore
  const byDay: Record<string, number> = {}
  for (const i of items) {
    const d = i.recorded_at.slice(0, 10)
    byDay[d] = (byDay[d] ?? 0) + 1
  }
  const critHigh = items.filter(i => i.severity === 'critical' || i.severity === 'high').length
  const slaBreaches = items.filter(i => i.kind === 'sla_breach').length
  let opened = 0
  let resolved = 0
  for (const it of items) {
    if (it.kind !== 'alert') continue
    const status = (it.payload?.status as string) || ''
    if (status === 'resolved' || status === 'closed') resolved++
    else opened++
  }
  return {
    total: items.length,
    days: Object.keys(byDay).length,
    scoreDelta,
    lastScore,
    critHigh,
    slaBreaches,
    opened,
    resolved,
  }
}

// ── Report args ───────────────────────────────────────────────

export interface ReportArgs {
  title: string
  subtitle: string
  variant: HistoryVariant
  footerStyle: 'compliance' | 'sprint'
  windowLabel: string
  domainFilter: string
  searchQ: string
  activeKinds: FeedKind[]
  items: FeedItem[]
  stats: Stats
  prevStats: Stats | null
  prevItems?: FeedItem[]
  prevLabel?: string
  /** Which density template to render. `window` = honour current
   *  filter window. `week/month/quarter/year` adjust the cover page +
   *  comparison framing for that cadence. */
  template: 'window' | AuditPeriod
}

// ── Top-level builder ─────────────────────────────────────────

export function buildHistoryReportHtml(args: ReportArgs): string {
  const { title, variant, footerStyle, items, stats, prevStats, prevLabel, template } = args
  const date = new Date().toLocaleString()

  // Template-specific cover badge + executive blurb.
  const templateBadge = (() => {
    switch (template) {
      case 'week':    return { badge: 'Weekly report',    blurb: 'Compact 1-page summary of this week\'s audit-relevant activity.' }
      case 'month':   return { badge: 'Monthly report',   blurb: 'Month-over-month comparison and per-category drill-down.' }
      case 'quarter': return { badge: 'Quarterly report', blurb: 'Quarter-over-quarter comparison with score sub-vector breakdown and SLA detail.' }
      case 'year':    return { badge: 'Annual report',    blurb: 'Year-over-year comparison plus full timeline. Long-form for executive board review.' }
      default:        return { badge: 'Custom window',    blurb: 'Filtered timeline export for the selected date range.' }
    }
  })()

  const rows = items.map(rowHtml).join('')
  const summaryCards = summaryCardsHtml(stats, prevStats, prevLabel)
  const comparisonBlock = (prevStats && prevLabel)
    ? comparisonBlockHtml(stats, prevStats, prevLabel)
    : ''
  const slaSection = slaSectionHtml(items)
  // Score-reason summary is more useful in monthly+ reports.
  const reasonsBlock = template === 'week' ? '' : reasonsBlockHtml(items)
  const yoyBlock = template === 'year' || template === 'quarter'
    ? `<div class="callout">Year/quarter-over-year score change ${prevStats && prevStats.lastScore > 0 ? ((stats.lastScore - prevStats.lastScore) >= 0 ? '+' : '') + (stats.lastScore - prevStats.lastScore) : '—'} (${stats.lastScore} now / ${prevStats?.lastScore ?? '—'} prev).</div>`
    : ''
  const footer = footerHtml(footerStyle, stats, date)

  // Cover meta grid — period · window · filters · audience. Same
  // pattern as report_engine.go puts under the gradient title band
  // so all Flyto PDFs feel like the same product.
  const metaGrid = `
    <div class="cover-meta-grid">
      <div class="cover-meta-item">
        <div class="cover-meta-label">Period</div>
        <div class="cover-meta-value">${escapeHtml(args.windowLabel)}</div>
      </div>
      <div class="cover-meta-item">
        <div class="cover-meta-label">Generated</div>
        <div class="cover-meta-value">${escapeHtml(date)}</div>
      </div>
      <div class="cover-meta-item">
        <div class="cover-meta-label">Kinds</div>
        <div class="cover-meta-value">${escapeHtml(args.activeKinds.join(', '))}</div>
      </div>
      <div class="cover-meta-item">
        <div class="cover-meta-label">Total events</div>
        <div class="cover-meta-value">${stats.total}</div>
      </div>
      ${args.domainFilter ? `
        <div class="cover-meta-item">
          <div class="cover-meta-label">Domain filter</div>
          <div class="cover-meta-value">${escapeHtml(args.domainFilter)}</div>
        </div>` : ''}
      ${args.searchQ ? `
        <div class="cover-meta-item">
          <div class="cover-meta-label">Search</div>
          <div class="cover-meta-value">${escapeHtml(args.searchQ)}</div>
        </div>` : ''}
    </div>
  `

  const classBadge = footerStyle === 'compliance' ? 'CONFIDENTIAL · AUDIT EVIDENCE' : 'INTERNAL · SPRINT REPORT'
  const classCls = footerStyle === 'compliance' ? 'cover-class-confidential' : 'cover-class-internal'

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${pdfCss(variant)}</style>
</head>
<body>
  <!-- ── Full-page cover ─────────────────────────────────── -->
  <div class="cover">
    <div class="cover-header">
      <div class="cover-header-brand">Warroom · ${variant === 'audit' ? 'CTEM' : 'Code Security'}</div>
      <div class="cover-header-badge">${escapeHtml(templateBadge.badge)}</div>
      <div class="cover-header-title">${escapeHtml(title)}</div>
      <div class="cover-header-desc">${escapeHtml(templateBadge.blurb)}</div>
      <div class="cover-header-line"></div>
    </div>
    <div class="cover-body">
      ${metaGrid}
      <div class="cover-class ${classCls}">${classBadge}</div>
      <div class="cover-scope">
        <strong>Scope.</strong> This report extracts every event from the org's
        history-feed that matched the filters above. Timeline rows below are
        chronologically ordered, newest first. SLA breach rows reflect issues
        that exceeded their severity-specific remediation window
        (${stats.slaBreaches} in this period).
        ${footerStyle === 'compliance'
          ? ` Underlying records are hash-chained — auditor can request the
              SHA-256 chain via <code>GET /api/v1/audit?verify=true</code>.`
          : ` Open vs Resolved totals — ${stats.opened} opened / ${stats.resolved} resolved · net ${(stats.resolved - stats.opened) >= 0 ? '−' : '+'}${Math.abs(stats.resolved - stats.opened)}.`}
      </div>
    </div>
    <div class="cover-footer">
      <span class="cover-footer-brand">FLYTO2</span>
      <span>${escapeHtml(date)}</span>
    </div>
  </div>

  <!-- ── Content pages ───────────────────────────────────── -->
  <div class="content">
    <h2>Executive summary</h2>
    ${summaryCards}
    ${yoyBlock}
    ${comparisonBlock}
    ${slaSection}
    ${reasonsBlock}

    <h2>Timeline (${stats.total} events)</h2>
    <table>
      <thead><tr><th>Time</th><th>Kind</th><th>Severity</th><th>Domain</th><th>Detail</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5" style="text-align: center; color: #999; padding: 24px;">No events in this window.</td></tr>`}</tbody>
    </table>

    ${footer}
  </div>
</body>
</html>`
}

// ── HTML fragment builders ────────────────────────────────────

function rowHtml(it: FeedItem): string {
  const sev = it.kind === 'sla_breach' ? 'critical' : (it.severity ?? '')
  const sevCls = sev ? `sev-${sev}` : ''
  const reasons = (it.payload?.reasons ?? []) as Array<{ kind: string; title: string; severity: string }>
  return `
    <tr class="${sevCls}">
      <td class="cell-time">${escapeHtml(formatIso(it.recorded_at))}</td>
      <td class="cell-kind"><span class="kind kind-${escapeHtml(it.kind)}">${escapeHtml(labelForKind(it.kind))}</span></td>
      <td class="cell-sev">${sev ? `<span class="sev sev-${escapeHtml(sev)}">${escapeHtml(sev)}</span>` : ''}</td>
      <td class="cell-domain">${it.domain ? escapeHtml(it.domain) : ''}</td>
      <td class="cell-title">
        <div class="row-title">${escapeHtml(it.title)}</div>
        ${it.summary ? `<div class="row-summary">${escapeHtml(it.summary)}</div>` : ''}
        ${reasons.length > 0 ? `
          <ul class="row-reasons">
            ${reasons.map(r => `<li>${escapeHtml(r.kind === 'sla_breach' ? 'SLA · ' : '')}${escapeHtml(r.title)}${r.severity && r.kind !== 'sla_breach' ? ` (${escapeHtml(r.severity)})` : ''}</li>`).join('')}
          </ul>
        ` : ''}
      </td>
    </tr>
  `
}

function summaryCardsHtml(stats: Stats, prev: Stats | null, prevLabel?: string): string {
  const card = (label: string, value: string | number, tone: 'good' | 'bad' | '' = '', deltaText?: string, deltaTone?: 'good' | 'bad' | 'neutral') => `
    <div class="card ${tone}">
      <div class="label">${escapeHtml(label)}</div>
      <div class="value">${escapeHtml(String(value))}</div>
      ${deltaText ? `<div class="delta delta-${deltaTone}">${escapeHtml(deltaText)}${prevLabel ? ` vs ${escapeHtml(prevLabel)}` : ''}</div>` : ''}
    </div>`

  const eventsDelta = prev ? formatDelta(stats.total - prev.total) : undefined
  const eventsTone = prev ? (stats.total > prev.total ? 'bad' : stats.total < prev.total ? 'good' : 'neutral') : undefined
  const slaDelta = prev ? formatDelta(stats.slaBreaches - prev.slaBreaches) : undefined
  const slaTone = prev ? (stats.slaBreaches > prev.slaBreaches ? 'bad' : stats.slaBreaches < prev.slaBreaches ? 'good' : 'neutral') : undefined
  const critDelta = prev ? formatDelta(stats.critHigh - prev.critHigh) : undefined
  const critTone = prev ? (stats.critHigh > prev.critHigh ? 'bad' : stats.critHigh < prev.critHigh ? 'good' : 'neutral') : undefined

  return `
    <div class="summary">
      ${card('Events', stats.total, '', eventsDelta, eventsTone)}
      ${card('Active days', stats.days)}
      ${card('Score Δ',
        stats.lastScore > 0 ? (stats.scoreDelta >= 0 ? '+' : '') + stats.scoreDelta : '—',
        stats.scoreDelta > 0 ? 'good' : stats.scoreDelta < 0 ? 'bad' : '')}
      ${card('Crit / High', stats.critHigh, stats.critHigh > 0 ? 'bad' : 'good', critDelta, critTone)}
      ${card('SLA breaches', stats.slaBreaches, stats.slaBreaches > 0 ? 'bad' : 'good', slaDelta, slaTone)}
    </div>`
}

function comparisonBlockHtml(curr: Stats, prev: Stats, prevLabel: string): string {
  const rowsHtml = [
    ['Events',       curr.total, prev.total],
    ['Crit / High',  curr.critHigh, prev.critHigh],
    ['SLA breaches', curr.slaBreaches, prev.slaBreaches],
    ['Score',        curr.lastScore, prev.lastScore],
    ['Active days',  curr.days, prev.days],
  ].map(([label, c, p]) => {
    const diff = (c as number) - (p as number)
    const sign = diff > 0 ? '+' : ''
    return `<tr><td>${escapeHtml(String(label))}</td><td>${p}</td><td>${c}</td><td class="delta-${diff > 0 ? 'bad' : diff < 0 ? 'good' : 'neutral'}">${sign}${diff}</td></tr>`
  }).join('')

  return `
    <h2>Period comparison</h2>
    <table class="comparison">
      <thead><tr><th>Metric</th><th>${escapeHtml(prevLabel)}</th><th>This period</th><th>Δ</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`
}

function slaSectionHtml(items: FeedItem[]): string {
  const slas = items.filter(i => i.kind === 'sla_breach')
  if (slas.length === 0) return ''
  const rows = slas.map(s => {
    const hours = s.payload?.sla_hours
    const orig = s.payload?.original_severity
    return `<tr>
      <td>${escapeHtml(formatIso(s.recorded_at))}</td>
      <td>${escapeHtml(s.domain ?? '')}</td>
      <td>${escapeHtml(s.payload?.category as string ?? '')}</td>
      <td>${escapeHtml(orig as string ?? '')}</td>
      <td>${escapeHtml(String(hours ?? ''))}h</td>
    </tr>`
  }).join('')
  return `
    <h2>SLA breaches in this period (${slas.length})</h2>
    <table>
      <thead><tr><th>Breached at</th><th>Domain</th><th>Category</th><th>Severity</th><th>SLA</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`
}

function reasonsBlockHtml(items: FeedItem[]): string {
  const score = items.filter(i => i.kind === 'score' && (i.payload?.reasons as unknown[] | undefined)?.length)
  if (score.length === 0) return ''
  const rows = score.slice(0, 10).map(s => {
    const rs = (s.payload?.reasons ?? []) as Array<{ kind: string; title: string; severity: string }>
    return `<tr>
      <td>${escapeHtml(formatIso(s.recorded_at))}</td>
      <td>${escapeHtml(s.title)}</td>
      <td>${rs.map(r => `<div class="row-reason">${escapeHtml(r.title)}${r.severity ? ` (${escapeHtml(r.severity)})` : ''}</div>`).join('')}</td>
    </tr>`
  }).join('')
  return `
    <h2>Score movements with co-incident causes</h2>
    <table>
      <thead><tr><th>When</th><th>Score event</th><th>Likely contributing events (±12h)</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`
}

function footerHtml(style: 'compliance' | 'sprint', stats: Stats, date: string): string {
  if (style === 'compliance') {
    return `<div class="footer">
      <div><strong>Warroom · Compliance evidence</strong></div>
      <div>This timeline is a chronological extract of the org's audit-relevant events for the period stated above. SHA-256 hashes of underlying records are available via the audit-chain endpoint on request.</div>
      <div>Generated ${escapeHtml(date)}</div>
    </div>`
  }
  const netBacklog = stats.resolved - stats.opened
  return `<div class="footer">
    <div><strong>Warroom · Sprint activity</strong></div>
    <div>Open vs Resolved totals for the period: ${stats.opened} opened / ${stats.resolved} resolved · net ${netBacklog >= 0 ? `−${netBacklog}` : `+${Math.abs(netBacklog)}`}.</div>
    <div>Generated ${escapeHtml(date)}</div>
  </div>`
}

function pdfCss(variant: HistoryVariant): string {
  // Two accent palettes — audit (violet) and code (cyan). Gradient
  // colours duplicated from report_engine.go so every Flyto PDF
  // (exec report, va report, audit report) presents as the same brand.
  const accent     = variant === 'audit' ? '#8b5cf6' : '#0891b2'
  const accentSoft = variant === 'audit' ? '#f3f0fb' : '#ecfeff'
  const gradient   = variant === 'audit'
    ? 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)'
    : 'linear-gradient(135deg, #083344 0%, #155e75 50%, #0e7490 100%)'
  return `
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0; padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 12px; line-height: 1.55; color: #1a1a1a;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  @page { margin: 14mm 12mm; }

  /* ── Full-page cover ────────────────────────────────── */
  .cover {
    min-height: 100vh;
    page-break-after: always;
    position: relative;
    display: flex; flex-direction: column;
    margin: -14mm -12mm 0;  /* extend cover past @page margins */
  }
  .cover-header {
    background: ${gradient};
    color: #fff; padding: 60px 48px 48px;
    flex: none;
  }
  .cover-header-brand {
    font-size: 11pt; font-weight: 700;
    letter-spacing: 3px; text-transform: uppercase;
    opacity: 0.7; margin-bottom: 24px;
  }
  .cover-header-badge {
    display: inline-block; padding: 4px 12px;
    background: rgba(255,255,255,0.12);
    border: 1px solid rgba(255,255,255,0.25);
    border-radius: 999px;
    font-size: 9pt; font-weight: 700;
    text-transform: uppercase; letter-spacing: 1.2px;
    margin-bottom: 16px;
  }
  .cover-header-title {
    font-size: 28pt; font-weight: 900; line-height: 1.15;
    margin-bottom: 12px; letter-spacing: 0;
  }
  .cover-header-desc {
    font-size: 11pt; opacity: 0.85;
    max-width: 540px; line-height: 1.6;
  }
  .cover-header-line {
    width: 60px; height: 3px; background: #fff;
    margin-top: 24px; border-radius: 2px; opacity: 0.6;
  }

  .cover-body {
    flex: 1;
    padding: 36px 48px;
    display: flex; flex-direction: column; gap: 24px;
  }
  .cover-meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px 32px;
    max-width: 520px;
  }
  .cover-meta-label {
    font-size: 7.5pt; font-weight: 700;
    text-transform: uppercase; letter-spacing: 1px;
    color: #9ca3af; margin-bottom: 2px;
  }
  .cover-meta-value {
    font-size: 10.5pt; font-weight: 600; color: #1a1a1a;
  }
  .cover-class {
    align-self: flex-start;
    display: inline-block; padding: 8px 20px;
    border: 2px solid; border-radius: 4px;
    font-size: 9pt; font-weight: 800; letter-spacing: 2px;
  }
  .cover-class-confidential { border-color: #dc2626; color: #dc2626; }
  .cover-class-internal     { border-color: #d97706; color: #d97706; }
  .cover-scope {
    padding: 16px 20px;
    background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px;
    font-size: 9pt; color: #4b5563; line-height: 1.7; max-width: 540px;
  }
  .cover-scope strong { color: #1a1a1a; }
  .cover-scope code {
    background: #eef2ff; color: ${accent};
    padding: 1px 5px; border-radius: 3px; font-size: 8.5pt;
  }
  .cover-footer {
    padding: 20px 48px;
    border-top: 1px solid #e5e7eb;
    display: flex; justify-content: space-between; align-items: center;
    font-size: 8pt; color: #9ca3af;
    flex: none;
  }
  .cover-footer-brand { font-weight: 700; color: ${accent}; letter-spacing: 2px; }

  /* ── Content pages ─────────────────────────────────── */
  .content { padding: 0 0 24px; }

  .summary { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin-bottom: 18px; }
  .summary .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 10px; background: #fafafa; }
  .summary .card .label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.8px; color: #999; font-weight: 700; }
  .summary .card .value { font-size: 18px; font-weight: 700; margin-top: 2px; color: #1a1a1a; }
  .summary .card .delta { font-size: 12px; font-weight: 700; margin-top: 2px; color: #888; }
  .summary .card.bad .value { color: #dc2626; } .summary .card.good .value { color: #16a34a; }
  .delta-bad { color: #dc2626; } .delta-good { color: #16a34a; } .delta-neutral { color: #888; }

  .callout { padding: 8px 12px; margin: 8px 0 12px; border-left: 3px solid ${accent};
    background: ${accentSoft}; color: #333; font-size: 12px; }

  h2 { font-size: 14px; font-weight: 800; margin: 18px 0 8px; color: #1a1a1a; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  thead th { background: #f4f4f5; padding: 6px 8px; text-align: left; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase; color: #666; font-weight: 700; border-bottom: 1px solid #d4d4d8; }
  tbody td { padding: 8px; vertical-align: top; border-bottom: 1px solid #f4f4f5; font-size: 12px; }
  table.comparison tbody td:last-child { font-weight: 700; font-variant-numeric: tabular-nums; }

  .cell-time { width: 80px; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12px; color: #555; }
  .cell-kind { width: 70px; } .cell-sev { width: 70px; }
  .cell-domain { width: 130px; color: #555; font-size: 12px; }
  .cell-title { min-width: 200px; }
  .row-title { font-weight: 600; color: #1a1a1a; }
  .row-summary { color: #666; font-size: 12px; margin-top: 2px; }
  .row-reasons { margin: 4px 0 0 12px; padding: 0; list-style: none; }
  .row-reasons li { font-size: 12px; color: #888; padding-left: 8px; border-left: 2px solid #d8d4f0; }
  .row-reason { font-size: 12px; color: #555; }

  .kind, .sev { display: inline-block; padding: 1px 6px; border-radius: 999px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
  .kind-scan { background: #cffafe; color: #0e7490; }
  .kind-pentest { background: #ffedd5; color: #c2410c; }
  .kind-score { background: #ede9fe; color: #6d28d9; }
  .kind-alert { background: #fee2e2; color: #b91c1c; }
  .kind-asset { background: #cffafe; color: #0891b2; }
  .kind-sla_breach { background: #fee2e2; color: #991b1b; }
  .sev-critical { background: #fee2e2; color: #991b1b; }
  .sev-high { background: #ffedd5; color: #9a3412; }
  .sev-medium { background: #fef3c7; color: #854d0e; }
  .sev-low { background: #dbeafe; color: #1e40af; }

  .footer { margin-top: 18px; padding: 10px 0; border-top: 1px solid #e5e7eb;
    font-size: 12px; color: #666; }
  .footer strong { color: #333; }
  .footer > div { margin-bottom: 3px; }
  `
}

// ── Tiny utilities (HTML-string-only) ─────────────────────────

function formatDelta(d: number): string {
  if (d === 0) return '—'
  return d > 0 ? `+${d}` : `${d}`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function labelForKind(k: FeedKind | string): string {
  if (k === 'sla_breach') return 'SLA'
  return k
}

function formatIso(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toISOString().replace('T', ' ').slice(0, 16)
}
