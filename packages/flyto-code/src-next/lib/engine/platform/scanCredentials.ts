import { request } from '../client'

// scanCredentials.ts — encrypted-at-rest credentials for
// authenticated DAST scanning. The plaintext flows through the
// POST body, gets sealed server-side via secrets.Store, and is
// NEVER returned on subsequent GETs. The DAST worker is the
// ONLY component that decrypts.
//
// UI rule: when displaying credential rows, NEVER attempt to
// echo or persist the plaintext anywhere — even in dev. The
// metadata (kind / label / expires_at) is what operators see.

export type CredentialKind = 'cookie' | 'bearer' | 'oauth_flow'

export interface ScanCredential {
  id: string
  org_id: string
  asset_id: string
  scan_type: string
  credential_kind: CredentialKind
  label?: string
  expires_at?: string | null
  key_id?: string
  created_by?: string
  created_at: string
  updated_at: string
  // Note: SealedDEK / Nonce / Payload deliberately omitted —
  // backend strips them before serialising.
}

export interface UpsertScanCredentialReq {
  asset_id: string
  scan_type?: 'authenticated_dast'
  credential_kind: CredentialKind
  plaintext: string
  label?: string
  expires_in_hours?: number
}

export interface ListScanCredentialsResponse {
  org_id: string
  count: number
  items: ScanCredential[]
}

export function listScanCredentials(orgId: string): Promise<ListScanCredentialsResponse> {
  return request('GET', `/api/v1/code/orgs/${orgId}/scan-credentials`)
}

// upsertScanCredential POSTs plaintext to the engine, which
// seals + persists. Backend returns metadata only (NO plaintext
// or envelope in the response). UI must NEVER attempt to
// re-display the plaintext after submission.
export function upsertScanCredential(orgId: string, req: UpsertScanCredentialReq): Promise<ScanCredential> {
  return request('POST', `/api/v1/code/orgs/${orgId}/scan-credentials`, req)
}

export function deleteScanCredential(orgId: string, assetId: string, scanType: string = 'authenticated_dast'): Promise<{ asset_id: string; scan_type: string; status: string }> {
  return request('DELETE', `/api/v1/code/orgs/${orgId}/scan-credentials`, {
    asset_id: assetId,
    scan_type: scanType,
  })
}
