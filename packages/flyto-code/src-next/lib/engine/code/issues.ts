import { request } from '../client'
import type { ReportSourceMeta } from '../reports/report-sources'

// ── Security Issues (aggregated) ──

export interface SecurityIssue {
  id: string
  type: string      // "cve" | "secret" | "security_finding"
  severity: string  // "CRITICAL" | "HIGH" | "MODERATE" | "LOW"
  title: string
  description: string
  // Dedup key used by verify + status-change flows.
  fingerprint: string
  // CVE-specific. Populated only when type === "cve".
  package?: string
  version?: string
  fixed_in?: string
  cve_id?: string
  ecosystem?: string
  references?: string[]
  published_at?: string
  repo_id: string
  repo_name: string
  status: string    // "open" | "ignored" | "solved" | "snoozed"
  source: string    // "osv" | "flyto-indexer"
  // CVE enrichment — populated by EPSS + KEV + cross-correlation
  epss?: number              // 0.0-1.0 exploit probability
  epss_percentile?: number   // 0.0-1.0
  in_kev?: boolean           // CISA Known Exploited Vulnerabilities
  external_exposed?: boolean // Shodan also reports this CVE on external IP
  risk_score?: number        // 0-100 composite risk

  // Rollup rows aggregate all secrets / SAST findings for a repo into
  // a single summary entry — indexer profile only emits counts, not
  // per-finding detail. Frontend renders these with a localised
  // template instead of using `title` directly.
  rollup?: boolean
  count?: number
}

export interface IssuesResponse {
  issues: SecurityIssue[]
  counts: { open: number; snoozed: number; ignored: number; solved: number; total: number }
}

/**
 * EnrichedSecurityIssue — what /issues?enrich=true returns. Embeds
 * the original SecurityIssue plus correlate.LocationContext: open
 * PRs, taint adjacency, AutoFix readiness, pentest verdict, and a
 * computed blast_radius. Every context field is optional; missing
 * means "we don't know", not "false".
 */
export interface EnrichedSecurityIssue extends SecurityIssue {
  blast_radius?: number
  open_prs_touching?: PRRef[]
  taint_adjacency?: TaintRef | null
  autofix_eligible?: boolean
  pentest_verdict?: PentestRef | null
}

export interface EnrichedIssuesResponse {
  issues: EnrichedSecurityIssue[]
  counts: { open: number; snoozed: number; ignored: number; solved: number; total: number }
}

/**
 * IssueFilters — the server-side filters the /issues endpoint accepts
 * (status / severity / type / repo). All four are aggregated client-side
 * by the engine BEFORE the response is built, so a 5k-issue org never
 * ships the full set down just to render 30 rows. The status `counts`
 * in the response are computed over ALL issues regardless of these
 * filters (see handlers_issues.go#applyIssueFilters), so the UI's tab
 * badges stay stable even when severity/type/repo narrow the table.
 *
 * `repo` is sent as the canonical `repo_id` query param; the engine
 * still accepts the legacy `?repo=` alias for older clients.
 */
export interface IssueFilters {
  status?: string
  severity?: string
  type?: string
  repo?: string
}

function appendIssueFilters(qs: URLSearchParams, params?: IssueFilters) {
  if (params?.status) qs.set('status', params.status)
  if (params?.severity) qs.set('severity', params.severity)
  if (params?.type) qs.set('type', params.type)
  // Canonical param is repo_id; engine keeps ?repo= as a back-compat alias.
  if (params?.repo) qs.set('repo_id', params.repo)
}

export function getOrgIssues(orgId: string, params?: IssueFilters) {
  const qs = new URLSearchParams()
  appendIssueFilters(qs, params)
  const query = qs.toString()
  return request<IssuesResponse>('GET', `/api/v1/code/orgs/${orgId}/issues${query ? '?' + query : ''}`)
}

/** Same as getOrgIssues but with cross-dim correlate context. */
export function getEnrichedOrgIssues(orgId: string, params?: IssueFilters) {
  const qs = new URLSearchParams({ enrich: 'true' })
  appendIssueFilters(qs, params)
  return request<EnrichedIssuesResponse>(
    'GET',
    `/api/v1/code/orgs/${orgId}/issues?${qs.toString()}`,
  )
}

export function updateIssueStatus(orgId: string, fingerprint: string, status: 'open' | 'snoozed' | 'ignored' | 'solved', snoozeDays?: number) {
  return request<{ id: string; status: string }>('PATCH', `/api/v1/code/orgs/${orgId}/issues/status`, {
    fingerprint,
    status,
    ...(snoozeDays != null && { snooze_days: snoozeDays }),
  })
}

// ── Alerts ──

export interface CodeAlert {
  id: string
  repoId: string
  orgId?: string
  scanId?: string | null
  category: string
  severity: string
  title: string
  description?: string
  filePath?: string | null
  lineNumber?: number | null
  fingerprint?: string
  status: string
  createdAt: string
}

// ── Cross-dim correlate types (matches internal/correlate/correlate.go) ──

export interface PRRef {
  number: number
  title?: string
  url?: string
  head_branch?: string
  is_draft?: boolean
  opened_at?: string
}

export interface TaintRef {
  categories?: string[]
  unsanitized_count?: number
}

export interface PentestRef {
  project_id: string
  target_url?: string
  last_scan_at?: string
  critical_count?: number
}

/**
 * EnrichedAlert is what /alerts?enrich=true and /pulse return —
 * a CodeAlert with cross-dimension context (open PRs touching the
 * file, taint adjacency, AutoFix eligibility, pentest verdict,
 * blast radius score). Every context field is optional; missing
 * means "we don't know", not "false".
 */
export type EnrichedAlert = CodeAlert & {
  blast_radius: number
  open_prs_touching?: PRRef[]
  taint_adjacency?: TaintRef | null
  autofix_eligible?: boolean
  pentest_verdict?: PentestRef | null
  last_seen?: string
}

export interface AlertListResponse {
  alerts: CodeAlert[]
  count: number
}

export interface EnrichedAlertListResponse {
  alerts: EnrichedAlert[]
  count: number
}

export function listAlerts(orgId: string, status?: string) {
  const qs = status ? `?status=${status}` : ''
  return request<AlertListResponse>('GET', `/api/v1/code/orgs/${orgId}/alerts${qs}`)
}

/** Same path, but with cross-dim context attached to each row. */
export function listEnrichedAlerts(orgId: string, status?: string) {
  const params = new URLSearchParams({ enrich: 'true' })
  if (status) params.set('status', status)
  return request<EnrichedAlertListResponse>(
    'GET',
    `/api/v1/code/orgs/${orgId}/alerts?${params.toString()}`,
  )
}

/**
 * PulseItem — unified shape returned by /orgs/{id}/pulse. Same schema
 * for every source (code alert / container / IaC / license / DAST /
 * pentest); the `source` discriminator drives icon + colour in
 * <PulseRow>. Cross-dim context fields mirror EnrichedAlert.
 */
export interface PulseItem {
  id: string
  // The engine emits 11 pulse sources (internal/correlate knownPulseSources).
  // Keep this union in lockstep so SOURCE_META renders each honestly instead of
  // collapsing cspm/identity/leak/divergence into the 'alert' (SAST) fallback.
  source: 'alert' | 'container' | 'cspm' | 'iac' | 'license' | 'dast' | 'identity' | 'mcp' | 'leak' | 'pentest' | 'divergence'
  severity: string
  title: string
  description?: string
  repo_id?: string
  file_path?: string
  line_number?: number
  category?: string
  status?: string
  created_at: string

  blast_radius: number
  open_prs_touching?: PRRef[]
  taint_adjacency?: TaintRef | null
  autofix_eligible?: boolean
  pentest_verdict?: PentestRef | null

  /** Fingerprint for alert-source items — allows opening the unified
   *  finding panel from Pulse cards. Other sources may not have one. */
  fingerprint?: string

  /** Source-specific extras keyed as strings (image_ref, package_name,
   *  cve_id, license_id, asset_type, target_url, etc.) */
  extra?: Record<string, string>
}

export interface PulseResponse {
  items: PulseItem[]
  count: number
  // Dimension-awareness (engine convergence 2026-06-10): which known pulse
  // sources produced >=1 item this request vs produced zero. "missing" means
  // produced-zero-rows this request — NOT "unconfigured". Optional so older
  // engine builds that omit them degrade gracefully.
  active_sources?: string[]
  missing_sources?: string[]
}

/**
 * Pulse — cross-dim "what should I look at right now" feed.
 * Returns the unified PulseItem stream sorted by blast radius desc.
 * Default `since=""` (no time floor) so the user always sees their
 * open backlog on first paint — narrowing comes from the UI's
 * window picker, not the API default.
 *
 * @param since duration like "24h", "168h" (== 7d), or "" for no floor.
 * @param limit output cap (engine clamps to 500)
 */
export function getOrgPulse(orgId: string, since: string = '', limit: number = 50) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (since) params.set('since', since)
  return request<PulseResponse>(
    'GET',
    `/api/v1/code/orgs/${orgId}/pulse?${params.toString()}`,
  )
}

/** AI-generated pulse summary. Kept as a pure UI type; no frontend POST
 * client is exported until the backend route is implemented. */
export interface PulseAISummary {
  recommendations: Array<{
    priority: 'urgent' | 'important' | 'suggested'
    action: string
    reason: string
    affected_count: number
  }>
  summary: string
  generated_at: string
}

export interface AdvisorActionItem {
  priority: 'urgent' | 'important' | 'suggested'
  title: string
  context: string
  affected_repos: string[]
  affected_count: number
  estimated_impact: string
  difficulty: 'quick-win' | 'medium' | 'project'
  action_type: string
  action_target: unknown
}

export interface AdvisorTrend {
  direction: 'improving' | 'declining' | 'stable'
  metric: string
  detail: string
  value?: number
}

export interface PulseAdvisorResponse {
  risk_summary: string
  action_items: AdvisorActionItem[]
  trends: AdvisorTrend[]
  highlights: string[]
  generated_at: string
  data_sources: string[]
  source?: string
}

// ── Webhooks ──

export function listWebhooks(orgId: string) {
  return request<{ webhooks: Array<{ id: string; url: string; events: string; active: boolean; created_at: string }> }>('GET', `/api/v1/code/orgs/${orgId}/webhooks`)
}
export function createWebhook(orgId: string, url: string, events?: string) {
  return request<{ id: string }>('POST', `/api/v1/code/orgs/${orgId}/webhooks`, { url, events: events ?? 'critical_issue' })
}
export function deleteWebhook(id: string) {
  return request<{ deleted: string }>('DELETE', `/api/v1/code/webhooks/${id}`)
}

// ── Scan schedule (legacy single-row) ──

export function getScanSchedule(orgId: string) {
  return request<{ id?: string; schedule: string; enabled: boolean; next_run_at?: string }>('GET', `/api/v1/code/orgs/${orgId}/scan-schedule`)
}
export function setScanSchedule(orgId: string, schedule: string, enabled: boolean) {
  return request<{ id: string }>('PUT', `/api/v1/code/orgs/${orgId}/scan-schedule`, { schedule, enabled })
}

// ── Scan schedules (multi-kind) ──
//
// One row per (org, kind). The Settings → Scanning tab renders two
// cards in parallel — one for `code` (repo deep-scan, weekly default)
// and one for `attack_surface` (domain discovery, daily default).
// Pause / resume / run-now operate on a single (org, kind) row.

export type ScanScheduleKind = 'code' | 'attack_surface'

export interface ScanScheduleRow {
  id: string
  org_id: string
  kind: ScanScheduleKind
  schedule: string         // 'hourly' | 'daily' | 'daily_full' | 'weekly' | 'manual'
  enabled: boolean
  last_run_at?: string | null
  next_run_at?: string | null
  consecutive_failures: number
  paused_at?: string | null
  paused_reason?: string
  updated_at: string
  updated_by?: string
  created_at: string
}

export function listScanSchedules(orgId: string) {
  return request<{ schedules: ScanScheduleRow[] }>('GET', `/api/v1/code/orgs/${orgId}/scan-schedules`)
}

export function putScanScheduleByKind(
  orgId: string,
  kind: ScanScheduleKind,
  schedule: string,
  enabled: boolean,
) {
  return request<ScanScheduleRow>(
    'PUT',
    `/api/v1/code/orgs/${orgId}/scan-schedules/${kind}`,
    { schedule, enabled },
  )
}

export function pauseScanSchedule(orgId: string, kind: ScanScheduleKind, reason?: string) {
  return request<{ status: string; reason: string }>(
    'POST',
    `/api/v1/code/orgs/${orgId}/scan-schedules/${kind}/pause`,
    reason ? { reason } : {},
  )
}

export function resumeScanSchedule(orgId: string, kind: ScanScheduleKind) {
  return request<{ status: string }>(
    'POST',
    `/api/v1/code/orgs/${orgId}/scan-schedules/${kind}/resume`,
    {},
  )
}

export function runScanScheduleNow(orgId: string, kind: ScanScheduleKind) {
  return request<{ kind: ScanScheduleKind; ok: boolean; reason: string; fired_at: string }>(
    'POST',
    `/api/v1/code/orgs/${orgId}/scan-schedules/${kind}/run-now`,
    {},
  )
}

// ── Unified Finding (cross-view detail) ──

export interface UnifiedFinding {
  id: string
  title: string
  description: string
  severity: string
  type: string // cve, secret, sast, container, iac, license, pentest
  cve_id?: string
  package?: string
  version?: string
  fixed_in?: string
  locations: Array<{
    repo_id?: string
    repo_name?: string
    file_path?: string
    line?: number
    domain?: string
    /** Inherited from ConnectedRepo.scanMode — present when the engine
     *  joins repo metadata into the finding locations. */
    scan_mode?: 'cloud' | 'local'
  }>
  autofix_available: boolean
  autofix_patches?: Array<{
    finding_id: string
    rule_id: string
    patch_status: string
    verify_passed: boolean
    pr_url?: string
  }>
  verifications?: Array<{
    execution_id: string
    status: string
    verdict?: string
    evidence_url?: string
    created_at: string
  }>
  latest_verdict?: string
  status: string
  references?: string[]
}

export function getUnifiedFinding(orgId: string, fingerprint: string) {
  return request<UnifiedFinding>('GET', `/api/v1/code/orgs/${orgId}/findings/${fingerprint}`)
}

// ── Report datasource definitions ──

export const ISSUES_REPORT_SOURCES: ReportSourceMeta[] = [
  {
    id: 'issues',
    name: 'Security Issues',
    nameKey: 'reports.ds.issues',
    category: 'security',
    fetcher: (orgId) => getEnrichedOrgIssues(orgId),
    rowsPath: 'issues',
    joinableOn: ['repo_id', 'fingerprint'],
    fields: [
      { key: 'severity', label: 'Severity', type: 'severity' },
      { key: 'type', label: 'Type', type: 'string' },
      { key: 'title', label: 'Title', type: 'string' },
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'repo_name', label: 'Repo', type: 'string' },
      { key: 'cve_id', label: 'CVE ID', type: 'string' },
      { key: 'package', label: 'Package', type: 'string' },
      { key: 'blast_radius', label: 'Blast Radius', type: 'number' },
      { key: 'autofix_eligible', label: 'AutoFix', type: 'boolean' },
      { key: 'published_at', label: 'Published', type: 'date' },
    ],
  },
  {
    id: 'pulse',
    name: 'Pulse Feed',
    nameKey: 'reports.ds.pulse',
    category: 'security',
    fetcher: (orgId) => getOrgPulse(orgId, '', 100),
    rowsPath: 'items',
    joinableOn: ['repo_id'],
    fields: [
      { key: 'severity', label: 'Severity', type: 'severity' },
      { key: 'source', label: 'Source', type: 'string' },
      { key: 'title', label: 'Title', type: 'string' },
      { key: 'blast_radius', label: 'Blast Radius', type: 'number' },
      { key: 'category', label: 'Category', type: 'string' },
      { key: 'autofix_eligible', label: 'AutoFix', type: 'boolean' },
      { key: 'created_at', label: 'Created', type: 'date' },
    ],
  },
]
