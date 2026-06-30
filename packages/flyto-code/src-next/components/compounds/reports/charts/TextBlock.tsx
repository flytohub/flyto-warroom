/**
 * TextBlock — static text widget for reports.
 * Renders professional commentary blocks with optional style variants.
 */

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

const STYLES = {
  info:    { border: '#3b82f6', bg: 'rgba(59,130,246,0.06)', icon: '#3b82f6' },
  warning: { border: '#f97316', bg: 'rgba(249,115,22,0.06)', icon: '#f97316' },
  success: { border: '#22c55e', bg: 'rgba(34,197,94,0.06)',  icon: '#22c55e' },
  neutral: { border: '#6b7280', bg: 'rgba(107,114,128,0.06)', icon: '#6b7280' },
}

interface Props {
  content?: string
  style?: 'info' | 'warning' | 'success' | 'neutral'
}

export function TextBlock({ content, style = 'neutral' }: Props) {
  if (!content) return null

  const s = STYLES[style] ?? STYLES.neutral

  // Simple bold parsing: **text** → <strong>text</strong>
  const parts = content.split(/(\*\*.*?\*\*)/g)

  return (
    <Box sx={{
      borderLeft: `3px solid ${s.border}`,
      bgcolor: s.bg,
      borderRadius: '0 6px 6px 0',
      px: 2, py: 1.5,
      minHeight: 40,
    }}>
      <Typography variant="body2" sx={{ lineHeight: 1.7, color: 'text.secondary', fontSize: 12 }}>
        {parts.map((part, i) =>
          part.startsWith('**') && part.endsWith('**')
            ? <strong key={i} style={{ color: 'var(--mui-palette-text-primary)', fontWeight: 700 }}>{part.slice(2, -2)}</strong>
            : <span key={i}>{part}</span>
        )}
      </Typography>
    </Box>
  )
}
