import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import type { SxProps, Theme } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import { FlytoSurface, type FlytoSurfaceDensity, type FlytoSurfaceTone } from './FlytoSurface'
import { flytoSpacing, flytoTextStyles } from '@/styles/visualSystem'

export interface FlytoCodeBlockProps {
  value: ReactNode
  label?: ReactNode
  detail?: ReactNode
  icon?: ReactNode
  action?: ReactNode
  tone?: FlytoSurfaceTone
  density?: FlytoSurfaceDensity
  minHeight?: number | string
  maxHeight?: number | string
  wrap?: boolean
  sx?: SxProps<Theme>
  preSx?: SxProps<Theme>
}

export function FlytoCodeBlock({
  value,
  label,
  detail,
  icon,
  action,
  tone = 'neutral',
  density = 'regular',
  minHeight,
  maxHeight = 360,
  wrap = true,
  sx,
  preSx,
}: FlytoCodeBlockProps) {
  const theme = useTheme()
  const pad = flytoSpacing.surfacePadding[density]

  return (
    <FlytoSurface
      title={label}
      subtitle={detail}
      icon={icon}
      action={action}
      tone={tone}
      density={density}
      bodySx={{ p: 0 }}
      sx={sx}
    >
      <Box
        component="pre"
        sx={{
          ...flytoTextStyles.codeSmall,
          m: 0,
          p: pad,
          minHeight,
          maxHeight,
          overflow: 'auto',
          bgcolor: theme.palette.mode === 'dark'
            ? alpha(theme.palette.common.white, 0.035)
            : alpha(theme.palette.common.black, 0.025),
          color: 'text.primary',
          whiteSpace: wrap ? 'pre-wrap' : 'pre',
          overflowWrap: wrap ? 'anywhere' : undefined,
          wordBreak: wrap ? 'break-word' : undefined,
          ...preSx,
        }}
      >
        {value}
      </Box>
    </FlytoSurface>
  )
}
