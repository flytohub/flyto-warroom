import { request } from '../client'

// credentials.ts — platform credential inventory (metadata only).
// Backend: api/handlers_credential_inventory.go (GET /api/v1/system/credentials,
// requirePlatformAdmin, capability system:creds:read). The projection emits
// ONLY presence/health metadata — there is no secret field to leak.

export interface CredentialInventoryItem {
  id: string
  org_id?: string // empty => platform-level
  provider_id: string
  credential_kind: string
  secret_ref_type?: string
  secret_ref_id?: string
  key_prefix?: string
  status: string
  status_reason?: string
  expires_at?: string
  last_verified_at?: string
  last_used_at?: string
  updated_at?: string
}

export interface ListCredentialInventoryResponse {
  credentials: CredentialInventoryItem[]
  note?: string
}

export function listCredentialInventory(filter?: {
  provider?: string
  status?: string
  org?: string
}): Promise<ListCredentialInventoryResponse> {
  const qs = new URLSearchParams()
  if (filter?.provider) qs.set('provider', filter.provider)
  if (filter?.status) qs.set('status', filter.status)
  if (filter?.org) qs.set('org', filter.org)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return request('GET', `/api/v1/system/credentials${suffix}`)
}
