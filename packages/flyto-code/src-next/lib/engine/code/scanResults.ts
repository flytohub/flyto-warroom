/**
 * scanResults + verifyHistory — coverage for two engine endpoints not
 * previously surfaced by the domain client barrel:
 *
 *   GET /api/v1/code/scans/{id}/results       → handleListScanResults
 *   GET /api/v1/code/repos/{repoId}/verify-history → handleListVerifyHistory
 *
 * Imported by DIRECT FILE PATH from the code-repos manager/engineer
 * views per the parallel-safety decoupling rule (do NOT route through
 * @lib/engine or edit lib/engine/index.ts).
 */

import { request } from '../client'

// ── Per-scan results ──────────────────────────────────────────────
//
// Mirrors store.CodeScanResult (internal/store/models.go). `data` is
// raw jsonb text — the per-category detail blob. Severity follows the
// canonical critical|high|medium|low|info vocabulary; map to the
// Severity token union at the call-site.

export interface CodeScanResult {
  id: string
  scanId: string
  repoId: string
  /** architecture | security | testing | cicd | ... */
  category: string
  severity: string
  score?: number | null
  summary: string
  /** Raw jsonb text — category-specific detail payload. */
  data: string
  createdAt: string
}

export interface ScanResultsResponse {
  results: CodeScanResult[]
  count: number
}

export function listScanResults(scanId: string) {
  return request<ScanResultsResponse>(
    'GET',
    `/api/v1/code/scans/${scanId}/results`,
  )
}

// ── Closed-loop verify history (Before/After) ─────────────────────
//
// handleListVerifyHistory REQUIRES both cve + package query params
// (400 otherwise). Returns chronological verdict events for a single
// (repo, CVE, package) triple so the UI can draw a Before/After
// reachability timeline. Mirrors store.VerifyResultHistoryRow.

export interface VerifyHistoryEvent {
  id: string
  repoId: string
  cveId: string
  packageName: string
  /** exploitable | suspected_exploitable | sanitized | likely_sanitized
   *  | unreachable | reachable | inconclusive */
  verdict: string
  /** 0..1 confidence in the verdict. */
  confidence: number
  /** How the verdict was produced (static reachability, dynamic probe…). */
  method: string
  /** Free-form evidence blob (text). */
  evidence: string
  executionId?: string
  actor?: string
  recordedAt: string
}

export interface VerifyHistoryResponse {
  repo_id: string
  cve_id: string
  package_name: string
  events: VerifyHistoryEvent[]
  count: number
}

export function listVerifyHistory(
  repoId: string,
  cve: string,
  pkg: string,
  limit = 100,
) {
  const qs = new URLSearchParams({
    cve,
    package: pkg,
    limit: String(limit),
  }).toString()
  return request<VerifyHistoryResponse>(
    'GET',
    `/api/v1/code/repos/${repoId}/verify-history?${qs}`,
  )
}
