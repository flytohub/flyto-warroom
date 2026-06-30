import { request } from '../client'

export interface OrgNotificationChannel {
  id: string
  org_id?: string
  channel_type: 'email' | 'slack' | 'webhook' | 'system_event' | string
  display_name?: string
  target_ref?: string
  status: 'active' | 'disabled' | 'unverified' | string
  created_at?: string
  updated_at?: string
}

export interface OrgNotificationRule {
  id: string
  org_id?: string
  rule_key: string
  enabled: boolean
  severity: 'info' | 'warning' | 'critical' | string
  event_source: string
  condition_json?: unknown
  channel_ids: string[]
  cooldown_seconds: number
  suppressed_until?: string
  created_at?: string
  updated_at?: string
}

export function listOrgNotificationChannels(orgId: string): Promise<{ channels: OrgNotificationChannel[]; count?: number; note?: string }> {
  return request('GET', `/api/v1/code/orgs/${orgId}/notification-channels`)
}

export function createOrgNotificationChannel(orgId: string, req: {
  channel_type: string
  display_name?: string
  target_ref?: string
  status?: string
}): Promise<{ ok: boolean; channel: OrgNotificationChannel }> {
  return request('POST', `/api/v1/code/orgs/${orgId}/notification-channels`, req)
}

export function testOrgNotificationChannel(orgId: string, channelId: string): Promise<{
  ok: boolean
  delivery: {
    status: 'dry_run' | string
    channel_id: string
    channel_type: string
    target_ref_status: 'sealed' | 'reference' | string
    message: string
  }
}> {
  return request('POST', `/api/v1/code/orgs/${orgId}/notification-channels/${channelId}/test`)
}

export function listOrgNotificationRules(orgId: string): Promise<{ rules: OrgNotificationRule[]; count?: number; note?: string }> {
  return request('GET', `/api/v1/code/orgs/${orgId}/notification-rules`)
}

export function createOrgNotificationRule(orgId: string, req: {
  rule_key: string
  event_source: string
  enabled?: boolean
  severity?: string
  condition_json?: unknown
  channel_ids?: string[]
  cooldown_seconds?: number
}): Promise<{ ok: boolean; rule: OrgNotificationRule; dropped_channel_ids?: string[]; warning?: string }> {
  return request('POST', `/api/v1/code/orgs/${orgId}/notification-rules`, req)
}
