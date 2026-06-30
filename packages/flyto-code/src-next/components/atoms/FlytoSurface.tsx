import type { MouseEventHandler, ReactNode } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import type { SxProps, Theme } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import { colors } from '@/styles/designTokens'
import {
  flytoIconSizing,
  flytoMotion,
  flytoRadii,
  flytoSpacing,
  flytoSurfaceAlpha,
  flytoTypography,
} from '@/styles/visualSystem'

export type FlytoSurfaceTone =
  | 'neutral'
  | 'brand'
  | 'tech'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'

export type FlytoSurfaceDensity = 'compact' | 'regular' | 'spacious'

export interface FlytoSurfaceProps {
  children: ReactNode
  title?: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  action?: ReactNode
  tone?: FlytoSurfaceTone
  density?: FlytoSurfaceDensity
  selected?: boolean
  interactive?: boolean
  scroll?: boolean
  noHeaderDivider?: boolean
  className?: string
  role?: string
  onClick?: MouseEventHandler<HTMLDivElement>
  sx?: SxProps<Theme>
  bodySx?: SxProps<Theme>
  headerSx?: SxProps<Theme>
}

export function flytoSurfaceToneColor(theme: Theme, tone: FlytoSurfaceTone): string {
  switch (tone) {
    case 'brand':
      return colors.brandDeep
    case 'tech':
      return colors.tech
    case 'success':
      return theme.palette.success.main
    case 'warning':
      return theme.palette.warning.main
    case 'danger':
      return theme.palette.error.main
    case 'info':
      return theme.palette.info.main
    case 'critical':
      return colors.severity.critical
    case 'high':
      return colors.severity.high
    case 'medium':
      return colors.severity.medium
    case 'low':
      return colors.severity.low
    default:
      return theme.palette.text.secondary
  }
}

export function FlytoSurface({
  children,
  title,
  subtitle,
  icon,
  action,
  tone = 'neutral',
  density = 'regular',
  selected = false,
  interactive = false,
  scroll = false,
  noHeaderDivider = false,
  className,
  role,
  onClick,
  sx,
  bodySx,
  headerSx,
}: FlytoSurfaceProps) {
  const theme = useTheme()
  const toneColor = flytoSurfaceToneColor(theme, tone)
  const hasHeader = title != null || subtitle != null || icon != null || action != null
  const pad = flytoSpacing.surfacePadding[density]
  const active = selected || tone !== 'neutral'

  return (
    <Paper
      variant="outlined"
      className={className}
      role={role}
      onClick={onClick}
      sx={{
        minWidth: 0,
        height: scroll ? '100%' : undefined,
        overflow: 'hidden',
        borderRadius: flytoRadii.surface,
        borderColor: selected ? alpha(toneColor, flytoSurfaceAlpha.selectedBorder) : 'divider',
        bgcolor: 'background.paper',
        borderLeft: active ? `3px solid ${alpha(toneColor, selected ? flytoSurfaceAlpha.selectedRail : flytoSurfaceAlpha.activeRail)}` : undefined,
        boxShadow: selected ? `0 0 0 1px ${alpha(toneColor, flytoSurfaceAlpha.selectedRing)}` : 'none',
        transition: interactive ? flytoMotion.hoverTransition : undefined,
        cursor: interactive || onClick ? 'pointer' : undefined,
        ...(active && {
          backgroundColor: alpha(toneColor, theme.palette.mode === 'dark' ? flytoSurfaceAlpha.activeBgDark : flytoSurfaceAlpha.activeBgLight),
        }),
        ...(interactive && {
          '&:hover': {
            borderColor: alpha(toneColor, flytoSurfaceAlpha.selectedBorder),
            boxShadow: `0 0 0 1px ${alpha(toneColor, flytoSurfaceAlpha.hoverRing)}`,
          },
        }),
        ...sx,
      }}
    >
      {hasHeader && (
        <Box
          sx={{
            px: pad,
            py: flytoSpacing.surfaceHeaderPaddingY[density],
            display: 'flex',
            alignItems: 'flex-start',
            gap: flytoSpacing.surfaceGap,
            borderBottom: noHeaderDivider ? 0 : '1px solid',
            borderColor: 'divider',
            bgcolor: alpha(toneColor, active ? flytoSurfaceAlpha.headerActiveBg : flytoSurfaceAlpha.headerNeutralBg),
            minWidth: 0,
            ...headerSx,
          }}
        >
          {icon != null && (
            <Box
              sx={{
                width: flytoIconSizing.surfaceBox[density],
                height: flytoIconSizing.surfaceBox[density],
                borderRadius: flytoRadii.icon,
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: toneColor,
                bgcolor: alpha(toneColor, flytoSurfaceAlpha.iconBg),
                border: '1px solid',
                borderColor: alpha(toneColor, flytoSurfaceAlpha.iconBorder),
                '& svg': {
                  width: flytoIconSizing.surfaceGlyph[density],
                  height: flytoIconSizing.surfaceGlyph[density],
                },
              }}
            >
              {icon}
            </Box>
          )}
          {(title != null || subtitle != null) && (
            <Box sx={{ minWidth: 0, flex: 1 }}>
              {title != null && (
                <Typography
                  variant="subtitle1"
                  sx={{
                    ...flytoTypography.surfaceTitle,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {title}
                </Typography>
              )}
              {subtitle != null && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ ...flytoTypography.surfaceSubtitle, mt: 0.35, maxWidth: 880 }}
                >
                  {subtitle}
                </Typography>
              )}
            </Box>
          )}
          {action != null && (
            <Box
              sx={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: flytoSpacing.actionGap,
                flexWrap: 'wrap',
                maxWidth: '100%',
              }}
            >
              {action}
            </Box>
          )}
        </Box>
      )}
      <Box
        sx={{
          p: pad,
          minWidth: 0,
          height: scroll ? (hasHeader ? `calc(100% - ${flytoSpacing.surfaceHeaderHeight[density]}px)` : '100%') : undefined,
          overflow: scroll ? 'auto' : undefined,
          ...bodySx,
        }}
      >
        {children}
      </Box>
    </Paper>
  )
}
