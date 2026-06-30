/**
 * Shared time/date formatters.
 *
 * Consolidates the byte-identical `formatTimestamp` that was copied in
 * compounds/history/dimensions/shared.ts and security/HistoryTimeline.tsx.
 */

/** Relative "just now / Xm / Xh / Xd ago" for recent events, falling back
 *  to a locale timestamp beyond a week. Returns the raw input on an
 *  unparseable date. */
export function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 7 * 86_400) return `${Math.floor(diff / 86_400)}d ago`
  return d.toLocaleString()
}
