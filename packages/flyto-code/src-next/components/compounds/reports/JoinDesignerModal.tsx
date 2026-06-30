/**
 * JoinDesignerModal — full-screen modal for visual data JOIN design.
 *
 * Left: Canvas (SVG grid + table blocks + bezier edges)
 * Right: Sidebar (add tables, preview join, select chart, save)
 */

import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Modal from '@mui/material/Modal'
import { X } from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import { useCapabilities } from '@hooks/useCapabilities'
import { DATA_SOURCE_MAP, canUseDataSource } from './datasources'
import { JoinCanvas } from './JoinCanvas'
import { JoinSidebar } from './JoinSidebar'
import { useJoinDesigner } from './useJoinDesigner'
import { getNestedValue } from './utils'
import type { SavedComponent } from './types'

interface Props {
  open: boolean
  onClose: () => void
  onSave: (comp: SavedComponent) => void
}

export function JoinDesignerModal({ open, onClose, onSave }: Props) {
  const { org } = useOrg()
  const orgId = org?.id ?? ''
  const caps = useCapabilities(orgId)

  const {
    nodes, edges, pan, dragging, panning, drawingEdge,
    addNode, removeNode, toggleField,
    startNodeDrag, startPan, onMouseMove, onMouseUp,
    startEdgeDraw, completeEdge, removeEdge, toggleJoinType,
  } = useJoinDesigner()

  // Fetch data for all added sources
  const queries = useQueries({
    queries: nodes.map(n => {
      const ds = DATA_SOURCE_MAP[n.sourceId]
      return {
        queryKey: qk.reports.dataSource(n.sourceId, orgId),
        queryFn: () => ds?.fetcher(orgId),
        enabled: !!ds && canUseDataSource(ds, caps) && !!orgId,
        staleTime: 2 * 60_000,
      }
    }),
  })

  // Build fetchedData map: sourceId → rows[]
  const fetchedData = useMemo(() => {
    const map = new Map<string, any[]>()
    nodes.forEach((n, i) => {
      const ds = DATA_SOURCE_MAP[n.sourceId]
      const data = queries[i]?.data
      if (data && ds) {
        const rows = ds.rowsPath ? getNestedValue(data, ds.rowsPath) ?? [] : [data]
        map.set(n.sourceId, Array.isArray(rows) ? rows : [rows])
      }
    })
    return map
  }, [nodes, queries])

  function handleAddSource(sourceId: string) {
    const ds = DATA_SOURCE_MAP[sourceId]
    if (!ds || !canUseDataSource(ds, caps)) return
    addNode(sourceId, ds.fields.map(f => f.key))
  }

  function handleSave(comp: SavedComponent) {
    onSave(comp)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose}>
      <Box sx={{
        position: 'absolute', inset: { xs: 8, md: 20 },
        bgcolor: '#0f0a1e',
        borderRadius: 3,
        border: '1px solid rgba(139,92,246,0.15)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        outline: 'none',
      }}>
        {/* Header */}
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 1,
          px: 2.5, py: 1.25,
          borderBottom: '1px solid',
          borderBottomColor: 'divider',
          flexShrink: 0,
        }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1, color: 'text.primary' }}>
            {t('reports.dataDesigner')}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t('reports.dragToJoin')}
          </Typography>
          <IconButton
            size="small"
            onClick={onClose}
            aria-label={t('common.close')}
            title={t('common.close')}
            sx={{ color: '#9ca3af' }}
          >
            <X size={16} />
          </IconButton>
        </Box>

        {/* Body: Canvas + Sidebar */}
        <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <JoinCanvas
            nodes={nodes}
            edges={edges}
            pan={pan}
            panning={panning}
            dragging={dragging}
            drawingEdge={drawingEdge}
            onCanvasMouseDown={startPan}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onNodeMouseDown={startNodeDrag}
            onRemoveNode={removeNode}
            onToggleField={toggleField}
            onPortMouseDown={startEdgeDraw}
            onPortMouseUp={completeEdge}
            onEdgeClick={toggleJoinType}
            onRemoveEdge={removeEdge}
          />
          <JoinSidebar
            nodes={nodes}
            edges={edges}
            fetchedData={fetchedData}
            onAddSource={handleAddSource}
            onSave={handleSave}
          />
        </Box>
      </Box>
    </Modal>
  )
}
