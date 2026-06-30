import { request } from '../client'

// notifications.ts — SYSTEM/admin notification channels + rules.
// Backend: api/handlers_notification_channels.go + api/handlers_notification_rules.go
// (requirePlatformAdmin, system:notifs:read/write). Distinct from the org-level
// NotificationsTab — this is the platform alert-routing control plane.
//
//   GET  /api/v1/system/notifications/channels — list channels
//   POST /api/v1/system/notifications/channels — create channel
//   GET  /api/v1/system/notifications/rules    — list rules
//   POST /api/v1/system/notifications/rules    — create rule

export interface NotificationChannel {
  id: string
  org_id?: string
  channel_type: string
  display_name?: string
  target_ref?: string
  status: string
  created_at?: string
  updated_at?: string
}

export interface ListNotificationChannelsResponse {
  channels: NotificationChannel[]
  count?: number
  note?: string
}

export function listNotificationChannels(): Promise<ListNotificationChannelsResponse> {
  return request('GET', '/api/v1/system/notifications/channels')
}

export function createNotificationChannel(req: {
  org_id?: string
  channel_type: string
  display_name?: string
  target_ref?: string
  status?: string
}): Promise<{ ok: boolean; channel: NotificationChannel }> {
  return request('POST', '/api/v1/system/notifications/channels', req)
}

export interface NotificationRule {
  id: string
  org_id?: string
  rule_key: string
  enabled: boolean
  severity: string
  event_source: string
  channel_ids: string[]
  cooldown_seconds: number
  suppressed_until?: string
  created_at?: string
  updated_at?: string
}

export interface ListNotificationRulesResponse {
  rules: NotificationRule[]
  count?: number
  note?: string
}

export function listNotificationRules(): Promise<ListNotificationRulesResponse> {
  return request('GET', '/api/v1/system/notifications/rules')
}

export function createNotificationRule(req: {
  rule_key: string
  event_source: string
  org_id?: string
  enabled?: boolean
  severity?: string
  channel_ids?: string[]
  cooldown_seconds?: number
}): Promise<unknown> {
  return request('POST', '/api/v1/system/notifications/rules', req)
}
