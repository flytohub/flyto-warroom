import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Tooltip from '@mui/material/Tooltip'
import IconButton from '@mui/material/IconButton'
import { t } from '@lib/i18n'
import { AiPanelBriefing } from './AiPanelBriefing'
import { AiPanelHotFindings } from './AiPanelHotFindings'
import { AiPanelActions } from './AiPanelActions'

interface AiPanelProps {
  collapsed: boolean
  onToggle: () => void
}

export function AiPanel({ collapsed, onToggle }: AiPanelProps) {
  if (collapsed) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          pt: 1,
          width: 48,
          height: '100%',
          borderLeft: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Tooltip title={t('nav.studio')} placement="left" arrow>
          <IconButton
            aria-label={t('nav.studio')}
            onClick={onToggle}
            size="small"
            sx={{
              color: 'text.secondary',
              '&:hover': { color: 'text.primary', bgcolor: 'action.hover' },
            }}
          >
            <PanelRightOpen size={22} />
          </IconButton>
        </Tooltip>
      </Box>
    )
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: 320,
        borderLeft: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.default',
      }}
    >
      <Paper
        elevation={0}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          m: 1,
          borderRadius: 2,
          bgcolor: 'background.paper',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1.5,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {t('nav.studio')}
          </Typography>
          <Tooltip title={t('common.collapse')}>
            <IconButton
              size="small"
              onClick={onToggle}
              aria-label={t('layout.collapseStudio')}
              sx={{ color: 'text.secondary' }}
            >
              <PanelRightClose size={18} />
            </IconButton>
          </Tooltip>
        </Box>
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <AiPanelBriefing />
          <AiPanelHotFindings />
          <AiPanelActions />
        </Box>
      </Paper>
    </Box>
  )
}
