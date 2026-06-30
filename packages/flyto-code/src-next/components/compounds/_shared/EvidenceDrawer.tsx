/**
 * EvidenceDrawer — right-side MUI Drawer scaffold for engineer
 * drilldowns. Title + close + a scrollable body for caller-supplied
 * sections. Domain agents put whatever evidence UI they want in
 * `children` (or the `sections` helper).
 */

import type { ReactNode } from 'react'
import Drawer from '@mui/material/Drawer'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'
import { alpha, useTheme } from '@mui/material/styles'
import { X } from 'lucide-react'

export interface EvidenceSection {
  title: string
  content: ReactNode
}

export interface EvidenceDrawerProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  /** Structured sections rendered with dividers. */
  sections?: EvidenceSection[]
  /** Free-form body (rendered after `sections`). */
  children?: ReactNode
  /** Sticky footer slot (e.g. action buttons). */
  footer?: ReactNode
  width?: number
}

export function EvidenceDrawer({
  open,
  onClose,
  title,
  subtitle,
  sections,
  children,
  footer,
  width = 460,
}: EvidenceDrawerProps) {
  const theme = useTheme()
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: width }, display: 'flex', flexDirection: 'column' } }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 1,
          px: 2.5,
          py: 2,
          borderBottom: `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" sx={{ color: theme.palette.text.secondary, mt: 0.25 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        <IconButton size="small" onClick={onClose} aria-label="close">
          <X size={18} />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', px: 2.5, py: 2 }}>
        {sections?.map((s, i) => (
          <Box key={s.title} sx={{ mb: 2.5 }}>
            {i > 0 && <Divider sx={{ mb: 2.5 }} />}
            <Typography
              variant="overline"
              sx={{ color: theme.palette.text.secondary, fontWeight: 700, letterSpacing: 0.5 }}
            >
              {s.title}
            </Typography>
            <Box sx={{ mt: 0.75 }}>{s.content}</Box>
          </Box>
        ))}
        {children}
      </Box>

      {footer && (
        <Box
          sx={{
            px: 2.5,
            py: 1.5,
            borderTop: `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
          }}
        >
          {footer}
        </Box>
      )}
    </Drawer>
  )
}
