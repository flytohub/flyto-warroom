import { request } from '../client'

export interface LaunchpadRolePreset {
  name: string
  description: string
  capabilities: string[]
}

export interface LaunchpadNotificationRule {
  ruleKey: string
  severity: string
  eventSource: string
  conditionJson: string
  cooldownSeconds: number
}

export interface LaunchpadReportTemplate {
  id: string
  name: string
  category: string
  config: unknown
}

export interface LaunchpadReportComponent {
  id: string
  name: string
  dataSourceId: string
  chartType: string
  labelField?: string
  valueField?: string
  defaultCols: number
}

export interface LaunchpadAPIKeyPreset {
  name: string
  scopes: string
}

export interface LaunchpadConnectorHint {
  providerId: string
  mappingId: string
  sourceSystemType: string
  recommendedRunbook: string
}

export interface LaunchpadPack {
  id: string
  name: string
  description: string
  category: string
  rolePresets: LaunchpadRolePreset[]
  notificationRules: LaunchpadNotificationRule[]
  reportTemplates: LaunchpadReportTemplate[]
  reportComponents: LaunchpadReportComponent[]
  apiKeyPresets: LaunchpadAPIKeyPreset[]
  connectorHints: LaunchpadConnectorHint[]
}

export interface LaunchpadAction {
  kind: string
  target: string
  state: string
  summary: string
}

export interface LaunchpadPlan {
  packId: string
  actions: LaunchpadAction[]
  counts: Record<string, number>
}

export interface LaunchpadApplyResponse extends LaunchpadPlan {
  applied: boolean
}

export function listLaunchpadPacks(orgId: string): Promise<{ packs: LaunchpadPack[] }> {
  return request('GET', `/api/v1/code/orgs/${orgId}/launchpad/packs`)
}

export function dryRunLaunchpadPack(orgId: string, packId: string): Promise<LaunchpadPlan> {
  return request('POST', `/api/v1/code/orgs/${orgId}/launchpad/packs/${encodeURIComponent(packId)}/dry-run`)
}

export function applyLaunchpadPack(orgId: string, packId: string): Promise<LaunchpadApplyResponse> {
  return request('POST', `/api/v1/code/orgs/${orgId}/launchpad/packs/${encodeURIComponent(packId)}/apply`)
}
