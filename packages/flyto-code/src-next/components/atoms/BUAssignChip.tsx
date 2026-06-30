import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSnackbar } from 'notistack'
import { Chip, Menu, MenuItem, Tooltip } from '@mui/material'
import { Network, ChevronDown } from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import {
  listBusinessUnits, assignAssetToBU, unassignAssetFromBU,
  type AssetKind,
} from '@lib/engine'

// BUAssignChip — per-row business-unit selector. Drops into
// repo rows + attack_surface rows so operators can assign assets
// to a BU without leaving the page they're already on. When the
// org has 0 BUs declared the chip stays hidden — no point
// teasing a feature that needs upstream setup.

export interface BUAssignChipProps {
  orgId: string | undefined
  assetId: string
  assetKind: AssetKind
  /** Current BU id on the asset (from server). Empty = unassigned. */
  currentBUID: string | undefined
  /** Query keys to invalidate after assign — let the caller refresh
   *  the underlying list without us coupling to its key shape. */
  invalidateOnChange?: readonly unknown[]
}

export function BUAssignChip({
  orgId, assetId, assetKind, currentBUID, invalidateOnChange,
}: BUAssignChipProps) {
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  const q = useQuery({
    queryKey: qk.platform.businessUnits(orgId),
    queryFn: () => listBusinessUnits(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const options = useMemo(() => q.data?.items ?? [], [q.data])

  const assignMut = useMutation({
    mutationFn: (buId: string) =>
      buId === ''
        ? unassignAssetFromBU(orgId!, { asset_id: assetId, asset_kind: assetKind })
        : assignAssetToBU(orgId!, buId, { asset_id: assetId, asset_kind: assetKind }),
    onSuccess: () => {
      enqueueSnackbar(t('buassign.success'), { variant: 'success' })
      setAnchor(null)
      if (invalidateOnChange) {
        const queryKey = invalidateOnChange as readonly unknown[]
        qc.invalidateQueries({ queryKey })
      }
    },
    onError: (e) => enqueueSnackbar(String(e as Error), { variant: 'error' }),
  })

  // Hide entirely when org has no BUs — same posture as
  // BUFilterDropdown.
  if (options.length === 0) return null

  const current = currentBUID ? options.find(o => o.id === currentBUID) : null
  const label = current?.label || t('buassign.unassigned')

  return (
    <>
      <Tooltip title={t('buassign.tooltip')}>
        <Chip
          size="small"
          icon={<Network size={11} />}
          label={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {label}
              <ChevronDown size={10} />
            </span>
          }
          onClick={(e) => setAnchor(e.currentTarget)}
          sx={{
            height: 22, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            bgcolor: current
              ? 'rgba(124,58,237,0.14)'
              : 'rgba(148,163,184,0.12)',
            color: current ? '#a78bfa' : 'var(--mui-palette-text-secondary)',
            '& .MuiChip-icon': { color: 'inherit', ml: 0.5 },
          }}
        />
      </Tooltip>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        <MenuItem
          selected={!currentBUID}
          onClick={() => assignMut.mutate('')}
          disabled={assignMut.isPending}
        >
          <em>{t('buassign.unassign')}</em>
        </MenuItem>
        {options.map(bu => (
          <MenuItem
            key={bu.id}
            selected={bu.id === currentBUID}
            onClick={() => assignMut.mutate(bu.id)}
            disabled={assignMut.isPending}
          >
            {bu.label}
            <span style={{
              marginLeft: 8, fontSize: 12, fontFamily: 'monospace',
              color: 'var(--mui-palette-text-secondary)',
            }}>
              {bu.key}
            </span>
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
