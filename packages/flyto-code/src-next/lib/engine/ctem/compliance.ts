import { request } from '../client'
import type { ReportSourceMeta } from '../reports/report-sources'

export interface ControlResult {
  control_id: string
  control_name: string   // Go json:"control_name"
  status: string         // pass, fail, partial
  details: string
}

export interface FrameworkResult {
  framework: string
  score: number
  pass_count: number
  partial_count?: number
  fail_count: number
  total_count: number
  controls: ControlResult[]
}

export interface ComplianceReport {
  org_id: string
  evaluated_at: string
  frameworks: FrameworkResult[]
  overall_score: number
}

export async function getOrgCompliance(orgId: string) {
  return request<ComplianceReport>('GET', `/api/v1/code/orgs/${orgId}/compliance`)
}

export type NormalizedControlStatus = 'pass' | 'partial' | 'fail' | 'not_applicable'

export interface ComplianceStatusSummary {
  pass_count: number
  partial_count: number
  fail_count: number
  not_applicable_count: number
  total_count: number
  evaluated_count: number
  non_pass_count: number
}

function safeCount(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

export function normalizeControlStatus(status: unknown): NormalizedControlStatus {
  const raw = String(status ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (raw === 'pass' || raw === 'passed' || raw === 'ok' || raw === 'success' || raw === 'compliant') return 'pass'
  if (raw === 'partial' || raw === 'partially_compliant' || raw === 'warning' || raw === 'warn') return 'partial'
  if (raw === 'not_applicable' || raw === 'notapplicable' || raw === 'n/a' || raw === 'na') return 'not_applicable'
  return 'fail'
}

export function summarizeFrameworkControls(framework: Pick<FrameworkResult, 'controls' | 'pass_count' | 'partial_count' | 'fail_count' | 'total_count'>): ComplianceStatusSummary {
  const controls = Array.isArray(framework.controls) ? framework.controls : []

  if (controls.length > 0) {
    let pass = 0
    let partial = 0
    let fail = 0
    let notApplicable = 0
    for (const control of controls) {
      const status = normalizeControlStatus(control.status)
      if (status === 'pass') pass++
      else if (status === 'partial') partial++
      else if (status === 'not_applicable') notApplicable++
      else fail++
    }
    const evaluated = pass + partial + fail
    return {
      pass_count: pass,
      partial_count: partial,
      fail_count: fail,
      not_applicable_count: notApplicable,
      total_count: controls.length,
      evaluated_count: evaluated,
      non_pass_count: partial + fail,
    }
  }

  const total = safeCount(framework.total_count)
  const pass = safeCount(framework.pass_count)
  const explicitPartial = safeCount(framework.partial_count)
  const rawFail = Math.min(total, safeCount(framework.fail_count))
  const partial = explicitPartial > 0 ? Math.min(total, explicitPartial) : Math.max(0, total - pass - rawFail)
  const fail = Math.max(0, Math.min(total, rawFail))
  return {
    pass_count: pass,
    partial_count: partial,
    fail_count: fail,
    not_applicable_count: 0,
    total_count: total,
    evaluated_count: total,
    non_pass_count: partial + fail,
  }
}

// ── Report datasource definitions ──

export const COMPLIANCE_REPORT_SOURCES: ReportSourceMeta[] = [
  {
    id: 'compliance-matrix',
    name: 'Compliance Matrix',
    nameKey: 'reports.ds.complianceMatrix',
    category: 'compliance',
    fetcher: (orgId) => getOrgCompliance(orgId),
    rowsPath: 'frameworks',
    fields: [
      { key: 'framework', label: 'Framework', type: 'string' },
      { key: 'score', label: 'Score', type: 'number' },
      { key: 'total_count', label: 'Total', type: 'number' },
      { key: 'pass_count', label: 'Passed', type: 'number' },
      { key: 'partial_count', label: 'Partial', type: 'number' },
      { key: 'fail_count', label: 'Failed', type: 'number' },
    ],
  },
]
