import { request } from '../client'

// scim.ts — SCIM provisioning admin (tokens + group→role mappings).
// Backend: api/handlers_scim_admin.go. Platform-admin gated
// (requirePlatformAdmin, system:scim:read/write). The plaintext token is
// returned ONCE on create — the UI must show it once and never persist it.
//
//   GET  /api/v1/system/scim/tokens?org_id=...        — list (metadata only)
//   POST /api/v1/system/scim/tokens                   — create (plaintext once)
//   POST /api/v1/system/scim/tokens/{id}/revoke       — soft-disable
//   GET  /api/v1/system/scim/group-mappings?org_id=...— list
//   POST /api/v1/system/scim/group-mappings           — upsert

export interface SCIMToken {
  id: string
  org_id: string
  token_prefix: string
  description?: string
  enabled: boolean
  created_at?: string
}

export interface ListSCIMTokensResponse {
  tokens: SCIMToken[]
}

export interface CreateSCIMTokenResponse {
  id: string
  token: string // plaintext — shown ONCE
  token_prefix: string
  org_id: string
  description?: string
  enabled: boolean
  created_at?: string
}

export function listSCIMTokens(orgId: string): Promise<ListSCIMTokensResponse> {
  return request('GET', `/api/v1/system/scim/tokens?org_id=${encodeURIComponent(orgId)}`)
}

export function createSCIMToken(req: { org_id: string; description?: string }): Promise<CreateSCIMTokenResponse> {
  return request('POST', '/api/v1/system/scim/tokens', req)
}

export function revokeSCIMToken(id: string): Promise<{ revoked: string }> {
  return request('POST', `/api/v1/system/scim/tokens/${encodeURIComponent(id)}/revoke`)
}

// SCIM can map a group to viewer/member/admin — NEVER owner or a platform role.
export type SCIMAssignableRole = 'viewer' | 'member' | 'admin'

export interface SCIMGroupMapping {
  org_id: string
  scim_group: string
  role: string
}

export interface ListSCIMGroupMappingsResponse {
  group_mappings: SCIMGroupMapping[]
}

export function listSCIMGroupMappings(orgId: string): Promise<ListSCIMGroupMappingsResponse> {
  return request('GET', `/api/v1/system/scim/group-mappings?org_id=${encodeURIComponent(orgId)}`)
}

export function upsertSCIMGroupMapping(req: { org_id: string; scim_group: string; role: SCIMAssignableRole }): Promise<SCIMGroupMapping> {
  return request('POST', '/api/v1/system/scim/group-mappings', req)
}
