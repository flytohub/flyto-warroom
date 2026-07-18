/**
 * Surface posture summaries — the container/cloud analogues of the
 * external-posture/kernel rollup. These are *read-only* aggregate
 * posture reads (coverage + grade rollup) that sit on top of the
 * per-finding lists already surfaced by the scan views.
 *
 * Backend:
 *   - `GET /api/v1/code/orgs/{id}/container-posture`
 *     handler `handleGetContainerPosture` (handlers_container_posture.go, Epic E1)
 *   - `GET /api/v1/code/orgs/{id}/cloud-posture`
 *     handler `handleGetCloudPosture` (handlers_cloud_posture.go, Epic E2)
 *
 * Both endpoints never 404: until the surface scoring write-path has
 * run for an org they return the asset inventory with
 * `score_available=false` and unscored rows (same "no data yet" shape
 * /external-posture uses). Callers should branch on `score_available`.
 *
 * Types mirror the Go response structs field-for-field (json tags).
 */
import { request } from '../client'
import type { CTEMPriorityItem, CTEMSortKey } from '../ctem/ctem'
import type { ScoreAuthority } from '../scoring/scoring'

// ── External-posture KPI summary (Wave 1, P1-7) ─────────────────────
//
// `GET /external-posture` now returns a server-computed `kpi_summary`
// block (strict superset — the old fields are unchanged). It moves the
// KEV / Crown-Jewel / Threat-Actor / Phishing / Stealer / Cert / SaaS
// tallies off the client: a 1k-domain org no longer downloads every
// attack_surface row just to count seven numbers (the O(n) client tally
// PostureOverview used to run).
//
// HONESTY CONTRACT: under a specific `?business_unit_id` some counts are
// intentionally 0 because the underlying signal is not BU-attributable.
// Render the 0 verbatim — never backfill from the client-side asset list.
// `business_unit_id` echoes the scope the server applied ("" = whole-org).
export interface KpiSummary {
  kev_count: number
  crown_jewel_count: number
  threat_actor_count: number
  phishing_count: number
  stealer_count: number
  certs_count: number
  saas_count: number
  business_unit_id: string
}

/**
 * Narrow read-model over the `/external-posture` response's new
 * `kpi_summary` field. The canonical `ExternalPosture` type lives in
 * `@compounds/_shared/externalPosture`; this interface lets posture
 * consumers pick `kpi_summary` off that payload without widening the
 * shared type (and without an `any` cast). Optional because older
 * engine revisions (rollout window) omit it — callers MUST guard.
 */
export interface ExternalPostureWithKpi {
  kpi_summary?: KpiSummary
}

// ── CTEM priorities — server pagination (Wave 1, P1-10) ─────────────
//
// `GET /ctem/priorities` now accepts `?limit` / `?offset` / `?sort` and
// returns `total` / `has_more` and a `stale` / `stale_reason` pair.
// `limit=-1` is uncapped. The legacy client (`ctem/ctem.ts`
// `getCTEMPriorities`) downloads the whole list and the view pages it
// client-side — fine at 30 rows, a problem at the 15k ceiling.
//
// CRITICAL honesty rule: when `stale === true` a contributing data feed
// failed for this request, so an empty / short queue must NOT be read as
// "all clear". The view renders a non-blocking banner off this flag.
export interface CtemPrioritiesPage {
  org_id: string
  /** Rows in THIS page (already prioritised + optionally deduped). */
  items: CTEMPriorityItem[]
  /** Page-local count (== items.length). Mirrors the legacy `count`. */
  count: number
  /** True total across all pages, server-computed. Drives "of N". */
  total: number
  /** Echo of the applied window. limit=-1 ⇒ uncapped. */
  limit: number
  offset: number
  /** More rows exist beyond offset+limit. */
  has_more: boolean
  /**
   * A contributing feed produced no rows because it FAILED (not because
   * it was empty). When true the queue may be incomplete — the UI shows
   * a non-blocking warning so a short list is never mistaken for safety.
   */
  stale: boolean
  /** Human-readable reason for `stale` (e.g. which feed failed). "" when not stale. */
  stale_reason: string
  /** Echo of the canonical sort key the server applied. */
  sort?: CTEMSortKey
  /** Echo of whether `?dedup=true` was honoured. */
  deduped: boolean
}

export interface GetCtemPrioritiesPageOptions {
  /** Per-team scope filter — empty / undefined = all BUs. */
  businessUnitId?: string
  sort?: CTEMSortKey
  dedup?: boolean
  /** Window size. -1 = uncapped. Defaults to the server default when omitted. */
  limit?: number
  offset?: number
}

/**
 * Server-paginated read of `/ctem/priorities`. Same endpoint as the
 * legacy `getCTEMPriorities`, but threads `?limit/?offset` and surfaces
 * the `total` / `has_more` / `stale` envelope the legacy client drops.
 */
export function getCtemPrioritiesPage(
  orgId: string,
  opts: GetCtemPrioritiesPageOptions = {},
): Promise<CtemPrioritiesPage> {
  const params = new URLSearchParams()
  if (opts.businessUnitId) params.set('business_unit_id', opts.businessUnitId)
  if (opts.sort) params.set('sort', opts.sort)
  if (opts.dedup) params.set('dedup', 'true')
  if (opts.limit != null) params.set('limit', String(opts.limit))
  if (opts.offset != null) params.set('offset', String(opts.offset))
  const qs = params.toString()
  return request<CtemPrioritiesPage>(
    'GET',
    `/api/v1/code/orgs/${orgId}/ctem/priorities${qs ? `?${qs}` : ''}`,
  )
}

// ── Container posture (Epic E1) ─────────────────────────────────────

/** One container image with its (optional) container-surface score. */
export interface ContainerPostureAsset {
  resource_id: string
  digest: string
  os_family?: string
  os_version?: string
  scored: boolean
  /** Raw score (0–100). Present only when `scored`. */
  score?: number
  /** Display-normalised score (0–100). Present only when `scored`. */
  display_score?: number
  /** Letter grade (bad|warn|fair|neutral|good). Present only when `scored`. */
  grade?: string
  /** True when the image is observed in a runtime workload snapshot. */
  running: boolean
  /** True when a workload running this image is externally exposed. */
  exposed: boolean
}

/** GET /container-posture response. Mirrors `api.ContainerPosture`. */
export interface ContainerPosture {
  org_id: string
  image_count: number
  scored_count: number
  /** Org-wide rollup availability. When false, only the inventory is real. */
  score_available: boolean
  avg_score?: number
  avg_display?: number
  avg_grade?: string
  authority?: ScoreAuthority
  /** Set when `score_available` is false (e.g. "no container scoring data yet"). */
  message?: string
  images: ContainerPostureAsset[]
  generated_at: string
}

export function getContainerPosture(orgId: string) {
  return request<ContainerPosture>(
    'GET',
    `/api/v1/code/orgs/${orgId}/container-posture`,
  )
}

// ── Cloud posture (Epic E2) ─────────────────────────────────────────

export interface CloudPostureResource {
  resource_id: string
  canonical_id: string
  resource_type?: string
  account_id?: string
  provider?: string
  scored: boolean
  score?: number
  grade?: string
}

export interface CloudPostureAccount {
  account_id: string
  account_locator?: string
  provider?: string
  display_name?: string
  resource_count: number
  scored_count: number
  /** Mean of scored resources in the account. Present only when scored_count > 0. */
  avg_score?: number
}

/** GET /cloud-posture response. Mirrors `api.CloudPosture`. */
export interface CloudPosture {
  org_id: string
  resource_count: number
  scored_count: number
  score_available: boolean
  avg_score?: number
  avg_display?: number
  avg_grade?: string
  authority?: ScoreAuthority
  message?: string
  accounts: CloudPostureAccount[]
  resources: CloudPostureResource[]
  /** Opaque cursor for the next resource page; pass as `after`. */
  next_cursor?: string
  generated_at: string
}

export function getCloudPosture(orgId: string, opts: { limit?: number; after?: string } = {}) {
  const params = new URLSearchParams()
  if (opts.limit != null) params.set('limit', String(opts.limit))
  if (opts.after) params.set('after', opts.after)
  const qs = params.toString()
  return request<CloudPosture>(
    'GET',
    `/api/v1/code/orgs/${orgId}/cloud-posture${qs ? `?${qs}` : ''}`,
  )
}
