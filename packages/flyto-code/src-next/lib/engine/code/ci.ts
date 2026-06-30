import { request } from '../client'
import type { ReportSourceMeta } from '../reports/report-sources'

export function submitCICheck(repoId: string, data: { commit_sha: string; pr_number?: number; branch?: string; findings: Array<{ severity: string; title: string }> }) {
  return request<{ id: string; status: string; summary: string; critical_count: number; high_count: number }>('POST', `/api/v1/code/repos/${repoId}/ci-check`, data)
}

export function listCIChecks(orgId: string, limit = 50) {
  return request<{ checks: Array<{ id: string; repo_id: string; commit_sha: string; pr_number?: number; branch?: string; status: string; policy: string; critical_count: number; high_count: number; total_count: number; summary: string; created_at: string }> }>('GET', `/api/v1/code/orgs/${orgId}/ci-checks?limit=${limit}`)
}

export function getCIPolicy(orgId: string) {
  return request<{ org_id: string; block_on: string; fail_on_license: boolean; fail_on_secret: boolean; fail_on_iac_critical: boolean; require_scan: boolean }>('GET', `/api/v1/code/orgs/${orgId}/ci-policy`)
}

export function updateCIPolicy(orgId: string, policy: { block_on: string; fail_on_license: boolean; fail_on_secret: boolean; fail_on_iac_critical: boolean; require_scan: boolean }) {
  return request<{ org_id: string }>('PUT', `/api/v1/code/orgs/${orgId}/ci-policy`, policy)
}

// ── Report datasource definitions ──

export const CI_REPORT_SOURCES: ReportSourceMeta[] = [
  {
    id: 'ci-checks',
    name: 'CI History',
    nameKey: 'reports.ds.ciChecks',
    category: 'ci',
    fetcher: (orgId) => listCIChecks(orgId, 50),
    rowsPath: 'checks',
    joinableOn: ['repo_id'],
    fields: [
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'branch', label: 'Branch', type: 'string' },
      { key: 'commit_sha', label: 'Commit', type: 'string' },
      { key: 'critical_count', label: 'Critical', type: 'number' },
      { key: 'high_count', label: 'High', type: 'number' },
      { key: 'total_count', label: 'Total', type: 'number' },
      { key: 'created_at', label: 'Date', type: 'date' },
    ],
  },
]
