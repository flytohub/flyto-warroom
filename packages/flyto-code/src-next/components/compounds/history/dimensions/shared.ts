import { Clock, Code2, Target, TrendingUp, AlertCircle, Network, AlertOctagon } from 'lucide-react'
import type { FeedKind } from '@lib/engine'

// Shared constants + helpers consumed by every dimension widget.
// Kept module-level so React doesn't re-create the lookup tables
// on every render — the values never change.

export const KIND_COLOR: Record<FeedKind, string> = {
  scan: '#06b6d4',
  pentest: '#fb923c',
  score: '#a78bfa',
  alert: '#f87171',
  asset: '#22d3ee',
  sla_breach: '#ef4444',
}

export const KIND_ICON: Record<FeedKind, typeof Clock> = {
  scan: Code2,
  pentest: Target,
  score: TrendingUp,
  alert: AlertCircle,
  asset: Network,
  sla_breach: AlertOctagon,
}

export const SEV_BG: Record<string, string> = {
  critical: '#ef444420',
  high: '#f9731620',
  medium: '#eab30820',
  low: '#64748b20', // canonical SEVERITY_TONE.low (slate) — was #3b82f6 blue
  info: '#94a3b820',
}

// `PILLAR_COLOR`, `CARD_SX`, and `weekKey` were removed when
// HistoryFeedView was redesigned — PillarDonut / SeverityOverTime /
// TopContributors / HourlyDistribution were the only callers, and
// they're gone. SectionCard in the parent view now owns card chrome.

// Re-exported from the shared canonical so existing `./shared` consumers
// (FeedRow, CompositionBars) keep working unchanged.
export { formatTimestamp } from '@lib/time'

export function sinceToDays(s: string): number {
  if (s.endsWith('d')) return Number(s.slice(0, -1)) || 7
  if (s.endsWith('h')) return Math.max(1, Math.ceil(Number(s.slice(0, -1)) / 24))
  return 7
}
