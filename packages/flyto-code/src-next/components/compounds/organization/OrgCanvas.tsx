import { LayoutGrid, Maximize2, LocateFixed, RefreshCw } from 'lucide-react'
import Tooltip from '@mui/material/Tooltip'
import IconButton from '@mui/material/IconButton'
import Box from '@mui/material/Box'
import { t } from '@lib/i18n'
import type { OrgNode, ToolItem } from './types'
import { NODE_W, NODE_H } from './useOrgChart'
import { OrgNodeCard } from './OrgNodeCard'

interface OrgCanvasProps {
  nodes: OrgNode[]
  selectedId: string | null
  repoHealthMap?: Map<string, { grade: string; score: number }>
  editingId: string | null
  editText: string
  addMenuId: string | null
  canvasRef: React.RefObject<HTMLDivElement | null>
  pan: { x: number; y: number }
  panning: boolean
  dragging: string | null
  editRef: React.RefObject<HTMLInputElement | null>
  onEditTextChange: (text: string) => void
  onConfirmRename: () => void
  onCancelRename: () => void
  onNodeMouseDown: (e: React.MouseEvent, id: string) => void
  onStartRename: (id: string) => void
  onDelete: (id: string) => void
  onToggleAddMenu: (id: string) => void
  onAddChild: (tool: ToolItem, parentId: string) => void
  onCanvasMouseDown: (e: React.MouseEvent) => void
  onMouseMove: (e: React.MouseEvent) => void
  onMouseUp: () => void
  onAutoLayout: () => void
  onFitToView: () => void
  onGoToRoot: () => void
  onSyncGitHub?: () => void
  syncing?: boolean
}

export function OrgCanvas({
  nodes, selectedId, repoHealthMap, editingId, editText, addMenuId,
  canvasRef, pan, panning, dragging, editRef,
  onEditTextChange, onConfirmRename, onCancelRename,
  onNodeMouseDown, onStartRename, onDelete, onToggleAddMenu, onAddChild,
  onCanvasMouseDown, onMouseMove, onMouseUp,
  onAutoLayout, onFitToView, onGoToRoot, onSyncGitHub, syncing,
}: OrgCanvasProps) {
  return (
    <div
      ref={canvasRef}
      style={{
        flex: 1, position: 'relative', overflow: 'hidden',
        cursor: panning ? 'grabbing' : dragging ? 'move' : 'grab',
        borderRadius: '0 0 16px 0',
      }}
      onMouseDown={onCanvasMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {/* Floating action buttons */}
      <Box sx={{
        position: 'absolute', top: 12, right: 12, zIndex: 10,
        display: 'flex', flexDirection: 'column', gap: 0.5,
        bgcolor: 'background.paper', borderRadius: 2, p: 0.5,
        border: '1px solid', borderColor: 'divider',
        boxShadow: 2,
      }}>
        <Tooltip title={t('org.toolbar.autoLayout')} placement="left" arrow>
          <IconButton size="small" onClick={onAutoLayout} aria-label={t('org.toolbar.autoLayout')} title={t('org.toolbar.autoLayout')}>
            <LayoutGrid size={16} />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('org.toolbar.fit')} placement="left" arrow>
          <IconButton size="small" onClick={onFitToView} aria-label={t('org.toolbar.fit')} title={t('org.toolbar.fit')}>
            <Maximize2 size={16} />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('org.toolbar.goToRoot')} placement="left" arrow>
          <IconButton size="small" onClick={onGoToRoot} aria-label={t('org.toolbar.goToRoot')} title={t('org.toolbar.goToRoot')}>
            <LocateFixed size={16} />
          </IconButton>
        </Tooltip>
        {onSyncGitHub && (
          <Tooltip title={t('org.toolbar.syncGitHub')} placement="left" arrow>
            <span>
              <IconButton
                size="small"
                onClick={onSyncGitHub}
                disabled={syncing}
                aria-label={t('org.toolbar.syncGitHub')}
                title={t('org.toolbar.syncGitHub')}
              >
                <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Box>

      {/* Dot grid */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <defs>
          <pattern id="orgGrid" width="32" height="32" patternUnits="userSpaceOnUse"
            x={pan.x % 32} y={pan.y % 32}>
            <circle cx="1" cy="1" r="0.8" fill="currentColor" opacity={0.15} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#orgGrid)" />
      </svg>

      {/* Connection lines */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <g transform={`translate(${pan.x}, ${pan.y})`}>
          {nodes.map((node) => {
            if (!node.parentId) return null
            const parent = nodes.find((n) => n.id === node.parentId)
            if (!parent) return null
            const x1 = parent.x + NODE_W / 2
            const y1 = parent.y + NODE_H
            const x2 = node.x + NODE_W / 2
            const y2 = node.y
            const my = (y1 + y2) / 2
            return (
              <path
                key={`line-${node.id}`}
                d={`M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`}
                fill="none" stroke={parent.color} strokeWidth={2} opacity={0.25}
              />
            )
          })}
        </g>
      </svg>

      {/* Nodes */}
      <div style={{ position: 'absolute', inset: 0, transform: `translate(${pan.x}px, ${pan.y}px)` }}>
        {nodes.map((node) => (
          <OrgNodeCard
            key={node.id}
            node={node}
            isSelected={selectedId === node.id}
            isEditing={editingId === node.id}
            editText={editText}
            addMenuId={addMenuId}
            editRef={editRef}
            repoHealth={node.repoId && repoHealthMap ? repoHealthMap.get(node.repoId) : undefined}
            onEditTextChange={onEditTextChange}
            onConfirmRename={onConfirmRename}
            onCancelRename={() => onCancelRename()}
            onNodeMouseDown={onNodeMouseDown}
            onDoubleClick={onStartRename}
            onDelete={onDelete}
            onToggleAddMenu={onToggleAddMenu}
            onAddChild={onAddChild}
          />
        ))}
      </div>
    </div>
  )
}
