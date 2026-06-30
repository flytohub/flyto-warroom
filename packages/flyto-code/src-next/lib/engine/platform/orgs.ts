import { request } from '../client'

export interface Organization {
  id: string
  name: string
  slug: string
  logoUrl?: string
  description: string
  createdAt: string
  repoCount?: number
  memberCount?: number
  /** Caller's role inside this org. Engine bundles this with the
   *  org list so admin-only surfaces (e.g. Tier 3 Promotion review)
   *  can gate themselves without an extra round trip. */
  role?: 'owner' | 'admin' | 'member' | 'guest'
  isAdmin?: boolean
  /** Picked at org creation; restricts which capability pages render
   *  inside the project. Default "all". See ProjectType for values. */
  projectType?: ProjectType
}

export interface OrgListResponse {
  organizations: Organization[]
  count: number
}

export function listOrgs() {
  return request<OrgListResponse>('GET', '/api/v1/code/orgs')
}

/** Restricts which capability pages are visible inside the project,
 *  on top of the org's plan-level entitlement. "all" shows everything
 *  the plan allows; "code" / "ctem" pick a single product line;
 *  "custom" honours the customFeatures list. */
export type ProjectType = 'all' | 'code' | 'ctem' | 'cloud' | 'custom'

/** Per-module data source: Flyto's own engine, or a bring-your-own
 *  external provider. `provider` is set only when source === 'byo'. */
export interface ModuleSourceSelection {
  module: string
  source: 'flyto' | 'byo'
  provider?: string
}

export interface CreateOrgOptions {
  projectType?: ProjectType
  customFeatures?: string[]
  /** Per-module source choice (Flyto vs BYO). Backend stores it as
   *  project config; BYO credential/ingestion wiring is a later phase. */
  moduleSources?: ModuleSourceSelection[]
}

export function createOrg(name: string, slug: string, opts: CreateOrgOptions = {}) {
  const body: Record<string, unknown> = { name, slug }
  if (opts.projectType && opts.projectType !== 'all') {
    body.project_type = opts.projectType
  }
  if (opts.projectType === 'custom' && opts.customFeatures?.length) {
    body.custom_features = opts.customFeatures
  }
  // Send every selected module source, including all-Flyto selections, so the
  // engine can persist an explicit capability/module policy instead of inferring
  // it from project_type.
  if (opts.moduleSources?.length) {
    body.module_sources = opts.moduleSources
  }
  return request<Organization>('POST', '/api/v1/code/orgs', body)
}

export function updateOrg(id: string, updates: Partial<Pick<Organization, 'name' | 'slug'>>) {
  return request<Organization>('PATCH', `/api/v1/code/orgs/${id}`, updates)
}

export function deleteOrg(id: string) {
  return request<{ ok: boolean }>('DELETE', `/api/v1/code/orgs/${id}`)
}

// ── Invitations ──

// Matches the engine's store.OrgInvitation JSON tags, which are camelCase
// (the engine ships camelCase and this client does not transform casing).
export interface OrgInvitation {
  id: string
  orgId: string
  email: string
  role: string
  invitedBy: string
  createdAt: string
  expiresAt: string
  acceptedAt?: string
}

export function listInvitations(orgId: string) {
  return request<{ invitations: OrgInvitation[] }>('GET', `/api/v1/code/orgs/${orgId}/invitations`)
}

export function createInvitation(orgId: string, email: string, role = 'member') {
  return request<OrgInvitation>('POST', `/api/v1/code/orgs/${orgId}/invitations`, { email, role })
}

export function deleteInvitation(orgId: string, invitationId: string) {
  return request<{ ok: boolean }>('DELETE', `/api/v1/code/orgs/${orgId}/invitations/${invitationId}`)
}

// ── Native org members (Warroom roles) ───────────────────────────────
// The engine's own membership table (org_members), joined with users for
// identity. Source of truth for owner→admin→member→viewer→guest roles —
// distinct from the GitHub/GitLab provider member proxy.

export interface OrgMemberProfile {
  id: string
  orgId: string
  userId: string
  role: string
  invitedBy?: string | null
  joinedAt: string
  email: string
  displayName: string
  photoUrl: string
}

export function listOrgMembers(orgId: string) {
  return request<{ members: OrgMemberProfile[]; count: number }>('GET', `/api/v1/code/orgs/${orgId}/members`)
}

/** Change a member's org role. admin/member/viewer/guest only — ownership
 *  transfer is a separate flow (engine rejects owner here). */
export function updateOrgMemberRole(orgId: string, userId: string, role: string) {
  return request<{ status: string; role: string }>('PATCH', `/api/v1/code/orgs/${orgId}/members/${userId}`, { role })
}

export function removeOrgMember(orgId: string, userId: string) {
  return request<{ status: string }>('DELETE', `/api/v1/code/orgs/${orgId}/members/${userId}`)
}

// ── Org Chart ──

export interface OrgChartNode {
  id: string
  parentId: string | null
  type: string
  label: string
  color: string
  icon: string
  x: number
  y: number
  repoId?: string
}

export function getOrgChart(orgId: string) {
  return request<{ nodes: OrgChartNode[]; count: number }>('GET', `/api/v1/code/orgs/${orgId}/chart`)
}

export function saveOrgChart(orgId: string, nodes: OrgChartNode[]) {
  return request<{ nodes: OrgChartNode[]; count: number }>('PUT', `/api/v1/code/orgs/${orgId}/chart`, { nodes })
}
