import { colors } from '@/styles/designTokens'
import type {
  CoverageEntity,
  CoverageClaim,
  CoverageResource,
  CoverageSource,
  CoverageState,
  CoverageScope,
  ScopeRollup,
  ResourceCoverage,
  ScopeState,
  SourceStatus,
} from '@lib/engine/code/assetCoverage'

export interface StatusMeta {
  label: string
  detail: string
  tone: string
  priority: number
  countsAsDebt: boolean
}

export interface ClaimStateMeta {
  label: string
  detail: string
  tone: string
  countsAsAnswer: boolean
  countsAsDebt: boolean
}

export interface ResourceVerdict {
  label: string
  detail: string
  tone: string
  kind: 'answered' | 'partial' | 'debt'
}

export interface ScopeStateMeta {
  label: string
  detail: string
  tone: string
  countsAsComplete: boolean
  countsAsDebt: boolean
}

const STATUS_META: Record<string, StatusMeta> = {
  fresh: {
    label: 'Fresh',
    detail: 'Source is inside its freshness window.',
    tone: colors.semantic.success,
    priority: 60,
    countsAsDebt: false,
  },
  stale: {
    label: 'Stale',
    detail: 'Previous observations need refresh before supporting current certainty.',
    tone: colors.semantic.warning,
    priority: 20,
    countsAsDebt: true,
  },
  error: {
    label: 'Error',
    detail: 'Collection failed or is blocked; this is not evidence of absence.',
    tone: colors.semantic.danger,
    priority: 10,
    countsAsDebt: true,
  },
  unavailable: {
    label: 'Unavailable',
    detail: 'A required credential or integration path is missing.',
    tone: colors.semantic.warning,
    priority: 30,
    countsAsDebt: true,
  },
  disabled: {
    label: 'Disabled',
    detail: 'Source is disabled; treat it as coverage debt.',
    tone: colors.semantic.neutral,
    priority: 35,
    countsAsDebt: true,
  },
  not_collected: {
    label: 'Not collected',
    detail: 'No attempt has been recorded for this source.',
    tone: colors.semantic.neutral,
    priority: 40,
    countsAsDebt: true,
  },
  unknown: {
    label: 'Unknown',
    detail: 'Source state is not classified.',
    tone: colors.semantic.neutral,
    priority: 50,
    countsAsDebt: true,
  },
}

const CLAIM_STATE_META: Record<string, ClaimStateMeta> = {
  present: {
    label: 'Present',
    detail: 'Source returned positive evidence for this resource.',
    tone: colors.semantic.success,
    countsAsAnswer: true,
    countsAsDebt: false,
  },
  absent_vendor_empty: {
    label: 'Vendor-empty',
    detail: 'Source returned an explicit empty result; this is an answered pair, not a discovery miss.',
    tone: colors.semantic.info,
    countsAsAnswer: true,
    countsAsDebt: false,
  },
  not_applicable: {
    label: 'N/A',
    detail: 'Source does not apply to this resource type.',
    tone: colors.semantic.neutral,
    countsAsAnswer: true,
    countsAsDebt: false,
  },
  stale: {
    label: 'Stale',
    detail: 'Observation is outside freshness policy; refresh before using as a current answer.',
    tone: colors.semantic.warning,
    countsAsAnswer: false,
    countsAsDebt: true,
  },
  error: {
    label: 'Error',
    detail: 'Collection failed; this is evidence debt, not a negative answer.',
    tone: colors.semantic.danger,
    countsAsAnswer: false,
    countsAsDebt: true,
  },
  absent_not_collected: {
    label: 'Not collected',
    detail: 'No collection attempt produced an answer for this pair.',
    tone: colors.semantic.neutral,
    countsAsAnswer: false,
    countsAsDebt: true,
  },
}

const SCOPE_STATE_META: Record<string, ScopeStateMeta> = {
  complete: {
    label: 'Scope complete',
    detail: 'All declared required entities, sources, and linked assets are answered.',
    tone: colors.semantic.success,
    countsAsComplete: true,
    countsAsDebt: false,
  },
  incomplete: {
    label: 'Scope incomplete',
    detail: 'One or more required entities, sources, or linked assets still have evidence debt.',
    tone: colors.semantic.warning,
    countsAsComplete: false,
    countsAsDebt: true,
  },
  unstarted: {
    label: 'Scope undeclared',
    detail: 'No confirmed business entity scope is declared; group completeness cannot be claimed.',
    tone: colors.semantic.neutral,
    countsAsComplete: false,
    countsAsDebt: true,
  },
  error: {
    label: 'Scope error',
    detail: 'The scope ledger could not be evaluated.',
    tone: colors.semantic.danger,
    countsAsComplete: false,
    countsAsDebt: true,
  },
}

const EMPTY_SCOPE_ROLLUP: ScopeRollup = {
  requiredEntities: 0,
  coveredEntities: 0,
  entitiesWithDebt: 0,
  candidateEntities: 0,
  unlinkedResources: 0,
  quarantinedAssets: 0,
  scopeDebtItems: 0,
  scopeDebtPercentage: 0,
  totalEntitySourceRows: 0,
  entitySourceDebtRows: 0,
}

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : []
}

export function sourceStatusMeta(status: SourceStatus | string): StatusMeta {
  return STATUS_META[status] ?? {
    label: String(status || 'unknown').replace(/_/g, ' '),
    detail: 'Source state is not classified.',
    tone: colors.semantic.neutral,
    priority: 55,
    countsAsDebt: true,
  }
}

export function claimStateMeta(state: CoverageState | string): ClaimStateMeta {
  return CLAIM_STATE_META[state] ?? {
    label: String(state || 'unknown').replace(/_/g, ' '),
    detail: 'Claim state is not classified; keep it as evidence debt until mapped.',
    tone: colors.semantic.neutral,
    countsAsAnswer: false,
    countsAsDebt: true,
  }
}

export function scopeStateMeta(state?: ScopeState | string): ScopeStateMeta {
  return SCOPE_STATE_META[state || 'unstarted'] ?? {
    label: String(state || 'unstarted').replace(/_/g, ' '),
    detail: 'Scope state is not classified; keep it as evidence debt until mapped.',
    tone: colors.semantic.neutral,
    countsAsComplete: false,
    countsAsDebt: true,
  }
}

export function sourceNextAction(source: CoverageSource): string {
  if (source.missingEnvGroups?.length) return 'Connect credential'
  if (source.status === 'fresh') return 'Monitor'
  if (source.status === 'stale') return 'Refresh source'
  if (source.status === 'error') return 'Fix collection'
  if (source.status === 'unavailable') return 'Connect integration'
  if (source.status === 'disabled') return 'Enable source'
  if (source.status === 'not_collected') return 'Run collection'
  return 'Classify source'
}

export function summarizeSourceStatuses(sources: CoverageSource[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const source of sources) {
    counts[source.status] = (counts[source.status] ?? 0) + 1
  }
  return counts
}

export function coverageDebt(summary: ResourceCoverage): number {
  return summary.error + summary.stale + summary.notCollected
}

export function coverageDebtForResource(resource: CoverageResource): number {
  return coverageDebt(resource.summary)
}

export function answeredCoverage(summary: ResourceCoverage): number {
  return summary.present + summary.vendorEmpty + summary.notApplicable
}

export function answeredCoverageForResource(resource: CoverageResource): number {
  return answeredCoverage(resource.summary)
}

export function totalCoverage(summary: ResourceCoverage): number {
  return summary.present + summary.vendorEmpty + summary.notApplicable + summary.stale + summary.error + summary.notCollected
}

export function totalCoverageForResource(resource: CoverageResource): number {
  return totalCoverage(resource.summary)
}

export function resourceLabel(resource: CoverageResource): string {
  return resource.resource.displayName || resource.resource.canonicalValue || resource.resource.id
}

export function rankCoverageResources(resources: CoverageResource[]): CoverageResource[] {
  return [...resources].sort((a, b) => {
    const debtDelta = coverageDebtForResource(b) - coverageDebtForResource(a)
    if (debtDelta !== 0) return debtDelta
    const errorDelta = b.summary.error - a.summary.error
    if (errorDelta !== 0) return errorDelta
    const staleDelta = b.summary.stale - a.summary.stale
    if (staleDelta !== 0) return staleDelta
    return resourceLabel(a).localeCompare(resourceLabel(b))
  })
}

export function resourceCoverageVerdict(resource: CoverageResource): ResourceVerdict {
  const answered = answeredCoverageForResource(resource)
  const debt = coverageDebtForResource(resource)
  const total = totalCoverageForResource(resource)
  if (total === 0) {
    return {
      label: 'Evidence debt',
      detail: 'No resource-source pairs were returned; do not derive an asset coverage answer.',
      tone: colors.semantic.warning,
      kind: 'debt',
    }
  }
  if (debt === 0) {
    return {
      label: 'Answered',
      detail: `${answered}/${total} source pairs have explicit answers.`,
      tone: colors.semantic.success,
      kind: 'answered',
    }
  }
  if (answered === 0) {
    return {
      label: 'Evidence debt',
      detail: `0/${total} source pairs have explicit answers; collection or source repair is required.`,
      tone: colors.semantic.warning,
      kind: 'debt',
    }
  }
  return {
    label: 'Partial answer',
    detail: `${answered}/${total} source pairs have explicit answers; ${debt} evidence-debt pairs require collection or retry.`,
    tone: colors.semantic.warning,
    kind: 'partial',
  }
}

export function claimSummary(claim: CoverageClaim): string {
  const meta = claimStateMeta(claim.coverageState)
  return `${meta.label} / ${claim.field} / ${claim.valueKind} / confidence ${claim.confidence}`
}

export function sourceDebtScore(source: CoverageSource): number {
  const meta = sourceStatusMeta(source.status)
  const missingWeight = source.missingEnvGroups?.length ? -2 : 0
  return meta.priority + missingWeight
}

export function rankDebtSources(sources: CoverageSource[]): CoverageSource[] {
  return [...sources]
    .filter((source) => sourceStatusMeta(source.status).countsAsDebt)
    .sort((a, b) => sourceDebtScore(a) - sourceDebtScore(b) || a.label.localeCompare(b.label))
}

export function entityLabel(entity: CoverageEntity): string {
  return entity.displayName || entity.legalName || entity.canonicalValue || entity.id
}

export function entityDebtCount(entity: CoverageEntity): number {
  return entity.debt?.length ?? 0
}

export function entitySourceDebtCount(entity: CoverageEntity): number {
  return asArray(entity.sourceStates).reduce((sum, source) => sum + source.debtPairs, 0)
}

export function rankScopeEntities(entities?: CoverageEntity[] | null): CoverageEntity[] {
  return [...asArray(entities)].sort((a, b) => {
    const debtDelta = entityDebtCount(b) - entityDebtCount(a)
    if (debtDelta !== 0) return debtDelta
    if (a.required !== b.required) return a.required ? -1 : 1
    const sourceDebtDelta = entitySourceDebtCount(b) - entitySourceDebtCount(a)
    if (sourceDebtDelta !== 0) return sourceDebtDelta
    return entityLabel(a).localeCompare(entityLabel(b))
  })
}

export function topScopeDebtEntities(scope?: CoverageScope, limit = 5): CoverageEntity[] {
  if (!scope) return []
  return rankScopeEntities(scope.entities).filter((entity) => entityDebtCount(entity) > 0).slice(0, limit)
}

export function normalizeScopeRollup(scope?: CoverageScope): ScopeRollup {
  return {
    ...EMPTY_SCOPE_ROLLUP,
    ...(scope?.rollup ?? {}),
  }
}

export function scopeCompletenessPct(scope?: CoverageScope): number {
  const rollup = normalizeScopeRollup(scope)
  if (rollup.requiredEntities <= 0) return 0
  return pct(rollup.coveredEntities, rollup.requiredEntities)
}

export function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

export function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  return clampPct((numerator / denominator) * 100)
}

export function formatPct(value: number): string {
  return `${Math.round(clampPct(value))}%`
}

export function formatDateTime(value?: string): string {
  if (!value) return 'No timestamp'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
