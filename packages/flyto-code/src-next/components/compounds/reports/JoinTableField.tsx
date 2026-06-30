/**
 * JoinTableField — single field row inside a JoinTableNode.
 * Shows: left port ● + checkbox + field name + type chip + right port ●
 */

import Box from '@mui/material/Box'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import { FIELD_H, PORT_R } from './joinLogic'
import type { FieldDef } from './types'

const TYPE_COLORS: Record<string, string> = {
  string: '#3b82f6', number: '#22c55e', date: '#f97316',
  severity: '#ef4444', grade: '#eab308', boolean: '#8b5cf6', array: '#06b6d4',
}

interface Props {
  field: FieldDef
  checked: boolean
  isLast: boolean
  nodeId: string
  drawingEdge: { sourceFieldType: string } | null
  onToggleField: (nodeId: string, field: string) => void
  onPortMouseDown: (nodeId: string, field: string, fieldType: string, e: React.MouseEvent) => void
  onPortMouseUp: (nodeId: string, field: string, fieldType: string) => void
}

export function JoinTableField({
  field: f, checked, isLast, nodeId,
  drawingEdge, onToggleField, onPortMouseDown, onPortMouseUp,
}: Props) {
  const typeColor = TYPE_COLORS[f.type] ?? '#6b7280'
  const isCompatible = drawingEdge ? drawingEdge.sourceFieldType === f.type : false
  const isDimmed = drawingEdge ? !isCompatible : false

  return (
    <Box sx={{
      display: 'flex', alignItems: 'center',
      height: FIELD_H, px: 1,
      borderBottom: isLast ? 'none' : '1px solid',
      borderBottomColor: isLast ? undefined : 'divider',
      bgcolor: checked ? 'rgba(139,92,246,0.06)' : 'transparent',
      '&:hover': { bgcolor: 'rgba(139,92,246,0.1)' },
      position: 'relative',
      transition: 'background 0.1s',
    }}>
      {/* Left port */}
      <Box
        onMouseDown={e => onPortMouseDown(nodeId, f.key, f.type, e)}
        onMouseUp={() => drawingEdge && isCompatible && onPortMouseUp(nodeId, f.key, f.type)}
        sx={{
          position: 'absolute', left: -PORT_R, top: '50%', transform: 'translateY(-50%)',
          width: PORT_R * 2, height: PORT_R * 2, borderRadius: '50%',
          bgcolor: isDimmed ? 'action.disabled' : typeColor,
          border: '1.5px solid',
          borderColor: isDimmed ? 'divider' : isCompatible ? '#fff' : 'background.paper',
          opacity: isDimmed ? 0.25 : 1,
          cursor: isDimmed ? 'not-allowed' : 'crosshair',
          '&:hover': isDimmed ? {} : { boxShadow: `0 0 6px ${typeColor}60`, transform: 'translateY(-50%) scale(1.2)' },
          transition: 'all 0.2s ease', zIndex: 20,
        }}
      />

      <Checkbox
        size="small" checked={checked}
        onChange={() => onToggleField(nodeId, f.key)}
        sx={{ p: 0.3, ml: 0.75, color: 'text.secondary', '&.Mui-checked': { color: '#a78bfa' }, '& .MuiSvgIcon-root': { fontSize: 16 } }}
      />
      <Typography variant="body2" sx={{
        flex: 1, fontSize: 12, fontFamily: 'monospace',
        color: 'text.primary', opacity: checked ? 1 : 0.4,
        ml: 0.5, fontWeight: checked ? 600 : 400,
      }} noWrap>
        {f.key}
      </Typography>
      <Chip label={f.type} size="small" sx={{
        height: 20, fontSize: 12, fontWeight: 600,
        bgcolor: `${typeColor}15`, color: typeColor,
        border: `1px solid ${typeColor}30`, mr: 1.25,
      }} />

      {/* Right port */}
      <Box
        onMouseDown={e => onPortMouseDown(nodeId, f.key, f.type, e)}
        onMouseUp={() => drawingEdge && isCompatible && onPortMouseUp(nodeId, f.key, f.type)}
        sx={{
          position: 'absolute', right: -PORT_R, top: '50%', transform: 'translateY(-50%)',
          width: PORT_R * 2, height: PORT_R * 2, borderRadius: '50%',
          bgcolor: isDimmed ? 'action.disabled' : typeColor,
          border: '1.5px solid',
          borderColor: isDimmed ? 'divider' : isCompatible ? '#fff' : 'background.paper',
          opacity: isDimmed ? 0.25 : 1,
          cursor: isDimmed ? 'not-allowed' : 'crosshair',
          '&:hover': isDimmed ? {} : { boxShadow: `0 0 6px ${typeColor}60`, transform: 'translateY(-50%) scale(1.2)' },
          transition: 'all 0.2s ease', zIndex: 20,
        }}
      />
    </Box>
  )
}
