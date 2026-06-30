/**
 * Shared utilities for the reports system.
 * Extracted from 5+ files to eliminate duplication.
 */

import type { DataWidgetConfig, ReportSection, SavedComponent, SavedCustomReport, ReportTemplate } from './types'
import { t } from '@lib/i18n';
import { FileText } from 'lucide-react'

// ── Nested value access (was duplicated 5x) ──

// Path-resolution accessor — the resolved value is intentionally
// loose because report widgets bind to arbitrary engine response
// shapes (counts, arrays, nested objects). Caller decides how to
// consume the result; arrays go straight into chart rows.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getNestedValue(obj: unknown, path: string): any {
  if (!obj || !path) return undefined
  return path.split('.').reduce<unknown>(
    (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
    obj,
  )
}

// ── Chart colors (was duplicated 3x) ──

export const CHART_COLORS: Record<string, string> = {
  donut: '#8b5cf6', bar: '#3b82f6', 'stacked-bar': '#3b82f6',
  line: '#22c55e', area: '#22c55e', radar: '#f97316',
  treemap: '#06b6d4', heatmap: '#ef4444', gauge: '#eab308',
  table: '#6b7280', kpi: '#ec4899', radialBar: '#14b8a6',
}

// ── Component persistence (was in DataStudioTab) ──

const COMP_KEY = 'flyto:report-components'

export function loadComponents(): SavedComponent[] {
  try { const r = localStorage.getItem(COMP_KEY); return r ? JSON.parse(r) : [] }
  catch (err) {
    if (import.meta.env?.DEV) console.warn('[reports] Failed to load from localStorage:', err)
    return []
  }
}

export function persistComponents(list: SavedComponent[]) {
  // Swallow is intentional — setItem can throw on quota/private-mode; persistence is best-effort
  try { localStorage.setItem(COMP_KEY, JSON.stringify(list)) } catch (err) { if (import.meta.env?.DEV) console.warn('[reports] Failed to persist to localStorage:', err) }
}

// ── Report persistence (was in ReportsView) ──

const SAVED_INDEX_KEY = 'flyto:custom-reports-index'
const SAVED_PREFIX = 'flyto:custom-report:'

export function loadSavedIndex(): SavedCustomReport[] {
  try { const r = localStorage.getItem(SAVED_INDEX_KEY); return r ? JSON.parse(r) : [] }
  catch (err) {
    if (import.meta.env?.DEV) console.warn('[reports] Failed to load from localStorage:', err)
    return []
  }
}

export function persistSavedIndex(idx: SavedCustomReport[]) {
  // Swallow is intentional — setItem can throw on quota/private-mode; persistence is best-effort
  try { localStorage.setItem(SAVED_INDEX_KEY, JSON.stringify(idx)) } catch (err) { if (import.meta.env?.DEV) console.warn('[reports] Failed to persist to localStorage:', err) }
}

export function loadSavedReport(id: string): ReportTemplate | null {
  try { const r = localStorage.getItem(SAVED_PREFIX + id); return r ? JSON.parse(r) : null }
  catch (err) {
    if (import.meta.env?.DEV) console.warn('[reports] Failed to load from localStorage:', err)
    return null
  }
}

export function persistSavedReport(t: ReportTemplate) {
  // Swallow is intentional — setItem can throw on quota/private-mode; persistence is best-effort
  try { localStorage.setItem(SAVED_PREFIX + t.id, JSON.stringify(t)) } catch (err) { if (import.meta.env?.DEV) console.warn('[reports] Failed to persist to localStorage:', err) }
}

export function deleteSavedReport(id: string) {
  // Swallow is intentional — removeItem can throw in private-mode; deletion is best-effort
  try { localStorage.removeItem(SAVED_PREFIX + id) } catch (err) { if (import.meta.env?.DEV) console.warn('[reports] Failed to persist to localStorage:', err) }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function normalizeReportSections(input: unknown): ReportSection[] {
  const sections = Array.isArray(input) ? input : []
  const normalized = sections
    .map((section, index): ReportSection | null => {
      if (!isRecord(section)) return null
      const widgets = Array.isArray(section.widgets)
        ? section.widgets.filter(isRecord) as unknown as DataWidgetConfig[]
        : []
      return {
        id: typeof section.id === 'string' && section.id.trim() ? section.id : `s${index + 1}`,
        name: typeof section.name === 'string' ? section.name : `Section ${index + 1}`,
        widgets,
      }
    })
    .filter((section): section is ReportSection => section !== null)
  return normalized.length > 0 ? normalized : [{ id: 's1', name: 'Section 1', widgets: [] }]
}

export function countReportWidgets(sections: unknown): number {
  return normalizeReportSections(sections).reduce((sum, section) => sum + section.widgets.length, 0)
}

export function makeEmptyTemplate(): ReportTemplate {
  return {
    id: `custom_${Date.now()}`,
    name: t('reports.untitled'),
    description: '',
    category: 'custom',
    icon: FileText,
    sections: [{ id: 's1', name: 'Section 1', widgets: [] }],
  }
}
