// Operations plane — shared helpers + the forward contracts for the
// governance facts the backend will expose (PR-6 control plane / PR-9
// notification plane). The v2 interfaces below are NOT consumed yet —
// they're the explicit frontend spec so the backend has a target and the
// UI is a fast wire-up when the endpoints land. Do NOT build UI against
// them until the endpoint exists (no speculative dead components).

/** "2h ago" / "3d ago" / "just now" from an ISO timestamp. */
export function relativeTime(iso?: string | null): string {
  if (!iso) return '—'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  const secs = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

import { colors } from '@/styles/designTokens'

/** Map a health/integration status string to a semantic tone key. */
export type HealthTone = 'ok' | 'warn' | 'error' | 'neutral'

/** Tone → dot/text colour (dual-mode safe; from the semantic palette). */
export const TONE_COLOR: Record<HealthTone, string> = {
  ok: colors.semantic.success,
  warn: colors.semantic.warning,
  error: colors.semantic.danger,
  neutral: colors.semantic.neutral,
}
export function healthTone(status?: string): HealthTone {
  switch ((status ?? '').toLowerCase()) {
    case 'ok': case 'healthy': case 'complete': case 'active': return 'ok'
    case 'expired': case 'rate_limited': case 'warning': case 'aging': case 'queued': case 'running': return 'warn'
    case 'missing': case 'failed': case 'error': case 'forbidden': case 'exhausted': case 'stale': return 'error'
    default: return 'neutral'
  }
}

// ─────────────────────────────────────────────────────────────────────
// v2 CONTRACTS — built when PR-6/PR-9 land (no UI yet). Spec for backend.
// ─────────────────────────────────────────────────────────────────────

/** PR-9 — a configured notification destination. */
export interface NotificationChannel {
  id: string
  kind: 'email' | 'slack' | 'webhook' | 'pagerduty'
  target: string
  active: boolean
}

/** PR-9 — a rule: when {event} at {severity}, notify {channels}, with
 *  dedup/silence windows to fight alert fatigue. */
export interface NotificationRule {
  id: string
  event: string            // e.g. 'sla.breach' | 'connector.expired' | 'score.drop'
  min_severity: 'low' | 'medium' | 'high' | 'critical'
  channel_ids: string[]
  silence_minutes?: number
  active: boolean
}

/** PR-9 — one delivery attempt of a notification. */
export interface NotificationDelivery {
  id: string
  rule_id: string
  channel_id: string
  status: 'queued' | 'sent' | 'failed' | 'suppressed'
  attempts: number
  delivered_at?: string
  error?: string
}

/** PR-6 — durable record of an operator action (who/what/why/when). */
export interface OperatorAction {
  id: string
  actor_id: string
  actor_email?: string
  action: 'ack' | 'suppress' | 'escalate' | 'resolve' | 'reopen' | 'retry'
  target_kind: string      // 'finding' | 'connector' | 'job' | 'alert' | …
  target_id: string
  reason?: string
  at: string
}

/** PR-8 — per-resource freshness SLA (not on any list endpoint yet). */
export interface FreshnessStatus {
  last_scanned_at?: string
  next_scan_at?: string
  stale_after_hours?: number
  status: 'fresh' | 'aging' | 'stale'
}
