/**
 * Unit tests for the Pulse dimension-presence entitlement filter.
 *
 * These cover the P1-FE mode-awareness fix: missing_sources from the engine
 * is unfiltered by entitlement (the backend is the single source of truth for
 * "no findings from X"), so the FE must drop dimensions the org isn't entitled
 * to before labelling them "Silent". A code-only org must NOT be told "Attack
 * surface — Silent"; an external-only org must NOT be told "Code — Silent".
 *
 * NO FAKE DATA: the filter only ever REMOVES entries — it never invents a
 * dimension. Every value tested here originates from a real engine
 * missing_sources[] payload + the real server-authored capabilities contract.
 */
import { describe, it, expect } from 'vitest'

// i18n is pulled in transitively by PulseView's module graph; stub it so the
// import doesn't try to hit the CDN cache at test time.
import { vi } from 'vitest'
vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

import { sourceToPageId, visibleMissingSources } from '../PulseView'
import type { CapabilityHelpers } from '@hooks/useCapabilities'

/** Build a minimal CapabilityHelpers double with an explicit visible-pages set. */
function caps(ready: boolean, visiblePages: string[]): CapabilityHelpers {
  const pageSet = new Set(visiblePages)
  return {
    ready,
    isLoading: !ready,
    isError: false,
    canSeePage: (page: string) => (ready ? pageSet.has(page) : true),
    canDoAction: (action: string) => ready && action === 'finding:update',
    hasFeature: (feature: string) => ready && visiblePages.includes(feature),
  }
}

describe('sourceToPageId', () => {
  it('maps code-tier dimensions to the issues page', () => {
    expect(sourceToPageId('alert')).toBe('issues')
    expect(sourceToPageId('container')).toBe('issues')
    expect(sourceToPageId('iac')).toBe('issues')
    expect(sourceToPageId('license')).toBe('issues')
  })

  it('maps external / pentest / cloud / identity / leak dimensions', () => {
    expect(sourceToPageId('dast')).toBe('domains')
    expect(sourceToPageId('pentest')).toBe('pentest')
    expect(sourceToPageId('cspm')).toBe('cspm')
    expect(sourceToPageId('identity')).toBe('identity')
    expect(sourceToPageId('mcp')).toBe('mcp')
    expect(sourceToPageId('leak')).toBe('threat_intel')
  })

  it('returns null for sources with no gated page (always in-scope)', () => {
    expect(sourceToPageId('divergence')).toBeNull()
    expect(sourceToPageId('some_future_dimension')).toBeNull()
  })
})

describe('visibleMissingSources', () => {
  const missing = ['alert', 'container', 'dast', 'pentest', 'divergence']

  it('fails closed when caps is undefined (hydrating) — shows no missing dimensions', () => {
    expect(visibleMissingSources(missing, undefined)).toEqual([])
  })

  it('fails closed when caps is not ready — shows no missing dimensions', () => {
    expect(visibleMissingSources(missing, caps(false, []))).toEqual([])
  })

  it('external-only org drops code/pentest dimensions, keeps dast + ungated', () => {
    // External-only (Bitsight-style): entitled to domains (ctem) but NOT
    // issues/pentest (code_audit). dast → domains stays; alert/container →
    // issues and pentest → pentest are dropped; divergence (ungated) stays.
    const externalOnly = caps(true, ['domains', 'threat_intel'])
    expect(visibleMissingSources(missing, externalOnly)).toEqual(['dast', 'divergence'])
  })

  it('code-only org drops dast, keeps code + pentest + ungated', () => {
    // Code-only (Snyk-style): entitled to issues + pentest, NOT domains.
    const codeOnly = caps(true, ['issues', 'pentest'])
    expect(visibleMissingSources(missing, codeOnly)).toEqual(['alert', 'container', 'pentest', 'divergence'])
  })

  it('combined org entitled to everything keeps every missing dimension', () => {
    const combined = caps(true, ['issues', 'domains', 'pentest', 'threat_intel'])
    expect(visibleMissingSources(missing, combined)).toEqual(missing)
  })

  it('never invents a dimension — output is always a subset of the input', () => {
    const codeOnly = caps(true, ['issues'])
    const out = visibleMissingSources(missing, codeOnly)
    expect(out.every(s => missing.includes(s))).toBe(true)
  })
})
