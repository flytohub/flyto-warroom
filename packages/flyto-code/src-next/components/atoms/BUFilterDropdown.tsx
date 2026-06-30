import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Select, MenuItem, type SelectChangeEvent } from '@mui/material'
import { Network } from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { listBusinessUnits } from '@lib/engine'
import { querySucceeded, resolvedList } from '@lib/queryState'

// BUFilterDropdown — reusable dropdown for filtering dashboards
// by business unit. Controlled component: caller owns the value.
//
// Special values:
//   ''            → All BUs (org-wide view)
//   'unassigned'  → only items NOT assigned to any BU
//   '<bu_id>'     → only items in that BU
//
// Renders nothing when the org has 0 BUs declared — operators
// without enterprise BU setup don't need to see a useless picker.

export interface BUFilterDropdownProps {
  orgId: string | undefined
  value: string
  onChange: (newValue: string) => void
  /** When false, hides the icon (cleaner for tight rows). */
  showIcon?: boolean
  /** Custom label override; defaults to "Business unit". */
  label?: string
}

export function BUFilterDropdown({ orgId, value, onChange, showIcon = true, label }: BUFilterDropdownProps) {
  const q = useQuery({
    queryKey: qk.platform.businessUnits(orgId),
    queryFn: () => listBusinessUnits(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const options = useMemo(() => resolvedList(q.data?.items, q, !!orgId), [q.data?.items, q, orgId])

  // Hide the dropdown entirely when no BUs are declared — the
  // picker would be a single "All" option with nothing to pick.
  if (!querySucceeded(q, !!orgId) || options.length === 0) return null

  const handleChange = (e: SelectChangeEvent<string>) => {
    onChange(e.target.value)
  }

  return (
    <Select
      size="small"
      value={value}
      onChange={handleChange}
      displayEmpty
      sx={{
        height: 28, minWidth: 160, fontSize: 12, fontWeight: 600,
        '& .MuiSelect-select': {
          py: 0, display: 'flex', alignItems: 'center', gap: 0.75,
        },
      }}
      renderValue={(v) => {
        const chosen = v ? options.find(o => o.id === v) : null
        const display = !v
          ? (label || t('bu.filter.all'))
          : v === 'unassigned'
            ? t('bu.filter.unassigned')
            : (chosen?.label || v)
        return (
          <>
            {showIcon && <Network size={12} style={{ opacity: 0.7 }} />}
            <span>{display}</span>
          </>
        )
      }}
    >
      <MenuItem value="">{t('bu.filter.all')}</MenuItem>
      <MenuItem value="unassigned">
        <em>{t('bu.filter.unassigned')}</em>
      </MenuItem>
      {options.map(bu => (
        <MenuItem key={bu.id} value={bu.id}>
          {bu.label}
          <span style={{
            marginLeft: 6, fontSize: 12, fontFamily: 'monospace',
            color: 'var(--mui-palette-text-secondary)',
          }}>
            {bu.key}
          </span>
        </MenuItem>
      ))}
    </Select>
  )
}
