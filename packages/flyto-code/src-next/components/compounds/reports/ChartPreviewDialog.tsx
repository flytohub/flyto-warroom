/**
 * ChartPreviewDialog — split-pane chart + data table with smart field mapping.
 *
 * Left: chart with configurable label/value dropdowns
 * Right: data table with highlighted mapped columns
 *
 * Smart defaults: auto-picks the best label/value fields based on
 * chart type + field types. User can override via dropdowns.
 */

import { useState, useEffect, Suspense } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import IconButton from '@mui/material/IconButton'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Skeleton from '@mui/material/Skeleton'
import { X } from 'lucide-react'
import { t } from '@lib/i18n';
import type { ChartType } from './types'
import ChartRenderer from './charts/ChartRenderer'

interface Props {
  open: boolean
  onClose: () => void
  chartType: ChartType
  rows: any[]
  stringFields: string[]
  numericFields: string[]
  allFields: string[]
}

/** Pick the best default label field for a chart type */
function smartLabel(_chartType: ChartType, stringFields: string[]): string {
  if (!stringFields.length) return ''

  // Never use as label — these are identifiers, not categories
  const EXCLUDE = new Set(['id', 'repo_id', 'org_id', 'project_id', 'fingerprint',
    'execution_id', 'commit_sha', 'pr_url', 'evidence_url', 'file_path',
    'source_file', 'sink_file', 'path', 'branch'])

  const usable = stringFields.filter(f => !EXCLUDE.has(f) && !f.endsWith('_id'))

  // Prefer semantic fields — categories that make good chart labels
  const preferred = ['severity', 'status', 'type', 'source', 'category',
    'grade', 'project_type', 'license_name', 'risk_level',
    'framework', 'asset_type', 'check_name', 'resource_type',
    'patch_status', 'rule_category', 'name', 'repo_name', 'title']
  for (const p of preferred) {
    if (usable.includes(p)) return p
  }
  return usable[0] ?? stringFields[0]
}

/** Pick the best default value field for a chart type */
function smartValue(chartType: ChartType, numericFields: string[]): string {
  if (!numericFields.length) return ''
  // Prefer meaningful metrics over counts
  const preferred = ['blast_radius', 'raw', 'total_uses', 'shared_count',
    'cve_total', 'cve_critical', 'cve_high', 'secret_count', 'findings_count',
    'file_count', 'dead_code_count', 'complex_functions', 'score']
  for (const p of preferred) {
    if (numericFields.includes(p)) return p
  }
  // For gauge/kpi, prefer score-like fields
  if (chartType === 'gauge' || chartType === 'kpi') {
    const scoreField = numericFields.find(f => f.includes('score') || f.includes('count'))
    if (scoreField) return scoreField
  }
  return numericFields[0]
}

export function ChartPreviewDialog({ open, onClose, chartType, rows, stringFields, numericFields, allFields }: Props) {
  const [labelField, setLabelField] = useState('')
  const [valueField, setValueField] = useState('')

  // Smart defaults when dialog opens or chart type changes
  useEffect(() => {
    if (open && chartType) {
      setLabelField(smartLabel(chartType, stringFields))
      setValueField(smartValue(chartType, numericFields))
    }
  }, [open, chartType, stringFields.join(','), numericFields.join(',')])

  const needsLabel = !['gauge', 'kpi'].includes(chartType)
  const needsValue = !['table'].includes(chartType)

  // Filter out UUID/ID columns from table display — useless noise
  const ID_COLS = new Set(['id', 'repo_id', 'org_id', 'project_id', 'fingerprint', 'execution_id'])
  const displayFields = allFields.filter(f => !ID_COLS.has(f) && !(/^[a-f0-9]{8}-/.test(String(rows[0]?.[f] ?? ''))))

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="subtitle2" fontWeight={700} sx={{ mr: 2 }}>
          {t('reports.chartPreview')}
        </Typography>

        {/* Field selectors */}
        {needsLabel && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="caption" sx={{ color: '#3b82f6', fontWeight: 700, fontSize: 12 }}>{t('reports.fieldLabel')}:</Typography>
            <Select size="small" value={labelField} onChange={e => setLabelField(e.target.value)}
              sx={{ minWidth: 120, fontSize: 13, height: 28, '& .MuiSelect-select': { py: 0.25 } }}
            >
              {stringFields.filter(f => !ID_COLS.has(f)).map(f => <MenuItem key={f} value={f} sx={{ fontSize: 13 }}>{f}</MenuItem>)}
            </Select>
          </Box>
        )}
        {needsValue && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="caption" sx={{ color: '#22c55e', fontWeight: 700, fontSize: 12 }}>{t('reports.fieldValue')}:</Typography>
            <Select size="small" value={valueField} onChange={e => setValueField(e.target.value)}
              sx={{ minWidth: 120, fontSize: 13, height: 28, '& .MuiSelect-select': { py: 0.25 } }}
            >
              <MenuItem value="" sx={{ fontSize: 13 }}><em>{t('reports.countOption')}</em></MenuItem>
              {numericFields.map(f => <MenuItem key={f} value={f} sx={{ fontSize: 13 }}>{f}</MenuItem>)}
            </Select>
          </Box>
        )}

        <Box sx={{ flex: 1 }} />
        <IconButton
          onClick={onClose}
          size="small"
          aria-label={t('common.close')}
          title={t('common.close')}
        >
          <X size={16} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>
        <Box sx={{ display: 'flex', height: '60vh', overflow: 'hidden' }}>
          {/* Left: Chart */}
          <Box sx={{ flex: 1, p: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid', borderRightColor: 'divider' }}>
            <Suspense fallback={<Skeleton variant="rounded" width="100%" height={300} />}>
              <Box sx={{ width: '100%' }}>
                <ChartRenderer
                  rows={rows}
                  chartType={chartType}
                  labelField={labelField || undefined}
                  valueField={valueField || undefined}
                />
              </Box>
            </Suspense>
          </Box>

          {/* Right: Data table with highlighted columns */}
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--mui-palette-divider)', position: 'sticky', top: 0, background: 'var(--mui-palette-background-paper)', zIndex: 1 }}>
                  {displayFields.map(f => {
                    const isLabel = f === labelField
                    const isValue = f === valueField
                    return (
                      <th key={f} style={{
                        textAlign: 'left', padding: '8px 10px', fontWeight: 700, whiteSpace: 'nowrap',
                        color: isLabel ? '#3b82f6' : isValue ? '#22c55e' : 'var(--mui-palette-text-primary)',
                        borderBottom: isLabel ? '3px solid #3b82f6' : isValue ? '3px solid #22c55e' : undefined,
                      }}>
                        {f}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--mui-palette-divider)' }}>
                    {displayFields.map(f => {
                      const isLabel = f === labelField
                      const isValue = f === valueField
                      const val = row[f]
                      const display = val == null ? '-' : typeof val === 'object' ? '...' : String(val)
                      return (
                        <td key={f} style={{
                          padding: '5px 10px', whiteSpace: 'nowrap',
                          color: isLabel ? '#3b82f6' : isValue ? '#22c55e' : 'var(--mui-palette-text-primary)',
                          fontWeight: isLabel || isValue ? 600 : 400,
                          backgroundColor: isLabel ? 'rgba(59,130,246,0.05)' : isValue ? 'rgba(34,197,94,0.05)' : undefined,
                        }}>
                          {display}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  )
}
