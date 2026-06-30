import { describe, expect, it } from 'vitest'

import type { CoverageEntity, CoverageResource, CoverageScope, CoverageSource } from '@lib/engine/code/assetCoverage'
import {
  claimStateMeta,
  entityDebtCount,
  entitySourceDebtCount,
  rankScopeEntities,
  formatPct,
  normalizeScopeRollup,
  pct,
  rankDebtSources,
  resourceCoverageVerdict,
  scopeCompletenessPct,
  scopeStateMeta,
  sourceNextAction,
  sourceStatusMeta,
  topScopeDebtEntities,
} from '../coverageModel'

function source(id: string, status: CoverageSource['status'], missingEnvGroups: string[] = []): CoverageSource {
  return {
    id,
    providerId: 'flyto',
    integrationId: `flyto:${id}`,
    label: id,
    surface: 'external',
    component: 'footprint',
    collectionMode: 'public_api',
    coverageField: `coverage.${id}`,
    outputGroups: ['domain'],
    freshnessSlaHours: 24,
    noisePolicy: 'unknown_error_stale_unavailable_are_never_asserted_as_clean',
    status,
    missingEnvGroups,
  }
}

function resource(id: string, summary: Partial<CoverageResource['summary']>): CoverageResource {
  return {
    resource: {
      id,
      category: 'domain',
      type: 'hostname',
      canonicalValue: id,
      status: 'active',
      reviewStatus: 'auto_confirmed',
      confidenceScore: 95,
      lastSeenAt: '2026-06-17T00:00:00Z',
    },
    summary: {
      present: 0,
      vendorEmpty: 0,
      notApplicable: 0,
      stale: 0,
      error: 0,
      notCollected: 0,
      ...summary,
    },
    claims: [],
  }
}

function entity(id: string, debt: number, required = true): CoverageEntity {
  return {
    id,
    kind: 'organization',
    legalName: id,
    canonicalValue: id,
    status: 'active',
    verificationState: 'confirmed',
    required,
    sourceStates: [],
    resources: [],
    debt: Array.from({ length: debt }).map((_, idx) => ({
      kind: `debt-${idx}`,
      severity: 'high',
      message: 'Required entity has no confirmed linked assets.',
      nextAction: 'Seed or confirm owned domains.',
      entityId: id,
    })),
  }
}

describe('coverageModel', () => {
  it('formats percentages defensively for empty and out-of-range rollups', () => {
    expect(pct(0, 0)).toBe(0)
    expect(pct(7, 4)).toBe(100)
    expect(formatPct(Number.NaN)).toBe('0%')
  })

  it('treats future or unknown source statuses as debt instead of clean absence', () => {
    const meta = sourceStatusMeta('paused_by_provider')

    expect(meta.countsAsDebt).toBe(true)
    expect(meta.label).toBe('paused by provider')
  })

  it('prioritizes blocked collection sources before lower-risk debt', () => {
    expect(rankDebtSources([
      source('stale-cert-log', 'stale'),
      source('fresh-crtsh', 'fresh'),
      source('missing-shodan', 'error', ['SHODAN_API_KEY']),
      source('unknown-feed', 'unknown'),
    ]).map((s) => s.id)).toEqual([
      'missing-shodan',
      'stale-cert-log',
      'unknown-feed',
    ])
  })

  it('returns deterministic next actions for every source status', () => {
    expect(sourceNextAction(source('ok', 'fresh'))).toBe('Monitor')
    expect(sourceNextAction(source('old', 'stale'))).toBe('Refresh source')
    expect(sourceNextAction(source('blocked', 'error', ['SHODAN_API_KEY']))).toBe('Connect credential')
    expect(sourceNextAction(source('future', 'paused_by_provider'))).toBe('Classify source')
  })

  it('classifies resource coverage without turning debt into answers', () => {
    expect(resourceCoverageVerdict(resource('answered.example.com', { present: 1, vendorEmpty: 1 })).label).toBe('Answered')
    expect(resourceCoverageVerdict(resource('partial.example.com', { present: 1, stale: 1 })).label).toBe('Partial answer')
    expect(resourceCoverageVerdict(resource('blocked.example.com', { error: 1, notCollected: 1 })).label).toBe('Evidence debt')
  })

  it('keeps unmapped claim states as evidence debt', () => {
    expect(claimStateMeta('present').countsAsAnswer).toBe(true)
    expect(claimStateMeta('absent_not_collected').countsAsDebt).toBe(true)
    expect(claimStateMeta('provider_paused').countsAsDebt).toBe(true)
  })

  it('keeps incomplete or unknown scope states as debt', () => {
    expect(scopeStateMeta('complete').countsAsComplete).toBe(true)
    expect(scopeStateMeta('incomplete').countsAsDebt).toBe(true)
    expect(scopeStateMeta('provider_paused').countsAsDebt).toBe(true)
  })

  it('ranks required entities with scope debt first', () => {
    expect(rankScopeEntities([
      entity('covered-bank', 0),
      entity('candidate-brand', 2, false),
      entity('missing-insurance', 1),
    ]).map((row) => row.id)).toEqual(['candidate-brand', 'missing-insurance', 'covered-bank'])
    expect(entityDebtCount(entity('missing-life', 2))).toBe(2)
  })

  it('keeps partial scope responses renderable instead of throwing', () => {
    const partialScope = {
      state: 'incomplete',
      rollup: {
        requiredEntities: 2,
        coveredEntities: 1,
      },
    } as unknown as CoverageScope
    const partialEntity = {
      ...entity('partial-bank', 1),
      sourceStates: undefined,
    } as unknown as CoverageEntity

    expect(rankScopeEntities(undefined)).toEqual([])
    expect(topScopeDebtEntities(partialScope)).toEqual([])
    expect(scopeCompletenessPct(partialScope)).toBe(50)
    expect(normalizeScopeRollup({ state: 'incomplete' } as unknown as CoverageScope).requiredEntities).toBe(0)
    expect(entitySourceDebtCount(partialEntity)).toBe(0)
  })

  it('computes scope completeness only from declared required entities', () => {
    expect(scopeCompletenessPct(undefined)).toBe(0)
    expect(scopeCompletenessPct({
      state: 'incomplete',
      rollup: {
        requiredEntities: 4,
        coveredEntities: 3,
        entitiesWithDebt: 1,
        candidateEntities: 0,
        unlinkedResources: 0,
        quarantinedAssets: 0,
        scopeDebtItems: 1,
        scopeDebtPercentage: 25,
        totalEntitySourceRows: 4,
        entitySourceDebtRows: 1,
      },
      entities: [],
    })).toBe(75)
  })
})
