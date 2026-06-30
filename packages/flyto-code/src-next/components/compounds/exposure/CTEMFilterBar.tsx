import { Crown, Shield, Clock, RotateCcw, Skull, Flame } from 'lucide-react'
import { t, tOr } from '@lib/i18n';
import { colors } from '@/styles/designTokens'
import { FilterBar, type FilterGroup, type ActiveChip } from '@atoms/FilterBar'

// CTEMFilterBar — the CTEM-domain adapter over the shared <FilterBar> atom
// (arch Phase 5). It owns the CTEM filter vocabulary (tier / severity / state
// flags / sort) and maps CTEMFilterState → FilterBarProps. The public surface
// (state / onChange / total / shown) is unchanged so CTEMActionsView and the
// existing test keep working against it.

export type SortKey = 'priority' | 'sla' | 'severity' | 'recent_fix' | 'first_seen'
export type FilterTier = 'crown_jewel' | 'customer_facing' | 'internal' | 'sandbox'
export type FilterSeverity = 'critical' | 'high' | 'medium' | 'low'

export interface CTEMFilterState {
  search: string
  tiers: FilterTier[]
  severities: FilterSeverity[]
  breachedOnly: boolean
  verifyingOnly: boolean
  hasThreatActor: boolean
  unassignedOnly: boolean
  sort: SortKey
}

export const EMPTY_FILTER: CTEMFilterState = {
  search: '',
  tiers: [],
  severities: [],
  breachedOnly: false,
  verifyingOnly: false,
  hasThreatActor: false,
  unassignedOnly: false,
  sort: 'priority',
}

export interface CTEMFilterBarProps {
  state: CTEMFilterState
  onChange: (next: CTEMFilterState) => void
  total: number
  shown: number
}

const SORT_OPTIONS: { value: SortKey; labelKey: string; fallback: string }[] = [
  { value: 'priority',   labelKey: 'ctem.sort.priority',   fallback: 'Priority (high → low)' },
  { value: 'sla',        labelKey: 'ctem.sort.sla',        fallback: 'SLA clock (soonest first)' },
  { value: 'severity',   labelKey: 'ctem.sort.severity',   fallback: 'Severity (worst first)' },
  { value: 'recent_fix', labelKey: 'ctem.sort.recentFix',  fallback: 'Recently marked fixed' },
  { value: 'first_seen', labelKey: 'ctem.sort.firstSeen',  fallback: 'First seen (oldest first)' },
]

const TIER_META: { value: FilterTier; labelKey: string; fallback: string; icon?: React.ReactNode }[] = [
  { value: 'crown_jewel',     labelKey: 'tier.crownJewel',     fallback: 'Crown Jewel',     icon: <Crown size={12} color={colors.section.history} /> },
  { value: 'customer_facing', labelKey: 'tier.customerFacing', fallback: 'Customer-facing', icon: <Shield size={12} color={colors.tech} /> },
  { value: 'internal',        labelKey: 'tier.internal',       fallback: 'Internal' },
  { value: 'sandbox',         labelKey: 'tier.sandbox',        fallback: 'Sandbox' },
]

const SEVERITIES: FilterSeverity[] = ['critical', 'high', 'medium', 'low']

export function CTEMFilterBar({ state, onChange, total, shown }: CTEMFilterBarProps) {
  const toggleTier = (t: FilterTier) =>
    onChange({ ...state, tiers: state.tiers.includes(t) ? state.tiers.filter(x => x !== t) : [...state.tiers, t] })
  const toggleSeverity = (s: FilterSeverity) =>
    onChange({ ...state, severities: state.severities.includes(s) ? state.severities.filter(x => x !== s) : [...state.severities, s] })

  const activeFilterCount =
    state.tiers.length + state.severities.length +
    (state.breachedOnly ? 1 : 0) + (state.verifyingOnly ? 1 : 0) +
    (state.hasThreatActor ? 1 : 0) + (state.unassignedOnly ? 1 : 0)

  const filterGroups: FilterGroup[] = [
    {
      label: t('ctem.filterTierSection'),
      items: TIER_META.map(t => ({
        key: `tier-${t.value}`, checked: state.tiers.includes(t.value),
        label: tOr(t.labelKey, t.fallback), icon: t.icon, onToggle: () => toggleTier(t.value),
      })),
    },
    {
      label: t('ctem.filterSeveritySection'),
      items: SEVERITIES.map(s => ({
        key: `sev-${s}`, checked: state.severities.includes(s),
        label: s.toUpperCase(), tone: colors.severity[s], onToggle: () => toggleSeverity(s),
      })),
    },
    {
      label: t('ctem.filterStateSection'),
      items: [
        { key: 'breached', checked: state.breachedOnly, label: t('ctem.filterBreached'), icon: <Clock size={12} color={colors.severity.critical} />, onToggle: () => onChange({ ...state, breachedOnly: !state.breachedOnly }) },
        { key: 'verifying', checked: state.verifyingOnly, label: t('ctem.filterVerifying'), icon: <RotateCcw size={12} color={colors.tech} />, onToggle: () => onChange({ ...state, verifyingOnly: !state.verifyingOnly }) },
        { key: 'threatActor', checked: state.hasThreatActor, label: t('ctem.filterThreatActor'), icon: <Skull size={12} color={colors.brandDeep} />, onToggle: () => onChange({ ...state, hasThreatActor: !state.hasThreatActor }) },
        { key: 'unassigned', checked: state.unassignedOnly, label: t('ctem.filterUnassigned'), icon: <Flame size={12} color={colors.semantic.warning} />, onToggle: () => onChange({ ...state, unassignedOnly: !state.unassignedOnly }) },
      ],
    },
  ]

  const activeChips: ActiveChip[] = [
    ...state.tiers.map(t => ({ key: `tier-${t}`, label: t.replace('_', ' '), tone: colors.brand, textTransform: 'capitalize' as const, onDelete: () => toggleTier(t) })),
    ...state.severities.map(s => ({ key: `sev-${s}`, label: s, tone: colors.severity[s] ?? colors.semantic.neutral, textTransform: 'uppercase' as const, onDelete: () => toggleSeverity(s) })),
    ...(state.breachedOnly ? [{ key: 'breached', label: t('ctem.filterBreached'), icon: <Clock size={10} />, tone: colors.severity.critical, onDelete: () => onChange({ ...state, breachedOnly: false }) }] : []),
    ...(state.verifyingOnly ? [{ key: 'verifying', label: t('ctem.filterVerifying'), icon: <RotateCcw size={10} />, tone: colors.tech, onDelete: () => onChange({ ...state, verifyingOnly: false }) }] : []),
    ...(state.hasThreatActor ? [{ key: 'threatActor', label: t('ctem.filterThreatActor'), icon: <Skull size={10} />, tone: colors.brandDeep, onDelete: () => onChange({ ...state, hasThreatActor: false }) }] : []),
    ...(state.unassignedOnly ? [{ key: 'unassigned', label: t('ctem.filterUnassigned'), icon: <Flame size={10} />, tone: colors.semantic.warning, onDelete: () => onChange({ ...state, unassignedOnly: false }) }] : []),
  ]

  return (
    <FilterBar
      search={state.search}
      onSearchChange={(v) => onChange({ ...state, search: v })}
      searchPlaceholder={t('ctem.searchPlaceholder')}
      searchAriaLabel={t('ctem.searchAria')}
      filterGroups={filterGroups}
      activeFilterCount={activeFilterCount}
      activeChips={activeChips}
      onClearAll={() => onChange(EMPTY_FILTER)}
      sort={{
        value: state.sort,
        options: SORT_OPTIONS.map(o => ({ value: o.value, label: tOr(o.labelKey, o.fallback) })),
        onChange: (v) => onChange({ ...state, sort: v as SortKey }),
      }}
      total={total}
      shown={shown}
    />
  )
}
