/**
 * Report types — data-first report engine.
 */

import type { LucideIcon } from 'lucide-react'

// ── Field & Data Source ──

export type FieldType = 'number' | 'string' | 'date' | 'severity' | 'grade' | 'boolean' | 'array'

export interface FieldDef {
  key: string
  label: string
  labelKey?: string        // i18n
  type: FieldType
  aggregate?: 'sum' | 'avg' | 'count' | 'min' | 'max'
  /** Dot-path for nested data */
  path?: string
}

export interface DataSourceDef {
  id: string
  name: string
  nameKey?: string
  category: 'health' | 'security' | 'architecture' | 'compliance' | 'ci' | 'external'
  icon: LucideIcon
  /** Backend capability page-id required before the frontend may fetch it. */
  requiredPage?: string
  fetcher: (orgId: string) => Promise<any>
  /** How to extract the array of rows from the API response */
  rowsPath?: string         // e.g. 'repos', 'items', 'findings', 'packages'
  fields: FieldDef[]
  joinableOn?: string[]     // keys that can JOIN with other sources
}

// ── Chart Types ──

export type ChartType =
  | 'donut' | 'bar' | 'stacked-bar' | 'line' | 'area'
  | 'radar' | 'treemap' | 'heatmap' | 'gauge' | 'table'
  | 'kpi' | 'radialBar' | 'text'

export interface ChartTypeDef {
  type: ChartType
  name: string
  nameKey?: string
  icon: LucideIcon
  /** What field types this chart needs */
  requiresLabel: boolean    // needs a string/category field for axis
  requiresValue: boolean    // needs a numeric field
  requiresMultiValue: boolean  // needs multiple numeric series
  supportsTimeSeries: boolean
}

// ── JOIN Config (multi-source designs from the Data Designer) ──

// JoinConfig captures everything the Data Designer needs to reproduce a
// joined view at render time: which sources to fetch, which fields to
// project, and how to stitch them together. Saved verbatim into the
// widget config (and into SavedComponent for the library) so reloading
// a saved component yields fresh data joined the same way as authoring
// time. Without this, "save to library" silently dropped the JOIN and
// stored a single-source pointer (operator-reported 2026-05-24).
//
// Field references in JoinEdgeRef use array indices into `nodes` instead
// of node IDs because saved configs need to survive a fresh designer
// session where the runtime ids would otherwise be re-minted.
export interface JoinNodeRef {
  sourceId: string
  selectedFields: string[]
}

export interface JoinEdgeRef {
  fromNodeIdx: number
  toNodeIdx: number
  fromField: string
  toField: string
  joinType: 'inner' | 'left'
}

export interface JoinConfig {
  nodes: JoinNodeRef[]
  edges: JoinEdgeRef[]
}

// ── Widget Config (what gets saved in a report template) ──

export interface DataWidgetConfig {
  id: string
  dataSourceId: string
  chartType: ChartType
  labelField?: string       // field key used as category/label
  valueField?: string       // field key used as value
  valueFields?: string[]    // multiple value fields (for stacked/radar)
  cols: number              // 1-12 grid span
  title?: string
  titleKey?: string
  filters?: Record<string, string>  // field → value filter
  /** Static text content for 'text' type widgets. Supports markdown-like bold (**text**). */
  content?: string
  /** Visual style for text blocks: 'info' (blue), 'warning' (orange), 'success' (green), 'neutral' (gray) */
  textStyle?: 'info' | 'warning' | 'success' | 'neutral'
  /**
   * Optional multi-source JOIN. When present, DataWidget fetches every
   * `nodes[].sourceId` in parallel, applies joinRows in order across
   * `edges`, then renders the chart with the joined row set. Absent
   * means single-source (legacy path).
   */
  joinConfig?: JoinConfig
}

// ── Report Template ──

export interface ReportSection {
  id: string
  name?: string
  widgets: DataWidgetConfig[]
}

export interface ReportTemplate {
  id: string
  name: string
  nameKey?: string
  description: string
  descKey?: string
  category: 'security' | 'ctem' | 'compliance' | 'opensource' | 'advanced' | 'custom'
  icon: LucideIcon
  sections: ReportSection[]
}

// ── Saved custom report index ──

export interface SavedCustomReport {
  id: string
  name: string
  savedAt: string
}

// ── Saved component (from Data Studio) ──

export interface SavedComponent {
  id: string
  name: string
  dataSourceId: string      // for join: nodes[0].sourceId (legacy single-source consumers)
  chartType: ChartType
  labelField?: string
  valueField?: string
  defaultCols: number
  createdAt: string
  /**
   * Present when the operator saved a JOIN-of-multiple-sources design
   * from the Data Designer. dataSourceId/labelField/valueField above
   * still get filled in for back-compat (chart binding picks one
   * concrete label + value from the joined row shape), but the JOIN
   * itself is the source of truth on re-render.
   */
  joinConfig?: JoinConfig
}

// ── Backward compat (used by old widget files + registry.ts) ──

export interface WidgetConfig extends DataWidgetConfig {
  /** Legacy alias — old widgets read config.type; new ones read config.chartType */
  type?: string
  props?: Record<string, unknown>
}

export interface WidgetProps {
  orgId: string
  config: WidgetConfig
}
