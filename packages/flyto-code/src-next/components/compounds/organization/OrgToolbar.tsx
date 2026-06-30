import { Trash2, Maximize2 } from 'lucide-react'
import Tooltip from '@mui/material/Tooltip'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import { t } from '@lib/i18n'
import { colors } from '@/styles/designTokens'
import type { ToolItem } from './types'
import { getTools } from './tools'

// Section accent (#06b6d4) — same hue the manager surface carries on
// its header, so toggling manager ↔ engineer feels like one page.
const ACCENT = colors.tech

interface OrgToolbarProps {
  selectedId: string | null
  onAddNode: (tool: ToolItem) => void
  onDelete: () => void
  onFitToView: () => void
}

export function OrgToolbar({ selectedId, onAddNode, onDelete, onFitToView }: OrgToolbarProps) {
  return (
    <Box sx={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5,
      p: 1, bgcolor: 'background.paper', borderRadius: 2,
      border: '1px solid', borderColor: 'divider',
      position: 'absolute', left: 12, top: 12, zIndex: 10,
      boxShadow: 2,
      // Thin accent rail ties the engineer canvas chrome to the
      // section colour the manager header uses.
      borderTop: `2px solid ${ACCENT}`,
    }}>
      <Typography variant="body2" sx={{ fontWeight: 700, fontSize: 12, textTransform: 'uppercase', color: ACCENT }}>
        {t('org.toolbar.add')}
      </Typography>

      {/* Node-type palette icons were one-per-type colour (red /
          orange / yellow / green / cyan / blue / violet), which read
          as a rainbow strip on every Org Chart load. Per the grounded
          palette, icons are neutral slate at rest and hover into the
          brand violet so the user still gets affordance feedback. */}
      {getTools().map((tool) => {
        const Icon = tool.icon
        return (
          <Tooltip key={tool.type} title={tool.label} placement="right" arrow enterDelay={200}>
            <IconButton
              size="small"
              onClick={() => onAddNode(tool)}
              aria-label={tool.label}
              title={tool.label}
              sx={{
                width: 32, height: 32,
                color: 'text.secondary',
                bgcolor: 'transparent',
                '&:hover': { color: 'primary.main', bgcolor: 'rgba(124, 58, 237, 0.12)' },
              }}
            >
              <Icon size={16} />
            </IconButton>
          </Tooltip>
        )
      })}

      <Divider flexItem sx={{ my: 0.5 }} />

      <Tooltip title={t('org.toolbar.delete')} placement="right" arrow enterDelay={200}>
        <span>
          <IconButton
            size="small"
            disabled={!selectedId || selectedId === 'root'}
            onClick={onDelete}
            aria-label={t('org.toolbar.delete')}
            title={t('org.toolbar.delete')}
            sx={{ width: 32, height: 32, color: 'error.main', '&:hover': { bgcolor: 'error.dark', color: 'error.contrastText' } }}
          >
            <Trash2 size={16} />
          </IconButton>
        </span>
      </Tooltip>

      <Tooltip title={t('org.toolbar.fit')} placement="right" arrow enterDelay={200}>
        <IconButton
          size="small"
          onClick={onFitToView}
          aria-label={t('org.toolbar.fit')}
          title={t('org.toolbar.fit')}
          sx={{
            width: 32, height: 32, color: 'text.secondary',
            '&:hover': { color: 'primary.main', bgcolor: 'rgba(124, 58, 237, 0.12)' },
          }}
        >
          <Maximize2 size={16} />
        </IconButton>
      </Tooltip>
    </Box>
  )
}
