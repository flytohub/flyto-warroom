import { request } from '../client'

// history-feed.ts — TypeScript client for the unified org history
// feed (flyto-engine handlers_history_feed.go).
//
//   GET /api/v1/code/orgs/{id}/history-feed
//     ?since=7d                        ← shortcut, fallback when from/to missing
//     ?from=2026-04-01&to=2026-04-15  ← explicit window (RFC3339 or YYYY-MM-DD)
//     ?kinds=scan,pentest,score,alert,asset,sla_breach
//     ?domain=api.flyto2.com           ← narrow to CTEM events for one domain
//     ?q=critical                       ← case-insensitive substring on title+summary
//     ?limit=300
//
// `sla_breach` is server-derived from external_issue_tracker rows
// that have exceeded their severity-specific SLA window. Score rows
// can carry `payload.reasons` — top-3 co-incident alerts/assets that
// probably explain a score movement.

export type FeedKind = 'scan' | 'pentest' | 'score' | 'alert' | 'asset' | 'sla_breach'
export type FeedPillar = 'va' | 'ctem' | 'cross'

export interface FeedReason {
  kind: string
  title: string
  severity: string
}

export interface FeedItem {
  kind: FeedKind
  pillar: FeedPillar
  title: string
  summary?: string
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'info'
  /** Set for CTEM rows; empty on code-pillar events. Used by the
      domain filter and the per-row chip. */
  domain?: string
  repo_id?: string
  project_id?: string
  alert_id?: string
  asset_id?: string
  recorded_at: string
  payload?: Record<string, unknown> & { reasons?: FeedReason[] }
}

export interface HistoryFeedResponse {
  org_id: string
  since: string
  /** Echo of the resolved [from, to] window so the UI can render
      "showing X events from A to B" without recomputing. */
  from?: string
  to?: string
  items: FeedItem[]
  count: number
}

export interface HistoryFeedParams {
  /** Default 7d. Accepts Go duration ("24h") or "Nd" shorthand. */
  since?: string
  /** RFC3339 or YYYY-MM-DD. Overrides `since` when BOTH supplied. */
  from?: string
  /** RFC3339 or YYYY-MM-DD. Inclusive end-of-day when no time given. */
  to?: string
  /** Subset of kinds. Empty / 'all' returns everything. */
  kinds?: FeedKind[]
  /** Filter to a single CTEM domain. Code-pillar events are excluded. */
  domain?: string
  /** Case-insensitive substring across title + summary. */
  q?: string
  /** Cap result count. Default 200, max 500 server-side. */
  limit?: number
}

export function getHistoryFeed(orgId: string, params: HistoryFeedParams = {}) {
  const qs = new URLSearchParams()
  if (params.since) qs.set('since', params.since)
  if (params.from) qs.set('from', params.from)
  if (params.to) qs.set('to', params.to)
  if (params.kinds && params.kinds.length > 0) qs.set('kinds', params.kinds.join(','))
  if (params.domain) qs.set('domain', params.domain)
  if (params.q) qs.set('q', params.q)
  if (params.limit) qs.set('limit', String(params.limit))
  const qstr = qs.toString()
  return request<HistoryFeedResponse>(
    'GET',
    `/api/v1/code/orgs/${encodeURIComponent(orgId)}/history-feed${qstr ? '?' + qstr : ''}`,
  )
}
