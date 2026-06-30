import Paper from '@mui/material/Paper'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { Flame } from 'lucide-react'

/**
 * PulseTile — one risk counter on the Projects hero.
 *
 * Extracted from ProjectsPage 2026-05-19 (was inline at lines 57-105
 * of that file). Compact card, clickable when there's a single org so
 * the click deep-links to the relevant filter view. Background uses
 * the metric's semantic colour at 8% alpha (visible but not loud);
 * the icon picks up the same colour at full saturation, value text
 * in tertiary so the icon-driven look is the anchor.
 */
export function PulseTile({
  icon: Icon, label, value, color, onClick,
}: {
  icon: typeof Flame
  label: string
  value: number
  color: string
  onClick?: () => void
}) {
  const muted = value === 0
  const tint = muted ? '#94a3b8' : color
  return (
    <Paper
      elevation={0}
      onClick={onClick}
      sx={{
        p: 2, borderRadius: 3,
        border: 1, borderColor: muted ? 'divider' : `${tint}33`,
        bgcolor: muted ? 'background.paper' : `${tint}0d`, // 0d = 5% alpha
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex', alignItems: 'center', gap: 1.5,
        transition: 'all 0.15s',
        ...(onClick && !muted ? {
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: `0 8px 24px ${tint}22`,
          },
        } : {}),
      }}
    >
      <Box sx={{
        width: 40, height: 40, borderRadius: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        bgcolor: `${tint}1a`,
        flexShrink: 0,
      }}>
        <Icon size={20} style={{ color: tint }} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h5" fontWeight={800} sx={{ color: muted ? 'text.primary' : tint, lineHeight: 1 }}>
          {value.toLocaleString()}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontWeight: 500 }}>
          {label}
        </Typography>
      </Box>
    </Paper>
  )
}
