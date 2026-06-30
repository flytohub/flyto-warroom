/**
 * AiPanelSection — collapsible section wrapper for AiPanel content.
 */

import { useState, type ReactNode } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Collapse from '@mui/material/Collapse'
import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'
import { tOr } from '@lib/i18n'

interface Props {
  title: string
  icon: LucideIcon
  iconColor?: string
  defaultOpen?: boolean
  children: ReactNode
}

export function AiPanelSection({ title, icon: Icon, iconColor = '#8b5cf6', defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Box>
      <Box
        onClick={() => setOpen(v => !v)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.75,
          px: 1.5, py: 1,
          cursor: 'pointer',
          '&:hover': { bgcolor: 'action.hover' },
          borderBottom: '1px solid', borderColor: 'divider',
        }}
      >
        <Icon size={14} style={{ color: iconColor, flexShrink: 0 }} />
        <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ flex: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {title}
        </Typography>
        <IconButton
          size="small"
          aria-label={open
            ? tOr('common.collapseSection', `Collapse ${title}`).replace('{title}', title)
            : tOr('common.expandSection', `Expand ${title}`).replace('{title}', title)}
          sx={{ p: 0, color: 'text.secondary' }}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </IconButton>
      </Box>
      <Collapse in={open}>
        <Box sx={{ p: 1.5 }}>
          {children}
        </Box>
      </Collapse>
    </Box>
  )
}
