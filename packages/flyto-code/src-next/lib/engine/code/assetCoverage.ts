import { request } from '../client'

type FutureString<T extends string> = T | (string & {})

export type CoverageState = FutureString<
  | 'present'
  | 'absent_vendor_empty'
  | 'not_applicable'
  | 'stale'
  | 'error'
  | 'absent_not_collected'
>

export type SourceStatus = FutureString<
  | 'fresh'
  | 'stale'
  | 'error'
  | 'unavailable'
  | 'disabled'
  | 'not_collected'
  | 'unknown'
>

export interface SourceCapability {
  id: string
  providerId: string
  integrationId: string
  label: string
  surface: string
  component: string
  collectionMode: string
  coverageField: string
  outputGroups: string[]
  requiredEnvGroups?: string[]
  freshnessSlaHours: number
  noisePolicy: string
}

export interface CoveragePolicy {
  resourceInclusion: string
  candidateHandling: string
  uncertaintyRendering: string
  absentNotCollectedMeaning: string
  unavailableSourceTreatment: string
}

export interface CoverageRollup {
  confirmedResources: number
  quarantinedCandidates: number
  sourceCount: number
  sourceStatusCounts: Record<string, number>
  claimStateCounts: Record<string, number>
  totalResourceSourcePairs: number
  answeredPairs: number
  presentPairs: number
  vendorEmptyPairs: number
  notApplicablePairs: number
  errorPairs: number
  stalePairs: number
  unavailablePairs: number
  notCollectedPairs: number
  uncertaintyDebtPairs: number
  uncertaintyDebtPercentage: number
}

export interface CoverageSource extends SourceCapability {
  status: SourceStatus
  freshnessStatus?: string
  missingEnvGroups?: string[]
  lastSuccessAt?: string
  lastAttemptAt?: string
  staleAfterSecs?: number
  detail?: string
  caveat?: string
}

export interface ResourceView {
  id: string
  category: string
  type: string
  canonicalValue: string
  displayName?: string
  status: string
  reviewStatus: string
  confidenceScore: number
  lastSeenAt: string
  lastScannedAt?: string
}

export interface ResourceCoverage {
  present: number
  vendorEmpty: number
  notApplicable: number
  stale: number
  error: number
  notCollected: number
}

export interface CoverageClaim {
  id: string
  resourceId: string
  field: string
  sourceId: string
  sourceIntegrationId: string
  sourceLabel: string
  coverageState: CoverageState
  valueKind: string
  value?: string
  confidence: number
  observedAt: string
  mappingVersion: string
}

export interface CoverageResource {
  resource: ResourceView
  summary: ResourceCoverage
  claims: CoverageClaim[]
  caveats?: string[]
  meta?: Record<string, string>
}

export interface QuarantineResource {
  resource: ResourceView
  certainty: string
  reason: string
}

export type ScopeState = FutureString<'complete' | 'incomplete' | 'unstarted' | 'error'>

export interface ScopeRollup {
  requiredEntities: number
  coveredEntities: number
  entitiesWithDebt: number
  candidateEntities: number
  unlinkedResources: number
  quarantinedAssets: number
  scopeDebtItems: number
  scopeDebtPercentage: number
  totalEntitySourceRows: number
  entitySourceDebtRows: number
}

export interface EntitySourceState {
  sourceId: string
  sourceLabel: string
  status: SourceStatus
  totalPairs: number
  answeredPairs: number
  debtPairs: number
}

export interface ScopeDebtItem {
  kind: string
  severity: string
  message: string
  nextAction: string
  entityId?: string
  resourceId?: string
  sourceId?: string
}

export interface ScopeEvidence {
  kind: string
  sourceId?: string
  reference?: string
  confidence?: number
}

export interface CoverageEntity {
  id: string
  parentId?: string
  kind: string
  legalName: string
  displayName?: string
  canonicalValue: string
  status: string
  verificationState: string
  required: boolean
  aliases?: string[]
  seedDomains?: string[]
  sourceStates: EntitySourceState[]
  resources: ResourceView[]
  debt?: ScopeDebtItem[]
  evidence?: ScopeEvidence[]
  caveats?: string[]
}

export interface CoverageScope {
  state: ScopeState
  rollup: ScopeRollup
  entities: CoverageEntity[]
  unlinkedResources?: ResourceView[]
  caveats?: string[]
}

export interface AssetCoverageResponse {
  orgId: string
  generatedAt: string
  policy: CoveragePolicy
  rollup: CoverageRollup
  scope?: CoverageScope
  sources: CoverageSource[]
  resources: CoverageResource[]
  quarantine: QuarantineResource[]
  caveats?: string[]
  meta?: Record<string, unknown>
}

export interface GetAssetCoverageOptions {
  category?: string
  resourceId?: string
  entityId?: string
  includeScope?: boolean
}

export function getAssetCoverage(
  orgId: string,
  opts: GetAssetCoverageOptions = {},
): Promise<AssetCoverageResponse> {
  const params = new URLSearchParams()
  if (opts.category) params.set('category', opts.category)
  if (opts.resourceId) params.set('resourceId', opts.resourceId)
  if (opts.entityId) params.set('entityId', opts.entityId)
  if (opts.includeScope === false) params.set('includeScope', 'false')
  const qs = params.toString()
  return request<AssetCoverageResponse>(
    'GET',
    `/api/v1/code/orgs/${orgId}/asset-coverage${qs ? `?${qs}` : ''}`,
  )
}

export function getAssetCoverageResource(
  orgId: string,
  resourceId: string,
): Promise<AssetCoverageResponse> {
  return request<AssetCoverageResponse>(
    'GET',
    `/api/v1/code/orgs/${orgId}/asset-coverage/resources/${encodeURIComponent(resourceId)}`,
  )
}
