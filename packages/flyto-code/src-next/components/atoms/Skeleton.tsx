import { Box } from '@mui/material'

// Skeleton + SkeletonRows — placeholder atoms while async data
// loads. Replaces the bare CircularProgress spinner so async state
// matches the final shape and the layout doesn't shift on data
// arrival.
//
// Built on MUI's Box so it inherits the palette via
// `var(--mui-palette-*)` — looks correct in both dark + light
// modes without extra theming work.

export interface SkeletonProps {
  width?: number | string
  height?: number | string
  radius?: number
}

export function Skeleton({ width = '100%', height = 12, radius = 4 }: SkeletonProps) {
  return (
    <Box
      sx={{
        width,
        height,
        borderRadius: `${radius}px`,
        background: 'linear-gradient(90deg, var(--mui-palette-action-disabledBackground, rgba(148,163,184,0.12)) 0%, var(--mui-palette-action-hover, rgba(148,163,184,0.20)) 50%, var(--mui-palette-action-disabledBackground, rgba(148,163,184,0.12)) 100%)',
        backgroundSize: '200% 100%',
        animation: 'flyto-skel-pulse 1.6s ease-in-out infinite',
        '@keyframes flyto-skel-pulse': {
          '0%':   { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      }}
    />
  )
}

export interface SkeletonRowsProps {
  rows?: number
  rowHeight?: number
  gap?: number
}

/** Repeats `Skeleton` rows N times — matches the picker / mitigation
 *  list shape so the layout doesn't jump when data lands. */
export function SkeletonRows({ rows = 4, rowHeight = 28, gap = 8 }: SkeletonRowsProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${gap}px`, p: 1 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Skeleton width={36} height={rowHeight - 4} radius={6} />
          <Skeleton width="40%" height={rowHeight - 6} />
          <Box sx={{ flex: 1 }} />
          <Skeleton width={48} height={20} radius={10} />
          <Skeleton width={48} height={20} radius={10} />
        </Box>
      ))}
    </Box>
  )
}
