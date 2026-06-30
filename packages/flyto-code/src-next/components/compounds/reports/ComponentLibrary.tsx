/**
 * ComponentLibrary — displays saved custom components with delete action.
 * Extracted from DataStudioTab bottom section.
 */

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import { Database, Trash2 } from 'lucide-react'
import { t } from '@lib/i18n';
import { CHART_TYPE_MAP } from './chartTypes'
import { CHART_COLORS } from './utils'
import type { SavedComponent } from './types'

interface Props {
  components: SavedComponent[]
  onDelete: (id: string) => void
}

export function ComponentLibrary({ components, onDelete }: Props) {
  return (
    <Box sx={{ flexShrink: 0, borderTop: '2px solid', borderTopColor: 'divider', maxHeight: '35%', overflow: 'auto' }}>
      <Box sx={{ px: 2, py: 0.75, display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Database size={12} style={{ color: '#22c55e' }} />
        <Typography variant="caption" fontWeight={700} sx={{ color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>
          {t('reports.myComponents')}
        </Typography>
        <Chip label={components.length} size="small" sx={{ height: 16, fontSize: 12, fontWeight: 700 }} />
      </Box>
      {components.length === 0 ? (
        <Box sx={{ py: 1.5, textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12 }}>
            {t('reports.noComponents')}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ px: 1, pb: 1 }}>
          {components.map(c => {
            const ct = CHART_TYPE_MAP[c.chartType]
            const color = CHART_COLORS[c.chartType] ?? '#6b7280'
            return (
              <Box key={c.id} sx={{
                display: 'flex', alignItems: 'center', gap: 0.5,
                px: 0.75, py: 0.4, mb: 0.25, borderRadius: 1,
                '&:hover': { bgcolor: 'action.hover' },
              }}>
                {ct && <ct.icon size={10} style={{ color }} />}
                <Typography variant="caption" sx={{ flex: 1, fontSize: 12, fontWeight: 500 }} noWrap>
                  {c.name}
                </Typography>
                <Tooltip title={t('common.delete')}>
                  <IconButton
                    size="small"
                    onClick={() => onDelete(c.id)}
                    aria-label={t('common.delete')}
                    sx={{ p: 0.2, color: 'text.secondary', '&:hover': { color: '#ef4444' } }}
                  >
                    <Trash2 size={10} />
                  </IconButton>
                </Tooltip>
              </Box>
            )
          })}
        </Box>
      )}
    </Box>
  )
}
