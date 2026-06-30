/**
 * JoinResultPreview — Step 2: join summary row + data preview dialog.
 */

import { useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import IconButton from '@mui/material/IconButton'
import { X, Table2 } from 'lucide-react'
import { t } from '@lib/i18n';
import type { JoinEdge } from './joinLogic'

interface Props {
  rowCount: number
  fields: string[]
  edges: JoinEdge[]
  nodeCount: number
  rows: any[]
}

export function JoinResultPreview({ rowCount, fields, nodeCount, rows }: Props) {
  const [open, setOpen] = useState(false)
  const hasData = rowCount > 0

  return (
    <Box sx={{ height: 90, flexShrink: 0, px: 2, py: 1, borderBottom: '2px solid', borderBottomColor: 'divider', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
        <Typography variant="caption" fontWeight={700} sx={{ fontSize: 13, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>
          {t('reports.step2')}
        </Typography>
        {hasData && (
          <>
            <Chip label={`${rowCount}`} size="small" sx={{ height: 22, fontSize: 13, fontWeight: 700 }} />
            <IconButton
              size="small"
              onClick={() => setOpen(true)}
              aria-label={t('reports.dataPreview')}
              title={t('reports.dataPreview')}
              sx={{ p: 0.25, color: 'text.secondary' }}
            >
              <Table2 size={16} />
            </IconButton>
          </>
        )}
      </Box>
      {hasData ? (
        <Box sx={{ overflow: 'auto', borderRadius: 1, border: '1px solid', borderColor: 'divider', flex: 1, minHeight: 0 }}>
          <Box sx={{ display: 'flex', minWidth: 'max-content' }}>
            {fields.map(f => (
              <Box key={f} sx={{
                px: 1, py: 0.5, fontSize: 12, fontFamily: 'monospace', fontWeight: 600,
                color: 'text.primary', whiteSpace: 'nowrap',
                borderRight: '1px solid', borderRightColor: 'divider', bgcolor: 'action.hover',
                '&:last-child': { borderRight: 'none' },
              }}>
                {f}
              </Box>
            ))}
          </Box>
        </Box>
      ) : (
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 13 }}>
          {nodeCount === 0 ? t('reports.addSourceFirst') : t('reports.drawEdge')}
        </Typography>
      )}

      {/* Data preview dialog */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {t('reports.dataPreview')}
          <Chip label={`${rowCount} rows · ${fields.length} fields`} size="small" sx={{ ml: 1 }} />
          <Box sx={{ flex: 1 }} />
          <IconButton
            onClick={() => setOpen(false)}
            size="small"
            aria-label={t('common.close')}
            title={t('common.close')}
          >
            <X size={16} />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <Box sx={{ overflow: 'auto', maxHeight: '60vh' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--mui-palette-divider)', position: 'sticky', top: 0, background: 'var(--mui-palette-background-paper)' }}>
                  {fields.map(f => (
                    <th key={f} style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 700, whiteSpace: 'nowrap', color: 'var(--mui-palette-text-primary)' }}>{f}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--mui-palette-divider)' }}>
                    {fields.map(f => {
                      const val = row[f]
                      const display = val == null ? '-' : typeof val === 'object' ? '...' : String(val)
                      return <td key={f} style={{ padding: '6px 12px', color: 'var(--mui-palette-text-primary)', whiteSpace: 'nowrap' }}>{display}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  )
}
