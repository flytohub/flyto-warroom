// vaReport.ts — Vulnerability Assessment report (External CTEM).
//
// Backend retired the dedicated `/va-report*` endpoints on 2026-05-24
// (api/router.go:673) in favour of the unified report engine:
//
//   POST /api/v1/code/orgs/{id}/reports/build
//   body: { template_id: "external_ctem", format: "html" | "pdf" }
//   200:  text/html (format=html, default fallback when pdf-service down)
//         application/pdf (format=pdf, when FLYTO_PDF_URL is wired)
//   403:  org lacks surface_external feature OR asset:read on external surface
//
// The same template_id maps to the same content the old /va-report shipped
// (org-wide external posture + findings + remediation), but the response
// is now a rendered blob instead of `{markdown, summary}` JSON — preview
// happens via an iframe in the consuming view, not by parsing markdown.

import { requestBlob } from '../client'

export type ReportFormat = 'html' | 'pdf'

/** Section descriptor accepted inline by `POST /reports/build`.
 *  Mirrors `api/report_engine.go:ReportSection`. Mostly consumed by
 *  the custom-report export path in `compounds/reports/buildSections.ts`
 *  — built-in templates use `template_id` instead. */
export interface BuildReportInlineSection {
  title: string
  type: 'text' | 'chart' | 'kpi' | 'table' | 'score_summary'
  data_source?: string
  chart_hint?: string
  filters?: Record<string, unknown>
  columns?: string[]
  max_rows?: number
  content?: string
  text_style?: string
  image?: string  // data:image/...;base64,... PNG from frontend chart capture
  rows?: Array<Record<string, unknown>>
  kpis?: Record<string, unknown>
}

/** Settings envelope — opt-in metadata; backend defaults are sensible
 *  enough that omitting `settings` works for built-in templates. */
export interface BuildReportSettings {
  report_name?: string
  description?: string
  locale?: string
  classification?: string
  watermark?: string
  logo_url?: string
  include_cover?: boolean
  include_toc?: boolean
}

export interface BuildReportRequest {
  /** Use one OR the other — `template_id` for backend-registered
   *  built-ins (default / external_ctem / code_audit / executive_summary),
   *  `sections` for custom reports assembled client-side. */
  template_id?: string
  sections?: BuildReportInlineSection[]
  settings?: BuildReportSettings
  format?: ReportFormat
}

/** POST /reports/build and return the rendered blob. Caller decides
 *  whether to render inline (HTML) or trigger a download (PDF). */
export function buildReport(orgId: string, req: BuildReportRequest): Promise<Blob> {
  return requestBlob('POST', `/api/v1/code/orgs/${orgId}/reports/build`, req)
}

/** Fetch the report HTML as a string for inline iframe preview. Same
 *  endpoint as buildReport but unwraps the blob so callers don't have
 *  to manage object-URL lifetimes for srcdoc rendering. */
export async function buildReportHTML(orgId: string, req: Omit<BuildReportRequest, 'format'>): Promise<string> {
  const blob = await buildReport(orgId, { ...req, format: 'html' })
  return blob.text()
}

/** Build the report as PDF and trigger a browser download. Falls back
 *  to HTML (per the engine — when FLYTO_PDF_URL is unset the server
 *  returns HTML with text/html content type instead of failing). The
 *  download extension follows the blob's actual mime type so users
 *  don't get a `.pdf` file containing HTML. */
export async function downloadBuiltReport(
  orgId: string, req: Omit<BuildReportRequest, 'format'>, filenameHint: string,
): Promise<void> {
  const blob = await buildReport(orgId, { ...req, format: 'pdf' })
  const ext = blob.type.includes('pdf') ? 'pdf' : 'html'
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = `${filenameHint}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } finally {
    URL.revokeObjectURL(url)
  }
}
