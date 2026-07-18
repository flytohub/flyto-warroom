import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import GppMaybeOutlinedIcon from '@mui/icons-material/GppMaybeOutlined'
import { t } from '@lib/i18n'
import type { ScoreAuthority } from '@lib/engine/scoring/scoring'

export interface RatingAuthorityBadgeProps {
  authority?: ScoreAuthority | null
  size?: 'small' | 'medium'
}

const LEVEL_COLOR: Record<ScoreAuthority['level'], 'success' | 'warning' | 'default' | 'error'> = {
  verified: 'success',
  imported_verified: 'warning',
  local: 'default',
  unavailable: 'error',
}

function labelFor(authority: ScoreAuthority): string {
  return t(authority.label_key || 'rating.authority.unavailable')
}

function tooltipFor(authority: ScoreAuthority): string {
  if (authority.comparable) return t('rating.authority.tooltipComparable')
  if (authority.level === 'imported_verified') return t('rating.authority.tooltipImported')
  if (authority.level === 'local') return t('rating.authority.tooltipLocal')
  return t('rating.authority.tooltipUnavailable')
}

function iconFor(authority: ScoreAuthority) {
  if (authority.comparable) return <VerifiedOutlinedIcon fontSize="small" />
  if (authority.level === 'unavailable') return <GppMaybeOutlinedIcon fontSize="small" />
  return <InfoOutlinedIcon fontSize="small" />
}

export function RatingAuthorityBadge({ authority, size = 'small' }: RatingAuthorityBadgeProps) {
  if (!authority) return null
  return (
    <Tooltip title={tooltipFor(authority)} arrow>
      <Chip
        icon={iconFor(authority)}
        label={labelFor(authority)}
        color={LEVEL_COLOR[authority.level] ?? 'default'}
        size={size}
        variant={authority.comparable ? 'filled' : 'outlined'}
        sx={{ maxWidth: '100%', '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
      />
    </Tooltip>
  )
}
