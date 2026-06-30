import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { SxProps, Theme } from '@mui/material'
import { FlytoSurface } from './FlytoSurface'
import { flytoLayout, flytoSpacing, flytoTypography } from '@/styles/visualSystem'

export interface FlytoMetricTileProps {
  label: ReactNode
  value: ReactNode
  icon?: ReactNode
  tone?: string
  sx?: SxProps<Theme>
}

export interface FlytoMetricGridProps {
  children?: ReactNode
  items?: Array<{
    label: ReactNode
    value: ReactNode
    tone?: string
    icon?: ReactNode
  }>
  minWidth?: number
  sx?: SxProps<Theme>
}

export function FlytoMetricTile({ label, value, icon, tone, sx }: FlytoMetricTileProps) {
  return (
    <FlytoSurface density="compact" sx={{ minWidth: 0, ...sx }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
        {icon != null && (
          <Box sx={{ display: 'grid', placeItems: 'center', color: tone ?? 'primary.main', flexShrink: 0 }}>
            {icon}
          </Box>
        )}
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={flytoTypography.metricLabel}>
            {label}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              ...flytoTypography.metricValue,
              fontSize: 15,
              color: tone ?? 'text.primary',
              overflowWrap: 'anywhere',
            }}
          >
            {value}
          </Typography>
        </Box>
      </Box>
    </FlytoSurface>
  )
}

export function FlytoMetricGrid({
  children,
  items,
  minWidth = flytoLayout.metricCardMinWidth,
  sx,
}: FlytoMetricGridProps) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`,
        gap: flytoSpacing.gridGap,
        minWidth: 0,
        ...sx,
      }}
    >
      {items?.map((item, index) => (
        <FlytoMetricTile
          key={`${String(item.label)}-${index}`}
          label={item.label}
          value={item.value}
          tone={item.tone}
          icon={item.icon}
        />
      ))}
      {children}
    </Box>
  )
}
