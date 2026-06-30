/**
 * useJoinDesigner — state management for the visual JOIN canvas.
 *
 * Handles: node CRUD, edge creation via port drag, canvas pan,
 * node drag, field selection.
 */

import { useState, useCallback, useRef } from 'react'
import type { JoinNode, JoinEdge } from './joinLogic'
import { NODE_W } from './joinLogic'

export interface JoinDesignerState {
  nodes: JoinNode[]
  edges: JoinEdge[]
  pan: { x: number; y: number }
}

export function useJoinDesigner() {
  const [nodes, setNodes] = useState<JoinNode[]>([])
  const [edges, setEdges] = useState<JoinEdge[]>([])
  const [pan, setPan] = useState({ x: 60, y: 60 })

  // Drag state
  const [dragging, setDragging] = useState<string | null>(null)
  const [panning, setPanning] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, nodeX: 0, nodeY: 0 })
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })

  // Edge drawing state (port drag)
  const [drawingEdge, setDrawingEdge] = useState<{
    sourceNodeId: string
    sourceField: string
    sourceFieldType: string
    mouseX: number
    mouseY: number
  } | null>(null)

  // ── Add a data source node ──
  const addNode = useCallback((sourceId: string, allFields: string[]) => {
    const count = nodes.length
    const node: JoinNode = {
      id: `jn_${Date.now()}`,
      sourceId,
      x: 60 + count * (NODE_W + 140),
      y: 80,
      selectedFields: allFields.slice(0, 5), // default select first 5
    }
    setNodes(prev => [...prev, node])
  }, [nodes.length])

  // ── Remove node + its edges ──
  const removeNode = useCallback((nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId))
    setEdges(prev => prev.filter(e => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId))
  }, [])

  // ── Toggle field selection ──
  const toggleField = useCallback((nodeId: string, field: string) => {
    setNodes(prev => prev.map(n => {
      if (n.id !== nodeId) return n
      const selected = n.selectedFields.includes(field)
        ? n.selectedFields.filter(f => f !== field)
        : [...n.selectedFields, field]
      return { ...n, selectedFields: selected }
    }))
  }, [])

  // ── Start dragging a node ──
  const startNodeDrag = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation()
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return
    setDragging(nodeId)
    dragStart.current = { x: e.clientX, y: e.clientY, nodeX: node.x, nodeY: node.y }
  }, [nodes])

  // ── Start panning ──
  const startPan = useCallback((e: React.MouseEvent) => {
    setPanning(true)
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
  }, [pan])

  // ── Mouse move (drag node or pan or draw edge) ──
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragging) {
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      setNodes(prev => prev.map(n =>
        n.id === dragging
          ? { ...n, x: dragStart.current.nodeX + dx, y: dragStart.current.nodeY + dy }
          : n
      ))
    } else if (panning) {
      const dx = e.clientX - panStart.current.x
      const dy = e.clientY - panStart.current.y
      setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy })
    } else if (drawingEdge) {
      setDrawingEdge(prev => prev ? { ...prev, mouseX: e.clientX, mouseY: e.clientY } : null)
    }
  }, [dragging, panning, drawingEdge])

  // ── Mouse up (end all drags) ──
  const onMouseUp = useCallback(() => {
    setDragging(null)
    setPanning(false)
    setDrawingEdge(null)
  }, [])

  // ── Start drawing edge from port ──
  const startEdgeDraw = useCallback((nodeId: string, field: string, fieldType: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDrawingEdge({
      sourceNodeId: nodeId,
      sourceField: field,
      sourceFieldType: fieldType,
      mouseX: e.clientX,
      mouseY: e.clientY,
    })
  }, [])

  // ── Complete edge to target port ──
  const completeEdge = useCallback((targetNodeId: string, targetField: string, targetFieldType: string) => {
    if (!drawingEdge) return
    if (drawingEdge.sourceNodeId === targetNodeId) return // no self-join
    // Type guard: only allow connecting same type
    if (drawingEdge.sourceFieldType !== targetFieldType) return

    // Check if edge already exists
    const exists = edges.some(e =>
      e.sourceNodeId === drawingEdge.sourceNodeId &&
      e.targetNodeId === targetNodeId &&
      e.sourceField === drawingEdge.sourceField &&
      e.targetField === targetField
    )
    if (exists) return

    const edge: JoinEdge = {
      id: `je_${Date.now()}`,
      sourceNodeId: drawingEdge.sourceNodeId,
      targetNodeId: targetNodeId,
      sourceField: drawingEdge.sourceField,
      targetField: targetField,
      joinType: 'inner',
    }
    setEdges(prev => [...prev, edge])
    setDrawingEdge(null)
  }, [drawingEdge, edges])

  // ── Remove edge ──
  const removeEdge = useCallback((edgeId: string) => {
    setEdges(prev => prev.filter(e => e.id !== edgeId))
  }, [])

  // ── Toggle join type ──
  const toggleJoinType = useCallback((edgeId: string) => {
    setEdges(prev => prev.map(e =>
      e.id === edgeId
        ? { ...e, joinType: e.joinType === 'inner' ? 'left' : 'inner' }
        : e
    ))
  }, [])

  return {
    nodes, edges, pan, dragging, panning, drawingEdge,
    addNode, removeNode, toggleField,
    startNodeDrag, startPan, onMouseMove, onMouseUp,
    startEdgeDraw, completeEdge, removeEdge, toggleJoinType,
  }
}
