import { qk } from '@lib/queryKeys'
/**
 * exportData.ts — fetch the rows a report widget is showing so the PDF
 * export can relay them inline to the backend.
 *
 * This mirrors `DataWidget.tsx`'s data path exactly (same query keys,
 * same `rowsPath` extraction, same JOIN computation) so the exported
 * table/KPI matches what the user sees on screen. Reads through the
 * React Query cache via `fetchQuery`, so a widget already rendered in
 * the preview is served from cache rather than re-fetched.
 */

import type { QueryClient } from '@tanstack/react-query'
import { DATA_SOURCE_MAP } from './datasources'
import { getNestedValue } from './utils'
import { joinRows } from './joinLogic'
import type { DataSourceDef, DataWidgetConfig } from './types'

const STALE = 2 * 60_000
type SourceAllowed = (ds: DataSourceDef) => boolean

function extractRows(ds: DataSourceDef | undefined, data: unknown): Record<string, unknown>[] {
  if (!ds) return []
  const raw = ds.rowsPath ? getNestedValue(data, ds.rowsPath) ?? [] : data ? [data] : []
  return Array.isArray(raw) ? raw : [raw]
}

/** Fetch (or read from cache) the rows backing a single widget. Handles
 *  multi-source JOIN widgets the same way the on-screen widget does. */
export async function fetchWidgetRows(
  qc: QueryClient,
  widget: DataWidgetConfig,
  orgId: string,
  sourceAllowed: SourceAllowed = () => true,
): Promise<Record<string, unknown>[]> {
  const hasJoin = !!widget.joinConfig && widget.joinConfig.nodes.length > 1
  if (hasJoin && widget.joinConfig) {
    const jc = widget.joinConfig
    const rowsByIdx = await Promise.all(jc.nodes.map(async n => {
      const jds = DATA_SOURCE_MAP[n.sourceId]
      if (!jds || !sourceAllowed(jds)) return []
      const data = await qc.fetchQuery({
        queryKey: qk.reports.dataSource(n.sourceId, orgId),
        queryFn: () => jds.fetcher(orgId),
        staleTime: STALE,
      })
      return extractRows(jds, data)
    }))
    if (rowsByIdx.length === 0) return []
    let result = rowsByIdx[0]
    for (const edge of jc.edges) {
      const right = rowsByIdx[edge.toNodeIdx] ?? []
      result = joinRows(result, right, edge.fromField, edge.toField, edge.joinType)
    }
    return result
  }

  const ds = DATA_SOURCE_MAP[widget.dataSourceId]
  if (!ds || !sourceAllowed(ds)) return []
  const data = await qc.fetchQuery({
    queryKey: qk.reports.dataSource(widget.dataSourceId, orgId),
    queryFn: () => ds.fetcher(orgId),
    staleTime: STALE,
  })
  return extractRows(ds, data)
}
