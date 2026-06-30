/**
 * externalModel — pure mapping helpers for external-surface read models.
 *
 * Historically lived in `exposure/externalModel.ts`, but several of
 * these helpers are consumed by non-exposure surfaces (dashboard), so
 * they now live in the neutral `_shared` layer to avoid cross-surface
 * god-file imports. `exposure/externalModel.ts` keeps a re-export so
 * exposure-internal callers are unchanged.
 *
 * The repair handoff calls out a Do-Not: components must not derive
 * score / grade / SLA breach / issue truth / blast radius / asset
 * identity locally. These adapter functions are the only allowed
 * shape-translation layer between an engine read model
 * (`/external-posture/kernel`, `/external-issues`, `/ctem-priorities`)
 * and a view's row type.
 *
 * Rules of engagement when extending:
 *   - Pure functions only — no React hooks, no Date.now() except for
 *     intentional display formatting (formatOverdue / oldestSlaViolationDays).
 *   - Input must be the raw engine type from `@lib/engine` or
 *     `_shared/externalPosture`; output is the view's row type.
 *   - Never invent fields the backend didn't supply (no defaulting a
 *     missing score to 0 — return `undefined` and let the view
 *     render an empty state).
 *   - Severity normalisation uses `toLowerCase()` consistently because
 *     SEVERITY_ORDER + SEV_COLORS keys are lowercase.
 */

import { t, tOr } from '@lib/i18n';
import type { CityBuilding } from '@compounds/dashboard/AssetCity3D'
import type { AttackSurfaceAsset, CTEMPriorityItem } from '@lib/engine'
import type {
  ExternalFinding, KernelAsset, OpenExternalIssue, SLAViolation,
} from '@compounds/_shared/externalPosture'

// ── DomainIntel: kernel finding → issue row ──

export interface IntelIssueRow {
  domain: string
  category: string
  severity: string
  description: string
  est_fix_time: string
  recommendation: string
}

/** Project one kernel-projected finding into the row shape DomainIntel
 *  renders. `title_key` / `desc_key` are i18n lookups; the fallback
 *  exposes the raw key when no translation exists rather than rendering
 *  an empty string. */
export function kernelFindingToIntelIssue(
  domain: string, finding: ExternalFinding,
): IntelIssueRow {
  return {
    domain,
    category: finding.category,
    severity: finding.severity.toLowerCase(),
    description: tOr(finding.title_key, finding.title_key),
    est_fix_time: '—',
    recommendation: tOr(finding.desc_key, finding.desc_key),
  }
}

/** Bulk variant — pulls every finding out of every asset, anchoring
 *  each to its parent canonical_value. Caller still does the sort
 *  (so the sort comparator can stay near the view's severity
 *  ordering). */
export function kernelAssetsToIntelIssues(
  assets: KernelAsset[] | undefined,
): IntelIssueRow[] {
  return (assets ?? []).flatMap(asset =>
    (asset.findings ?? []).map(f => kernelFindingToIntelIssue(asset.canonical_value, f)),
  )
}

// ── DashboardView: kernel asset → city building ──

/** Project each kernel external asset into the AssetCity3D building
 *  shape. Score / grade come straight from the kernel — no React-side
 *  rounding fallbacks beyond `Math.round` for the display layer. */
export function kernelAssetsToDomainBuildings(
  assets: KernelAsset[] | undefined,
): CityBuilding[] {
  return (assets ?? []).map((d): CityBuilding => ({
    id: d.resource_id,
    kind: 'domain',
    name: d.display_name || d.canonical_value,
    score: Math.round(d.score ?? 0),
    grade: d.grade ?? '-',
    size: (d.sources?.length ?? 0) + (d.findings?.length ?? 0) + 1,
    criticalCount: d.findings?.filter(f => f.severity === 'CRITICAL').length ?? 0,
  }))
}

// ── SLAMonitorView: open issue + CTEM priority → SLA rows ──

export interface SLAIssueRow {
  domain: string
  category: string
  severity: string
  description: string
}

export interface SLAViolationRow extends SLAIssueRow {
  sla_hours: number
  overdue_by: string
}

/** Open external issues come from `/external-issues` (the lighter
 *  shape that DOES include the CTEM lifecycle but doesn't carry
 *  SLA budget metadata). Used to populate the non-violated rows in
 *  the SLA monitor table. */
export function externalIssuesToSLAIssues(
  issues: OpenExternalIssue[] | undefined,
): SLAIssueRow[] {
  return (issues ?? []).map(issue => ({
    domain: issue.domain,
    category: issue.category,
    severity: issue.severity.toLowerCase(),
    description: issue.description,
  }))
}

/** Breach state + SLA budget come from `/ctem-priorities` filtered to
 *  `kind=external && breached`. `overdue_by` is display-only — the
 *  underlying breach moment (`sla_breach_at`) is backend-canonical, we
 *  just format the duration so the row reads as "Overdue 3d" instead
 *  of forcing the operator to read a timestamp. */
export function ctemPrioritiesToSLAViolations(
  items: CTEMPriorityItem[] | undefined,
): SLAViolationRow[] {
  return (items ?? [])
    .filter(p => p.kind === 'external' && p.breached)
    .map(p => ({
      domain: p.domain ?? '',
      category: p.category,
      severity: p.severity.toLowerCase(),
      description: p.description || p.title,
      sla_hours: p.sla_hours,
      overdue_by: formatOverdue(p.sla_breach_at),
    }))
}

/** Counts that drive the dashboard's `<ExternalThreatStrip>` tiles:
 *  KEV-listed findings, findings naming a known threat actor, findings
 *  on a crown-jewel-tier asset. All three are flags the engine sets on
 *  the CTEM priority list; counting them locally is pure aggregation.
 *
 *  Scope contract: this counts whatever the caller passes. The current
 *  call site (dashboard) hands over the full `/ctem-priorities` list
 *  which includes both `external` and `code` kinds — matching the
 *  pre-adapter behaviour. If a future caller needs external-only
 *  counts they should pre-filter the input or we add a dedicated
 *  variant; flipping the default here would silently change the
 *  dashboard's tile numbers.
 *
 *  Returns zeros for undefined / empty input so the strip's "hide
 *  zero tiles" gate keeps working without per-tile defensive code. */
export interface ExternalThreatCounts {
  kev: number
  threatActor: number
  crownJewel: number
}

export function externalThreatCountsFromCtem(
  items: CTEMPriorityItem[] | undefined,
): ExternalThreatCounts {
  const list = items ?? []
  return {
    kev: list.filter(i => i.kev_listed).length,
    threatActor: list.filter(i => !!i.threat_actor).length,
    crownJewel: list.filter(i => i.asset_tier === 'crown_jewel').length,
  }
}

// ── PostureOverview hero: subdomain stats (F2) ──

export interface SubdomainStats {
  totalSubdomains: number
  resolvingSubdomains: number
  totalAssets: number
}

/** Count subdomains + resolving subdomains out of the raw attack-surface
 *  list. The `resolves` flag lives in each asset's `metadata` JSON blob,
 *  so this ends a `JSON.parse(metadata)` that previously ran inside a
 *  React `useMemo` (a "derive truth in component" smell, audit F2).
 *
 *  This is a stop-gap: it still parses scanner-shaped metadata on the
 *  client. The real fix is backend shipping `subdomain_count` /
 *  `resolving_subdomain_count` on a posture-summary endpoint (audit BE
 *  gap 1) — at which point this helper is deleted, not relocated again.
 *  A malformed metadata blob counts as non-resolving (never throws). */
export function subdomainStats(
  assets: AttackSurfaceAsset[] | undefined,
): SubdomainStats {
  const list = assets ?? []
  const subdomains = list.filter(a => a.asset_type === 'subdomain')
  const resolving = subdomains.filter(a => {
    try { return !!JSON.parse(a.metadata || '{}').resolves } catch { return false }
  })
  return {
    totalSubdomains: subdomains.length,
    resolvingSubdomains: resolving.length,
    totalAssets: list.length,
  }
}

// ── PostureOverview hero: peer-corpus percentile band (F1) ──

export interface PeerPercentileBand {
  label: string
  tone: string
}

/** Map the org's avg score against the 5-point peer-baseline
 *  distribution (P25/P50/P75/P90/P95) and return a ranked-bucket label
 *  + tone. Bucketed, not interpolated: the corpus is small (n≈50–100)
 *  and operators read "Top 10%" as a rank, not a continuous statistic.
 *
 *  Pure display arithmetic — the percentile VALUES are backend-canonical
 *  (peer-baseline snapshots); only the band labelling is display-layer,
 *  which is why it legitimately lives here and not on the server.
 *  Returns null when fewer than P50+P90 anchors exist (worker hasn't run
 *  yet) so the caller hides the chip rather than faking a band. */
export function peerPercentileBand(
  score: number,
  latest: Record<number, { value: number }>,
): PeerPercentileBand | null {
  const p95 = latest[95]?.value
  const p90 = latest[90]?.value
  const p75 = latest[75]?.value
  const p50 = latest[50]?.value
  const p25 = latest[25]?.value
  if (typeof p50 !== 'number' || typeof p90 !== 'number') return null
  if (typeof p95 === 'number' && score >= p95) {
    return { label: t('posture.sectorBand.top5'), tone: '#22c55e' }
  }
  if (score >= p90) return { label: t('posture.sectorBand.top10'), tone: '#22c55e' }
  if (typeof p75 === 'number' && score >= p75) {
    return { label: t('posture.sectorBand.top25'), tone: '#84cc16' }
  }
  if (score >= p50) return { label: t('posture.sectorBand.aboveP50'), tone: '#84cc16' }
  if (typeof p25 === 'number' && score >= p25) {
    return { label: t('posture.sectorBand.bottom50'), tone: '#f97316' }
  }
  return { label: t('posture.sectorBand.bottom25'), tone: '#ef4444' }
}

/** "Overdue X" duration formatter. Backend-canonical breach moment
 *  comes in as RFC3339; the bucket boundaries (`<24h` shows hours,
 *  `≥24h` shows days) are display-layer choices and legitimately
 *  live in the frontend. Empty string for missing / un-parseable
 *  input so the caller renders nothing instead of "NaN d". */
export function formatOverdue(slaBreachAt?: string): string {
  if (!slaBreachAt) return ''
  const breachAt = new Date(slaBreachAt).getTime()
  if (Number.isNaN(breachAt)) return ''
  const hours = Math.max(0, Math.floor((Date.now() - breachAt) / 3_600_000))
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

// ── Dashboard tooltip: oldest open SLA breach ──

/** How many whole days ago the OLDEST currently-breached SLA was
 *  first detected. Drives the "X d" suffix on the dashboard hero
 *  SLA chip. Pure display arithmetic over the backend's `detected_at`
 *  field — the truth that a row IS breached comes from the server. */
export function oldestSlaViolationDays(
  violations: SLAViolation[] | undefined,
): number {
  if (!violations || violations.length === 0) return 0
  let maxDays = 0
  for (const v of violations) {
    const t = Date.parse(v.detected_at)
    if (Number.isNaN(t)) continue
    const days = Math.floor((Date.now() - t) / 86_400_000)
    if (days > maxDays) maxDays = days
  }
  return maxDays
}
