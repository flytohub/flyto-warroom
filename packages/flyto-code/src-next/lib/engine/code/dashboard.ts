/**
 * dashboard.ts — composite dashboard endpoint client.
 *
 * Backend: `GET /api/v1/code/orgs/{id}/dashboard` returns the
 * pre-aggregated payload from the dashboard_cache table. One
 * round-trip replaces 3 parallel fetches (attackSurface,
 * pentests, computedScore). The other dashboard panels
 * (healthSummary, pulse, externalPosture, ctemPriorities,
 * peerBaseline, scoreEvents) still go through their individual
 * endpoints — pulling them into the cache requires extracting
 * per-handler composers first.
 */

import { request } from '../client'

export interface DashboardPayload {
  /** Raw arrays/objects — typed loosely because the cached row
   *  is a JSON blob; consumers can cast to their existing types. */
  attackSurface: unknown
  pentests: unknown
  computedScore: unknown
  /** Freshness meta. */
  computed_at: string
  source: 'worker' | 'inline-fallback' | string
  partial_errors?: string[]
  refresh_ms: number
}

export function getOrgDashboard(orgId: string): Promise<DashboardPayload> {
  return request<DashboardPayload>(
    'GET',
    `/api/v1/code/orgs/${orgId}/dashboard`,
  )
}
