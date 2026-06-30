import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import MuiCheckbox from '@mui/material/Checkbox'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import { Search, GitBranch, Lock, Globe, ChevronLeft } from 'lucide-react'
import { t } from '@lib/i18n'
import type { Repository } from '@code/repository'
import type { OwnerGroup } from './RepoPickerModal'

interface RepoListProps {
  selectedOwner: string
  owners: OwnerGroup[]
  ownerRepos: Repository[]
  selected: Set<string>
  search: string
  onSearchChange: (value: string) => void
  onToggleRepo: (id: string) => void
  onSelectAll: () => void
  onBack: () => void
}

export function RepoList({
  selectedOwner, owners, ownerRepos, selected, search,
  onSearchChange, onToggleRepo, onSelectAll, onBack,
}: RepoListProps) {
  const owner = owners.find((o) => o.login === selectedOwner)
  const allIds = ownerRepos.map((r) => r.providerId)
  const allChecked = allIds.length > 0 && allIds.every((id) => selected.has(id))

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {/* Back + owner header */}
      <Button
        variant="text"
        startIcon={<ChevronLeft size={16} />}
        onClick={onBack}
        sx={{ alignSelf: 'flex-start', textTransform: 'none', fontWeight: 600, color: 'text.primary', gap: 1 }}
      >
        <Avatar src={owner?.avatarUrl} sx={{ width: 24, height: 24 }} />
        {selectedOwner}
      </Button>

      <TextField
        placeholder={t('repoPicker.search')}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        size="small"
        fullWidth
        slotProps={{
          input: {
            startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment>,
          },
        }}
      />

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="body2" color="text.secondary">
          {ownerRepos.length} repos
        </Typography>
        <Button size="small" onClick={onSelectAll} sx={{ textTransform: 'none', fontSize: 12 }}>
          {allChecked ? t('repoPicker.deselectAll') : t('repoPicker.selectAll')}
        </Button>
      </Box>

      <Box sx={{ maxHeight: 350, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {ownerRepos.map((repo) => (
          <Box
            key={repo.providerId}
            component="label"
            sx={{
              display: 'flex', alignItems: 'center', gap: 1.5,
              p: 1.5, borderRadius: 2, cursor: 'pointer',
              border: 1, borderColor: selected.has(repo.providerId) ? 'primary.main' : 'transparent',
              bgcolor: selected.has(repo.providerId) ? 'action.selected' : 'transparent',
              '&:hover': { bgcolor: 'action.hover' },
              transition: 'all 0.15s',
            }}
          >
            <MuiCheckbox
              checked={selected.has(repo.providerId)}
              onChange={() => onToggleRepo(repo.providerId)}
              size="small"
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <GitBranch size={14} style={{ opacity: 0.4, flexShrink: 0 }} />
                <Typography variant="body2" fontWeight={500} noWrap>{repo.name}</Typography>
                {repo.isPrivate
                  ? <Lock size={12} style={{ opacity: 0.4, flexShrink: 0 }} />
                  : <Globe size={12} style={{ opacity: 0.4, flexShrink: 0 }} />
                }
                {repo.language && (
                  <Chip label={repo.language} size="small" variant="outlined" sx={{ fontSize: 12, height: 24 }} />
                )}
              </Box>
              {repo.description && (
                <Typography variant="body2" color="text.secondary" noWrap sx={{ ml: 3.5 }}>
                  {repo.description}
                </Typography>
              )}
            </Box>
          </Box>
        ))}
        {ownerRepos.length === 0 && (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">{t('repoPicker.noMatch')}</Typography>
          </Box>
        )}
      </Box>
    </Box>
  )
}
