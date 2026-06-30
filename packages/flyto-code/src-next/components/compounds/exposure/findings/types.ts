// Findings table — shared types, column registry, and persistence helpers.
// Extracted verbatim from FindingsView.tsx (behaviour-neutral split) so the
// orchestrator and its row/drawer parts share one source of truth.

import { tOr } from '@lib/i18n'
import type { FindingsFilter } from '@lib/engine'

export const PAGE_SIZE = 100

export function dateLabel(iso?: string | null): string {
  if (!iso) return '—'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  return new Date(t).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

// ── Column registry — single source of truth for what's renderable ─

export interface ColumnDef {
  id: string
  label: string
  width: string
  defaultVisible: boolean
}

const REQUIRED_VISIBLE_COLUMNS = ['select', 'expand', 'status', 'history'] as const

// Column schema — id / width / defaultVisible are stable. Labels
// are looked up at render time via columnLabel() so tOr() can read
// the loaded translation table (CLAUDE.md i18n rule 5).
export const COLUMNS: ColumnDef[] = [
  { id: 'select',     label: '',           width: '28px',  defaultVisible: true },
  { id: 'expand',     label: '',           width: '22px',  defaultVisible: true },
  { id: 'risk',       label: 'Risk Vector',width: 'minmax(112px, 126px)', defaultVisible: true },
  { id: 'findingId',  label: 'Finding ID', width: '112px', defaultVisible: false },
  { id: 'asset',      label: 'Asset',      width: 'minmax(126px, 1fr)', defaultVisible: true },
  { id: 'details',    label: 'Details',    width: 'minmax(220px, 1fr)', defaultVisible: false },
  { id: 'firstSeen',  label: 'First Seen', width: '78px',  defaultVisible: true },
  { id: 'lastSeen',   label: 'Last Seen',  width: '78px',  defaultVisible: true },
  { id: 'severity',   label: 'Severity',   width: '82px', defaultVisible: true },
  { id: 'grade',      label: 'Grade',      width: '72px', defaultVisible: true },
  { id: 'status',     label: 'Status',     width: '112px', defaultVisible: true },
  { id: 'history',    label: 'History',    width: '44px', defaultVisible: true },
  { id: 'threat',     label: 'Threat',     width: '80px',  defaultVisible: false },
  { id: 'importance', label: 'Importance', width: '76px',  defaultVisible: false },
  { id: 'country',    label: 'Country',    width: '70px',  defaultVisible: false },
  { id: 'tags',       label: 'Tags',       width: '120px', defaultVisible: false },
  { id: 'lifetime',   label: 'Remaining',  width: '80px',  defaultVisible: false },
]

export function columnLabel(col: ColumnDef): string {
  if (!col.label) return ''
  return tOr(`findings.col.${col.id}`, col.label)
}

export interface SavedFilterSet {
  name: string
  filter: FindingsFilter
}

export function loadVisibleColumns(orgId: string): Set<string> {
  if (typeof window === 'undefined') return new Set(COLUMNS.filter(c => c.defaultVisible).map(c => c.id))
  try {
    const raw = window.localStorage.getItem(`findings_visible_columns_${orgId}`)
    if (!raw) return new Set(COLUMNS.filter(c => c.defaultVisible).map(c => c.id))
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) {
      const s = new Set<string>(arr.filter((x): x is string => typeof x === 'string'))
      // Control/lifecycle columns are product-critical: selection and
      // expansion are actions, while status/history make CTEM continuity
      // visible even for users carrying older localStorage preferences.
      REQUIRED_VISIBLE_COLUMNS.forEach(c => s.add(c))
      return s
    }
  } catch { /* fall through */ }
  return new Set(COLUMNS.filter(c => c.defaultVisible).map(c => c.id))
}

export function saveVisibleColumns(orgId: string, cols: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(`findings_visible_columns_${orgId}`, JSON.stringify([...cols]))
  } catch { /* ignore */ }
}

export function loadSavedSets(orgId: string): SavedFilterSet[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(`findings_saved_sets_${orgId}`)
    if (!raw) return []
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch { return [] }
}

export function saveSavedSets(orgId: string, sets: SavedFilterSet[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(`findings_saved_sets_${orgId}`, JSON.stringify(sets))
  } catch { /* ignore */ }
}
