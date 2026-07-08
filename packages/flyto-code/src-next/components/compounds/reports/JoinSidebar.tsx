/**
 * JoinSidebar — right panel container for JOIN designer.
 * Composes: JoinSourceList (Step 1) + JoinResultPreview (Step 2)
 *           + JoinChartSelector (Step 3) + save area.
 */

import { useState, useMemo } from 'react'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import { Save } from 'lucide-react'
import { t } from '@lib/i18n';
import { DATA_SOURCE_MAP } from './datasources'
import { joinRows } from './joinLogic'
import type { JoinNode, JoinEdge } from './joinLogic'
import type { ChartType, SavedComponent, JoinConfig } from './types'
import type { BackendReportSource } from '@lib/engine'
import { JoinSourceList } from './JoinSourceList'
import { JoinResultPreview } from './JoinResultPreview'
import { JoinChartSelector } from './JoinChartSelector'
import { ChartPreviewDialog } from './ChartPreviewDialog'

interface Props {
  nodes: JoinNode[]
  edges: JoinEdge[]
  fetchedData: Map<string, any[]>
  onAddSource: (sourceId: string) => void
  onSave: (comp: SavedComponent) => void
  backendSourceById?: Record<string, BackendReportSource>
}

export function JoinSidebar({ nodes, edges, fetchedData, onAddSource, onSave, backendSourceById }: Props) {
  const [chartType, setChartType] = useState<ChartType | ''>('')
  const [name, setName] = useState('')
  const [previewDialog, setPreviewDialog] = useState(false)

  const joinedRows = useMemo(() => {
    if (nodes.length === 0) return []
    if (nodes.length === 1) return fetchedData.get(nodes[0].sourceId) ?? []
    if (edges.length === 0) return []
    let result = fetchedData.get(nodes[0].sourceId) ?? []
    for (const edge of edges) {
      const rightRows = fetchedData.get(
        nodes.find(n => n.id === edge.targetNodeId)?.sourceId ?? ''
      ) ?? []
      result = joinRows(result, rightRows, edge.sourceField, edge.targetField, edge.joinType)
    }
    return result
  }, [nodes, edges, fetchedData])

  const allSelectedFields = useMemo(() => {
    const fields: string[] = []
    for (const node of nodes) {
      for (const f of node.selectedFields) if (!fields.includes(f)) fields.push(f)
    }
    return fields
  }, [nodes])

  const stringFields = allSelectedFields.filter(f => typeof joinedRows[0]?.[f] === 'string')
  const numericFields = allSelectedFields.filter(f => typeof joinedRows[0]?.[f] === 'number')

  function handleSave() {
    if (!chartType || nodes.length === 0) return

    // Pick smart label — exclude internal ID/hash fields
    const ID_FIELDS = new Set(['id', 'repo_id', 'org_id', 'project_id', 'fingerprint', 'execution_id', 'commit_sha'])
    const usableLabels = stringFields.filter(f => !ID_FIELDS.has(f) && !f.endsWith('_id'))
    const preferred = ['severity', 'status', 'type', 'category', 'grade', 'project_type', 'license_name', 'risk_level', 'name', 'repo_name']
    const bestLabel = preferred.find(p => usableLabels.includes(p)) ?? usableLabels[0] ?? stringFields[0] ?? 'name'

    // Capture the full JOIN definition when more than one source / any
    // edges are present. Earlier code discarded everything except
    // `nodes[0].sourceId`, which silently turned multi-source designs
    // into single-source pointers the moment they hit the library —
    // re-loading the saved widget rendered only the first table's
    // unjoined rows (operator-reported 2026-05-24 「資料設計表是無法保存
    // 至元件庫」).
    //
    // Edges reference node positions by index, not by runtime ID, so
    // the saved blob survives a fresh designer session where IDs
    // would otherwise re-mint and break edge resolution.
    let joinConfig: JoinConfig | undefined
    if (nodes.length > 1 || edges.length > 0) {
      joinConfig = {
        nodes: nodes.map(n => ({
          sourceId: n.sourceId,
          selectedFields: [...n.selectedFields],
        })),
        edges: edges.map(e => ({
          fromNodeIdx: nodes.findIndex(n => n.id === e.sourceNodeId),
          toNodeIdx: nodes.findIndex(n => n.id === e.targetNodeId),
          fromField: e.sourceField,
          toField: e.targetField,
          joinType: e.joinType,
        })).filter(e => e.fromNodeIdx >= 0 && e.toNodeIdx >= 0),
      }
    }

    onSave({
      id: `comp_${Date.now()}`,
      name: name.trim() || `${nodes.map(n => DATA_SOURCE_MAP[n.sourceId]?.name).join(' + ')}`,
      dataSourceId: nodes[0].sourceId,
      chartType: chartType as ChartType,
      labelField: bestLabel,
      valueField: numericFields[0],
      defaultCols: chartType === 'table' ? 12 : 6,
      createdAt: new Date().toISOString(),
      joinConfig,
    })
  }

  return (
    <Box sx={{
      flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <JoinSourceList nodes={nodes} onAddSource={onAddSource} backendSourceById={backendSourceById} />

      <JoinResultPreview
        rowCount={joinedRows.length}
        fields={allSelectedFields}
        edges={edges}
        nodeCount={nodes.length}
        rows={joinedRows}
      />

      <JoinChartSelector
        chartType={chartType}
        onChartTypeChange={setChartType}
        hasData={joinedRows.length > 0}
        stringFields={stringFields}
        numericFields={numericFields}
        onPreview={() => setPreviewDialog(true)}
      />

      {/* Save (always visible, disabled until chart selected) */}
      <Box sx={{ px: 2, py: 1, borderTop: '2px solid', borderTopColor: 'divider', flexShrink: 0 }}>
        <TextField
          size="small" fullWidth disabled={!chartType}
          placeholder={t('reports.componentName')}
          value={name} onChange={e => setName(e.target.value)}
          sx={{ mb: 0.75, '& .MuiOutlinedInput-root': { fontSize: 13 } }}
        />
        <Button variant="outlined" size="small" fullWidth disabled={!chartType}
          startIcon={<Save size={14} />} onClick={handleSave}
          sx={{ textTransform: 'none', fontSize: 13 }}
        >
          {t('reports.saveToLibrary')}
        </Button>
      </Box>

      {/* Chart preview dialog */}
      <ChartPreviewDialog
        open={previewDialog}
        onClose={() => setPreviewDialog(false)}
        chartType={chartType as ChartType}
        rows={joinedRows}
        stringFields={stringFields}
        numericFields={numericFields}
        allFields={allSelectedFields}
      />
    </Box>
  )
}
