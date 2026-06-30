/**
 * buildSections.ts — translate a `ReportTemplate` into the
 * `ReportSection[]` shape that backend `POST /reports/build` accepts.
 *
 * History: backend retired `POST /reports/generate` on 2026-05-24 and
 * replaced it with a registry-only `/reports/build` that re-fetched data
 * server-side. That broke every widget whose `data_source` the backend
 * didn't register (pulse, issues, JOINs, …). 2026-05-29 restored the
 * "frontend relays the data it already rendered" model: `/reports/build`
 * now accepts inline `rows`/`kpis`, and {@link computeWidgetExportData}
 * produces them from the rows the on-screen widget already fetched.
 *
 * Section shape decisions (mirrors `api/report_engine.go:ReportSection`):
 *   - text widgets        → { type: 'text',  content, text_style }
 *   - chart widgets       → { type: 'chart', chart_hint, image }
 *     (incl. gauge/radialBar — image-only path; `data_source` omitted so
 *      the backend embeds the captured screenshot verbatim)
 *   - kpi widgets         → { type: 'kpi',   kpis }   (inline, no source)
 *   - table widgets       → { type: 'table', rows, columns, max_rows }
 *                           (inline rows the frontend already has)
 *
 * Inline table/kpi sections carry NO `data_source`, so the backend skips
 * the registry fetch and the per-source access gate (safe: the data came
 * through authorized read endpoints to populate the widget). The only
 * widget that can't export is a genuinely unknown chart type, which
 * `partitionWidgetsBySupport` still flags for the blocking dialog.
 */

import type { ReportTemplate, DataWidgetConfig } from './types'

/** Backend-registered `data_source` IDs from `api/report_engine.go`
 *  `getDataSourceRegistry()`. Keep in lock-step — adding a source on
 *  the backend without updating this set will not break exports (just
 *  keeps the conservative blocking), but adding here without backend
 *  support WILL silently drop sections on render. */
export const BACKEND_SUPPORTED_SOURCES: ReadonlySet<string> = new Set([
  // Cross-surface / score
  'computed-score', 'score-history',
  // Code surface
  'health-summary', 'cve', 'alerts', 'repos', 'top-risks',
  // External surface
  'attack-surface', 'dast-findings', 'external-issues', 'ioc',
  'brand-protection', 'vendor-risk',
  // Cross-surface / catalog
  'compliance', 'ransomware', 'threat-actors', 'malware-families',
])

/** Map frontend `ChartType` to backend `chart_hint` enum. Returns
 *  'auto' for chart types backend doesn't speak directly (stacked-bar,
 *  area, treemap, heatmap, radialBar, gauge) — the image-only path
 *  means the hint is mostly cosmetic anyway. */
function backendChartHint(t: string): string {
  switch (t) {
    case 'donut':
    case 'bar':
    case 'line':
    case 'radar':
      return t
    default:
      return 'auto'
  }
}

const CHART_TYPES: ReadonlySet<string> = new Set([
  'donut', 'bar', 'stacked-bar', 'line', 'area',
  'radar', 'treemap', 'heatmap',
  // gauge / radialBar render as ApexRadialBar on screen — capture them
  // as images (the image-only path) rather than as KPI numbers so the
  // PDF matches what the user sees.
  'gauge', 'radialBar',
])
const KPI_TYPES: ReadonlySet<string> = new Set(['kpi'])

/** Classification used by the export blocker. */
export type WidgetSupport =
  | { ok: true; reason: 'text' | 'chart-image' | 'kpi' | 'table' }
  | { ok: false; reason: 'join-not-supported' | 'unsupported-source' | 'unknown-chart-type'; detail?: string }

export function classifyWidget(w: DataWidgetConfig): WidgetSupport {
  // Inline-data export (restored 2026-05-29): the frontend now relays
  // the rows/KPIs it already fetched for the on-screen widget, so a
  // widget is exportable regardless of whether its data_source is in
  // the backend registry. JOIN widgets are fine too — the frontend
  // computes the joined rows and sends them inline (the backend never
  // had to understand JOINs). The only thing we still can't render is
  // a chart type we don't recognise at all.
  if (w.chartType === 'text') {
    return { ok: true, reason: 'text' }
  }
  if (CHART_TYPES.has(w.chartType)) {
    // Chart widgets carry an image (frontend captures via
    // ApexCharts.exec('dataURI')) so they're embedded verbatim.
    return { ok: true, reason: 'chart-image' }
  }
  if (KPI_TYPES.has(w.chartType)) {
    return { ok: true, reason: 'kpi' }
  }
  if (w.chartType === 'table') {
    return { ok: true, reason: 'table' }
  }
  return { ok: false, reason: 'unknown-chart-type', detail: w.chartType }
}

export function isWidgetSupported(w: DataWidgetConfig): boolean {
  return classifyWidget(w).ok
}

/** Result of walking the template. `unsupported` carries one entry per
 *  blocked widget with a human-readable reason; the export handler
 *  renders these in the blocking dialog. */
export type UnsupportedReason = 'join-not-supported' | 'unsupported-source' | 'unknown-chart-type'

export interface PartitionResult {
  supported: DataWidgetConfig[]
  unsupported: Array<{
    widget: DataWidgetConfig
    sectionId: string
    title: string
    reason: UnsupportedReason
    detail?: string
  }>
}

export function partitionWidgetsBySupport(template: ReportTemplate): PartitionResult {
  const supported: DataWidgetConfig[] = []
  const unsupported: PartitionResult['unsupported'] = []
  for (const section of template.sections) {
    for (const w of section.widgets) {
      const cls = classifyWidget(w)
      if (cls.ok) {
        supported.push(w)
      } else {
        unsupported.push({
          widget: w,
          sectionId: section.id,
          title: w.title ?? w.titleKey ?? w.id,
          reason: cls.reason,
          detail: cls.detail,
        })
      }
    }
  }
  return { supported, unsupported }
}

/** Section descriptor mirroring backend `api/report_engine.go:ReportSection`. */
export interface BackendReportSection {
  title: string
  type: 'text' | 'chart' | 'kpi' | 'table'
  data_source?: string
  chart_hint?: string
  content?: string
  text_style?: string
  columns?: string[]
  max_rows?: number
  image?: string  // data:image/...;base64,... PNG
  // Inline data the frontend already fetched/computed for the widget.
  // When present the backend renders these verbatim and skips both the
  // data_source registry fetch AND the per-source access gate.
  rows?: Array<Record<string, unknown>>
  kpis?: Record<string, unknown>
}

/** Inline export payload produced by {@link computeWidgetExportData}. */
export interface WidgetExportData {
  chartImage?: string
  rows?: Array<Record<string, unknown>>
  columns?: string[]
  kpis?: Record<string, unknown>
}

function humanizeField(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/** Column selection mirroring `charts/DataTable.tsx` so the PDF table
 *  shows the same columns as the on-screen widget: explicit fields if
 *  the widget pins them, else auto-detected keys minus internal/object
 *  columns, finally dropping all-empty columns. */
export function tableColumns(rows: Array<Record<string, unknown>>, fields?: string[]): string[] {
  if (rows.length === 0) return fields ?? []
  const allCols = fields ?? Object.keys(rows[0]).filter(k => {
    if (k.startsWith('_') || k === 'id') return false
    const sample = rows.find(r => r[k] != null)?.[k]
    if (sample != null && typeof sample === 'object') return false
    return true
  })
  return allCols.filter(col => rows.some(row => row[col] != null && row[col] !== ''))
}

/** KPI value mirroring `charts/KPICard.tsx`: a pinned non-numeric string
 *  value passes through; a numeric valueField sums; no valueField counts
 *  rows. Returns the single label→value pair the backend renders as a
 *  KPI card. */
function kpiData(widget: DataWidgetConfig, rows: Array<Record<string, unknown>>): Record<string, unknown> {
  const vf = widget.valueField
  if (rows.length === 0) return { [vf ? humanizeField(vf) : 'Total Records']: 0 }
  if (vf) {
    const firstVal = rows[0]?.[vf]
    if (typeof firstVal === 'string' && isNaN(Number(firstVal))) {
      return { [humanizeField(vf)]: firstVal }
    }
    const total = rows.reduce((s, r) => s + (Number(r[vf]) || 0), 0)
    return { [humanizeField(vf)]: total }
  }
  return { 'Total Records': rows.length }
}

/** Build the inline payload for a table/kpi widget from the rows the
 *  frontend already fetched. Charts/text don't need this (handled via
 *  image / content). Caps at 100 rows to match DataTable's display. */
export function computeWidgetExportData(
  widget: DataWidgetConfig,
  rows: Array<Record<string, unknown>>,
): WidgetExportData {
  if (widget.chartType === 'kpi') {
    return { kpis: kpiData(widget, rows) }
  }
  if (widget.chartType === 'table') {
    const columns = tableColumns(rows, widget.valueFields)
    const trimmed = rows.slice(0, 100).map(row => {
      const picked: Record<string, unknown> = {}
      for (const col of columns) picked[col] = row[col]
      return picked
    })
    return { rows: trimmed, columns }
  }
  return {}
}

/** Map ONE widget to its backend section descriptor. Caller must have
 *  pre-checked `isWidgetSupported(widget) === true` — passing an
 *  unsupported widget throws so a regression doesn't silently produce
 *  a dropped section.
 *
 *  `data` carries the inline export payload from
 *  {@link computeWidgetExportData} (rows/columns/kpis) plus the
 *  `chartImage` dataURI from `ApexCharts.exec(id, 'dataURI')`. Chart
 *  widgets use the image; table/kpi widgets relay their data inline so
 *  the backend renders it verbatim (no registry fetch, no access gate). */
export function widgetToSection(
  widget: DataWidgetConfig,
  resolvedTitle: string,
  data: WidgetExportData = {},
): BackendReportSection {
  const cls = classifyWidget(widget)
  if (!cls.ok) {
    throw new Error(
      `widgetToSection called with unsupported widget ${widget.id} ` +
      `(${cls.reason}${cls.detail ? `: ${cls.detail}` : ''}). ` +
      `Call partitionWidgetsBySupport upstream.`,
    )
  }
  switch (cls.reason) {
    case 'text':
      return {
        title: resolvedTitle,
        type: 'text',
        content: widget.content ?? '',
        text_style: widget.textStyle,
      }
    case 'chart-image':
      return {
        title: resolvedTitle,
        type: 'chart',
        chart_hint: backendChartHint(widget.chartType),
        image: data.chartImage,
      }
    case 'kpi':
      return {
        title: resolvedTitle,
        type: 'kpi',
        kpis: data.kpis ?? {},
      }
    case 'table':
      return {
        title: resolvedTitle,
        type: 'table',
        rows: data.rows ?? [],
        columns: data.columns ?? [],
        max_rows: 100,
      }
  }
}
