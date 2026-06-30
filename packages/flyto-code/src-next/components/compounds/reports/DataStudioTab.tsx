/**
 * DataStudioTab — design a data widget: source → fields → chart → preview → save.
 *
 * Saved components go to localStorage and appear in the LayoutTab for use.
 */

import { useState, useMemo, useEffect, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import Alert from '@mui/material/Alert'
import { Save, GitMerge, Lock } from 'lucide-react'
import { JoinDesignerModal } from './JoinDesignerModal'
import { ComponentLibrary } from './ComponentLibrary'
import { t, tOr } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import { useCapabilities } from '@hooks/useCapabilities'
import { DATA_SOURCES, DATA_SOURCE_MAP, blockedDataSourceMessage, canUseDataSource } from './datasources'
import { CHART_TYPES, CHART_TYPE_MAP } from './chartTypes'
import { getNestedValue, CHART_COLORS, loadComponents, persistComponents } from './utils'
import ChartRenderer from './charts/ChartRenderer'
import type { ChartType, SavedComponent } from './types'

interface Props {
  components: SavedComponent[]
  onComponentsChange: (list: SavedComponent[]) => void
  onSave?: (comp: SavedComponent) => void
}

export function DataStudioTab({ components, onComponentsChange, onSave }: Props) {
  const { org } = useOrg()
  const orgId = org?.id ?? ''
  const caps = useCapabilities(orgId)
  const [designerOpen, setDesignerOpen] = useState(false)

  const [selectedSource, setSelectedSource] = useState('')
  const [labelField, setLabelField] = useState('')
  const [valueField, setValueField] = useState('')
  const [chartType, setChartType] = useState<ChartType | ''>('')
  const [componentName, setComponentName] = useState('')

  const ds = DATA_SOURCE_MAP[selectedSource]
  const selectedSourceAllowed = canUseDataSource(ds, caps)

  const stringFields = useMemo(() =>
    ds?.fields.filter(f => f.type === 'string' || f.type === 'severity' || f.type === 'grade') ?? [],
  [ds])
  const numericFields = useMemo(() =>
    ds?.fields.filter(f => f.type === 'number') ?? [],
  [ds])

  // Auto-pick smart defaults when data source changes
  useEffect(() => {
    if (!ds) return
    const EXCLUDE = new Set(['id', 'repo_id', 'org_id', 'project_id', 'fingerprint', 'execution_id', 'commit_sha'])
    const usable = stringFields.filter(f => !EXCLUDE.has(f.key) && !f.key.endsWith('_id'))
    const preferred = ['severity', 'status', 'type', 'category', 'grade', 'project_type', 'license_name', 'risk_level', 'name', 'repo_name']
    const bestLabel = preferred.find(p => usable.some(f => f.key === p)) ?? usable[0]?.key ?? ''
    setLabelField(bestLabel)

    const prefValue = ['blast_radius', 'raw', 'total_uses', 'shared_count', 'cve_total', 'secret_count', 'findings_count']
    const bestValue = prefValue.find(p => numericFields.some(f => f.key === p)) ?? numericFields[0]?.key ?? ''
    setValueField(bestValue)
  }, [selectedSource, ds, stringFields, numericFields])

  // Fetch data for live preview
  const { data: previewData, isLoading: previewLoading } = useQuery({
    queryKey: qk.reports.dataSource(selectedSource, orgId),
    queryFn: () => ds?.fetcher(orgId),
    enabled: !!ds && selectedSourceAllowed && !!orgId && !!chartType,
    staleTime: 2 * 60_000,
  })

  const previewRows = useMemo(() => {
    if (!previewData || !ds) return []
    return ds.rowsPath ? getNestedValue(previewData, ds.rowsPath) ?? [] : [previewData]
  }, [previewData, ds])

  function handleSave() {
    if (!selectedSource || !chartType) return
    const name = componentName.trim() || `${ds?.name ?? selectedSource} — ${CHART_TYPE_MAP[chartType]?.name ?? chartType}`

    // Sanitize: never save internal ID fields as label
    const ID_FIELDS = new Set(['id', 'repo_id', 'org_id', 'project_id', 'fingerprint', 'execution_id', 'commit_sha'])
    let finalLabel = labelField
    if (!finalLabel || ID_FIELDS.has(finalLabel) || finalLabel.endsWith('_id')) {
      const preferred = ['severity', 'status', 'type', 'category', 'grade', 'project_type', 'license_name', 'risk_level', 'name', 'repo_name']
      const usable = stringFields.filter(f => !ID_FIELDS.has(f.key) && !f.key.endsWith('_id'))
      finalLabel = preferred.find(p => usable.some(f => f.key === p)) ?? usable[0]?.key ?? labelField
    }

    const comp: SavedComponent = {
      id: `comp_${Date.now()}`,
      name,
      dataSourceId: selectedSource,
      chartType: chartType as ChartType,
      labelField: finalLabel || undefined,
      valueField: valueField || undefined,
      defaultCols: chartType === 'table' ? 12 : chartType === 'kpi' || chartType === 'gauge' ? 4 : 6,
      createdAt: new Date().toISOString(),
    }
    const updated = [...components, comp]
    onComponentsChange(updated)
    persistComponents(updated)
    if (onSave) onSave(comp)
    // Reset form
    setComponentName('')
    setChartType('')
  }

  function handleDelete(id: string) {
    const updated = components.filter(c => c.id !== id)
    onComponentsChange(updated)
    persistComponents(updated)
  }

  function handleDesignerSave(comp: SavedComponent) {
    const updated = [...components, comp]
    onComponentsChange(updated)
    persistComponents(updated)
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

      {/* ── Visual Designer button ── */}
      <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        <Button
          fullWidth variant="outlined" size="small"
          startIcon={<GitMerge size={14} />}
          onClick={() => setDesignerOpen(true)}
          sx={{ textTransform: 'none', fontSize: 13, borderColor: '#6366f1', color: '#a78bfa', '&:hover': { borderColor: '#818cf8', bgcolor: 'rgba(99,102,241,0.08)' } }}
        >
          {t('reports.openDesigner')}
        </Button>
      </Box>

      <JoinDesignerModal
        open={designerOpen}
        onClose={() => setDesignerOpen(false)}
        onSave={handleDesignerSave}
      />

      {/* ── Quick builder form (scrollable, for single-source widgets) ── */}
      <Box sx={{ flex: 1, overflow: 'auto', px: 1.5, py: 1 }}>

        {/* Step 1: Data Source */}
        <Typography variant="caption" fontWeight={700} sx={{ color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', mb: 0.5 }}>
          {t('reports.step1')}
        </Typography>
        <Select
          size="small" fullWidth
          value={selectedSource}
          onChange={e => { setSelectedSource(e.target.value); setLabelField(''); setValueField(''); setChartType('') }}
          displayEmpty sx={{ mb: 1.5, fontSize: 12 }}
        >
          <MenuItem value="" disabled><em>{t('reports.pickSource')}</em></MenuItem>
          {DATA_SOURCES.map(s => {
            const allowed = canUseDataSource(s, caps)
            return (
              <MenuItem key={s.id} value={s.id} disabled={!allowed} sx={{ fontSize: 12 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <s.icon size={12} />
                  {tOr(s.nameKey ?? '', s.name)}
                  {!allowed && <Lock size={11} aria-hidden="true" />}
                </Box>
              </MenuItem>
            )
          })}
        </Select>

        {ds && !selectedSourceAllowed && (
          <Alert severity="info" icon={<Lock size={16} />} sx={{ mb: 1.5, py: 0.5, borderRadius: 1.5 }}>
            <Typography variant="caption">
              {tOr('reports.sourceLocked', blockedDataSourceMessage(ds))}
            </Typography>
          </Alert>
        )}

        {/* Step 2: Fields */}
        {ds && selectedSourceAllowed && (
          <>
            <Typography variant="caption" fontWeight={700} sx={{ color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', mb: 0.5 }}>
              {t('reports.step2')}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12, display: 'block', mb: 0.25 }}>
              {t('reports.labelField')}
            </Typography>
            <Select size="small" fullWidth value={labelField} onChange={e => setLabelField(e.target.value)} displayEmpty sx={{ mb: 1, fontSize: 13 }}>
              <MenuItem value="" sx={{ fontSize: 13 }}><em>{t('reports.noneOption')}</em></MenuItem>
              {stringFields.map(f => <MenuItem key={f.key} value={f.key} sx={{ fontSize: 13 }}>{tOr(`reports.col.${f.key}`, f.label)}</MenuItem>)}
            </Select>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12, display: 'block', mb: 0.25 }}>
              {t('reports.valueField')}
            </Typography>
            <Select size="small" fullWidth value={valueField} onChange={e => setValueField(e.target.value)} displayEmpty sx={{ mb: 1.5, fontSize: 13 }}>
              <MenuItem value="" sx={{ fontSize: 13 }}><em>{t('reports.noneCountOption')}</em></MenuItem>
              {numericFields.map(f => <MenuItem key={f.key} value={f.key} sx={{ fontSize: 13 }}>{tOr(`reports.col.${f.key}`, f.label)}</MenuItem>)}
            </Select>
          </>
        )}

        {/* Step 3: Chart Type */}
        {ds && selectedSourceAllowed && (
          <>
            <Typography variant="caption" fontWeight={700} sx={{ color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', mb: 0.75 }}>
              {t('reports.step3')}
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0.5, mb: 1.5 }}>
              {CHART_TYPES.map(ct => {
                const color = CHART_COLORS[ct.type] ?? '#6b7280'
                const active = chartType === ct.type
                return (
                  <Paper key={ct.type} elevation={0} onClick={() => setChartType(ct.type)}
                    sx={{
                      p: 0.75, borderRadius: 1.5, cursor: 'pointer',
                      border: '1px solid', borderColor: active ? color : 'divider',
                      bgcolor: active ? `${color}15` : 'transparent',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25,
                      '&:hover': { borderColor: color, bgcolor: `${color}08` },
                      transition: 'all 0.15s',
                    }}
                  >
                    <ct.icon size={16} style={{ color }} />
                    <Typography variant="caption" sx={{ fontSize: 12, textAlign: 'center', lineHeight: 1.1, color: active ? color : 'text.secondary' }}>
                      {tOr(ct.nameKey ?? '', ct.name)}
                    </Typography>
                  </Paper>
                )
              })}
            </Box>
          </>
        )}

        {/* Step 4: Live mini preview */}
        {ds && selectedSourceAllowed && chartType && (
          <>
            <Typography variant="caption" fontWeight={700} sx={{ color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', mb: 0.5 }}>
              {t('reports.preview')}
            </Typography>
            <Paper sx={{ p: 1, mb: 1.5, borderRadius: 1.5, border: '1px solid', borderColor: 'divider', minHeight: 100 }}>
              {previewLoading ? (
                <Skeleton variant="rounded" height={80} />
              ) : (
                <Suspense fallback={<Skeleton variant="rounded" height={80} />}>
                  <ChartRenderer
                    rows={previewRows}
                    chartType={chartType as ChartType}
                    labelField={labelField || undefined}
                    valueField={valueField || undefined}
                  />
                </Suspense>
              )}
            </Paper>
          </>
        )}

        {/* Step 5: Name + Save */}
        {ds && selectedSourceAllowed && chartType && (
          <Box sx={{ display: 'flex', gap: 0.75, mb: 2 }}>
            <TextField
              size="small" fullWidth
              placeholder={t('reports.componentName')}
              value={componentName}
              onChange={e => setComponentName(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { fontSize: 13 } }}
            />
            <Button
              variant="contained" size="small"
              startIcon={<Save size={12} />}
              onClick={handleSave}
              sx={{ textTransform: 'none', fontSize: 13, whiteSpace: 'nowrap', bgcolor: '#22c55e', boxShadow: 'none', '&:hover': { bgcolor: '#16a34a', boxShadow: 'none' } }}
            >
              {t('reports.saveToLibrary')}
            </Button>
          </Box>
        )}
      </Box>

      <ComponentLibrary components={components} onDelete={handleDelete} />
    </Box>
  )
}

// Re-export helpers for other files
export { loadComponents, persistComponents }
