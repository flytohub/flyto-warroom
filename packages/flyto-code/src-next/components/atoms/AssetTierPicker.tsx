import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Chip, Menu, MenuItem, Tooltip, CircularProgress } from '@mui/material'
import { Crown, Shield, Network, Box, Check } from 'lucide-react'
import {
  setRepoTier, setAssetTier, tierLabel, tierColor,
  type AssetTier,
} from '@lib/engine'
import { qk } from '@lib/queryKeys'

// AssetTierPicker — small inline control for setting a repo's or
// attack-surface asset's tier. The tier feeds the CTEM priority
// engine's per-finding multiplier (crown_jewel ×1.5, customer_facing
// ×1.2, internal ×1.0, sandbox ×0.5).
//
// Used in both contexts:
//   - <AssetTierPicker target="repo" orgId={…} id={repoId} … />
//   - <AssetTierPicker target="asset" orgId={…} id={assetID} … />
//
// On mutation success, invalidates `ctem-priorities` so the picker
// reflects the new weighting without a manual refresh.

export interface AssetTierPickerProps {
  target: 'repo' | 'asset'
  orgId: string
  id: string
  tier: AssetTier | string | undefined
  /** Disable interaction (no menu opens). Useful in read-only views. */
  readonly?: boolean
  /** Optional callback after mutation success. */
  onChanged?: (tier: AssetTier) => void
}

const TIER_OPTIONS: { value: AssetTier; icon: typeof Crown }[] = [
  { value: 'crown_jewel',     icon: Crown },
  { value: 'customer_facing', icon: Shield },
  { value: 'internal',        icon: Network },
  { value: 'sandbox',         icon: Box },
]

export function AssetTierPicker({
  target, orgId, id, tier, readonly, onChanged,
}: AssetTierPickerProps) {
  const qc = useQueryClient()
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const current = (tier as AssetTier | undefined) ?? 'internal'
  const Icon = TIER_OPTIONS.find(o => o.value === current)?.icon ?? Network

  const mut = useMutation({
    mutationFn: (newTier: AssetTier) =>
      target === 'repo'
        ? setRepoTier(orgId, id, newTier)
        : setAssetTier(orgId, id, newTier),
    onSuccess: (_, newTier) => {
      // Bust everything that depends on tier — priorities, paths,
      // and the originating list query (repos / attack-surface).
      qc.invalidateQueries({ queryKey: qk.ctem.priorities(orgId) })
      qc.invalidateQueries({ queryKey: qk.ctem.attackPaths(orgId) })
      qc.invalidateQueries({ queryKey: target === 'repo' ? qk.repos.connected(orgId) : qk.attackSurface(orgId) })
      onChanged?.(newTier)
      setAnchorEl(null)
    },
  })

  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    if (readonly) return
    setAnchorEl(e.currentTarget)
  }

  return (
    <>
      <Tooltip title={readonly
        ? `${tierLabel(current)}`
        : `${tierLabel(current)} — click to change`}>
        <Chip
          size="small"
          icon={mut.isPending
            ? <CircularProgress size={10} sx={{ color: tierColor(current) }} />
            : <Icon size={11} />}
          label={tierLabel(current)}
          onClick={handleClick}
          sx={{
            height: 22, fontSize: 13, fontWeight: 600,
            bgcolor: `${tierColor(current)}1a`,
            color: tierColor(current),
            cursor: readonly ? 'default' : 'pointer',
            '& .MuiChip-icon': { ml: 0.5, color: tierColor(current) },
            '&:hover': readonly ? {} : { bgcolor: `${tierColor(current)}2a` },
          }}
        />
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        slotProps={{
          paper: {
            sx: { minWidth: 200, bgcolor: 'var(--color-surface, #0f172a)' },
          },
        }}
      >
        {TIER_OPTIONS.map(o => {
          const O = o.icon
          const active = o.value === current
          return (
            <MenuItem
              key={o.value}
              onClick={() => mut.mutate(o.value)}
              sx={{
                fontSize: 12,
                color: tierColor(o.value),
                fontWeight: active ? 700 : 500,
              }}
            >
              <O size={12} style={{ marginRight: 8 }} />
              {tierLabel(o.value)}
              {active && <Check size={12} style={{ marginLeft: 'auto' }} />}
            </MenuItem>
          )
        })}
      </Menu>
    </>
  )
}
