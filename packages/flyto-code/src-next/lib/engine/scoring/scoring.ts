/**
 * Unified scoring persistence — submit computed scores + fetch history.
 */

import { request } from '../client'
import type { ReportSourceMeta } from '../reports/report-sources'

// (BenchmarkResponse / getOrgBenchmark already defined further
//  down at line ~210 — original `BenchmarkData` type. PostureOverview
//  uses it via `getOrgBenchmark`. Don't re-define here.)

export interface LeakBreach {
  Name: string
  Title: string
  Domain: string
  BreachDate: string
  PwnCount: number
  Description: string
  DataClasses: string[]
  IsSensitive: boolean
}
export interface DomainLeakExposure {
  domain: string
  breach_count: number
  total_pwned: number
  worst_breach?: LeakBreach
  sensitive_hit: boolean
  last_breach_at?: string
  fetched_at: string
  status?: 'checked' | 'not_assessed'
  error_code?: 'rate_limited' | 'provider_error' | string
  error?: string
}
export interface LeakExposureResponse {
  org_id: string
  domain_count: number
  checked_count?: number
  failed_count?: number
  hit_count: number
  total_pwned: number
  status?: 'checked' | 'partial' | 'not_assessed'
  message?: string
  domains: DomainLeakExposure[]
  generated_at: string
}
export function getLeakExposure(orgId: string): Promise<LeakExposureResponse> {
  return request('GET', `/api/v1/code/orgs/${orgId}/leak-exposure`)
}

// ── Posture snapshots (90-day trend) ──
//
// Each row is one pre-aggregated snapshot written by the worker's
// unified-score loop. Reading the last 90 powers the trend chart on
// the Posture Overview hub.

export interface PostureSnapshot {
  id: string
  org_id: string
  snapshot_date: string
  overall_display: number
  overall_grade: string
  mode: string
  asset_count: number
  subdomain_count: number
  ip_count: number
  crown_jewel_count: number
  finding_count_total: number
  finding_count_by_severity: string  // JSON-stringified object
  finding_count_by_category: string  // JSON-stringified object
  kev_count: number
  mttr_hours: number
}

export interface PostureSnapshotsResponse {
  org_id: string
  days: number
  snapshots: PostureSnapshot[] | null
  count: number
}

export function getPostureSnapshots(orgId: string, days = 90): Promise<PostureSnapshotsResponse> {
  return request('GET', `/api/v1/code/orgs/${orgId}/posture-snapshots?days=${days}`)
}

// ── Discovery runs (CT log / Shodan observability) ──
//
// One row per (org, root_domain, source) sweep. Powers the
// "last sweep ran at 03:14, 47 found, 3 new" panel — the operator's
// proof that proactive collection is happening.

export interface DiscoveryRun {
  id: string
  org_id: string
  root_domain: string
  source: string
  started_at: string
  finished_at: string | null
  status: 'running' | 'ok' | 'error' | 'rate_limited'
  discovered_count: number
  new_count: number
  error: string
}

export interface DiscoveryRunsResponse {
  org_id: string
  limit: number
  runs: DiscoveryRun[] | null
  count: number
}

export function getDiscoveryRuns(orgId: string, limit = 20): Promise<DiscoveryRunsResponse> {
  return request('GET', `/api/v1/code/orgs/${orgId}/discovery-runs?limit=${limit}`)
}

// ── Verifier source health ──
//
// Per-source (PASS / FAIL / INCONCLUSIVE) tally over the last N
// hours of raw_observations. UI uses this to badge "verifier
// healthy" vs "1+ sources degraded" so the operator catches a
// dead source (crt.sh rate-limited, DoH endpoint blocked) before
// scoring silently degrades.

export interface SourceHealthRow {
  source: string
  verdict: string
  count: number
}

export interface SourceHealthResponse {
  org_id: string
  hours: number
  sources: SourceHealthRow[] | null
  count: number
}

export function getVerifierSourceHealth(orgId: string, hours = 24): Promise<SourceHealthResponse> {
  return request('GET', `/api/v1/code/orgs/${orgId}/verifier-source-health?hours=${hours}`)
}

// ── Types ──

export interface UnifiedScoreSubmission {
  overall_raw: number
  overall_display: number
  overall_grade: string
  categories: string   // JSON-stringified category array
  cross_dim: string    // JSON-stringified CrossDimDetail
  active_sub_vectors: number
  total_sub_vectors: number
}

export interface UnifiedScoreEntry {
  id: string
  orgId: string
  overallRaw: number
  overallDisplay: number
  overallGrade: string
  categories: string
  crossDim: string
  activeSubVectors: number
  totalSubVectors: number
  computedAt: string
  authority?: ScoreAuthority
}

export type ScoreAuthorityLevel = 'verified' | 'imported_verified' | 'local' | 'unavailable'
export type ScoreAuthorityMode =
  | 'flyto2_cloud'
  | 'enterprise_online'
  | 'enterprise_airgap'
  | 'ce_local'
  | 'local_compute'
export type ScoreAuthoritySignatureStatus = 'valid' | 'missing' | 'invalid' | 'expired' | 'not_required'

export interface ScoreAuthority {
  level: ScoreAuthorityLevel
  mode: ScoreAuthorityMode
  label_key: string
  algorithm_version: string
  model_version: string
  display_scale_id: string
  source_manifest_version: string
  calibration_version: string
  evidence_completeness: number
  signature_status: ScoreAuthoritySignatureStatus
  comparable: boolean
  caveats?: string[]
  scope?: string
  observation_window?: {
    start?: string
    end?: string
  }
}

// ── API functions ──

export async function submitUnifiedScore(orgId: string, score: UnifiedScoreSubmission): Promise<void> {
  await request<void>('POST', `/api/v1/code/orgs/${orgId}/unified-score`, score)
}

export async function getUnifiedScoreHistory(orgId: string, days = 90): Promise<{ entries: UnifiedScoreEntry[]; count: number }> {
  return request<{ entries: UnifiedScoreEntry[]; count: number }>('GET', `/api/v1/code/orgs/${orgId}/unified-score-history?days=${days}`)
}

export async function getLatestUnifiedScore(orgId: string): Promise<UnifiedScoreEntry | null> {
  try {
    return await request<UnifiedScoreEntry>('GET', `/api/v1/code/orgs/${orgId}/unified-score`)
  } catch {
    return null
  }
}

// ── Computed score (server-side scoring engine) ──

export interface ComputedScoreResponse {
  // ── A3 envelope (P1-F PR4 trigger #4) ──
  // Discriminator the frontend reads to decide between "render score
  // gauge" and "render no-score empty state". When omitted, treat as
  // truthy (legacy rollout — older engine revisions didn't ship this
  // field). When explicitly `false`, the wire contract is
  // `overall_raw / overall_display / overall_grade === null`.
  score_available?: boolean
  /** Optional human-readable empty-state copy. Render verbatim — do
   *  NOT combine with i18n fallbacks. */
  message?: string | null
  /** Optional machine-readable empty-state reason
   *  (`bootstrap` / `insufficient_data` / `surface_disabled`). */
  no_score_reason?: string | null

  categories: ComputedCategoryServer[]
  overall_raw: number | null
  overall_display: number | null
  /** A3: was non-null. `null` when `score_available === false`. */
  overall_grade: string | null
  overall_grade_color: string
  active_count: number
  total_count: number
  cross_dim: {
    blast_radius_penalty: number
    pr_adjacency_penalty: number
    taint_adjacency_penalty: number
    pentest_verdict_modifier: number
    autofix_coverage_bonus: number
    total: number
  }
  mode: 'external' | 'internal' | 'combined'
  authority?: ScoreAuthority
  explanations?: ScoringExplanationServer[]
  repo_scores?: RepoScoreResultServer[]
}

export interface RepoScoreResultServer {
  repo_id: string
  name: string
  raw: number
  display: number
  grade: string
  scorable: boolean
}

export interface ComputedCategoryServer {
  id: string
  label: string
  weight: number
  effective_weight: number
  color: string
  sub_vectors: ComputedSubVectorServer[]
  raw: number | null
  display: number | null
  grade: string | null
  grade_color: string
}

export interface ComputedSubVectorServer {
  id: string
  label: string
  weight: number
  color: string
  mode: 'scored' | 'observing' | 'context'
  drill_down_type: 'repo' | 'domain'
  raw: number | null
  display: number | null
  grade: string | null
  grade_color: string
  repo_scores?: DrillScoreServer[]
  domain_scores?: DrillScoreServer[]
}

export interface DrillScoreServer {
  id: string
  name: string
  raw: number | null
  display: number | null
  grade: string | null
  grade_color: string
  label: string
}

export interface ScoringExplanationServer {
  finding_id: string
  sub_vector_id: string
  description: string
  base_penalty: number
  confidence_level: 'L0' | 'L1' | 'L2'
  multiplier: number
  effective_penalty: number
  reason: string
}

export async function getComputedScore(orgId: string): Promise<ComputedScoreResponse> {
  return request<ComputedScoreResponse>('GET', `/api/v1/code/orgs/${orgId}/computed-score`)
}

// ── Score Events (grade change timeline) ──

export interface ScoreEvent {
  date: string
  from_grade: string
  to_grade: string
  from_score: number
  to_score: number
  direction: 'upgrade' | 'downgrade' | 'stable'
  reasons: string[]
}

export async function getOrgScoreEvents(orgId: string, days = 90): Promise<{ events: ScoreEvent[] }> {
  return request<{ events: ScoreEvent[] }>('GET', `/api/v1/code/orgs/${orgId}/score-events?days=${days}`)
}

export async function getDomainScoreEvents(projectId: string, days = 90): Promise<{ events: ScoreEvent[] }> {
  return request<{ events: ScoreEvent[] }>('GET', `/api/v1/code/pentests/${projectId}/score-events?days=${days}`)
}

// ── Peer Benchmarking ──

export interface BenchmarkData {
  // ── A3 envelope (P1-F PR4 trigger #4) — emitted by
  //    api/handlers_benchmark.go. `score_available === false` ⇒
  //    org_score / org_grade null, percentile / benchmark /
  //    comparison / display_text omitted. ──
  score_available?: boolean
  message?: string | null
  /** A3: nullable when score_available=false. Was non-null in
   *  the pre-A3 wire — readers MUST gate on score_available. */
  org_score: number | null
  org_grade?: string | null
  sector: string
  /** Omitted on the no-score path. */
  percentile?: number
  /** Omitted on the no-score path. */
  benchmark?: {
    p25: number
    p50: number
    p75: number
    p90: number
    sample_size: number
  }
  /** Omitted on the no-score path. */
  comparison?: string
  /** Omitted on the no-score path. */
  display_text?: string
}

export async function getOrgBenchmark(orgId: string): Promise<BenchmarkData | null> {
  try {
    return await request<BenchmarkData>('GET', `/api/v1/code/orgs/${orgId}/benchmark`)
  } catch {
    return null
  }
}

// ── Report datasource definitions ──

export const SCORING_REPORT_SOURCES: ReportSourceMeta[] = [
  {
    id: 'score-history',
    name: 'Score History',
    nameKey: 'reports.ds.scoreHistory',
    category: 'health',
    fetcher: (orgId) => getUnifiedScoreHistory(orgId, 30),
    rowsPath: 'entries',
    fields: [
      { key: 'computed_at', label: 'Date', type: 'date' },
      { key: 'overall_display', label: 'Score', type: 'number' },
      { key: 'overall_grade', label: 'Grade', type: 'grade' },
    ],
  },
  {
    id: 'computed-score',
    name: 'Computed Score',
    nameKey: 'reports.ds.computedScore',
    category: 'health',
    // A3-F5 (Codex review of 59919eb, 2026-05-25). Pre-A3 this
    // datasource collapsed `c.raw ?? 0` / `c.display ?? 0` /
    // `r.overall_raw ?? 0` / `r.overall_display ?? 0` and shipped
    // the result into the report builder. When the engine returns
    // `score_available=false`, the PDF would have rendered:
    //   - every unscored category row as a real "0 / F" line item
    //   - the report header as "Overall: 0 / F"
    // Both indistinguishable from a genuine catastrophic score —
    // the same fake-zero pattern A3 was meant to eliminate, just
    // delivered via report instead of web UI.
    //
    // Fix: skip categories with null raw / display / grade (same
    // per-category gate ScoreDimensions3D uses), and pass overall
    // fields through as null when score_available=false OR
    // overall_raw is null. The report renderer handles null
    // numeric / grade cells as blanks — better than fabricating a
    // zero score in a printed deliverable.
    fetcher: (orgId) => getComputedScore(orgId).then(r => {
      const hasOverallScore =
        r.score_available !== false &&
        r.overall_raw != null &&
        r.overall_display != null
      return {
        categories: r.categories
          ?.filter((c): c is typeof c & { raw: number; display: number; grade: string } =>
            c.raw != null && c.display != null && c.grade != null && c.grade !== '',
          )
          .map(c => ({
            label: c.label,
            raw: Math.round(c.raw),
            display: Math.round(c.display),
            grade: c.grade,
            weight: Math.round(c.effective_weight * 100),
          })) ?? [],
        overall_raw: hasOverallScore ? Math.round(r.overall_raw!) : null,
        overall_display: hasOverallScore ? Math.round(r.overall_display!) : null,
        overall_grade: hasOverallScore ? r.overall_grade : null,
        mode: r.mode,
        active_vectors: r.categories?.length ?? 0,
        score_available: hasOverallScore,
        message: r.message ?? null,
      }
    }),
    rowsPath: 'categories',
    fields: [
      { key: 'label', label: 'Category', type: 'string' },
      { key: 'raw', label: 'Score', type: 'number' },
      { key: 'display', label: 'Display', type: 'number' },
      { key: 'grade', label: 'Grade', type: 'grade' },
      { key: 'weight', label: 'Weight %', type: 'number' },
    ],
  },
  {
    id: 'score-events',
    name: 'Score Events',
    nameKey: 'reports.ds.scoreEvents',
    category: 'health',
    fetcher: (orgId) => getOrgScoreEvents(orgId, 90),
    rowsPath: 'events',
    fields: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'from_grade', label: 'From Grade', type: 'grade' },
      { key: 'to_grade', label: 'To Grade', type: 'grade' },
      { key: 'from_score', label: 'From Score', type: 'number' },
      { key: 'to_score', label: 'To Score', type: 'number' },
      { key: 'direction', label: 'Direction', type: 'string' },
    ],
  },
]
