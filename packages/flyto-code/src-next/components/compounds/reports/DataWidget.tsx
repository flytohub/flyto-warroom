/**
 * DataWidget — the universal data-driven widget.
 *
 * Fetches data from the configured datasource, extracts rows,
 * and renders the chosen chart type with the selected fields.
 */

import { useMemo } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'
import { Lock } from 'lucide-react'
import { t, tOr } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useCapabilities } from '@hooks/useCapabilities'
import { QueryError } from '@atoms/QueryError'
import { CARD } from './designTokens'
import { DATA_SOURCE_MAP, blockedDataSourceMessage, canUseDataSource } from './datasources'
import { CHART_TYPE_MAP } from './chartTypes'
import { getNestedValue } from './utils'
import { joinRows } from './joinLogic'
import type { DataWidgetConfig } from './types'
import ChartRenderer from './charts/ChartRenderer'
import { TextBlock } from './charts/TextBlock'

interface Props {
  config: DataWidgetConfig
  orgId: string
}

export function DataWidget({ config, orgId }: Props) {
  // Hooks must be called unconditionally — the text early return is
  // pushed AFTER the useQuery call. We gate the actual fetch via
  // `enabled` instead of skipping the hook entirely, so the hook
  // order is stable across renders.
  const isText = config.chartType === 'text'
  const ds = DATA_SOURCE_MAP[config.dataSourceId]
  const ct = CHART_TYPE_MAP[config.chartType]
  const caps = useCapabilities(orgId)
  const singleAllowed = canUseDataSource(ds, caps)

  // Single-source fetch — legacy path, also fires when a join is
  // present (with `enabled: false`) so hook order stays stable.
  const hasJoin = !!config.joinConfig && config.joinConfig.nodes.length > 1
  const {
    data,
    isLoading: singleLoading,
    isError: singleError,
    error: singleFetchError,
    refetch: refetchSingle,
  } = useQuery({
    queryKey: qk.reports.dataSource(config.dataSourceId, orgId),
    queryFn: () => ds?.fetcher(orgId),
    enabled: !isText && !hasJoin && !!ds && singleAllowed && !!orgId,
    staleTime: 2 * 60_000,
  })

  // Multi-source JOIN — fans out one query per source listed in
  // joinConfig and computes joinRows in order so the widget renders
  // with fresh joined data (not whatever the designer happened to
  // serialize). When joinConfig is absent these queries are gated
  // off via `enabled: false` to keep useQueries' fan-out stable.
  const joinNodes = config.joinConfig?.nodes ?? []
  const joinQueries = useQueries({
    queries: joinNodes.map(n => {
      const jds = DATA_SOURCE_MAP[n.sourceId]
      return {
        queryKey: qk.reports.dataSource(n.sourceId, orgId),
        queryFn: () => jds?.fetcher(orgId),
        enabled: !isText && hasJoin && !!jds && canUseDataSource(jds, caps) && !!orgId,
        staleTime: 2 * 60_000,
      }
    }),
  })
  const blockedJoinSource = hasJoin
    ? joinNodes.map(n => DATA_SOURCE_MAP[n.sourceId]).find(jds => jds && !canUseDataSource(jds, caps))
    : undefined
  const joinedRows = useMemo<Record<string, unknown>[]>(() => {
    if (!hasJoin || !config.joinConfig) return []
    // Bail if any side is still loading or errored — render the
    // chart with empty rows rather than mid-fetch garbage.
    if (joinQueries.some(q => q.isLoading)) return []
    if (joinQueries.some(q => q.isError)) return []
    const rowsByIdx: Record<string, unknown>[][] = joinQueries.map((q, i) => {
      const jds = DATA_SOURCE_MAP[joinNodes[i].sourceId]
      if (!jds) return []
      const raw = jds.rowsPath ? getNestedValue(q.data, jds.rowsPath) ?? [] : q.data ? [q.data] : []
      return Array.isArray(raw) ? raw : [raw]
    })
    if (rowsByIdx.length === 0) return []
    let result = rowsByIdx[0]
    for (const edge of config.joinConfig.edges) {
      const right = rowsByIdx[edge.toNodeIdx] ?? []
      result = joinRows(result, right, edge.fromField, edge.toField, edge.joinType)
    }
    return result
  }, [hasJoin, config.joinConfig, joinQueries, joinNodes])

  const isLoading = hasJoin ? joinQueries.some(q => q.isLoading) : singleLoading
  const isError = hasJoin ? joinQueries.some(q => q.isError) : singleError
  const error = hasJoin ? joinQueries.find(q => q.isError)?.error : singleFetchError
  const retry = hasJoin
    ? () => {
        joinQueries
          .filter(q => q.isError)
          .forEach(q => { void q.refetch() })
      }
    : refetchSingle

  if (isText) {
    const widgetTitle = config.titleKey ? tOr(config.titleKey, config.title ?? '') : (config.title ?? '')
    return (
      <Paper
        data-widget-id={config.id}
        data-chart-type="text"
        data-widget-title={widgetTitle}
        sx={{ p: 2.5, borderRadius: `${CARD.borderRadius}px`, boxShadow: CARD.shadow, height: '100%' }}
      >
        {widgetTitle && (
          <Typography variant="body2" fontWeight={600} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, mb: 1 }}>
            {widgetTitle}
          </Typography>
        )}
        <TextBlock content={config.content} style={config.textStyle} />
      </Paper>
    )
  }

  if (!ds) {
    return (
      <Paper sx={{ p: 2, borderRadius: 2, border: '1px dashed', borderColor: 'divider' }}>
        <Typography variant="caption" color="text.secondary">{t('reports.unknownSource')}: {config.dataSourceId}</Typography>
      </Paper>
    )
  }

  if (!singleAllowed || blockedJoinSource) {
    const blocked = blockedJoinSource ?? ds
    return (
      <Paper sx={{ p: 2, borderRadius: 2, border: '1px dashed', borderColor: 'divider', height: '100%' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Lock size={14} style={{ color: 'var(--mui-palette-text-secondary)', flexShrink: 0 }} />
          <Typography variant="caption" color="text.secondary">
            {tOr('reports.sourceLocked', blockedDataSourceMessage(blocked))}
          </Typography>
        </Box>
      </Paper>
    )
  }

  const Icon = ct?.icon ?? ds.icon

  const widgetTitle = config.titleKey ? tOr(config.titleKey, config.title ?? ds.name) : (config.title ?? tOr(ds.nameKey ?? '', ds.name))

  return (
    <Paper
      data-widget-id={config.id}
      data-chart-type={config.chartType}
      data-widget-title={widgetTitle}
      sx={{
        p: 2.5, borderRadius: `${CARD.borderRadius}px`,
        boxShadow: CARD.shadow,
        height: '100%',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Icon size={14} style={{ color: '#a78bfa', flexShrink: 0 }} />
        <Typography variant="body2" fontWeight={600} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {widgetTitle}
        </Typography>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        {isLoading ? (
          <Skeleton variant="rounded" height={200} />
        ) : isError ? (
          <QueryError error={error} onRetry={retry} label={t('reports.failedToLoadData')} compact />
        ) : (
          <ChartRenderer
            rows={hasJoin
              ? joinedRows
              : ds.rowsPath ? getNestedValue(data, ds.rowsPath) ?? [] : data ? [data] : []}
            chartType={config.chartType}
            labelField={config.labelField}
            valueField={config.valueField}
            valueFields={config.valueFields}
            allFields={config.valueFields ?? (config.labelField && config.valueField ? [config.labelField, config.valueField] : undefined)}
            title={config.title}
            chartId={config.id}
          />
        )}
      </Box>
    </Paper>
  )
}
