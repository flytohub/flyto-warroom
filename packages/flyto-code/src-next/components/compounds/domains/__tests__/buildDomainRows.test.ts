import { describe, it, expect, vi } from 'vitest'

// Mock i18n before importing the module under test
vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

import { buildDomainRows, flattenAttackSurfaceAssets } from '../buildDomainRows'
import type { AttackSurfaceAsset, PentestProject } from '@lib/engine'

function makeProject(overrides: Partial<PentestProject> = {}): PentestProject {
  return {
    id: 'pt-1',
    org_id: 'org-1',
    name: 'Test',
    target_url: 'https://example.com',
    project_type: 'frontend',
    status: 'active',
    config: '{}',
    last_scan_at: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeAsset(overrides: Partial<AttackSurfaceAsset> = {}): AttackSurfaceAsset {
  return {
    id: 'a-1',
    asset_type: 'subdomain',
    value: 'api.example.com',
    metadata: '{}',
    status: 'active',
    discovered_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('buildDomainRows', () => {
  it('returns empty for no data', () => {
    const result = buildDomainRows([], [])
    expect(result).toEqual([])
  })

  it('creates rows from projects', () => {
    const projects = [makeProject()]
    const result = buildDomainRows([], projects)
    expect(result).toHaveLength(1)
    expect(result[0].domain).toBe('example.com')
    expect(result[0].url).toBe('https://example.com')
    expect(result[0].project).toBe(projects[0])
  })

  it('adds resolving subdomains', () => {
    const assets = [
      makeAsset({ id: 'a-sub', value: 'sub.example.com', asset_type: 'subdomain', metadata: '{"resolves": true}' }),
    ]
    const result = buildDomainRows(assets, [])
    expect(result).toHaveLength(1)
    expect(result[0].domain).toBe('sub.example.com')
  })

  // Pin the contract that broke once: a discovered subdomain MUST
  // inherit its parent's pentest project, otherwise the AI / verify
  // tabs render "尚未綁定專案" because the row carries no projectId.
  // If this regresses (e.g. someone refactors buildDomainRows to drop
  // the projectsByID lookup), this test fails loudly before the bug
  // ships.
  it('attaches parent project to discovered subdomains by project_id', () => {
    const projects = [makeProject({ id: 'pt-parent', target_url: 'https://example.com' })]
    const assets = [
      makeAsset({
        id: 'a-sub',
        value: 'api.example.com',
        asset_type: 'subdomain',
        metadata: '{"resolves": true}',
        project_id: 'pt-parent',
      }),
    ]
    const result = buildDomainRows(assets, projects)
    const sub = result.find(r => r.domain === 'api.example.com')
    expect(sub).toBeDefined()
    expect(sub!.project).toBe(projects[0])
    expect(sub!.project?.id).toBe('pt-parent')
  })

  it('keeps subdomain row but without project when project_id is missing', () => {
    // Defensive — older rows without project_id should still render,
    // just without the AI tab. Regression guard for the fallback path.
    const assets = [
      makeAsset({
        id: 'a-orphan',
        value: 'orphan.example.com',
        asset_type: 'subdomain',
        metadata: '{"resolves": true}',
        // project_id intentionally omitted
      }),
    ]
    const result = buildDomainRows(assets, [])
    const sub = result.find(r => r.domain === 'orphan.example.com')
    expect(sub).toBeDefined()
    expect(sub!.project).toBeUndefined()
  })

  it('generates HTTP issues from missing headers', () => {
    const projects = [makeProject()]
    const assets = [
      makeAsset({
        id: 'a-http',
        value: 'example.com',
        asset_type: 'http_endpoint',
        metadata: JSON.stringify({
          scheme: 'https',
          status: 200,
          headers: {},  // no security headers set
        }),
      }),
    ]
    const result = buildDomainRows(assets, projects)
    expect(result).toHaveLength(1)
    // Missing HSTS, CSP, X-Content-Type-Options, X-Frame-Options should generate issues
    const issueTitles = result[0].issues.map(i => i.title)
    expect(issueTitles).toContain('TLS not enforced with valid HSTS header')
    expect(issueTitles).toContain('Content Security Policy (CSP) header not set')
    expect(result[0].issues.length).toBeGreaterThanOrEqual(3)
  })

  it('skips non-resolving subdomains', () => {
    const assets = [
      makeAsset({ value: 'nohost.example.com', asset_type: 'subdomain', metadata: '{"resolves": false}' }),
    ]
    const result = buildDomainRows(assets, [])
    expect(result).toHaveLength(0)
  })

  it('sorts by issue count descending', () => {
    const projects = [
      makeProject({ id: 'pt-1', target_url: 'https://safe.com', name: 'Safe' }),
      makeProject({ id: 'pt-2', target_url: 'https://risky.com', name: 'Risky' }),
    ]
    const assets = [
      // risky.com has HTTPS endpoint missing all headers
      makeAsset({
        id: 'a-risky',
        value: 'risky.com',
        asset_type: 'http_endpoint',
        metadata: JSON.stringify({ scheme: 'https', status: 200, headers: {} }),
      }),
    ]
    const result = buildDomainRows(assets, projects)
    expect(result.length).toBeGreaterThanOrEqual(2)
    // risky.com should be first (more issues) or equal
    const riskyIdx = result.findIndex(r => r.domain === 'risky.com')
    const safeIdx = result.findIndex(r => r.domain === 'safe.com')
    expect(riskyIdx).toBeLessThan(safeIdx)
  })

  it('uses kernel findings and score when kernel assets are provided', () => {
    const projects = [makeProject()]
    const assets = [
      makeAsset({
        id: 'a-http',
        value: 'example.com',
        asset_type: 'http_endpoint',
        metadata: JSON.stringify({ scheme: 'https', status: 200, headers: {} }),
      }),
    ]

    const result = buildDomainRows(assets, projects, undefined, [{
      resource_id: 'krn:external:domain:example.com',
      type: 'domain',
      canonical_value: 'example.com',
      sources: ['attack_surface'],
      confidence: 1,
      score: 91,
      grade: 'A',
      last_scanned: '2024-01-02T00:00:00Z',
      findings: [{
        id: 'finding-1',
        category: 'frontend',
        severity: 'HIGH',
        title_key: 'kernel.hsts',
        desc_key: 'kernel.hsts.desc',
      }],
    }])

    expect(result).toHaveLength(1)
    expect(result[0].score).toBe(91)
    expect(result[0].grade).toBe('A')
    expect(result[0].issues).toEqual([{
      title: 'kernel.hsts',
      desc: 'kernel.hsts.desc',
      severity: 'HIGH',
      category: 'frontend',
    }])
  })

  it('flattens nested attack-surface evidence into detail assets', () => {
    const nested = makeAsset({
      id: 'a-http',
      asset_type: 'http_endpoint',
      value: 'https://api.example.com',
      metadata: JSON.stringify({ scheme: 'https', headers: { Server: 'nginx' } }),
      resource_id: 'kr-api',
    })
    const domain = makeAsset({
      id: 'kr-api',
      asset_type: 'subdomain',
      value: 'api.example.com',
      metadata: '{}',
      resource_id: 'kr-api',
      assets: [nested],
    })

    const assets = flattenAttackSurfaceAssets([domain])
    const result = buildDomainRows(assets, [], undefined, [{
      resource_id: 'kr-api',
      type: 'subdomain',
      canonical_value: 'api.example.com',
      sources: ['kernel'],
      confidence: 90,
      findings: [],
    }])

    expect(assets.map(a => a.asset_type)).toEqual(['subdomain', 'http_endpoint'])
    expect(result).toHaveLength(1)
    expect(result[0].assets.some(a => a.asset_type === 'http_endpoint')).toBe(true)
  })
})
