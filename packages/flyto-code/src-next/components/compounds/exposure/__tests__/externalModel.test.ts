import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

import {
  kernelFindingToIntelIssue,
  kernelAssetsToIntelIssues,
  kernelAssetsToDomainBuildings,
  externalIssuesToSLAIssues,
  ctemPrioritiesToSLAViolations,
  externalThreatCountsFromCtem,
  formatOverdue,
  oldestSlaViolationDays,
  subdomainStats,
  peerPercentileBand,
} from '../externalModel'
import type { ExternalFinding, KernelAsset, OpenExternalIssue, SLAViolation } from '../shared'
import type { AttackSurfaceAsset, CTEMPriorityItem } from '@lib/engine'

function surfaceAsset(over: Partial<AttackSurfaceAsset> = {}): AttackSurfaceAsset {
  return { id: 'a', asset_type: 'subdomain', value: 'x', metadata: '{}', status: 'active', discovered_at: '', ...over }
}

function finding(over: Partial<ExternalFinding> = {}): ExternalFinding {
  return {
    id: 'f-1',
    category: 'frontend',
    severity: 'HIGH',
    title_key: 'external.dast.hsts_missing',
    desc_key: 'external.dast.hsts_missing.desc',
    ...over,
  }
}

function asset(over: Partial<KernelAsset> = {}): KernelAsset {
  return {
    resource_id: 'krn:external:domain:example.com',
    type: 'domain',
    canonical_value: 'example.com',
    sources: ['attack_surface'],
    confidence: 95,
    ...over,
  }
}

describe('kernelFindingToIntelIssue', () => {
  it('projects severity to lowercase and resolves i18n keys via tOr', () => {
    const row = kernelFindingToIntelIssue('example.com', finding())
    expect(row).toEqual({
      domain: 'example.com',
      category: 'frontend',
      severity: 'high',
      description: 'external.dast.hsts_missing',
      est_fix_time: '—',
      recommendation: 'external.dast.hsts_missing.desc',
    })
  })
})

describe('kernelAssetsToIntelIssues', () => {
  it('returns [] for undefined input', () => {
    expect(kernelAssetsToIntelIssues(undefined)).toEqual([])
  })

  it('returns [] when no asset has findings', () => {
    expect(kernelAssetsToIntelIssues([asset(), asset({ resource_id: 'krn:b', canonical_value: 'b.com' })])).toEqual([])
  })

  it('flattens findings across multiple assets, anchoring each to its parent canonical_value', () => {
    const a = asset({ findings: [finding({ id: 'f-a' })] })
    const b = asset({
      resource_id: 'krn:b', canonical_value: 'sub.example.com',
      findings: [finding({ id: 'f-b1' }), finding({ id: 'f-b2', severity: 'CRITICAL' })],
    })
    const rows = kernelAssetsToIntelIssues([a, b])
    expect(rows).toHaveLength(3)
    expect(rows[0].domain).toBe('example.com')
    expect(rows[1].domain).toBe('sub.example.com')
    expect(rows[2].severity).toBe('critical')
  })
})

describe('kernelAssetsToDomainBuildings', () => {
  it('returns [] for undefined input', () => {
    expect(kernelAssetsToDomainBuildings(undefined)).toEqual([])
  })

  it('falls back to canonical_value for name when display_name absent, dash grade when score missing (no-score case)', () => {
    const rows = kernelAssetsToDomainBuildings([asset()])
    expect(rows[0]).toMatchObject({
      id: 'krn:external:domain:example.com',
      kind: 'domain',
      name: 'example.com',
      score: 0,
      grade: '-',
    })
  })

  it('counts CRITICAL findings only', () => {
    const a = asset({
      score: 71, grade: 'C', display_name: 'Example',
      findings: [
        finding({ severity: 'CRITICAL' }),
        finding({ severity: 'CRITICAL' }),
        finding({ severity: 'HIGH' }),
      ],
    })
    const [row] = kernelAssetsToDomainBuildings([a])
    expect(row.name).toBe('Example')
    expect(row.score).toBe(71)
    expect(row.grade).toBe('C')
    expect(row.criticalCount).toBe(2)
    expect(row.size).toBe(1 + 3 + 1) // sources(1) + findings(3) + 1
  })
})

describe('externalIssuesToSLAIssues', () => {
  it('returns [] for undefined input', () => {
    expect(externalIssuesToSLAIssues(undefined)).toEqual([])
  })

  it('lowercases severity', () => {
    const open: OpenExternalIssue = {
      id: 'oei-1', org_id: 'org-1',
      domain: 'example.com', category: 'frontend',
      description: 'HSTS not enforced', severity: 'HIGH',
      fingerprint: 'fp-1', first_seen_at: '2026-05-10T00:00:00Z',
    }
    expect(externalIssuesToSLAIssues([open])[0].severity).toBe('high')
  })
})

function priority(over: Partial<CTEMPriorityItem> = {}): CTEMPriorityItem {
  return {
    kind: 'external',
    id: 'pri-1',
    fingerprint: 'fp-1',
    title: 'HSTS not enforced',
    description: '',
    severity: 'HIGH',
    effective_severity: 'HIGH',
    priority_score: 80,
    category: 'frontend',
    domain: 'example.com',
    asset_tier: 'crown_jewel',
    kev_listed: false,
    epss_score: 0,
    mitigation_factor: 1,
    sla_hours: 72,
    breached: true,
    verification_state: 'verified',
    first_seen_at: '2026-05-01T00:00:00Z',
    ...over,
  } as CTEMPriorityItem
}

describe('ctemPrioritiesToSLAViolations', () => {
  it('returns [] for undefined input', () => {
    expect(ctemPrioritiesToSLAViolations(undefined)).toEqual([])
  })

  it('filters out kind=code rows even when breached', () => {
    expect(ctemPrioritiesToSLAViolations([priority({ kind: 'code' })])).toEqual([])
  })

  it('filters out non-breached external rows', () => {
    expect(ctemPrioritiesToSLAViolations([priority({ breached: false })])).toEqual([])
  })

  it('falls back to `title` when description is empty', () => {
    const row = ctemPrioritiesToSLAViolations([priority({ description: '' })])[0]
    expect(row.description).toBe('HSTS not enforced')
  })
})

describe('externalThreatCountsFromCtem', () => {
  it('returns zeros for undefined / empty input', () => {
    expect(externalThreatCountsFromCtem(undefined)).toEqual({ kev: 0, threatActor: 0, crownJewel: 0 })
    expect(externalThreatCountsFromCtem([])).toEqual({ kev: 0, threatActor: 0, crownJewel: 0 })
  })

  it('counts independent flags — a single row can contribute to multiple tiles', () => {
    // The `priority()` fixture defaults `asset_tier: 'crown_jewel'`,
    // so non-crown rows MUST set the tier explicitly otherwise this
    // test silently degrades to "every row is a crown jewel" and
    // stops exercising the filter.
    const counts = externalThreatCountsFromCtem([
      priority({ id: 'a', kev_listed: true,  asset_tier: 'crown_jewel' }),
      priority({ id: 'b', threat_actor: 'APT-29', asset_tier: 'customer_facing' }),
      priority({ id: 'c', kev_listed: true, threat_actor: 'APT-29', asset_tier: 'crown_jewel' }),
      priority({ id: 'd', asset_tier: 'internal' }),
    ])
    expect(counts).toEqual({ kev: 2, threatActor: 2, crownJewel: 2 })
  })

  it('does not filter out code-kind rows (caller decides scope)', () => {
    // Today's call-site passes only the org-wide CTEM priorities and
    // those happen to include both kinds; the adapter counts flags
    // wherever the engine set them. If a future caller wants
    // external-only counts they should filter upstream OR we add a
    // dedicated `externalThreatCountsFromExternalCtem` variant.
    expect(externalThreatCountsFromCtem([
      priority({ id: 'code', kind: 'code', kev_listed: true }),
    ]).kev).toBe(1)
  })
})

describe('formatOverdue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-29T12:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('returns empty string for undefined input', () => {
    expect(formatOverdue(undefined)).toBe('')
  })

  it('returns empty string for unparseable input', () => {
    expect(formatOverdue('not-a-date')).toBe('')
  })

  it('returns hours when under 24h since breach moment', () => {
    expect(formatOverdue('2026-05-29T07:00:00Z')).toBe('5h')
  })

  it('returns days when 24h or more since breach moment', () => {
    expect(formatOverdue('2026-05-26T12:00:00Z')).toBe('3d')
  })
})

describe('oldestSlaViolationDays', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-29T00:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  function v(detected_at: string, over: Partial<SLAViolation> = {}): SLAViolation {
    return {
      domain: 'example.com', category: 'frontend',
      description: '...', severity: 'HIGH',
      detected_at,
      sla_hours: 72, overdue_by: '', fix_guide: '',
      ...over,
    }
  }

  it('returns 0 for undefined / empty input', () => {
    expect(oldestSlaViolationDays(undefined)).toBe(0)
    expect(oldestSlaViolationDays([])).toBe(0)
  })

  it('returns the oldest day-distance across multiple violations', () => {
    expect(oldestSlaViolationDays([
      v('2026-05-26T00:00:00Z'), // 3 days
      v('2026-05-20T00:00:00Z'), // 9 days — should win
      v('2026-05-28T00:00:00Z'), // 1 day
    ])).toBe(9)
  })

  it('skips violations with unparseable detected_at', () => {
    expect(oldestSlaViolationDays([
      v('garbage'),
      v('2026-05-27T00:00:00Z'), // 2 days
    ])).toBe(2)
  })
})

describe('subdomainStats', () => {
  it('returns zeros for undefined / empty input', () => {
    expect(subdomainStats(undefined)).toEqual({ totalSubdomains: 0, resolvingSubdomains: 0, totalAssets: 0 })
    expect(subdomainStats([])).toEqual({ totalSubdomains: 0, resolvingSubdomains: 0, totalAssets: 0 })
  })

  it('counts subdomains and only the resolving ones', () => {
    const stats = subdomainStats([
      surfaceAsset({ asset_type: 'subdomain', metadata: '{"resolves":true}' }),
      surfaceAsset({ asset_type: 'subdomain', metadata: '{"resolves":false}' }),
      surfaceAsset({ asset_type: 'subdomain', metadata: '{}' }),       // no resolves key → non-resolving
      surfaceAsset({ asset_type: 'domain', metadata: '{"resolves":true}' }), // not a subdomain
      surfaceAsset({ asset_type: 'port_scan', metadata: '{}' }),
    ])
    expect(stats).toEqual({ totalSubdomains: 3, resolvingSubdomains: 1, totalAssets: 5 })
  })

  it('treats malformed metadata as non-resolving without throwing', () => {
    const stats = subdomainStats([
      surfaceAsset({ asset_type: 'subdomain', metadata: 'not json' }),
      surfaceAsset({ asset_type: 'subdomain', metadata: '' }),
    ])
    expect(stats).toEqual({ totalSubdomains: 2, resolvingSubdomains: 0, totalAssets: 2 })
  })
})

describe('peerPercentileBand', () => {
  const full = { 25: { value: 40 }, 50: { value: 55 }, 75: { value: 70 }, 90: { value: 82 }, 95: { value: 90 } }

  it('returns null when fewer than P50+P90 anchors exist', () => {
    expect(peerPercentileBand(80, {})).toBeNull()
    expect(peerPercentileBand(80, { 50: { value: 55 } })).toBeNull()       // missing P90
    expect(peerPercentileBand(80, { 90: { value: 82 } })).toBeNull()       // missing P50
  })

  it('buckets a score against the distribution', () => {
    expect(peerPercentileBand(95, full)?.label).toBe('Top 5%')
    expect(peerPercentileBand(85, full)?.label).toBe('Top 10%')   // >=P90, <P95
    expect(peerPercentileBand(72, full)?.label).toBe('Top 25%')   // >=P75, <P90
    expect(peerPercentileBand(60, full)?.label).toBe('Above sector P50')
    expect(peerPercentileBand(45, full)?.label).toBe('Bottom 50%') // >=P25, <P50
    expect(peerPercentileBand(10, full)?.label).toBe('Bottom 25%')
  })

  it('falls back gracefully when only P50+P90 are present', () => {
    const sparse = { 50: { value: 55 }, 90: { value: 82 } }
    expect(peerPercentileBand(90, sparse)?.label).toBe('Top 10%')  // >=P90 (no P95 anchor)
    expect(peerPercentileBand(60, sparse)?.label).toBe('Above sector P50')
    expect(peerPercentileBand(20, sparse)?.label).toBe('Bottom 25%') // no P25 anchor → bottom bucket
  })
})
