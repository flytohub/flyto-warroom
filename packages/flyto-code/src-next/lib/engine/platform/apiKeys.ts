import { request } from '../client'

export interface OrgAPIKey {
  id: string
  key_prefix: string
  name: string
  scopes: string
  created_by: string
  last_used_at?: string
  created_at: string
}

export interface CreateAPIKeyResponse {
  id: string
  key: string  // full key, shown ONCE
  key_prefix: string
  name: string
  scopes: string
  created_at: string
}

export function listAPIKeys(orgId: string) {
  return request<{ keys: OrgAPIKey[] }>('GET', `/api/v1/code/orgs/${orgId}/api-keys`)
}

export function createAPIKey(orgId: string, name: string, scopes = 'read,write') {
  return request<CreateAPIKeyResponse>('POST', `/api/v1/code/orgs/${orgId}/api-keys`, { name, scopes })
}

export function revokeAPIKey(orgId: string, keyId: string) {
  return request<{ revoked: string }>('DELETE', `/api/v1/code/orgs/${orgId}/api-keys/${keyId}`)
}
