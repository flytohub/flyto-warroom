import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
// The audit script is plain Node ESM (excluded from the build tsconfig); we only
// consume its pure, exported loop-island helpers here.
// @ts-expect-error - .mjs script has no type declarations
import { detectLoopIslands, validateLoopWaiver } from '../../../scripts/audit-navbar-smoke-registry.mjs'

const FIVE_ISLANDS = ['containers', 'vuln_mgmt', 'sensor_map', 'brand_protection', 'botshield']

// A platform-loop registry that has the surfaces but is MISSING the five
// modules - the exact "isolated page" regression H1 must catch.
const REGISTRY_WITHOUT_ISLANDS = {
  surfaces: [
    { id: 'code_redteam', modules: ['issues', 'pentest', 'autofix', 'architecture', 'code-scans'] },
    { id: 'darkweb', modules: ['threat_actors', 'malware_families', 'ransomware_incidents', 'data_leaks', 'ioc_lookup'] },
  ],
}

const ISLAND_ROUTES = [
  { id: 'containers', moduleId: 'containers', surface: 'code_redteam' },
  { id: 'vuln_mgmt', moduleId: 'vuln_mgmt', surface: 'code_redteam' },
  { id: 'sensor_map', moduleId: 'sensor_map', surface: 'darkweb' },
  { id: 'brand_protection', moduleId: 'brand_protection', surface: 'darkweb' },
  { id: 'botshield', moduleId: 'botshield', surface: 'darkweb' },
]

const NOW = new Date('2026-06-07T00:00:00Z')

describe('navbar smoke loop-island detection (H1)', () => {
  it('flags every route whose module is not wired into its surface platform-loop', () => {
    const failures = detectLoopIslands(ISLAND_ROUTES, REGISTRY_WITHOUT_ISLANDS, NOW)
    const flagged = failures.filter((f: { kind: string }) => f.kind === 'loop_island').map((f: { route: string }) => f.route)
    for (const island of FIVE_ISLANDS) {
      expect(flagged, `expected ${island} to be flagged as a loop island`).toContain(island)
    }
    expect(flagged).toHaveLength(FIVE_ISLANDS.length)
  })

  it('passes once the modules are absorbed into the loop', () => {
    const registry = {
      surfaces: [
        { id: 'code_redteam', modules: ['issues', 'pentest', 'autofix', 'architecture', 'code-scans', 'containers', 'vuln_mgmt'] },
        { id: 'darkweb', modules: ['threat_actors', 'malware_families', 'ransomware_incidents', 'data_leaks', 'ioc_lookup', 'sensor_map', 'brand_protection', 'botshield'] },
      ],
    }
    expect(detectLoopIslands(ISLAND_ROUTES, registry, NOW)).toHaveLength(0)
  })

  it('does not let route.surface validity alone satisfy the loop check', () => {
    // surface is valid (exists in registry) but the module is still an island.
    const failures = detectLoopIslands(
      [{ id: 'containers', moduleId: 'containers', surface: 'code_redteam' }],
      REGISTRY_WITHOUT_ISLANDS,
      NOW,
    )
    expect(failures).toHaveLength(1)
    expect(failures[0].kind).toBe('loop_island')
  })

  it('honors a well-formed, unexpired structured waiver', () => {
    const routes = [{
      id: 'containers',
      moduleId: 'containers',
      surface: 'code_redteam',
      loopWaiver: { reason: 'loop work tracked in FLYA-X', expiry: '2026-12-31', ownedBy: 'platform' },
    }]
    expect(detectLoopIslands(routes, REGISTRY_WITHOUT_ISLANDS, NOW)).toHaveLength(0)
  })

  it('rejects an expired waiver', () => {
    const routes = [{
      id: 'containers',
      moduleId: 'containers',
      surface: 'code_redteam',
      loopWaiver: { reason: 'stale', expiry: '2025-01-01', ownedBy: 'platform' },
    }]
    const failures = detectLoopIslands(routes, REGISTRY_WITHOUT_ISLANDS, NOW)
    expect(failures.some((f: { kind: string }) => f.kind === 'loop_waiver')).toBe(true)
    expect(failures.some((f: { kind: string }) => f.kind === 'loop_island')).toBe(true)
  })

  it('rejects a malformed waiver (missing ownedBy)', () => {
    const result = validateLoopWaiver(
      { id: 'containers', loopWaiver: { reason: 'x', expiry: '2026-12-31' } },
      NOW,
    )
    expect(result.active).toBe(false)
    expect(result.failures.some((f: { detail: string }) => f.detail.includes('ownedBy'))).toBe(true)
  })

  it('regression guard: the real shipped registries contain zero loop islands', () => {
    const root = process.cwd()
    const navbar = JSON.parse(
      fs.readFileSync(path.join(root, 'docs/platform-loops/navbar-smoke-registry.json'), 'utf8'),
    )
    const loops = JSON.parse(
      fs.readFileSync(path.join(root, 'docs/platform-loops/platform-loop-registry.json'), 'utf8'),
    )
    expect(detectLoopIslands(navbar.routes, loops, NOW)).toHaveLength(0)
  })
})
