/**
 * JoinChartSelector — Step 3: chart type grid with smart disable + preview button.
 */

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import IconButton from '@mui/material/IconButton'
import { Eye } from 'lucide-react'
import { t } from '@lib/i18n';
import { CHART_TYPES } from './chartTypes'
import { CHART_COLORS } from './utils'
import type { ChartType } from './types'

interface Props {
  chartType: ChartType | ''
  onChartTypeChange: (ct: ChartType) => void
  hasData: boolean
  stringFields: string[]
  numericFields: string[]
  onPreview: () => void
}

export function JoinChartSelector({ chartType, onChartTypeChange, hasData, stringFields, numericFields, onPreview }: Props) {
  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 2, py: 1, flexShrink: 0 }}>
        <Typography variant="caption" fontWeight={700} sx={{ fontSize: 13, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>
          {t('reports.step3')}
        </Typography>
        {chartType && (
          <IconButton
            size="small"
            onClick={onPreview}
            aria-label={t('reports.previewChart')}
            title={t('reports.previewChart')}
            sx={{ p: 0.25, color: '#8b5cf6' }}
          >
            <Eye size={16} />
          </IconButton>
        )}
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', px: 2, pb: 1, opacity: hasData ? 1 : 0.3, pointerEvents: hasData ? 'auto' : 'none' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0.75 }}>
          {CHART_TYPES.map(ct => {
            const color = CHART_COLORS[ct.type] ?? '#6b7280'
            const active = chartType === ct.type
            const hasStr = stringFields.length > 0
            const hasNum = numericFields.length > 0
            let disabled = false
            if (['donut', 'bar', 'treemap', 'radialBar'].includes(ct.type)) disabled = !hasStr
            else if (['radar', 'heatmap'].includes(ct.type)) disabled = !hasStr || !hasNum
            else if (ct.type === 'gauge') disabled = !hasNum
            return (
              <Paper key={ct.type} elevation={0} onClick={disabled ? undefined : () => onChartTypeChange(ct.type)}
                sx={{
                  p: 0.75, borderRadius: 1.5, cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.3 : 1, border: '1px solid',
                  borderColor: active ? color : 'divider',
                  bgcolor: active ? `${color}15` : 'transparent',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25,
                  '&:hover': disabled ? {} : { borderColor: color },
                  transition: 'all 0.15s',
                }}
              >
                <ct.icon size={18} style={{ color: disabled ? 'rgba(128,128,128,0.3)' : color }} />
                <Typography variant="caption" sx={{ fontSize: 13, textAlign: 'center', color: disabled ? 'text.secondary' : active ? color : 'text.secondary' }}>
                  {ct.name}
                </Typography>
              </Paper>
            )
          })}
        </Box>
      </Box>
    </Box>
  )
}
