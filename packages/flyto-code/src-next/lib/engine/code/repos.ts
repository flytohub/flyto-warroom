import { request } from '../client'
import type { ReportSourceMeta } from '../reports/report-sources'

// ── Connected Repos ──

export interface ConnectedRepo {
  id: string
  orgId: string
  provider: string
  /** Provider-side identifier — GitHub's numeric id as string, GitLab
   *  project id as string. Used by the Repo Picker to dedupe against
   *  the list of repos fetched from the provider API, so it can tell
   *  "already connected" from "not connected yet". Backend is
   *  authoritative; the field name matches `json:"providerId"` on the
   *  engine side. */
  providerId: string
  fullName: string
  ownerName: string
  repoName: string
  language?: string
  isPrivate: boolean
  htmlUrl: string
  avatarUrl?: string
  autoScan: boolean
  lastScannedAt?: string
  /** How this repo is scanned. `cloud` (default) means the engine
   *  clones + indexes server-side. `local` means the user runs
   *  `flyto-index` locally and uploads the JSON result. */
  scanMode?: 'cloud' | 'local'
  /** CTEM asset tier — crown_jewel / customer_facing / internal /
   *  sandbox. Drives the priority engine multiplier when a finding
   *  lands on this repo. Defaults to `internal` server-side via
   *  COALESCE so older rows still scan cleanly. */
  assetTier?: 'crown_jewel' | 'customer_facing' | 'internal' | 'sandbox'
  /** Compliance scope — JSON array text of regulatory tags
   *  (pii / pci / hipaa / sox / gdpr / regulated / custom).
   *  Parse via JSON.parse(); empty / "[]" = no tags. */
  complianceScope?: string
  /** Per-team scoping (migration 017). Empty = unassigned. */
  businessUnitId?: string
  /** Status of the most recent scan attempt for this repo. Surfaced
   *  alongside `lastScannedAt` so the row can render a "Failed"
   *  warning instead of looking like "never scanned" when the most
   *  recent attempt actually failed (403, App not installed, …). */
  lastScanStatus?: 'queued' | 'running' | 'complete' | 'failed' | 'cancelled'
  /** Operator-actionable reason for the latest failed scan, set by
   *  the engine's classifyScanFailure helper. Empty when the latest
   *  scan succeeded or no scan has run yet. */
  lastScanError?: string
}

export interface RepoListResponse {
  repos: ConnectedRepo[]
  count: number
}

export function listConnectedRepos(orgId: string) {
  return request<RepoListResponse>('GET', `/api/v1/code/orgs/${orgId}/repos`)
}

export function connectRepo(orgId: string, repo: {
  provider: string
  providerId: string
  ownerName: string
  repoName: string
  fullName: string
  defaultBranch: string
  language?: string
  isPrivate: boolean
  avatarUrl?: string
  htmlUrl: string
  /** Optional deployment URL — engine uses it to auto-create a
   *  pentest project + run attack-surface discovery alongside the
   *  code scan. Null/empty = skip (no pentest auto-create). */
  homepage?: string | null
}, token?: string) {
  // Pass the provider token as a header so engine can persist it AND use it
  // for the immediate auto-scan enqueue. Without this, a private-repo scan
  // that fires before saveOrgToken finishes will fail with
  // "fatal: could not read Username for 'https://github.com'".
  const headers: Record<string, string> = {}
  if (token) headers['X-GitHub-Token'] = token
  return request<ConnectedRepo>('POST', `/api/v1/code/orgs/${orgId}/repos`, repo, { headers })
}

export function disconnectRepo(repoId: string) {
  return request<{ status: string }>('DELETE', `/api/v1/code/repos/${repoId}`)
}

// ── Org tokens ──

export function saveOrgToken(orgId: string, token: string, provider = 'github') {
  return request<{ status: string }>('POST', `/api/v1/code/orgs/${orgId}/token`, { provider, token })
}

export function getOrgTokenStatus(orgId: string, provider = 'github') {
  return request<{ connected: boolean; provider: string }>('GET', `/api/v1/code/orgs/${orgId}/token/status?provider=${provider}`)
}

// ── GitHub App ──

/**
 * Persist the (orgId ↔ installation_id) binding after the user lands on
 * the App's setup-URL callback. Backend re-validates by minting an
 * installation token; throws on failure.
 */
export function connectGitHubAppInstallation(
  orgId: string,
  installationId: number,
  setupAction: string = 'install',
) {
  return request<{ status: string; installation_id: number; account_login: string }>(
    'POST',
    `/api/v1/code/orgs/${orgId}/github/connect`,
    { installation_id: installationId, setup_action: setupAction },
  )
}

// ── Scans ──

export interface CodeScan {
  id: string
  repoId: string
  status: string
  triggerType: string
  createdAt: string
}

export function triggerScan(repoId: string, force = true) {
  // Default force=true on user-initiated clicks — operator clicking
  // play on a row with a stuck queued/running scan means they want
  // a fresh attempt, not the idempotent "return the stuck one"
  // behaviour. Pass force=false for programmatic/auto re-triggers
  // that should respect existing in-flight work.
  const qs = force ? '?force=1' : ''
  return request<CodeScan>('POST', `/api/v1/code/repos/${repoId}/scans${qs}`)
}

// Manually stop a queued/running scan. Pairs with backend's
// in-memory CancelFunc registry that SIGKILL's the subprocess
// group. Cross-pod: even when the scan goroutine lives on a
// different engine instance, the DB row gets flipped so the UI
// stops showing the spinner.
export function cancelScan(scanId: string) {
  return request<{ scan_id: string; status: string; reason: string }>(
    'POST', `/api/v1/code/scans/${scanId}/cancel`,
  )
}

// Bulk-cancel every queued/running scan for the org. Used by the
// header "Scanning…" pill to give the user one click out of a
// stuck batch.
export function cancelOrgScans(orgId: string) {
  return request<{ cancelled: number; killed_now: number; scan_ids: string[] }>(
    'POST', `/api/v1/code/orgs/${orgId}/scans/cancel-all`,
  )
}

export function listRepoScans(repoId: string, limit = 5) {
  return request<{ scans: CodeScan[]; count: number }>('GET', `/api/v1/code/repos/${repoId}/scans?limit=${limit}`)
}

export interface ScanLogEntry {
  id: string
  repo_id: string
  repo_name: string
  status: string
  trigger_type: string
  error: string | null
  categories: string
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export function getOrgScanLog(orgId: string, limit = 200) {
  return request<{ entries: ScanLogEntry[]; count: number }>('GET', `/api/v1/code/orgs/${orgId}/scan-log?limit=${limit}`)
}

// ── Recent verify executions for a repo ──
//
// Deliberately re-uses the canonical WorkflowExecution from verify.ts so
// there's a single source of truth for the field names. The engine API
// returns the same camelCase shape for both endpoints.

import type { WorkflowExecution as VerifyExecution } from './verify'

export type RepoWorkflowExecution = VerifyExecution

export function listRepoWorkflowExecutions(repoId: string, limit = 10) {
  return request<{ executions: RepoWorkflowExecution[]; count: number }>(
    'GET', `/api/v1/code/repos/${repoId}/workflow-executions?limit=${limit}`,
  )
}

// ── AI-generated remediation plan ──

export interface FixPlanItem {
  id: string
  title: string
  kind: 'cve' | 'sast' | 'secret' | 'complexity' | 'dead_code' | 'license'
  severity: string
  rationale?: string
  effort_hours: number
  files?: string[]
}

export interface FixPlanBucket {
  week: number
  label?: string
  items: FixPlanItem[]
  effort_hours: number
}

export interface FixPlan {
  buckets: FixPlanBucket[]
  dependencies: Array<{ from: string; to: string }>
  total_effort_hours: number
  critical_path: string[]
  summary?: string
  generated_at: string
}

export function generateFixPlan(repoId: string, force = false) {
  const qs = force ? '?force=1' : ''
  return request<{ plan: FixPlan | null; cached?: boolean; empty?: boolean }>(
    'POST', `/api/v1/code/repos/${repoId}/fix-plan${qs}`,
  )
}

export function getFixPlan(repoId: string) {
  return request<{ plan: FixPlan | null }>(
    'GET', `/api/v1/code/repos/${repoId}/fix-plan`,
  )
}

// ── AI Fix Prompt Context ──
// Auto-generated after each scan. Contains a precise prompt for
// Cursor/Copilot/ChatGPT with exact file paths, CVEs, taint flows,
// dead code zones to avoid, etc.

export interface AIFixContext {
  ready: boolean
  missing?: string[]
  instructions?: string
  repo_name?: string
  project_type?: string
  frameworks?: string[]
  primary_language?: string
  prompt?: string
  generated_at?: string
  context?: {
    cves?: Array<{ id: string; package: string; version: string; fixed_in: string; severity: string; summary: string; affected_files?: string[]; reachable: boolean; taint_category?: string }>
    sast_findings?: Array<{ title: string; file: string; line: number; severity: string; snippet?: string }>
    dead_code?: Array<{ name: string; file: string; line: number; type: string }>
    complex_functions?: Array<{ name: string; file: string; line: number; score: number }>
    taint_flows?: Array<{ source: string; sink: string; source_file: string; sink_file: string; category: string }>
    secrets?: Array<{ pattern: string; file: string; line: number }>
    dependencies?: Array<{ name: string; version: string; ecosystem: string }>
  }
}

export function getAIFixContext(repoId: string) {
  return request<AIFixContext>('GET', `/api/v1/code/repos/${repoId}/ai-fix-context`)
}

// ── AI auto-remediation proposals ──
//
// Proposals are produced automatically after a scan completes
// (engine: runAutoAIFixFlow). The frontend displays them with an
// "Open PR" button per row; clicking calls acceptAIProposal which
// turns the proposal into a real GitHub PR.

export interface AIProposal {
  id: string
  finding: string
  kind: 'cve_bump' | 'ai_patch' | 'info'
  severity: string
  file_path: string
  branch: string
  commit_msg: string
  pr_title: string
  pr_body: string
  diff_preview: string
  package?: string
  fixed_version?: string
  ecosystem?: string
  cve_id?: string
  pr_url?: string
  pr_number?: number
  accepted: boolean
  accepted_at?: string
  /** When false, this proposal is info-only — the engine found the CVE
   *  but cannot auto-PR it (transitive dep, no fix version known, etc.).
   *  The drawer should render skip_reason / skip_hint instead of an
   *  Open PR button. */
  actionable: boolean
  /** Stable enum token matching one of the skipReason* constants in
   *  flyto-engine/api/ai_autofix.go. Used as i18n key prefix:
   *  `issues.skip_reason_${skip_reason}`. */
  skip_reason?: string
  /** Free-form guidance shown raw under the reason, e.g. "cryptography
   *  is a transitive dep — upgrade openai or add an explicit pin". */
  skip_hint?: string
}

export interface AIPatchReport {
  scan_id: string
  repo_id: string
  generated_at: string
  entries: AIProposal[]
  skip_reason?: string
}

export function listAIProposals(repoId: string) {
  return request<AIPatchReport>(
    'GET', `/api/v1/code/repos/${repoId}/ai-proposals`,
  )
}

export function acceptAIProposal(repoId: string, proposalId: string) {
  return request<AIProposal>(
    'POST',
    `/api/v1/code/repos/${repoId}/ai-proposals/${proposalId}/accept`,
  )
}

// ── Repo profile / health ──

export interface HealthDimension {
  score: number
  max: number
  status: string
  finding_count?: number
  complex_count?: number
  dead_count?: number
}

export interface RepoProfile {
  // Core
  project_type: string
  project_sub_type: string
  file_count: number

  // Health
  health_dimensions?: {
    security?: HealthDimension
    complexity?: HealthDimension
    dead_code?: HealthDimension
    coverage?: HealthDimension
    overall?: { score: number; max_score: number; grade: string }
  }

  // Structure
  languages?: Record<string, number>
  symbol_counts?: Record<string, number>

  // APIs & Services
  api_definition_count: number
  services?: string[]
  frameworks?: Array<{ name: string; version?: string; type: string; conventions?: Record<string, string> }>

  // Models
  model_count: number

  // Dependencies
  dependency_count: number
  conflict_count: number

  // Security
  secret_count: number
  taint_flow_count: number

  // Quality
  complex_functions: number
  avg_complexity: number
  dead_code_count: number

  // Documentation
  doc_score: number

  // License
  project_license: string

  // Patterns
  patterns: string[]

  // Connections
  connection_count: number
  orphan_count: number

  // Engineering intelligence (v2.11+)
  config_drift?: { env_vars_defined: number; env_vars_referenced: number; issue_count: number; issues?: Array<{ var: string; category: string; severity: string; description: string }> }
  tech_debt?: { total_items: number; by_tag: Record<string, number>; by_severity: Record<string, number>; high_count: number; medium_count: number }
  error_handling?: { total_functions: number; functions_with_handling: number; coverage_pct: number; issue_count: number; by_category: Record<string, number> }
  api_drift?: { total_definitions: number; total_calls: number; matched: number; broken_calls: number; dead_endpoints: number; method_mismatches: number }
  bus_factor?: { total_files_analyzed: number; bus_factor_1_count: number; bus_factor_1_pct: number; avg_bus_factor: number; risk_files: Array<{ file: string; bus_factor: number; primary_author: string; primary_pct: number }> }
  perf_patterns?: { total_issues: number; by_category: Record<string, number>; issues?: Array<{ file: string; line: number; func: string; category: string; severity: string; description: string }> }
  import_health?: { total_modules: number; total_edges: number; coupling_density: number; avg_fan_in: number; avg_fan_out: number; avg_instability: number; god_module_count: number; god_modules?: Array<{ path: string; fan_in: number }>; unstable_count: number; circular_dep_count: number }

  // CVE / Vulnerabilities
  cve_critical?: number
  cve_high?: number
  cve_total?: number
  cve_vulnerabilities?: Array<{
    id: string
    summary: string
    severity: string
    package: string
    version: string
    fixed_in: string
  }>

  // Module graph
  module_graph?: Record<string, string[]>
  module_graph_summary?: Record<string, string[]>

  // Detailed arrays (available when full profile is loaded)
  api_definitions?: Array<{ method: string; path: string; file?: string }>
  models?: Array<{ name: string; type?: string; fields?: Array<{ name: string; type: string }>; file?: string }>

  // SAST findings
  sast_findings?: Array<{ title: string; severity: string; file: string; line?: number; rule?: string }>

  // Meta
  summary?: string
  scanId?: string
  scannedAt?: string
}

export function getRepoProfile(repoId: string) {
  return request<RepoProfile>('GET', `/api/v1/code/repos/${repoId}/health`)
}

// ── Org health summary (bulk) ──

export interface RepoHealthSummary {
  repo_id: string
  project_type: string
  scanned_at?: string
  secret_count?: number
  security_findings?: number
  complex_functions?: number
  dead_code_count?: number
  cve_critical?: number
  cve_high?: number
  cve_total?: number
  license_issues?: number
  alert_total?: number
  alert_resolved?: number
  /** Number of findings eligible for AutoFix */
  autofix_eligible?: number
  /** Mean time to remediate in hours (critical+high alerts only) */
  mttr_hours?: number
  /**
   * Unified score in 250–900 display form, already passed
   * through the engine's DisplayScore() — frontend renders
   * verbatim. Absent when the engine couldn't score this repo
   * (no scan results yet, or no drill-down data).
   *
   * Named `display_score` (NOT `score`) to disambiguate from
   * `aggregated.top_risks[].score` in the same response, which
   * ships raw 0-100. Audit B1: backend-truth, do NOT call
   * displayScore() on this value.
   */
  display_score?: number
  /** A–F grade aligned with display_score. Same backend-truth
   *  contract: absent when the engine couldn't score this repo. */
  grade?: string
  /** Median time to remediate in hours */
  mttr_median_hours?: number
  /** Number of resolved alerts used to compute MTTR */
  mttr_sample_size?: number
}

export interface OrgHealthAggregated {
  avg_score: number
  avg_grade: string
  grade_dist: Record<'A' | 'B' | 'C' | 'D' | 'F', number>
  at_risk_count: number
  secure_count: number
  critical_count: number
  high_count: number
  top_risks: Array<{ repo_id: string; grade: string; score: number }>
}

export interface OrgHealthSummaryResponse {
  repos: RepoHealthSummary[]
  scanned_count: number
  total_count: number
  aggregated?: OrgHealthAggregated
  /** Number of scans queued or running server-side right now. Non-zero
   *  means the Scan-All button should stay locked even after the user
   *  navigates away and comes back. */
  active_scan_count?: number
}

export function getOrgHealthSummary(orgId: string) {
  return request<OrgHealthSummaryResponse>('GET', `/api/v1/code/orgs/${orgId}/health-summary`)
}

// ── Repo findings ──

export interface CodeFinding {
  name: string
  file: string
  line?: number
  type?: string
  severity?: string
  score?: number
  detail?: string
}

export interface RepoFindings {
  dead_code: CodeFinding[]
  complex_functions: CodeFinding[]
  sast_findings: CodeFinding[]
  secrets: CodeFinding[]
  taint_flows: CodeFinding[]
  dead_code_count: number
  complex_count: number
  sast_count: number
  secret_count: number
  taint_count: number
}

export function getRepoFindings(repoId: string) {
  return request<RepoFindings>('GET', `/api/v1/code/repos/${repoId}/findings`)
}

// ── Report datasource definitions ──

export const REPOS_REPORT_SOURCES: ReportSourceMeta[] = [
  {
    id: 'health-summary',
    name: 'Health Summary',
    nameKey: 'reports.ds.healthSummary',
    category: 'health',
    fetcher: (orgId) => getOrgHealthSummary(orgId),
    rowsPath: 'repos',
    joinableOn: ['repo_id'],
    fields: [
      { key: 'repo_id', label: 'Repo ID', type: 'string' },
      { key: 'project_type', label: 'Project Type', type: 'string' },
      { key: 'secret_count', label: 'Secrets', type: 'number', aggregate: 'sum' },
      { key: 'security_findings', label: 'Security Findings', type: 'number', aggregate: 'sum' },
      { key: 'complex_functions', label: 'Complex Functions', type: 'number', aggregate: 'sum' },
      { key: 'dead_code_count', label: 'Dead Code', type: 'number', aggregate: 'sum' },
      { key: 'cve_critical', label: 'CVE Critical', type: 'number', aggregate: 'sum' },
      { key: 'cve_high', label: 'CVE High', type: 'number', aggregate: 'sum' },
      { key: 'cve_total', label: 'CVE Total', type: 'number', aggregate: 'sum' },
      { key: 'scanned_at', label: 'Last Scanned', type: 'date' },
    ],
  },
  {
    id: 'scan-log',
    name: 'Scan Activity',
    nameKey: 'reports.ds.scanLog',
    category: 'health',
    fetcher: (orgId) => getOrgScanLog(orgId, 200),
    rowsPath: 'entries',
    joinableOn: ['repo_id'],
    fields: [
      { key: 'repo_name', label: 'Repo', type: 'string' },
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'trigger_type', label: 'Trigger', type: 'string' },
      { key: 'categories', label: 'Categories', type: 'string' },
      { key: 'started_at', label: 'Started', type: 'date' },
      { key: 'completed_at', label: 'Completed', type: 'date' },
    ],
  },
]
