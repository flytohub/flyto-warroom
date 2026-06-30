/**
 * JoinCanvas — SVG canvas for visual data JOIN design.
 *
 * Renders: dot grid + bezier edges + positioned JoinTableNode blocks.
 * Based on OrgCanvas pattern (custom SVG, no external lib).
 */

import { useRef } from 'react'
import Box from '@mui/material/Box'
import { t } from '@lib/i18n';
import { JoinTableNode } from './JoinTableNode'
import { DATA_SOURCE_MAP } from './datasources'
import type { JoinNode, JoinEdge } from './joinLogic'
import { NODE_W, NODE_H_BASE, FIELD_H, bezierPath } from './joinLogic'

interface Props {
  nodes: JoinNode[]
  edges: JoinEdge[]
  pan: { x: number; y: number }
  panning: boolean
  dragging: string | null
  drawingEdge: { sourceNodeId: string; sourceField: string; sourceFieldType: string; mouseX: number; mouseY: number } | null
  onCanvasMouseDown: (e: React.MouseEvent) => void
  onMouseMove: (e: React.MouseEvent) => void
  onMouseUp: () => void
  onNodeMouseDown: (e: React.MouseEvent, nodeId: string) => void
  onRemoveNode: (nodeId: string) => void
  onToggleField: (nodeId: string, field: string) => void
  onPortMouseDown: (nodeId: string, field: string, fieldType: string, e: React.MouseEvent) => void
  onPortMouseUp: (nodeId: string, field: string, fieldType: string) => void
  onEdgeClick: (edgeId: string) => void
  onRemoveEdge: (edgeId: string) => void
}

function getFieldIndex(node: JoinNode, field: string): number {
  const ds = DATA_SOURCE_MAP[node.sourceId]
  return ds?.fields.findIndex(f => f.key === field) ?? 0
}

export function JoinCanvas({
  nodes, edges, pan, panning, dragging, drawingEdge,
  onCanvasMouseDown, onMouseMove, onMouseUp,
  onNodeMouseDown, onRemoveNode, onToggleField,
  onPortMouseDown, onPortMouseUp, onEdgeClick, onRemoveEdge,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null)

  return (
    <Box
      ref={canvasRef}
      sx={{
        flex: 1, position: 'relative', overflow: 'hidden',
        cursor: panning ? 'grabbing' : dragging ? 'move' : 'grab',
        bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.3)' : '#f8fafc',
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
      }}
      onMouseDown={onCanvasMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {/* SVG: grid + edges */}
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      >
        {/* Dot grid */}
        <defs>
          <pattern id="join-grid" width="32" height="32" patternUnits="userSpaceOnUse"
            x={pan.x % 32} y={pan.y % 32}>
            <circle cx="16" cy="16" r="0.8" fill="rgba(255,255,255,0.06)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#join-grid)" />

        {/* Edges */}
        <g transform={`translate(${pan.x}, ${pan.y})`} style={{ pointerEvents: 'auto' }}>
          {edges.map(edge => {
            const srcNode = nodes.find(n => n.id === edge.sourceNodeId)
            const tgtNode = nodes.find(n => n.id === edge.targetNodeId)
            if (!srcNode || !tgtNode) return null

            const srcIdx = getFieldIndex(srcNode, edge.sourceField)
            const tgtIdx = getFieldIndex(tgtNode, edge.targetField)

            const x1 = srcNode.x + NODE_W
            const y1 = srcNode.y + NODE_H_BASE + srcIdx * FIELD_H + FIELD_H / 2
            const x2 = tgtNode.x
            const y2 = tgtNode.y + NODE_H_BASE + tgtIdx * FIELD_H + FIELD_H / 2

            const color = edge.joinType === 'inner' ? '#22c55e' : '#f97316'
            const midX = (x1 + x2) / 2
            const midY = (y1 + y2) / 2
            return (
              <g key={edge.id} style={{ cursor: 'pointer' }}>
                {/* Hit area */}
                <path d={bezierPath(x1, y1, x2, y2)} stroke="transparent" strokeWidth={14} fill="none" />
                {/* Soft glow */}
                <path d={bezierPath(x1, y1, x2, y2)} stroke={color} strokeWidth={4} fill="none" opacity={0.08} />
                {/* Visible edge */}
                <path d={bezierPath(x1, y1, x2, y2)} stroke={color} strokeWidth={1.5} fill="none" strokeDasharray={edge.joinType === 'left' ? '6 3' : 'none'} />
                {/* Label badge — click to toggle join type */}
                <g onClick={e => { e.stopPropagation(); onEdgeClick(edge.id) }}>
                  <rect x={midX - 22} y={midY - 9} width={44} height={18} rx={8} fill="rgba(30,41,59,0.9)" stroke={color} strokeWidth={1} />
                  <text x={midX} y={midY + 3} textAnchor="middle" fill={color} fontSize={8} fontWeight={600} fontFamily="sans-serif">
                    {edge.joinType.toUpperCase()}
                  </text>
                </g>
                {/* Delete button — right of badge */}
                <g
                  onClick={e => { e.stopPropagation(); onRemoveEdge(edge.id) }}
                  opacity={0.4}
                  style={{ cursor: 'pointer' }}
                >
                  <circle cx={midX + 30} cy={midY} r={7} fill="rgba(30,41,59,0.9)" stroke="#ef4444" strokeWidth={1} />
                  <line x1={midX + 27} y1={midY - 3} x2={midX + 33} y2={midY + 3} stroke="#ef4444" strokeWidth={1.5} />
                  <line x1={midX + 33} y1={midY - 3} x2={midX + 27} y2={midY + 3} stroke="#ef4444" strokeWidth={1.5} />
                  <set attributeName="opacity" to="1" begin="mouseover" end="mouseout" />
                </g>
              </g>
            )
          })}

          {/* Drawing edge (in progress) */}
          {drawingEdge && canvasRef.current && (() => {
            const srcNode = nodes.find(n => n.id === drawingEdge.sourceNodeId)
            if (!srcNode) return null
            const srcIdx = getFieldIndex(srcNode, drawingEdge.sourceField)
            const x1 = srcNode.x + NODE_W
            const y1 = srcNode.y + NODE_H_BASE + srcIdx * FIELD_H + FIELD_H / 2
            const rect = canvasRef.current!.getBoundingClientRect()
            const x2 = drawingEdge.mouseX - rect.left - pan.x
            const y2 = drawingEdge.mouseY - rect.top - pan.y
            return (
              <path d={bezierPath(x1, y1, x2, y2)} stroke="#6366f1" strokeWidth={2} fill="none" strokeDasharray="4 4" opacity={0.6} />
            )
          })()}
        </g>
      </svg>

      {/* Positioned nodes */}
      <div style={{ position: 'absolute', inset: 0, transform: `translate(${pan.x}px, ${pan.y}px)` }}>
        {nodes.map(node => (
          <JoinTableNode
            key={node.id}
            node={node}
            onMouseDown={onNodeMouseDown}
            onRemove={onRemoveNode}
            onToggleField={onToggleField}
            onPortMouseDown={onPortMouseDown}
            onPortMouseUp={onPortMouseUp}
            drawingEdge={drawingEdge ? { sourceFieldType: drawingEdge.sourceFieldType } : null}
          />
        ))}
      </div>

      {/* Empty state */}
      {nodes.length === 0 && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <Box sx={{ textAlign: 'center', p: 6, borderRadius: 3, border: '2px dashed', borderColor: 'divider' }}>
            <Box sx={{ fontSize: 40, mb: 1.5, color: 'text.secondary' }}>+</Box>
            <Box sx={{ fontSize: 13, color: 'text.secondary', fontWeight: 500 }}>{t('reports.joinCanvas.addSourcesHint')}</Box>
            <Box sx={{ fontSize: 13, color: 'text.secondary', mt: 0.75 }}>{t('reports.joinCanvas.dragPortsHint')}</Box>
          </Box>
        </Box>
      )}
    </Box>
  )
}
