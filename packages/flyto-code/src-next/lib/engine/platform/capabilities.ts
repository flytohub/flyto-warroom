/**
 * Capabilities — backend-driven entitlement + RBAC snapshot.
 *
 * Read once per (org, user) navigation; React Query caches it. The
 * frontend never makes entitlement decisions on its own; it only
 * filters nav and route-guards based on what this object says.
 *
 * Backend: GET /api/v1/me/capabilities?org_id=<id>
 * Source of truth: flyto-engine/internal/permission/capabilities.yaml
 */

import { request } from '../client'
import type { ProjectType } from './orgs'

export type Tier = 'code' | 'ctem' | 'code_ctem' | 'code_ctem_cspm'
export type Plan = 'free' | 'starter' | 'pro' | 'team' | 'enterprise'
export type Role = 'owner' | 'admin' | 'member' | 'viewer' | 'guest'
export type PageAccessState = 'enabled' | 'locked_preview' | 'hidden'
export type ActionAccessState = 'allowed' | 'payment_required' | 'blocked'
export type BillingBehavior = 'included' | 'addon_required' | 'metered' | 'credit_required' | 'blocked'
export type BillingMode = 'preview' | 'live' | (string & {})
export type Edition = 'community' | 'saas' | 'self_hosted_online' | 'enterprise_airgap' | (string & {})
export type LicenseClass = 'apache_2' | 'commercial' | (string & {})

export interface EditionProviders {
  auth?: string
  billing?: string
  storage?: string
  ai?: string
  threat_intel?: string
}

export interface PageAccess {
  state: PageAccessState
  reason?: string
  required_feature?: string
  required_sku?: string
  paywall_key?: string
}

export interface SurfaceAccess {
  state: PageAccessState
  billing_behavior?: BillingBehavior
  reason?: string
  required_feature?: string
  required_sku?: string
  paywall_key?: string
}

export interface ActionAccess {
  state: ActionAccessState
  billing_behavior?: BillingBehavior
  reason?: string
  required_action?: string
  required_feature?: string
  required_sku?: string
  paywall_key?: string
}

export interface MeterState {
  billing_behavior?: BillingBehavior
  quota?: number
  used?: number
  remaining?: number
}

export interface Paywall {
  title: string
  message: string
  cta_key: string
  required_feature?: string
  required_sku?: string
}

export interface Capabilities {
  tier: Tier
  plan: Plan
  billing_mode?: BillingMode
  role: Role
  project_type: ProjectType
  features: string[]
  visible_pages: string[]
  permissions: string[]
  edition?: Edition
  deploy_mode?: string
  providers?: EditionProviders
  license_class?: LicenseClass
  hidden_surfaces?: string[]
  unsupported_actions?: string[]
  surfaces?: Record<string, SurfaceAccess>
  page_states?: Record<string, PageAccess>
  actions?: Record<string, ActionAccess>
  meters?: Record<string, MeterState>
  paywalls?: Record<string, Paywall>
  seat_cap: number
  repo_cap: number
  domain_cap: number
}

export async function getMyCapabilities(orgId: string): Promise<Capabilities> {
  return request<Capabilities>('GET', `/api/v1/me/capabilities?org_id=${encodeURIComponent(orgId)}`)
}
