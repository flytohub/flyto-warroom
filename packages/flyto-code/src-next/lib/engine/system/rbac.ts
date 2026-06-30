import { request } from '../client'

// rbac.ts — RBAC role + capability + user-role admin.
// Backend: api/handlers_rbac.go (requirePlatformAdmin, system:rbac:read/write).
//
//   GET    /api/v1/system/rbac/roles                                  — list roles
//   POST   /api/v1/system/rbac/roles                                  — create role
//   PATCH  /api/v1/system/rbac/roles/{id}                             — update role
//   POST   /api/v1/system/rbac/roles/{id}/capabilities               — add capability
//   DELETE /api/v1/system/rbac/roles/{id}/capabilities/{capability}  — remove capability
//   POST   /api/v1/system/rbac/orgs/{orgID}/users/{userID}/roles      — assign role
//   DELETE /api/v1/system/rbac/orgs/{orgID}/users/{userID}/roles/{roleID} — revoke role

export interface RBACRole {
  id: string
  org_id?: string
  name: string
  description?: string
  is_system: boolean
  capabilities: string[]
  created_at?: string
  updated_at?: string
}

export interface ListRBACRolesResponse {
  count: number
  roles: RBACRole[]
  note?: string
}

export interface RBACUserCapabilities {
  org_id: string
  user_id: string
  is_platform_admin: boolean
  role_ids: string[]
  capabilities: string[]
  count: number
}

export function listRBACRoles(): Promise<ListRBACRolesResponse> {
  return request('GET', '/api/v1/system/rbac/roles')
}

export function createRBACRole(req: {
  name: string
  org_id?: string
  description?: string
  capabilities?: string[]
}): Promise<{ ok: boolean; role: RBACRole }> {
  return request('POST', '/api/v1/system/rbac/roles', req)
}

export function updateRBACRole(id: string, req: { name: string; description?: string }): Promise<{ ok: boolean; role: RBACRole }> {
  return request('PATCH', `/api/v1/system/rbac/roles/${encodeURIComponent(id)}`, req)
}

export function addRBACRoleCapability(id: string, capability: string): Promise<{ ok: boolean; role: RBACRole }> {
  return request('POST', `/api/v1/system/rbac/roles/${encodeURIComponent(id)}/capabilities`, { capability })
}

export function removeRBACRoleCapability(id: string, capability: string): Promise<{ ok: boolean; role: RBACRole }> {
  return request('DELETE', `/api/v1/system/rbac/roles/${encodeURIComponent(id)}/capabilities/${encodeURIComponent(capability)}`)
}

export function assignRBACUserRole(orgId: string, userId: string, roleId: string): Promise<{ ok: boolean; org_id: string; user_id: string; role_id: string }> {
  return request('POST', `/api/v1/system/rbac/orgs/${encodeURIComponent(orgId)}/users/${encodeURIComponent(userId)}/roles`, { role_id: roleId })
}

export function revokeRBACUserRole(orgId: string, userId: string, roleId: string): Promise<{ ok: boolean; org_id: string; user_id: string; role_id: string }> {
  return request('DELETE', `/api/v1/system/rbac/orgs/${encodeURIComponent(orgId)}/users/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}`)
}

export function getRBACUserCapabilities(orgId: string, userId: string): Promise<RBACUserCapabilities> {
  return request(
    'GET',
    `/api/v1/system/rbac/orgs/${encodeURIComponent(orgId)}/users/${encodeURIComponent(userId)}/capabilities`,
  )
}
