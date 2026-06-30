/**
 * FlytoSelect — the canonical dropdown for the app.
 *
 * Wraps MUI Select so every dropdown looks identical across macOS /
 * Windows / Linux. Always searchable is not natively supported by MUI
 * Select, so we use a simple filter approach for large option sets.
 *
 * Sizing: adaptive by default. Caller supplies `minWidth` + optional
 * `maxWidth`; the control grows with label length but won't overflow its
 * row. Pass a numeric `width` only when a fixed pixel count is genuinely
 * needed (e.g., aligned side-by-side in a settings card).
 */
import { Select, MenuItem, FormControl, type SelectChangeEvent } from '@mui/material'
import { ChevronDown } from 'lucide-react'
import { t } from '@lib/i18n'

export interface FlytoSelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface Props {
  value: string
  onChange: (value: string) => void
  options: FlytoSelectOption[]
  placeholder?: string
  /** Override the searchable-threshold heuristic (not used with MUI Select). */
  searchable?: boolean
  clearable?: boolean
  disabled?: boolean
  size?: 'xs' | 'sm' | 'md'
  /** Fixed width. Prefer minWidth / maxWidth for adaptive sizing. */
  width?: number | string
  minWidth?: number | string
  maxWidth?: number | string
  className?: string
  'aria-label'?: string
  /** Escape hatch — merged into MUI Select as-is. */
  extra?: Record<string, unknown>
}

const SIZE_MAP: Record<string, 'small' | 'medium'> = {
  xs: 'small',
  sm: 'small',
  md: 'medium',
}

export function FlytoSelect({
  value,
  onChange,
  options,
  placeholder,
  clearable = false,
  disabled,
  size = 'sm',
  width,
  minWidth = 120,
  maxWidth = 260,
  className,
  'aria-label': ariaLabel,
  extra,
}: Props) {
  // MUI silently drops options whose value is the empty string in some
  // contexts. Callers may still pass '' as the "All / none" value for
  // backward compat; we map it to a sentinel on the way in and strip it
  // on the way out.
  const SENTINEL = '__flyto_all__'
  const mappedOptions = options.map(o =>
    o.value === '' ? { ...o, value: SENTINEL } : o,
  )
  const mappedValue = value === '' ? SENTINEL : value

  // Default hint when caller didn't supply one.
  const resolvedPlaceholder = placeholder ?? t('common.pleaseSelect')

  const muiSize = SIZE_MAP[size] ?? 'small'

  const handleChange = (event: SelectChangeEvent<string>) => {
    const v = event.target.value
    onChange(v === SENTINEL ? '' : (v ?? ''))
  }

  return (
    <FormControl
      size={muiSize}
      disabled={disabled}
      className={className}
      sx={{
        ...(width
          ? { width }
          : { minWidth, maxWidth, flex: '0 1 auto' }),
      }}
    >
      <Select
        value={mappedValue || ''}
        onChange={handleChange}
        displayEmpty
        renderValue={(selected) => {
          if (!selected || selected === SENTINEL) {
            return (
              <span style={{ opacity: 0.5 }}>{resolvedPlaceholder}</span>
            )
          }
          const opt = mappedOptions.find(o => o.value === selected)
          return opt?.label ?? selected
        }}
        IconComponent={() => <ChevronDown size={14} style={{ marginRight: 8, opacity: 0.7 }} />}
        inputProps={{ 'aria-label': ariaLabel }}
        sx={{
          bgcolor: 'action.hover',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: 'divider',
          },
          '& .MuiSelect-select': {
            py: muiSize === 'small' ? 0.75 : 1,
            fontSize: 13,
          },
        }}
        MenuProps={{
          PaperProps: {
            sx: {
              bgcolor: 'background.paper',
              borderColor: 'divider',
              '& .MuiMenuItem-root': {
                fontSize: 13,
              },
            },
          },
        }}
        {...extra}
      >
        {clearable && (
          <MenuItem value={SENTINEL}>
            <em>{resolvedPlaceholder}</em>
          </MenuItem>
        )}
        {mappedOptions
          .filter(o => !clearable || o.value !== SENTINEL)
          .map(o => (
            <MenuItem key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </MenuItem>
          ))}
      </Select>
    </FormControl>
  )
}
