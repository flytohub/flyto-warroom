import { request } from '../client'

export type ModuleCategory = 'core' | 'surface' | 'verification' | 'action' | 'simulation' | 'gate' | 'program' | (string & {})
export type ModuleStatus = 'live' | 'beta' | 'soon' | (string & {})
export type ModuleSourceKind = 'flyto' | 'integration'

export interface ModuleProvider {
  id: string
  label: string
}

export interface ModuleRegistryEntry {
  key: string
  display_name: string
  title_key?: string
  description: string
  description_key?: string
  category: ModuleCategory
  risk_level: string
  status: ModuleStatus
  landing_path?: string
  source_selectable: boolean
  flyto_native: boolean
  default_enabled: boolean
  cross_cutting?: boolean
  aliases?: string[]
  requires?: string[]
  features?: string[]
  gating_features?: string[]
  permissions?: string[]
  commercial_actions?: string[]
  navigation?: string[]
  providers?: ModuleProvider[]
  /** Billing tier from the catalog. Empty/'free' = free (preview default);
   *  'paid' = charged. The wizard's price badge reads this off the registry
   *  instead of hardcoding "free" — charging later is a backend catalog
   *  change, not a frontend edit. */
  billing?: string
}

export interface ModuleRegistryResponse {
  catalog_version: string
  modules: ModuleRegistryEntry[]
}

export interface ProjectCapabilitySource {
  kind: ModuleSourceKind
  integrationId?: string
}

export interface ProjectModuleCapability {
  key: string
  display_name: string
  category: ModuleCategory
  risk_level: string
  status: ModuleStatus
  state: 'enabled' | 'disabled' | 'locked' | 'blocked' | (string & {})
  reason?: string
  missing_dependencies?: string[]
  source_selectable: boolean
  flyto_native: boolean
  sources?: ProjectCapabilitySource[]
  navigation?: string[]
  permissions?: string[]
  commercial_actions?: string[]
  pages?: string[]
}

export interface ProjectCapabilitiesResponse {
  org_id: string
  project_id: string
  project_kind: 'organization' | 'security' | 'workspace' | (string & {})
  enabled_modules: string[]
  modules: Record<string, ProjectModuleCapability>
  capabilities: Record<string, boolean>
  pages?: Record<string, boolean>
  navigation: string[]
  actions?: Record<string, {
    state: 'allowed' | 'payment_required' | 'blocked' | (string & {})
    billing_behavior?: string
    reason?: string
    required_action?: string
    required_feature?: string
    required_sku?: string
    paywall_key?: string
  }>
  catalog_version: string
}

export interface PutProjectModuleSource {
  kind: ModuleSourceKind
  integrationId?: string
}

export interface PutProjectModule {
  module: string
  enabled: boolean
  billingTier?: string
  sources: PutProjectModuleSource[]
}

export function getGlobalModuleRegistry(): Promise<ModuleRegistryResponse> {
  return request('GET', '/api/v1/module-registry')
}

export function getOrgModuleRegistry(orgId: string): Promise<ModuleRegistryResponse> {
  return request('GET', `/api/v1/code/orgs/${orgId}/module-registry`)
}

export function getProjectCapabilities(orgId: string, projectId: string): Promise<ProjectCapabilitiesResponse> {
  return request('GET', `/api/v1/code/orgs/${orgId}/projects/${projectId}/capabilities`)
}

export function putProjectModules(orgId: string, projectId: string, modules: PutProjectModule[]): Promise<{ modules: unknown[] }> {
  return request('PUT', `/api/v1/code/orgs/${orgId}/fusion/projects/${projectId}/modules`, { modules })
}
