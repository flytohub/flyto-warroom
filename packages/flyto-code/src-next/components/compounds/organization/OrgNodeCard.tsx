import { GripVertical, Trash2, Plus } from 'lucide-react'
import Paper from '@mui/material/Paper'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import ButtonBase from '@mui/material/ButtonBase'
import { t } from '@lib/i18n';
import { GRADE_COLORS } from '@compounds/_shared/scoring'
import type { OrgNode, ToolItem } from './types'
import { getIcon, getTools } from './tools'
import { NODE_W, NODE_H } from './useOrgChart'

function NodeIcon({ icon }: { icon: string }) {
  const Icon = getIcon(icon)
  return <Icon size={18} />
}

interface OrgNodeCardProps {
  node: OrgNode
  isSelected: boolean
  repoHealth?: { grade: string; score: number }
  isEditing: boolean
  editText: string
  addMenuId: string | null
  editRef: React.RefObject<HTMLInputElement | null>
  onEditTextChange: (text: string) => void
  onConfirmRename: () => void
  onCancelRename: () => void
  onNodeMouseDown: (e: React.MouseEvent, id: string) => void
  onDoubleClick: (id: string) => void
  onDelete: (id: string) => void
  onToggleAddMenu: (id: string) => void
  onAddChild: (tool: ToolItem, parentId: string) => void
}

export function OrgNodeCard({
  node, isSelected, isEditing, editText, addMenuId, editRef, repoHealth,
  onEditTextChange, onConfirmRename, onCancelRename,
  onNodeMouseDown, onDoubleClick, onDelete, onToggleAddMenu, onAddChild,
}: OrgNodeCardProps) {
  return (
    <Paper
      elevation={isSelected ? 4 : 1}
      sx={{
        position: 'absolute',
        left: node.x, top: node.y,
        width: NODE_W, height: NODE_H,
        display: 'flex', alignItems: 'center', gap: 1, px: 1.5,
        borderRadius: 2, cursor: 'pointer', userSelect: 'none',
        border: '2px solid',
        borderColor: isSelected ? node.color : 'divider',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        '&:hover': { borderColor: node.color },
        '& .delete-btn': { opacity: 0 },
        '&:hover .delete-btn': { opacity: 1 },
      }}
      onMouseDown={(e) => onNodeMouseDown(e, node.id)}
      onDoubleClick={() => onDoubleClick(node.id)}
    >
      {/* Grip */}
      <Box sx={{ color: 'text.secondary', cursor: 'grab', flexShrink: 0 }}>
        <GripVertical size={12} />
      </Box>

      {/* Icon */}
      <Box sx={{ color: node.color, flexShrink: 0 }}>
        <NodeIcon icon={node.icon} />
      </Box>

      {/* Label / Edit */}
      {isEditing ? (
        <input
          ref={editRef}
          value={editText}
          onChange={(e) => onEditTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter') onConfirmRename()
            if (e.key === 'Escape') onCancelRename()
          }}
          onBlur={onConfirmRename}
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1, minWidth: 0, border: 'none', outline: 'none',
            background: 'transparent', color: 'inherit', fontSize: 13, fontWeight: 600,
          }}
        />
      ) : (
        <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <Typography variant="body2" fontWeight={600} noWrap>{node.label}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="body2" color="text.secondary" noWrap>
              {t(`org.tool.${node.type}`)}
            </Typography>
            {repoHealth && (
              <Typography variant="caption" fontWeight={700} sx={{ color: GRADE_COLORS[repoHealth.grade] ?? '#666' }}>
                {repoHealth.grade}
              </Typography>
            )}
          </Box>
        </Box>
      )}

      {/* Delete */}
      {node.id !== 'root' && (
        <IconButton
          size="small"
          className="delete-btn"
          onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}
          sx={{ color: 'text.secondary', '&:hover': { color: 'error.main' } }}
          aria-label={t('organization.deleteNode')}
          title={t('organization.deleteNode')}
        >
          <Trash2 size={14} />
        </IconButton>
      )}

      {/* Add child button */}
      <IconButton
        size="small"
        onClick={(e) => { e.stopPropagation(); onToggleAddMenu(node.id); }}
        sx={{
          position: 'absolute', bottom: -14, left: '50%', transform: 'translateX(-50%)',
          width: 24, height: 24,
          bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
          color: 'text.secondary',
          '&:hover': { color: 'primary.main', borderColor: 'primary.main' },
        }}
        aria-label={t('organization.addChild')}
        title={t('organization.addChild')}
      >
        <Plus size={12} />
      </IconButton>

      {/* Add child popup */}
      {addMenuId === node.id && (
        <Paper
          elevation={8}
          onClick={(e) => e.stopPropagation()}
          sx={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            mt: 2, p: 0.5, borderRadius: 2, zIndex: 20, minWidth: 140,
          }}
        >
          {getTools().map((tool) => {
            const TIcon = tool.icon
            return (
              <ButtonBase
                key={tool.type}
                onClick={(e) => { e.stopPropagation(); onAddChild(tool, node.id); }}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1,
                  width: '100%', px: 1.5, py: 0.75, borderRadius: 1,
                  justifyContent: 'flex-start',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <TIcon size={15} style={{ color: tool.color }} />
                <Typography variant="body2">{tool.label}</Typography>
              </ButtonBase>
            )
          })}
        </Paper>
      )}
    </Paper>
  )
}
