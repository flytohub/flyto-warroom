/* eslint-disable react-refresh/only-export-components -- This atom intentionally exports shared toolbar constants. */
/**
 * SearchField — the canonical search/filter input for toolbars.
 *
 * Before this, list views each rolled their own raw <TextField>: some
 * `size="small"` (~40px), some default medium (~56px), so search rows
 * ended up taller than their neighbouring buttons (the DomainsView eyesore).
 * This fixes the height ONCE: a `size="small"` field pinned to TOOLBAR_H so
 * a search input and any TOOLBAR_H-tall button line up perfectly.
 *
 * Pair it with `toolbarControlSx` on adjacent buttons/selects so the whole
 * row shares one height. Extensible: new toolbars use these two exports and
 * can never drift again.
 */
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import { Search } from 'lucide-react'
import type { SxProps, Theme } from '@mui/material/styles'
import { t } from '@lib/i18n';

/** Canonical toolbar control height (px). One number, every toolbar. */
export const TOOLBAR_H = 40

/** Drop onto a Button/Select sharing a row with SearchField so heights match. */
export const toolbarControlSx: SxProps<Theme> = {
  height: TOOLBAR_H,
  textTransform: 'none',
  fontWeight: 600,
  borderRadius: 2,
}

export interface SearchFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  height?: number
  /** Extra sx (e.g. flex: 1 to fill the row). */
  sx?: SxProps<Theme>
  autoFocus?: boolean
  'aria-label'?: string
}

export function SearchField({ value, onChange, placeholder, height = TOOLBAR_H, sx, autoFocus, ...rest }: SearchFieldProps) {
  return (
    <TextField
      size="small"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? t('common.search')}
      autoFocus={autoFocus}
      aria-label={rest['aria-label'] ?? placeholder ?? t('common.search')}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <Search size={16} />
            </InputAdornment>
          ),
          sx: { height, minHeight: height, maxHeight: height, borderRadius: 2 },
        },
      }}
      sx={{
        // Pin the field's outer height so it matches TOOLBAR_H-tall buttons.
        '& .MuiOutlinedInput-root': { height, minHeight: height, maxHeight: height, borderRadius: 2 },
        ...sx,
      }}
    />
  )
}
