/**
 * ChartRenderer — dynamically renders any chart type from data rows + field config.
 *
 * This is the core of the data-first report engine. It takes:
 * - rows: the raw data array from the API
 * - chartType: which visualization to use
 * - labelField: which field is the category axis
 * - valueField(s): which field(s) are the numeric values
 *
 * Then aggregates the data and renders the appropriate chart.
 */

import { lazy, Suspense, useMemo } from 'react'
import Box from '@mui/material/Box'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import { t } from '@lib/i18n';
import type { ChartType } from '../types'

const ApexDonut = lazy(() => import('./ApexDonut'))
const ApexBar = lazy(() => import('./ApexBar'))
const ApexRadar = lazy(() => import('./ApexRadar'))
const ApexTreemap = lazy(() => import('./ApexTreemap'))
const ApexHeatmap = lazy(() => import('./ApexHeatmap'))
const ApexLine = lazy(() => import('./ApexLine'))
const ApexRadialBar = lazy(() => import('./ApexRadialBar'))
const DataTable = lazy(() => import('./DataTable'))
const KPICard = lazy(() => import('./KPICard'))

export interface ChartRendererProps {
  rows: any[]
  chartType: ChartType
  labelField?: string
  valueField?: string
  valueFields?: string[]
  allFields?: string[]      // for table: which columns to show
  title?: string
  chartId?: string          // unique ID for ApexCharts.exec() PNG export
}

/** Aggregate rows by labelField, summing valueField */
function aggregate(rows: any[], labelField: string, valueField: string): { labels: string[]; values: number[] } {
  const map = new Map<string, number>()
  for (const row of rows) {
    const label = String(row[labelField] ?? t('common.unknown'))
    const val = Number(row[valueField] ?? 0)
    if (isFinite(val)) {
      map.set(label, (map.get(label) ?? 0) + val)
    }
  }
  // Sort by value desc, cap at 15 for readability
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
  return { labels: sorted.map(e => e[0]), values: sorted.map(e => e[1]) }
}

/** Count occurrences of each label value */
function countBy(rows: any[], labelField: string): { labels: string[]; values: number[] } {
  const map = new Map<string, number>()
  for (const row of rows) {
    const label = String(row[labelField] ?? t('common.unknown'))
    map.set(label, (map.get(label) ?? 0) + 1)
  }
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
  return { labels: sorted.map(e => e[0]), values: sorted.map(e => e[1]) }
}

export default function ChartRenderer({ rows, chartType, labelField, valueField, allFields, title, chartId }: ChartRendererProps) {
  const data = useMemo(() => {
    if (!rows || rows.length === 0) return null

    if (chartType === 'table' || chartType === 'kpi') return { rows }

    if (!labelField) return null

    // If we have a valueField, aggregate; otherwise count
    if (valueField) {
      return aggregate(rows, labelField, valueField)
    }
    return countBy(rows, labelField)
  }, [rows, chartType, labelField, valueField])

  if (!data || (chartType !== 'table' && chartType !== 'kpi' && (!('labels' in data) || data.labels.length === 0))) {
    return (
      <Box sx={{ py: 3, textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">{t('reports.noDataAvailable')}</Typography>
      </Box>
    )
  }

  const fallback = <Skeleton variant="rounded" height={200} />

  return (
    <Suspense fallback={fallback}>
      {chartType === 'donut' && 'labels' in data && (
        <ApexDonut labels={data.labels} values={data.values} chartId={chartId} />
      )}
      {(chartType === 'bar' || chartType === 'stacked-bar') && 'labels' in data && (
        <ApexBar labels={data.labels} values={data.values} title={title} chartId={chartId} />
      )}
      {chartType === 'line' && 'labels' in data && (
        <ApexLine labels={data.labels} values={data.values} title={title} chartId={chartId} />
      )}
      {chartType === 'area' && 'labels' in data && (
        <ApexLine labels={data.labels} values={data.values} title={title} area chartId={chartId} />
      )}
      {chartType === 'radar' && 'labels' in data && (
        <ApexRadar labels={data.labels} values={data.values} chartId={chartId} />
      )}
      {chartType === 'treemap' && 'labels' in data && (
        <ApexTreemap labels={data.labels} values={data.values} chartId={chartId} />
      )}
      {chartType === 'heatmap' && 'labels' in data && (
        <ApexHeatmap rows={rows} labelField={labelField!} valueField={valueField!} chartId={chartId} />
      )}
      {chartType === 'radialBar' && 'labels' in data && (
        <ApexRadialBar labels={data.labels} values={data.values} chartId={chartId} />
      )}
      {chartType === 'gauge' && 'labels' in data && (
        <ApexRadialBar labels={data.labels.slice(0, 1)} values={data.values.slice(0, 1)} gauge chartId={chartId} />
      )}
      {chartType === 'table' && 'rows' in data && (
        <DataTable rows={data.rows} fields={allFields} />
      )}
      {chartType === 'kpi' && 'rows' in data && (
        <KPICard rows={data.rows} valueField={valueField} labelField={labelField} />
      )}
    </Suspense>
  )
}
