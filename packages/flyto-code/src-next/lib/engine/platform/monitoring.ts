import { request } from '../client'
import type { ReportSourceMeta } from '../reports/report-sources'

export interface MonitoringEvent {
  id: string
  org_id: string
  domain: string
  event_type: string
  severity: string
  description: string
  old_value: string
  new_value: string
  detected_at: string
}

export async function listMonitoringEvents(orgId: string, limit = 100) {
  return request<{ events: MonitoringEvent[] }>('GET', `/api/v1/code/orgs/${orgId}/monitoring-events?limit=${limit}`)
}

// ── Report datasource definitions ──

export const MONITORING_REPORT_SOURCES: ReportSourceMeta[] = [
  {
    id: 'monitoring-events',
    name: 'Monitoring Events',
    nameKey: 'reports.ds.monitoringEvents',
    category: 'external',
    fetcher: (orgId) => listMonitoringEvents(orgId, 200),
    rowsPath: 'events',
    fields: [
      { key: 'domain', label: 'Domain', type: 'string' },
      { key: 'event_type', label: 'Event Type', type: 'string' },
      { key: 'severity', label: 'Severity', type: 'severity' },
      { key: 'description', label: 'Description', type: 'string' },
      { key: 'old_value', label: 'Old Value', type: 'string' },
      { key: 'new_value', label: 'New Value', type: 'string' },
      { key: 'detected_at', label: 'Detected', type: 'date' },
    ],
  },
]
