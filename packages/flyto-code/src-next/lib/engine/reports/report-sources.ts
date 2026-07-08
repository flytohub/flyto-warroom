/**
 * Report data source metadata — co-located with engine fetchers.
 *
 * HOW TO ADD A NEW DATASOURCE:
 * 1. In your engine module (e.g. security.ts), add entries to the
 *    exported REPORT_SOURCES array alongside the fetcher function.
 * 2. That's it — datasources.ts auto-collects from all modules.
 *
 * No need to touch datasources.ts, LayoutTab.tsx, or any other file.
 * The report builder will pick up the new source automatically.
 */

import { request } from '../client'

export type FieldType = 'number' | 'string' | 'date' | 'severity' | 'grade' | 'boolean' | 'array'
export type FieldAggregate = 'sum' | 'avg' | 'count' | 'min' | 'max'
export type SourceCategory = 'health' | 'security' | 'architecture' | 'compliance' | 'ci' | 'external'

export interface ReportFieldMeta {
  key: string
  label: string
  labelKey?: string
  type: FieldType
  aggregate?: FieldAggregate
  path?: string
}

export interface ReportSourceMeta {
  id: string
  name: string
  nameKey?: string
  category: SourceCategory
  /** Backend capability page-id required before the frontend may fetch it. */
  requiredPage?: string
  fetcher: (orgId: string) => Promise<unknown>
  rowsPath?: string
  joinableOn?: string[]
  fields: ReportFieldMeta[]
}

export interface BackendReportSource {
  id: string
  name: string
  category: string
  surface?: string
  required_feature?: string
  required_action?: string
  available: boolean
  unavailable_reason?: string
  readiness?: 'ready' | 'empty' | 'error' | 'unavailable' | string
  has_data?: boolean
  sample_count?: number
  kpi_signal_count?: number
  probe_error?: string
  supported_chart_types: string[]
  joinable_on?: string[]
}

export function listBackendReportSources(orgId: string): Promise<{ sources: BackendReportSource[]; count: number }> {
  return request('GET', `/api/v1/code/orgs/${orgId}/report-sources`)
}
