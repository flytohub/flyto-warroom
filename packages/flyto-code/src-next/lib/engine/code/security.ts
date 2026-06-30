/**
 * Extended security scanners: container, IaC, license, triage.
 * Backs the ScanViews in the war room.
 */

import { request } from '../client'
import type { ReportSourceMeta } from '../reports/report-sources'

// ── Container ──

export function listContainerFindings(orgId: string) {
  return request<{ findings: Array<{ id: string; repo_id?: string; scan_run_id?: string; source_type?: string; source_ref?: string; image_ref: string; package_name: string; installed_version: string; fixed_version?: string; severity: string; cve_id?: string; title: string; status: string; scanned_at: string; resolved_at?: string; resolution?: string }> }>('GET', `/api/v1/code/orgs/${orgId}/container-findings`)
}

// ── IaC ──

export function listIaCFindings(orgId: string) {
  return request<{ findings: Array<{ id: string; repo_id: string; file_path: string; line?: number; resource_type: string; check_id: string; check_name: string; severity: string; guideline?: string; framework: string; status: string }> }>('GET', `/api/v1/code/orgs/${orgId}/iac-findings`)
}

// ── License ──

export function listLicenseIssues(orgId: string) {
  return request<{ issues: Array<{ id: string; repo_id: string; package_name: string; package_version?: string; license_id: string; license_name: string; risk_level: string; reason?: string; status: string }> }>('GET', `/api/v1/code/orgs/${orgId}/license-issues`)
}

// ── Malware ──

export interface MalwareScanResult {
  total_deps: number
  malware_found: number
  hits: Array<{ package: string; version: string; ecosystem: string; reason: string; severity: string }>
}

export function getMalwareScanResults(orgId: string) {
  return request<{ results: Array<{ category: string; data: string }> }>('GET', `/api/v1/code/orgs/${orgId}/scan-results?category=malware`)
}

// ── CSPM ──

export interface CSPMFinding {
  id: string
  org_id: string
  provider: string
  resource_id: string
  resource_type: string
  region?: string
  rule_id: string
  rule_title: string
  severity: string
  evidence?: string
  guideline?: string
  status: string
  scanned_at: string
}

export function listCSPMFindings(orgId: string) {
  return request<{ count: number; findings: CSPMFinding[] }>('GET', `/api/v1/code/orgs/${orgId}/cspm-findings`)
}

// ── Runtime telemetry ──

export interface RuntimeEvent {
  id: string
  org_id: string
  api_key_id: string
  event_type: string
  threat?: string
  path?: string
  ip?: string
  details?: string
  source?: 'runtime_sdk' | 'rasp' | string
  agent_id?: string
  service?: string
  environment?: string
  runtime?: string
  agent_version?: string
  confidence?: number
  policy_mode?: 'observe' | 'monitor' | 'enforce' | string
  decision?: 'observed' | 'blocked' | 'allowed' | 'held' | 'gap' | string
  coverage_status?: RASPCoverageStatus | string
  gap_reason?: string
  evidence_digest?: string
  occurred_at: string
  received_at: string
}

export type RASPCoverageStatus =
  | 'covered'
  | 'degraded'
  | 'stale'
  | 'no_agent'
  | 'no_heartbeat'
  | 'unsupported'
  | 'not_configured'
  | 'not_collected'
  | 'scan_failed'
  | 'permission_denied'
  | 'rate_limited'
  | 'unknown'

export interface RASPCoverageService {
  agent_id: string
  service?: string
  environment?: string
  runtime?: string
  agent_version?: string
  status: RASPCoverageStatus | string
  gap_reason?: string
  last_heartbeat?: string
  last_event_at: string
  observed_events: number
}

export interface RASPCoverageSummary {
  status: RASPCoverageStatus | string
  gap_reason?: string
  stale_after_sec: number
  services: RASPCoverageService[]
}

export interface RuntimeEventsResponse {
  count: number
  events: RuntimeEvent[]
  rasp_coverage?: RASPCoverageSummary
}

export function listRuntimeEvents(orgId: string, limit = 200) {
  return request<RuntimeEventsResponse>('GET', `/api/v1/code/orgs/${orgId}/runtime-events?limit=${limit}`)
}

// ── SBOM ──

export function downloadSBOM(repoId: string): string {
  // Returns the URL — caller opens in new tab
  return `/api/v1/code/repos/${repoId}/sbom`
}

// ── Triage stats ──

export function getTriageStats(orgId: string) {
  return request<{ total_issues: number; reachable_issues: number; noise_filtered: number; noise_reduction_pct: number }>('GET', `/api/v1/code/orgs/${orgId}/triage-stats`)
}

// ── Report datasource definitions ──

export const SECURITY_REPORT_SOURCES: ReportSourceMeta[] = [
  {
    id: 'containers',
    name: 'Container Findings',
    nameKey: 'reports.ds.containers',
    category: 'security',
    fetcher: (orgId) => listContainerFindings(orgId),
    rowsPath: 'findings',
    joinableOn: ['repo_id'],
    fields: [
      { key: 'severity', label: 'Severity', type: 'severity' },
      { key: 'title', label: 'Title', type: 'string' },
      { key: 'image_ref', label: 'Image', type: 'string' },
      { key: 'package_name', label: 'Package', type: 'string' },
      { key: 'cve_id', label: 'CVE', type: 'string' },
      { key: 'fixed_version', label: 'Fix Version', type: 'string' },
      { key: 'scanned_at', label: 'Scanned', type: 'date' },
    ],
  },
  {
    id: 'iac',
    name: 'IaC Findings',
    nameKey: 'reports.ds.iac',
    category: 'compliance',
    fetcher: (orgId) => listIaCFindings(orgId),
    rowsPath: 'findings',
    joinableOn: ['repo_id'],
    fields: [
      { key: 'severity', label: 'Severity', type: 'severity' },
      { key: 'check_name', label: 'Check', type: 'string' },
      { key: 'resource_type', label: 'Resource', type: 'string' },
      { key: 'framework', label: 'Framework', type: 'string' },
      { key: 'file_path', label: 'File', type: 'string' },
      { key: 'guideline', label: 'Guideline', type: 'string' },
    ],
  },
  {
    id: 'licenses',
    name: 'License Issues',
    nameKey: 'reports.ds.licenses',
    category: 'compliance',
    fetcher: (orgId) => listLicenseIssues(orgId),
    rowsPath: 'issues',
    joinableOn: ['repo_id'],
    fields: [
      { key: 'license_name', label: 'License', type: 'string' },
      { key: 'risk_level', label: 'Risk Level', type: 'severity' },
      { key: 'package_name', label: 'Package', type: 'string' },
      { key: 'reason', label: 'Reason', type: 'string' },
    ],
  },
  {
    id: 'malware',
    name: 'Malware Scan',
    nameKey: 'reports.ds.malware',
    category: 'security',
    fetcher: (orgId) => getMalwareScanResults(orgId),
    rowsPath: 'results',
    fields: [
      { key: 'category', label: 'Category', type: 'string' },
      { key: 'data', label: 'Data', type: 'string' },
    ],
  },
  {
    id: 'cspm',
    name: 'CSPM Findings',
    nameKey: 'reports.ds.cspm',
    category: 'compliance',
    fetcher: (orgId) => listCSPMFindings(orgId),
    rowsPath: 'findings',
    fields: [
      { key: 'provider', label: 'Provider', type: 'string' },
      { key: 'resource_type', label: 'Resource', type: 'string' },
      { key: 'region', label: 'Region', type: 'string' },
      { key: 'rule_title', label: 'Rule', type: 'string' },
      { key: 'severity', label: 'Severity', type: 'severity' },
      { key: 'evidence', label: 'Evidence', type: 'string' },
      { key: 'guideline', label: 'Guideline', type: 'string' },
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'scanned_at', label: 'Scanned', type: 'date' },
    ],
  },
  {
    id: 'runtime-events',
    name: 'Runtime Events',
    nameKey: 'reports.ds.runtimeEvents',
    category: 'security',
    fetcher: (orgId) => listRuntimeEvents(orgId, 200),
    rowsPath: 'events',
    fields: [
      { key: 'event_type', label: 'Event Type', type: 'string' },
      { key: 'threat', label: 'Threat', type: 'string' },
      { key: 'path', label: 'Path', type: 'string' },
      { key: 'ip', label: 'IP', type: 'string' },
      { key: 'occurred_at', label: 'Occurred', type: 'date' },
    ],
  },
]
