import type { ReactNode } from 'react'

/**
 * FilterBar contract — a domain-free toolbar (search + filter menu + sort menu
 * + active-chip row + shown/total counter). Views (CTEM / Findings / Issues /
 * Pulse) feed it config-shaped props; the atom owns the UI. Extracted from
 * CTEMFilterBar (arch Phase 5 — shared primitive). Keep it domain-agnostic:
 * the caller builds groups/chips from its own filter state.
 */
export interface FilterToggleItem {
  key: string
  checked: boolean
  label: string
  icon?: ReactNode
  /** Accent tone for the checked/label colour. */
  tone?: string
  onToggle: () => void
}

export interface FilterGroup {
  label: string
  items: FilterToggleItem[]
}

export interface SortOption {
  value: string
  label: string
}

export interface ActiveChip {
  key: string
  label: string
  tone?: string
  icon?: ReactNode
  textTransform?: 'capitalize' | 'uppercase' | 'none'
  onDelete: () => void
}

export interface FilterBarProps {
  search: string
  onSearchChange: (v: string) => void
  searchPlaceholder?: string
  searchAriaLabel?: string
  /** Grouped toggles rendered in the filter Menu. */
  filterGroups: FilterGroup[]
  /** Count shown on the filter button badge. */
  activeFilterCount: number
  /** Dismissable chips + a "clear all". Empty = chip row hidden. */
  activeChips: ActiveChip[]
  onClearAll: () => void
  /** Optional sort Menu. Omit to hide the sort button. */
  sort?: { value: string; options: SortOption[]; onChange: (v: string) => void }
  total: number
  shown: number
}
