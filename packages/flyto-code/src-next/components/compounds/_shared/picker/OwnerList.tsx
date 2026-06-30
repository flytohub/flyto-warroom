import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import { ChevronRight, Building2, User } from 'lucide-react'
import { t } from '@lib/i18n'
import type { OwnerGroup } from './RepoPickerModal'

interface OwnerListProps {
  owners: OwnerGroup[]
  selected: Set<string>
  onSelectOwner: (login: string) => void
}

export function OwnerList({ owners, selected, onSelectOwner }: OwnerListProps) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('repoPicker.selectOwner')}
      </Typography>
      <Box sx={{ maxHeight: 400, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {owners.map((owner) => {
          const ownerSelected = owner.repos.filter((r) => selected.has(r.providerId)).length
          return (
            <Box
              key={owner.login}
              onClick={() => onSelectOwner(owner.login)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 2,
                px: 2, py: 1.5, borderRadius: 2, cursor: 'pointer',
                border: 1, borderColor: 'divider',
                transition: 'all 0.15s',
                '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
              }}
            >
              <Avatar src={owner.avatarUrl} sx={{ width: 36, height: 36 }} />
              {owner.isOrg
                ? <Building2 size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
                : <User size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
              }
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600} noWrap>{owner.login}</Typography>
              </Box>
              <Chip
                label={ownerSelected > 0
                  ? `${ownerSelected} / ${owner.repos.length} repos`
                  : `${owner.repos.length} repos`}
                size="small"
                variant="outlined"
                sx={{ fontWeight: 500, fontSize: 12 }}
              />
              <ChevronRight size={16} style={{ opacity: 0.3, flexShrink: 0 }} />
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
