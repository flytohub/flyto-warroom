// scoringAudit.ts — Read-only forensic access to the 3-table
// observation pipeline (observations + state + decisions, all
// hash-chained). Surfaces the integrity check + change history.
//
// Backend: handlers_score_audit.go.
//   GET /api/v1/code/orgs/{id}/score-observations?domain=X&limit=N
//   GET /api/v1/code/orgs/{id}/score-decisions?domain=X&limit=N
//   GET /api/v1/code/orgs/{id}/score-state/verify?domain=X

import { request } from '../client'

export interface ScoreObservation {
  id: string
  projectId: string
  orgId: string
  domain: string
  score: number
  grade: string
  details: string       // JSON blob
  observedAt: string
  prevHash: string
  entryHash: string
}

export interface ScoreDecision {
  id: string
  projectId: string
  orgId: string
  domain: string
  fromScore: number
  toScore: number
  fromGrade: string
  toGrade: string
  decisionType: string      // accepted / quarantined / promoted / rejected
  reason: string
  observationIds: string    // JSON array
  decidedBy: string
  decidedAt: string
}

export interface ListObservationsResponse {
  project_id: string
  domain: string
  observations: ScoreObservation[]
  count: number
}

export interface ListDecisionsResponse {
  project_id: string
  domain: string
  decisions: ScoreDecision[]
  count: number
}

export interface VerifyChainResponse {
  project_id: string
  domain: string
  chain_intact: boolean
  checked: number
  error?: string
}

export function listScoreObservations(orgId: string, domain: string, limit = 100) {
  const qs = new URLSearchParams({ domain, limit: String(limit) })
  return request<ListObservationsResponse>('GET', `/api/v1/code/orgs/${orgId}/score-observations?${qs}`)
}

export function listScoreDecisions(orgId: string, domain: string, limit = 100) {
  const qs = new URLSearchParams({ domain, limit: String(limit) })
  return request<ListDecisionsResponse>('GET', `/api/v1/code/orgs/${orgId}/score-decisions?${qs}`)
}

export function verifyScoreChain(orgId: string, domain: string) {
  const qs = new URLSearchParams({ domain })
  return request<VerifyChainResponse>('GET', `/api/v1/code/orgs/${orgId}/score-state/verify?${qs}`)
}
