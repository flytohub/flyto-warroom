import { request } from '../client'
import type { ReportSourceMeta } from '../reports/report-sources'

export interface APIDefinition {
  method: string
  path: string
  file?: string
  repo_id: string
}

export interface APIDefinitionsResponse {
  apis: APIDefinition[]
  total: number
  /** Echo of the `?domain=` filter that produced this slice. Empty
   *  string = no filter (org-wide result). */
  domain?: string
}

/**
 * Fetch API definitions for the org.
 *
 * `domain` narrows to repos whose `homepage` resolves to that host,
 * which is the right surface for the Domain Detail page (don't spray
 * every repo's routes under every domain). `repoId` is the older
 * per-repo filter — orthogonal.
 */
export function getOrgAPIDefinitions(orgId: string, opts: { repoId?: string; domain?: string } = {}) {
  const qs = new URLSearchParams()
  if (opts.repoId) qs.set('repo_id', opts.repoId)
  if (opts.domain) qs.set('domain', opts.domain)
  const qstr = qs.toString()
  return request<APIDefinitionsResponse>(
    'GET',
    `/api/v1/code/orgs/${orgId}/api-definitions${qstr ? '?' + qstr : ''}`,
  )
}

/**
 * Per-repo arch summary returned by /orgs/{id}/arch-map.
 *
 * Field set mirrors flyto-indexer's profile output — every quality
 * dimension (complexity / dead code / taint / secrets) plus
 * architecture intelligence (frameworks / patterns / services / deps)
 * surfaces as a flat number / string array so the war-room dashboard
 * can render stat tiles without re-parsing nested JSON.
 */
export interface RepoArch {
  repo_id: string
  name: string
  project_type: string
  project_sub_type?: string
  license?: string
  file_count: number
  doc_score: number
  symbol_counts?: Record<string, number>  // { api, class, function, method }
  languages?: Record<string, number>       // language → loc

  complex_functions: number
  max_complexity: number
  avg_complexity: number
  dead_code_count: number
  duplicate_rate?: number     // 0–100 percentage of duplicated lines
  duplicate_count?: number    // number of duplicate blocks detected
  secret_count: number
  conflict_count: number
  taint_flow_count: number
  taint_sources?: number
  taint_sinks?: number
  taint_unsanitized?: number
  taint_sanitized?: number

  services: string[]
  frameworks?: string[]
  framework_details?: Array<{ name: string; type?: string; version?: string }>
  patterns?: string[]
  api_count: number
  model_count: number
  dependency_count: number
  import_count: number
  connection_count: number
  orphan_count: number

  flyto_depends?: string[]
}

/** Org-wide roll-up — drives headline tiles + grade distribution chart. */
export interface OrgArchAggregate {
  total_repos: number
  total_files: number
  total_dead_code: number
  total_complex_functions: number
  total_secrets: number
  total_taint_flows: number
  total_apis: number
  grade_distribution: Record<string, number>     // A/B/C/D/F → repo count
  language_distribution: Record<string, number>  // language → loc
  worst_repo?: string
  best_repo?: string
}

export interface OrgArchResponse {
  repos: RepoArch[]
  total: number
  aggregate: OrgArchAggregate
}

/** Org-wide architecture rollup: one row per connected repo + cross-repo aggregate. Powers the Architecture > Overview view. */
export function getOrgArchMap(orgId: string) {
  return request<OrgArchResponse>('GET', `/api/v1/code/orgs/${orgId}/arch-map`)
}

/** Per-repo deep dive — heavy fields the org list omits.
 *  Loaded lazily when the user clicks into a repo card. */
export interface RepoArchDetail {
  repo_id: string
  name: string
  dead_symbols?: Array<{ line: number; name: string; path: string; type: string }>
  top_imports?: Array<{ package: string; count: number; files?: string[] }>
  frameworks?: Array<{
    name?: string
    type?: string
    version?: string
    conventions?: string[]
    entry_points?: Array<{ file?: string; symbol?: string; line?: number }>
  }>
  taint_summary?: {
    total_sources?: number
    total_sinks?: number
    unsanitized_flows?: number
    sanitized_flows?: number
    high_risk_count?: number
    file_hits?: string[]
    categories?: string[]
  }
}

/** Per-repo deep arch fields (dead symbols, top imports, frameworks, taint). Lazy-loaded on repo card click — heavy. */
export function getRepoArchDetail(repoId: string) {
  return request<RepoArchDetail>('GET', `/api/v1/code/repos/${repoId}/arch`)
}

/** A single dead-code finding — one row in the org-wide report. */
export interface DeadSymbol {
  repo_id: string
  repo_name: string
  path: string
  name: string
  line: number
  type: string  // 'class' | 'function' | 'method' | 'variable'
}

export function getOrgDeadCode(orgId: string) {
  return request<{ symbols: DeadSymbol[]; total: number }>(
    'GET',
    `/api/v1/code/orgs/${orgId}/dead-code`,
  )
}

/** A package's cross-repo usage profile. */
export interface DepPackage {
  name: string
  shared_count: number  // # repos that import it
  total_uses: number    // total usage across all repos
  by_repo: Array<{
    repo_id: string
    repo_name: string
    count: number
    files_count: number
  }>
}

export interface OrgDependencies {
  packages: DepPackage[]
  total: number
  aggregate: {
    total_packages: number
    shared_packages: number
    single_use_packages: number
    highest_concentration: { repo: string; package: string; count: number }
  }
}

export function getOrgDependencies(orgId: string) {
  return request<OrgDependencies>('GET', `/api/v1/code/orgs/${orgId}/dependencies`)
}

/** DepPackage with cross-dim context from correlate.EnrichByPackage. */
export type EnrichedDepPackage = DepPackage & {
  open_prs_touching?: import('./issues').PRRef[]
  taint_adjacency?: import('./issues').TaintRef | null
  autofix_eligible?: boolean
  pentest_verdict?: import('./issues').PentestRef | null
  blast_radius?: number
}

export interface EnrichedOrgDependencies extends Omit<OrgDependencies, 'packages'> {
  packages: EnrichedDepPackage[]
}

/** Same path with cross-dim context attached to each package row. */
export function getEnrichedDependencies(orgId: string) {
  return request<EnrichedOrgDependencies>(
    'GET',
    `/api/v1/code/orgs/${orgId}/dependencies?enrich=true`,
  )
}

/** A single source→sink taint flow surfaced by the indexer. */
export interface TaintFlowRow {
  repo_id: string
  repo_name: string
  source: string
  source_file?: string
  source_line?: number
  sink: string
  sink_file?: string
  sink_line?: number
  path?: string[]
  severity?: string
  category?: string
  recommendation?: string
}

export interface OrgTaintFlowsResponse {
  flows: TaintFlowRow[]
  total: number
}

export function getOrgTaintFlows(orgId: string) {
  return request<OrgTaintFlowsResponse>('GET', `/api/v1/code/orgs/${orgId}/taint-flows`)
}

/** Diff between every repo's two most recent completed scans. */
export interface NewCVEDigest {
  repo_id: string
  repo_name: string
  cve_id: string
  package: string
  version: string
  fixed_in?: string
  severity: string
  summary?: string
}

export interface ScanDiffResponse {
  compared_at: string
  since?: string
  new_cves_count: number
  resolved_cves_count: number
  secrets_delta: number
  dead_code_delta: number
  complex_fns_delta: number
  taint_flows_delta: number
  new_cves_top: NewCVEDigest[]
  repos_compared: number
  repos_no_history: number
  repos_with_changes: number
}

export function getOrgScanDiff(orgId: string) {
  return request<ScanDiffResponse>('GET', `/api/v1/code/orgs/${orgId}/scan-diff`)
}

// ── Report datasource definitions ──

export const ARCH_REPORT_SOURCES: ReportSourceMeta[] = [
  {
    id: 'arch-map',
    name: 'Architecture',
    nameKey: 'reports.ds.archMap',
    category: 'architecture',
    fetcher: (orgId) => getOrgArchMap(orgId),
    rowsPath: 'repos',
    joinableOn: ['repo_id'],
    fields: [
      { key: 'repo_id', label: 'Repo ID', type: 'string' },
      { key: 'name', label: 'Name', type: 'string' },
      { key: 'project_type', label: 'Type', type: 'string' },
      { key: 'grade', label: 'Grade', type: 'grade' },
      { key: 'raw', label: 'Score', type: 'number' },
      { key: 'file_count', label: 'Files', type: 'number', aggregate: 'sum' },
      { key: 'dead_code_count', label: 'Dead Code', type: 'number', aggregate: 'sum' },
      { key: 'complex_functions', label: 'Complex Fns', type: 'number', aggregate: 'sum' },
      { key: 'secret_count', label: 'Secrets', type: 'number', aggregate: 'sum' },
      { key: 'taint_flow_count', label: 'Taint Flows', type: 'number', aggregate: 'sum' },
      { key: 'api_count', label: 'APIs', type: 'number', aggregate: 'sum' },
      { key: 'dependency_count', label: 'Dependencies', type: 'number', aggregate: 'sum' },
    ],
  },
  {
    id: 'dependencies',
    name: 'Dependencies',
    nameKey: 'reports.ds.dependencies',
    category: 'architecture',
    fetcher: (orgId) => getOrgDependencies(orgId),
    rowsPath: 'packages',
    fields: [
      { key: 'name', label: 'Package', type: 'string' },
      { key: 'shared_count', label: 'Shared By', type: 'number' },
      { key: 'total_uses', label: 'Total Uses', type: 'number' },
    ],
  },
  {
    id: 'enriched-deps',
    name: 'Enriched Dependencies',
    nameKey: 'reports.ds.enrichedDeps',
    category: 'security',
    fetcher: (orgId) => getEnrichedDependencies(orgId),
    rowsPath: 'packages',
    fields: [
      { key: 'name', label: 'Package', type: 'string' },
      { key: 'shared_count', label: 'Shared By', type: 'number' },
      { key: 'blast_radius', label: 'Blast Radius', type: 'number' },
      { key: 'autofix_eligible', label: 'AutoFix', type: 'boolean' },
    ],
  },
  {
    id: 'taint-flows',
    name: 'Taint Flows',
    nameKey: 'reports.ds.taintFlows',
    category: 'security',
    fetcher: (orgId) => getOrgTaintFlows(orgId),
    rowsPath: 'flows',
    joinableOn: ['repo_id'],
    fields: [
      { key: 'repo_name', label: 'Repo', type: 'string' },
      { key: 'source', label: 'Source', type: 'string' },
      { key: 'sink', label: 'Sink', type: 'string' },
      { key: 'severity', label: 'Severity', type: 'severity' },
      { key: 'category', label: 'Category', type: 'string' },
      { key: 'source_file', label: 'Source File', type: 'string' },
      { key: 'sink_file', label: 'Sink File', type: 'string' },
    ],
  },
  {
    id: 'dead-code',
    name: 'Dead Code',
    nameKey: 'reports.ds.deadCode',
    category: 'architecture',
    fetcher: (orgId) => getOrgDeadCode(orgId),
    rowsPath: 'symbols',
    joinableOn: ['repo_id'],
    fields: [
      { key: 'repo_name', label: 'Repo', type: 'string' },
      { key: 'name', label: 'Symbol', type: 'string' },
      { key: 'type', label: 'Type', type: 'string' },
      { key: 'path', label: 'File', type: 'string' },
      { key: 'line', label: 'Line', type: 'number' },
    ],
  },
  {
    id: 'api-definitions',
    name: 'API Definitions',
    nameKey: 'reports.ds.apiDefinitions',
    category: 'architecture',
    fetcher: (orgId) => getOrgAPIDefinitions(orgId),
    rowsPath: 'apis',
    joinableOn: ['repo_id'],
    fields: [
      { key: 'method', label: 'Method', type: 'string' },
      { key: 'path', label: 'Path', type: 'string' },
      { key: 'file', label: 'File', type: 'string' },
      { key: 'repo_id', label: 'Repo ID', type: 'string' },
    ],
  },
  {
    id: 'scan-diff',
    name: 'Scan Delta',
    nameKey: 'reports.ds.scanDiff',
    category: 'health',
    fetcher: (orgId) => getOrgScanDiff(orgId),
    fields: [
      { key: 'new_cves_count', label: 'New CVEs', type: 'number' },
      { key: 'resolved_cves_count', label: 'Resolved CVEs', type: 'number' },
      { key: 'secrets_delta', label: 'Secrets Delta', type: 'number' },
      { key: 'dead_code_delta', label: 'Dead Code Delta', type: 'number' },
      { key: 'complex_fns_delta', label: 'Complexity Delta', type: 'number' },
      { key: 'taint_flows_delta', label: 'Taint Delta', type: 'number' },
      { key: 'repos_compared', label: 'Repos Compared', type: 'number' },
    ],
  },
]
