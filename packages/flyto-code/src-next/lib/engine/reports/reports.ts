/**
 * Report templates & components — engine API client.
 */

import { request, BASE, authHeader } from '../client'

// ── Types ──

// ReportTemplateConfig is the raw "sections + widgets" payload
// the editor manipulates. The schema is editor-driven and evolves
// per release; downstream consumers parse the parts they care about.
export type ReportTemplateConfig = Record<string, unknown>

export interface ServerReportTemplate {
  id: string
  org_id: string
  name: string
  category: string
  config: ReportTemplateConfig // sections + widgets JSON
  created_by?: string
  created_at: string
  updated_at: string
}

export interface ServerReportComponent {
  id: string
  org_id: string
  name: string
  data_source_id: string
  chart_type: string
  label_field?: string
  value_field?: string
  default_cols: number
  created_by?: string
  created_at: string
}

// ── Templates ──

export function listReportTemplates(orgId: string) {
  return request<{ templates: ServerReportTemplate[] }>('GET', `/api/v1/code/orgs/${orgId}/report-templates`)
}

export function createReportTemplate(orgId: string, body: { name: string; category?: string; config: ReportTemplateConfig }) {
  return request<ServerReportTemplate>('POST', `/api/v1/code/orgs/${orgId}/report-templates`, body)
}

export function updateReportTemplate(id: string, body: { name?: string; category?: string; config?: ReportTemplateConfig }) {
  return request<ServerReportTemplate>('PUT', `/api/v1/code/report-templates/${id}`, body)
}

export function deleteReportTemplate(id: string) {
  return request<{ deleted: string }>('DELETE', `/api/v1/code/report-templates/${id}`)
}

// ── Components ──

export function listReportComponents(orgId: string) {
  return request<{ components: ServerReportComponent[] }>('GET', `/api/v1/code/orgs/${orgId}/report-components`)
}

export function createReportComponent(orgId: string, body: {
  name: string; data_source_id: string; chart_type: string;
  label_field?: string; value_field?: string; default_cols?: number;
}) {
  // Body intentionally omits `join_config`. The backend handler uses
  // `DisallowUnknownFields()` and the `report_components` table has
  // no JOIN column today, so sending it produces a 400 ("json: unknown
  // field"). JOIN configs live in localStorage as the durable copy
  // until a backend column lands — see ReportsView's
  // `createComponentMut`, which now strips the field before POST.
  return request<ServerReportComponent>('POST', `/api/v1/code/orgs/${orgId}/report-components`, body)
}

export function deleteReportComponent(id: string) {
  return request<{ deleted: string }>('DELETE', `/api/v1/code/report-components/${id}`)
}

// ── AI Polish ──

export interface ReportWidgetSummary {
  title: string
  chart_type: string
  data_summary: string
}

export interface ReportAIPolishResponse {
  status?: 'ok' | 'unavailable'
  executive_summary: string
  sections: { widget_title: string; insight: string }[]
  recommendations: string[]
  generated_at: string
  reason?: string
  reason_key?: string
}

export function polishReport(orgId: string, body: {
  report_name: string
  category: string
  widgets: ReportWidgetSummary[]
}) {
  return request<ReportAIPolishResponse>('POST', `/api/v1/code/orgs/${orgId}/reports/ai-polish`, body)
}

// ── PDF Export ──
//
// The legacy `generateReportPdf` (POST `/reports/generate?format=pdf`)
// was removed when the backend retired that route on 2026-05-24.
// ReportsView now drives custom-report exports through `buildReport` /
// `downloadBuiltReport` in `./vaReport.ts` with inline `sections[]`
// derived from the template, gated by `BACKEND_SUPPORTED_SOURCES` in
// `components/compounds/reports/buildSections.ts`.

/**
 * Render arbitrary HTML to PDF via backend Chromium service.
 * Used for Executive Report (markdown→HTML on frontend, PDF on backend).
 */
export async function renderHtmlToPdf(orgId: string, html: string): Promise<Blob> {
  const bearer = await authHeader()
  if (!bearer) throw new Error('Not authenticated')
  const res = await fetch(`${BASE}/api/v1/code/orgs/${orgId}/reports/render-pdf`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      Authorization: bearer,
    },
    body: html,
  })
  if (!res.ok) {
    // Same empty-body fallthrough as generateReportPdf — keep these
    // two error paths in lock-step.
    const text = await res.text().catch(() => '')
    throw new Error(text || `${res.status} ${res.statusText}`)
  }
  return res.blob()
}
