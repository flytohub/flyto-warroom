/**
 * JoinTableNode — UML-style data source block on the JOIN canvas.
 * Header (draggable) + list of JoinTableField rows.
 */

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import { X, GripVertical } from 'lucide-react'
import { DATA_SOURCE_MAP } from './datasources'
import { t } from '@lib/i18n';
import type { JoinNode } from './joinLogic'
import { NODE_W } from './joinLogic'
import { JoinTableField } from './JoinTableField'

interface Props {
  node: JoinNode
  onMouseDown: (e: React.MouseEvent, nodeId: string) => void
  onRemove: (nodeId: string) => void
  onToggleField: (nodeId: string, field: string) => void
  onPortMouseDown: (nodeId: string, field: string, fieldType: string, e: React.MouseEvent) => void
  onPortMouseUp: (nodeId: string, field: string, fieldType: string) => void
  drawingEdge: { sourceFieldType: string } | null
}

export function JoinTableNode({
  node, onMouseDown, onRemove, onToggleField,
  onPortMouseDown, onPortMouseUp, drawingEdge,
}: Props) {
  const ds = DATA_SOURCE_MAP[node.sourceId]
  if (!ds) return null

  const fields = ds.fields
  const checkedCount = node.selectedFields.length

  return (
    <div style={{
      position: 'absolute', left: node.x, top: node.y,
      width: NODE_W, zIndex: 10,
      filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.5))',
      border: '1px solid', borderColor: 'var(--mui-palette-divider)',
      borderRadius: 10, overflow: 'visible',
    }}>
      {/* Header */}
      <Box
        onMouseDown={e => onMouseDown(e, node.id)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 1.25,
          px: 2, py: 1.25,
          bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(139,92,246,0.15)' : '#ede9fe',
          borderRadius: '9px 9px 0 0',
          borderBottom: '2px solid',
          borderBottomColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(139,92,246,0.3)' : '#c4b5fd',
          cursor: 'grab', userSelect: 'none',
          '&:active': { cursor: 'grabbing' },
        }}
      >
        <GripVertical size={12} style={{ color: 'var(--mui-palette-text-disabled)', flexShrink: 0 }} />
        <ds.icon size={16} style={{ color: 'var(--mui-palette-primary-main, #8b5cf6)', flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={700} sx={{ color: 'text.primary', fontSize: 13, lineHeight: 1.3 }} noWrap>
            {ds.name}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 12 }}>
            {checkedCount}/{fields.length} fields
          </Typography>
        </Box>
        <IconButton
          size="small"
          onClick={e => { e.stopPropagation(); onRemove(node.id) }}
          aria-label={t('common.delete')}
          title={t('common.delete')}
          sx={{ p: 0.4, color: 'text.secondary', '&:hover': { color: '#ef4444', bgcolor: 'rgba(239,68,68,0.1)' } }}
        >
          <X size={14} />
        </IconButton>
      </Box>

      {/* Fields */}
      <Box sx={{
        bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#ffffff',
        borderRadius: '0 0 9px 9px',
        overflow: 'visible',
      }}>
        {fields.map((f, i) => (
          <JoinTableField
            key={f.key}
            field={f}
            checked={node.selectedFields.includes(f.key)}
            isLast={i === fields.length - 1}
            nodeId={node.id}
            drawingEdge={drawingEdge}
            onToggleField={onToggleField}
            onPortMouseDown={onPortMouseDown}
            onPortMouseUp={onPortMouseUp}
          />
        ))}
      </Box>
    </div>
  )
}
