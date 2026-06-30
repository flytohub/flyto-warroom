/**
 * Generic per-workspace cost-budget governance.
 *
 * Mirrors the engine's core budget handlers (handlers_budget.go):
 *   GET  /api/v1/budgets/overview?workspace_id=…  → handleBudgetOverview
 *   GET  /api/v1/budgets/policies?workspace_id=…  → handleListBudgetPolicies
 *   POST /api/v1/budgets/policies                 → handleUpsertBudgetPolicy
 *
 * This is the platform-native LLM/API *cost* budget surface (billed_cents,
 * calendar-month windows, hard-stop) — distinct from the campaign-budget
 * (token-cap) surface BudgetPoliciesTab wires. In this product the org id
 * IS the workspace id (single workspace per org), as the engine's own
 * tests use orgID for ListAuditLogs / cost scoping.
 *
 * Imported by DIRECT FILE PATH per the engine-client decoupling rule.
 */
import { request } from '../client'

export type BudgetScopeType = 'workspace' | 'project'
export type BudgetWindowKind = 'calendar_month_utc' | 'lifetime'

/** store.BudgetPolicy — amounts are integer cents. */
export interface BudgetPolicy {
  id: string
  workspaceId: string
  scopeType: BudgetScopeType
  scopeId: string | null
  metric: string // "billed_cents"
  windowKind: BudgetWindowKind
  amount: number // limit in cents
  warnPercent: number // soft threshold (default 80)
  hardStopEnabled: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

/** store.BudgetIncident — a threshold breach (soft warning / hard pause). */
export interface BudgetIncident {
  id: string
  workspaceId: string
  policyId: string
  thresholdType: 'soft' | 'hard'
  status: 'open' | 'resolved' | 'dismissed'
  amountObserved: number
  amountLimit: number
  resolutionAction: string | null
  resolvedBy: string | null
  resolvedAt: string | null
  createdAt: string
}

/** budget.Overview — the primary dashboard payload. */
export interface BudgetOverview {
  policies: BudgetPolicy[]
  activeIncidents: BudgetIncident[]
  currentSpendCents: number
  currentLimitCents: number
  utilization: number // 0.0–1.0+
  isBlocked: boolean
}

export function getBudgetOverview(workspaceId: string) {
  return request<BudgetOverview>(
    'GET',
    `/api/v1/budgets/overview?workspace_id=${encodeURIComponent(workspaceId)}`,
  )
}

export interface BudgetPoliciesResponse {
  policies: BudgetPolicy[]
  count: number
}

export function listBudgetPolicies(workspaceId: string) {
  return request<BudgetPoliciesResponse>(
    'GET',
    `/api/v1/budgets/policies?workspace_id=${encodeURIComponent(workspaceId)}`,
  )
}

/** Body for POST /api/v1/budgets/policies. The engine fills metric
 *  (billed_cents), defaults scopeType=workspace, windowKind=calendar_month_utc,
 *  warnPercent=80, hardStopEnabled=true, and sets isActive=amount>0. */
export interface UpsertBudgetPolicyInput {
  workspaceId: string
  amount: number // cents
  scopeType?: BudgetScopeType
  scopeId?: string | null
  warnPercent?: number
  hardStopEnabled?: boolean
  windowKind?: BudgetWindowKind
}

export function upsertBudgetPolicy(input: UpsertBudgetPolicyInput) {
  return request<BudgetPolicy>('POST', '/api/v1/budgets/policies', input)
}
