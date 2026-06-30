/**
 * lib/engine/assetEvidence.ts — bindings for the 3-tier observation
 * ledger (raw_observations → asset_states → asset_decisions) and the
 * compliance audit-export endpoint.
 *
 * Engine endpoints (added 2026-05-17):
 *   GET /code/orgs/{id}/asset-states
 *   GET /code/orgs/{id}/asset-evidence?asset_type=X&asset_key=Y
 *   GET /code/orgs/{id}/audit-export?asset_type=X
 *
 * Why this exists in the frontend (the feedback-certainty contract):
 *   The customer-facing attack_surface table is a derived view of
 *   asset_states. The engine writes EVERY observation to
 *   raw_observations + asset_states (incl. inconclusive + refuted
 *   ones the default attack_surface view filters out). The UI must
 *   be able to drill into "why does the engine believe / refute
 *   this finding" — otherwise the "100% certain" promise is
 *   unverifiable from the customer's seat.
 */

import { request } from '../client'

// Mirrors flyto-engine/internal/store models.go constants.
export const ASSET_STATUS_PENDING = 'pending'
export const ASSET_STATUS_CONFIRMED = 'confirmed'
export const ASSET_STATUS_INCONCLUSIVE = 'inconclusive'
export const ASSET_STATUS_REFUTED = 'refuted'

export type AssetStateStatus =
  | typeof ASSET_STATUS_PENDING
  | typeof ASSET_STATUS_CONFIRMED
  | typeof ASSET_STATUS_INCONCLUSIVE
  | typeof ASSET_STATUS_REFUTED

export interface AssetState {
  orgId: string
  projectId: string
  assetType: string
  assetKey: string
  status: AssetStateStatus
  confidence: number
  metadata: string
  sourcesAgree: number
  sourcesDisagree: number
  roundsPassed: number
  firstObservedAt: string
  lastObservedAt: string
  decidedAt?: string | null
}

export interface RawObservation {
  id: string
  orgId: string
  projectId: string
  assetType: string
  assetKey: string
  /** dns_google | dns_cloudflare | dns_sb | dns_local | crtsh | ... */
  source: string
  /** pass | fail | inconclusive */
  verdict: string
  confidence: number
  rawResponse: string
  observedAt: string
  prevHash: string
  entryHash: string
}

export interface AssetDecision {
  id: string
  orgId: string
  projectId: string
  assetType: string
  assetKey: string
  fromStatus: string
  toStatus: string
  /** initial_pending | consensus_confirm | contradicted_refute |
   *  insufficient_evidence | manual_override */
  decisionType: string
  reason: string
  /** JSON array of observation IDs cited as evidence. */
  citedObservations: string
  decidedAt: string
}

export interface ListAssetStatesResponse {
  org_id: string
  asset_type: string
  status_filter: string
  include_pending: boolean
  asset_states: AssetState[]
  count: number
}

export interface AssetEvidenceResponse {
  org_id: string
  asset_type: string
  asset_key: string
  /** null when the asset has never been observed (UI: "not scanned yet"). */
  state: AssetState | null
  /** Chronological oldest-first. */
  observations: RawObservation[]
  /** Newest-first. */
  decisions: AssetDecision[]
  chain_intact: boolean
  chain_count: number
  chain_error?: string
}

/**
 * List asset_states for one org, optionally narrowed by type / status.
 * Default response excludes 'pending' (transient, no UI value).
 */
export function listAssetStates(
  orgId: string,
  opts: { assetType?: string; status?: AssetStateStatus; includePending?: boolean } = {},
) {
  const qs = new URLSearchParams()
  if (opts.assetType) qs.set('asset_type', opts.assetType)
  if (opts.status) qs.set('status', opts.status)
  if (opts.includePending) qs.set('include_pending', '1')
  const q = qs.toString()
  return request<ListAssetStatesResponse>(
    'GET',
    `/api/v1/code/orgs/${orgId}/asset-states${q ? `?${q}` : ''}`,
  )
}

/**
 * Full evidence bundle for one (asset_type, asset_key). Returns
 * state=null when never observed — caller renders "not scanned yet"
 * instead of treating it as an error.
 */
export function getAssetEvidence(orgId: string, assetType: string, assetKey: string) {
  const qs = new URLSearchParams({ asset_type: assetType, asset_key: assetKey })
  return request<AssetEvidenceResponse>(
    'GET',
    `/api/v1/code/orgs/${orgId}/asset-evidence?${qs.toString()}`,
  )
}

/**
 * Compliance audit-export endpoint. Returns a JSON Blob the caller
 * triggers as a browser download. Backend stamps the response with
 * Content-Disposition: attachment; filename=flyto-audit-<org>-<type>.json,
 * but we still synthesize the filename client-side because the
 * fetch path doesn't expose response headers conveniently.
 *
 * Status filter mirrors the engine: empty = all assets,
 * 'refuted' = only ones the engine has rejected, etc.
 */
export async function downloadAuditExport(
  orgId: string,
  assetType: string,
  opts: { status?: AssetStateStatus } = {},
): Promise<{ filename: string; bytes: number; bundleHash: string }> {
  const qs = new URLSearchParams({ asset_type: assetType })
  if (opts.status) qs.set('status', opts.status)
  // The engine returns ~10MB JSON; fetch raw then trigger blob download.
  const data = await request<{
    export: unknown
    bundle_sha256: string
    hash_recipe: string
  }>(
    'GET',
    `/api/v1/code/orgs/${orgId}/audit-export?${qs.toString()}`,
  )

  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const filename = `flyto-audit-${orgId}-${assetType}-${new Date()
    .toISOString()
    .slice(0, 10)}.json`

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Defer revoke so the click handler can finish reading the URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000)

  return { filename, bytes: blob.size, bundleHash: data.bundle_sha256 }
}
