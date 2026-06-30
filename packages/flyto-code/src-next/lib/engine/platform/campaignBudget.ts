/**
 * Campaign budget — per-org token caps for red team campaigns.
 * Mirrors /api/v1/code/orgs/{id}/campaign-budget/* on the engine.
 */
import { request } from '../client'

export type CampaignBudgetMetric = 'input_tokens' | 'output_tokens' | 'total_tokens'

export interface CampaignBudgetPolicy {
  id: string
  orgId: string
  metric: CampaignBudgetMetric
  windowDays: number
  amount: number
  warnPercent: number
  hardStopEnabled: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CampaignBudgetIncident {
  id: string
  orgId: string
  policyId: string
  thresholdType: 'soft' | 'hard'
  status: 'open' | 'resolved'
  amountObserved: number
  amountLimit: number
  windowFrom: string
  windowTo: string
  resolvedBy?: string | null
  resolvedAt?: string | null
  createdAt: string
}

export function listCampaignBudgetPolicies(orgId: string) {
  return request<{ policies: CampaignBudgetPolicy[] }>(
    'GET',
    `/api/v1/code/orgs/${orgId}/campaign-budget/policies`,
  )
}

export function upsertCampaignBudgetPolicy(
  orgId: string,
  body: {
    id?: string
    metric: CampaignBudgetMetric
    window_days: number
    amount: number
    warn_percent: number
    hard_stop_enabled: boolean
    is_active: boolean
  },
) {
  return request<CampaignBudgetPolicy>(
    'PUT',
    `/api/v1/code/orgs/${orgId}/campaign-budget/policies`,
    body,
  )
}

export function deleteCampaignBudgetPolicy(orgId: string, policyId: string) {
  return request<void>(
    'DELETE',
    `/api/v1/code/orgs/${orgId}/campaign-budget/policies/${policyId}`,
  )
}

export function listCampaignBudgetIncidents(orgId: string) {
  return request<{ incidents: CampaignBudgetIncident[] }>(
    'GET',
    `/api/v1/code/orgs/${orgId}/campaign-budget/incidents`,
  )
}

export function resolveCampaignBudgetIncident(orgId: string, incidentId: string) {
  return request<void>(
    'POST',
    `/api/v1/code/orgs/${orgId}/campaign-budget/incidents/${incidentId}/resolve`,
  )
}
