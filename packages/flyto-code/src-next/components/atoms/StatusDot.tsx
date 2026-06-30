import { Box } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'

/**
 * StatusDot — the small solid colour-coded circle used as a health /
 * online / status indicator (connector reachable, system OK, legend
 * swatch, …).
 *
 * Was previously: a one-line `<span/Box style={{ width, height,
 * borderRadius: '50%', background }} />` re-declared per file (operations
 * ConnectorHealthPanel, PostureSnapshotChart legend, …). Trivial, but it
 * is the same element each time — so it lives here once.
 *
 * Pass any colour (hex / token / CSS var). Default 9px to match the
 * operator-plane health dots.
 */

export interface StatusDotProps {
  color: string
  /** Diameter in px. Default 9. */
  size?: number
  sx?: SxProps<Theme>
}

export function StatusDot({ color, size = 9, sx }: StatusDotProps) {
  return (
    <Box
      component="span"
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        bgcolor: color,
        flexShrink: 0,
        display: 'inline-block',
        ...sx,
      }}
    />
  )
}
