import { useState } from 'react'
import {
  Box, InputBase, IconButton, Tooltip, Menu, MenuItem, ListItemIcon, ListItemText,
  Stack, Chip, Divider,
} from '@mui/material'
import { Search, X, SlidersHorizontal, ArrowUpDown, Check } from 'lucide-react'
import { t } from '@lib/i18n';
import { colors, softBg } from '@/styles/designTokens'
import type { FilterBarProps, ActiveChip } from './types'

/**
 * FilterBar — domain-free filter toolbar (arch Phase 5 shared primitive,
 * extracted from CTEMFilterBar). Search + filter Menu + optional sort Menu +
 * active-chip row + shown/total counter. Fully controlled: the parent owns the
 * filter state and supplies config-shaped props. See ./types.
 */
export function FilterBar({
  search, onSearchChange, searchPlaceholder, searchAriaLabel,
  filterGroups, activeFilterCount, activeChips, onClearAll,
  sort, total, shown,
}: FilterBarProps) {
  const [filterAnchor, setFilterAnchor] = useState<HTMLElement | null>(null)
  const [sortAnchor, setSortAnchor] = useState<HTMLElement | null>(null)

  return (
    <Stack spacing={1} sx={{ mb: 1, px: 1.5 }}>
      {/* Top row: search + filter + sort + counter */}
      <Stack direction="row" spacing={1} alignItems="center">
        <Box sx={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 1,
          px: 1, py: 0.5, borderRadius: 1.5,
          border: '1px solid var(--mui-palette-divider, rgba(148,163,184,0.2))',
          bgcolor: 'var(--mui-palette-action-hover, rgba(148,163,184,0.06))',
        }}>
          <Search size={14} color={colors.semantic.neutral} />
          <InputBase
            placeholder={searchPlaceholder ?? t('filterBar.search')}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            sx={{ flex: 1, fontSize: 12 }}
            inputProps={{ 'aria-label': searchAriaLabel ?? t('filterBar.searchAria') }}
          />
          {search && (
            <Tooltip title={t('filterBar.clearSearch')}>
              <IconButton
                size="small"
                onClick={() => onSearchChange('')}
                aria-label={t('filterBar.clearSearch')}
              >
                <X size={12} />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {filterGroups.length > 0 && (
          <Tooltip title={t('filterBar.filters')}>
            <IconButton
              size="small"
              onClick={(e) => setFilterAnchor(e.currentTarget)}
              aria-label={t('filterBar.filters')}
              sx={{
                border: '1px solid var(--mui-palette-divider, rgba(148,163,184,0.2))',
                borderRadius: 1.5,
                color: activeFilterCount > 0 ? colors.brand : 'var(--mui-palette-text-secondary)',
                bgcolor: activeFilterCount > 0 ? softBg(colors.brand, 0.12) : undefined,
              }}
            >
              <SlidersHorizontal size={14} />
              {activeFilterCount > 0 && (
                <Chip size="small" label={activeFilterCount}
                  sx={{ ml: 0.5, height: 16, fontSize: 12, fontWeight: 700, minWidth: 16, bgcolor: colors.brand, color: '#fff' }} />
              )}
            </IconButton>
          </Tooltip>
        )}

        {sort && (
          <Tooltip title={t('filterBar.sort')}>
            <IconButton size="small" onClick={(e) => setSortAnchor(e.currentTarget)}
              aria-label={t('filterBar.sort')}
              sx={{
                border: '1px solid var(--mui-palette-divider, rgba(148,163,184,0.2))',
                borderRadius: 1.5, color: 'var(--mui-palette-text-secondary)',
              }}>
              <ArrowUpDown size={14} />
            </IconButton>
          </Tooltip>
        )}

        <Box sx={{
          fontSize: 13, color: 'var(--mui-palette-text-secondary, var(--color-text-tertiary))',
          fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', minWidth: 64, textAlign: 'right', pr: 1,
        }}>
          {shown === total ? `${total}` : `${shown} / ${total}`}
        </Box>
      </Stack>

      {/* Active filter chips */}
      {activeChips.length > 0 && (
        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {activeChips.map((c) => <ActiveFilterChip key={c.key} chip={c} />)}
          <Chip size="small" label={t('filterBar.clearAll')} onClick={onClearAll}
            variant="outlined" sx={{ height: 20, fontSize: 12, cursor: 'pointer' }} />
        </Stack>
      )}

      {/* Filter menu */}
      <Menu anchorEl={filterAnchor} open={!!filterAnchor} onClose={() => setFilterAnchor(null)}
        slotProps={{ paper: { sx: { minWidth: 240 } } }}>
        {filterGroups.map((g, gi) => [
          gi > 0 ? <Divider key={`d-${gi}`} /> : null,
          <SectionLabel key={`l-${gi}`}>{g.label}</SectionLabel>,
          ...g.items.map((it) => (
            <FilterToggle key={it.key} checked={it.checked} icon={it.icon} tone={it.tone}
              label={it.label} onClick={it.onToggle} />
          )),
        ])}
      </Menu>

      {/* Sort menu */}
      {sort && (
        <Menu anchorEl={sortAnchor} open={!!sortAnchor} onClose={() => setSortAnchor(null)}
          slotProps={{ paper: { sx: { minWidth: 220 } } }}>
          {sort.options.map((opt) => (
            <MenuItem key={opt.value} selected={sort.value === opt.value}
              onClick={() => { sort.onChange(opt.value); setSortAnchor(null) }} sx={{ fontSize: 12 }}>
              <ListItemIcon sx={{ minWidth: 24 }}>
                {sort.value === opt.value ? <Check size={12} /> : null}
              </ListItemIcon>
              <ListItemText primaryTypographyProps={{ fontSize: 12 }}>{opt.label}</ListItemText>
            </MenuItem>
          ))}
        </Menu>
      )}
    </Stack>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{
      px: 2, py: 0.5, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700,
      color: 'var(--mui-palette-text-secondary, var(--color-text-tertiary))',
    }}>
      {children}
    </Box>
  )
}

function FilterToggle({ checked, label, icon, tone, onClick }: {
  checked: boolean; label: string; icon?: React.ReactNode; tone?: string; onClick: () => void
}) {
  return (
    <MenuItem onClick={onClick} sx={{ fontSize: 12 }}>
      <ListItemIcon sx={{ minWidth: 24 }}>
        {checked ? <Check size={12} color={tone ?? colors.brand} /> : icon ?? null}
      </ListItemIcon>
      <ListItemText primaryTypographyProps={{ fontSize: 12, fontWeight: checked ? 700 : 400, color: tone }}>
        {label}
      </ListItemText>
    </MenuItem>
  )
}

function ActiveFilterChip({ chip }: { chip: ActiveChip }) {
  const tone = chip.tone ?? colors.brand
  return (
    <Chip
      size="small"
      icon={chip.icon as React.ReactElement | undefined}
      label={chip.label}
      onDelete={chip.onDelete}
      sx={{
        height: 20, fontSize: 12, fontWeight: 700,
        bgcolor: softBg(tone, 0.14), color: tone,
        textTransform: chip.textTransform ?? 'none',
        '& .MuiChip-icon': { color: tone },
        '& .MuiChip-deleteIcon': { color: tone, opacity: 0.6 },
      }}
    />
  )
}
