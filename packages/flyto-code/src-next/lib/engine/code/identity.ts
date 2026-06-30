import { request } from '../client'

// identity.ts — identity security surface (PR#184) org-scoped reads.
// Backend: api/handlers_identity.go + api/handlers_identity_access_graph.go.
//
//   GET /api/v1/code/orgs/{id}/identity/posture      — MFA/status roll-up
//   GET /api/v1/code/orgs/{id}/identity/access-graph — group→app access graph
//
// Both are connector-gated: empty (configured=false / empty graph) until an
// IdP / cloud / SCIM source is wired — the UI renders a "connect your IdP"
// empty state.

export interface IdentityRow {
  resourceId: string
  mfaEnrolled: boolean
  status?: string
  reason: string
}

export interface IdentityPosture {
  configured: boolean
  totalIdentities: number
  mfaEnrolled: number
  mfaMissing: number
  mfaCoverage: number // 0..1
  statusCounts: Record<string, number>
  atRisk: IdentityRow[]
  sources: string[]
}

export function getIdentityPosture(orgId: string): Promise<IdentityPosture> {
  return request('GET', `/api/v1/code/orgs/${orgId}/identity/posture`)
}

export interface AccessGraphNode {
  resourceId: string
  kind: 'group' | 'user' | 'app' | string
  name: string
}

export interface AccessGraphEdge {
  subject: string
  app: string
  grantVia: string
}

export interface IdentityAccessGraph {
  nodes: AccessGraphNode[]
  edges: AccessGraphEdge[]
}

export function getIdentityAccessGraph(orgId: string): Promise<IdentityAccessGraph> {
  return request('GET', `/api/v1/code/orgs/${orgId}/identity/access-graph`)
}
