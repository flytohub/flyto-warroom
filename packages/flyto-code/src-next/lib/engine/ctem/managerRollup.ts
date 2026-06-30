/**
 * managerRollup.ts — manager-grade executive aggregations derived
 * from the CTEM priority feed.
 *
 * The manager surfaces (Dashboard, Exec Overview) need three numbers
 * that no single endpoint ships pre-aggregated:
 *   - $ financial exposure at risk  (Σ impact.mid_usd over open crit/high)
 *   - SLA breaches                  (count of `breached` priority items)
 *   - KEV-listed exposure           (count of `kev_listed` priority items)
 *
 * These are PURE derivations over `getCTEMPriorities` rows — no new
 * endpoint, no new wire contract. Keeping the math in one typed place
 * means the Dashboard manager hero and the Exec landing read the same
 * definition of "$ at risk" instead of each re-deriving it inline
 * (and drifting). Imported by DIRECT PATH per the decoupling rule.
 *
 * NOTE: the engine emits `impact` as a confidence-banded range, never
 * a single dollar value (honesty wording, see ImpactEstimate). We roll
 * up the `mid_usd` mid-point for the headline KPI and also expose the
 * low/high band so the narrative can render it as a range, never as a
 * false-precision single figure.
 */

import type { CTEMPriorityItem, CTEMPriorityResponse } from './ctem'

export interface ManagerRollup {
  /** Count of priority items considered (crit + high effective sev). */
  hotCount: number
  /** Σ impact.low_usd over hot items that carry an impact estimate. */
  atRiskLowUsd: number
  /** Σ impact.mid_usd — the headline "$ at risk" figure. */
  atRiskMidUsd: number
  /** Σ impact.high_usd over hot items. */
  atRiskHighUsd: number
  /** How many hot items actually carried an impact estimate (for
   *  honesty: "$X across N of M findings with a modelled impact"). */
  withImpactCount: number
  /** Count of priority items past their SLA window. */
  slaBreaches: number
  /** Count of KEV-listed (CISA known-exploited) priority items. */
  kevCount: number
  /** Count of crown-jewel-tier priority items. */
  crownJewelCount: number
  /** Count of items with a named threat actor. */
  threatActorCount: number
}

const HOT = new Set(['critical', 'high'])

function effectiveSeverity(item: CTEMPriorityItem): string {
  return (item.effective_severity || item.severity || '').toLowerCase()
}

/** Roll a CTEM priority response into the executive headline numbers. */
export function rollupManagerKpis(
  resp: CTEMPriorityResponse | undefined,
): ManagerRollup {
  const items = resp?.items ?? []
  let atRiskLowUsd = 0
  let atRiskMidUsd = 0
  let atRiskHighUsd = 0
  let withImpactCount = 0
  let hotCount = 0
  let slaBreaches = 0
  let kevCount = 0
  let crownJewelCount = 0
  let threatActorCount = 0

  for (const item of items) {
    if (item.breached) slaBreaches++
    if (item.kev_listed) kevCount++
    if (item.asset_tier === 'crown_jewel') crownJewelCount++
    if (item.threat_actor) threatActorCount++

    const hot = HOT.has(effectiveSeverity(item))
    if (!hot) continue
    hotCount++
    const imp = item.impact
    if (imp) {
      withImpactCount++
      atRiskLowUsd += imp.low_usd
      atRiskMidUsd += imp.mid_usd
      atRiskHighUsd += imp.high_usd
    }
  }

  return {
    hotCount,
    atRiskLowUsd: Math.round(atRiskLowUsd),
    atRiskMidUsd: Math.round(atRiskMidUsd),
    atRiskHighUsd: Math.round(atRiskHighUsd),
    withImpactCount,
    slaBreaches,
    kevCount,
    crownJewelCount,
    threatActorCount,
  }
}

/** Compact USD formatter for KPI tiles — "$1.2M" / "$340K" / "$0".
 *  Returns the bare formatted string; callers wrap it in a KpiCard
 *  value (string passthrough — KpiCard renders strings verbatim, so
 *  the count-up animation only runs on numeric tiles). */
export function formatUsdCompact(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '$0'
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${Math.round(value)}`
}
