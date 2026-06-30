/**
 * SeverityChip — token-colored severity pill. No inline hex; pulls
 * tone/soft/ring from the severity token table.
 */

import Box from '@mui/material/Box'
import { SEVERITY_TONE, type Severity } from '@lib/tokens/severity'

export interface SeverityChipProps {
  severity: Severity
  /** Override the displayed text. Defaults to the (capitalized) severity. */
  label?: string
  size?: 'sm' | 'md'
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Unknown'
}

export function SeverityChip({ severity, label, size = 'md' }: SeverityChipProps) {
  const t = SEVERITY_TONE[severity] ?? SEVERITY_TONE['']
  const dims =
    size === 'sm'
      ? { px: 0.75, py: 0.125, fontSize: 12 }
      : { px: 1, py: 0.25, fontSize: 12 }

  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        borderRadius: 999,
        bgcolor: t.soft,
        border: `1px solid ${t.ring}`,
        color: t.tone,
        fontWeight: 600,
        lineHeight: 1.5,
        whiteSpace: 'nowrap',
        ...dims,
      }}
    >
      <Box
        component="span"
        sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: t.tone, flexShrink: 0 }}
      />
      {label ?? cap(severity)}
    </Box>
  )
}
