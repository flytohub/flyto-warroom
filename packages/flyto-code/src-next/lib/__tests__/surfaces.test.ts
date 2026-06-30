import { describe, expect, it } from 'vitest'
import { PILLAR_SURFACES, SURFACES, surfaceColor, surfaceDef } from '@lib/surfaces'

describe('surface registry', () => {
  it('models the five product surfaces used across cockpit, asset map, and remediation', () => {
    expect(PILLAR_SURFACES.map(surface => surface.id)).toEqual([
      'external',
      'code',
      'container',
      'cloud',
      'runtime',
    ])
  })

  it('keeps runtime as a first-class i18n-gated pillar', () => {
    expect(SURFACES.runtime).toMatchObject({
      id: 'runtime',
      labelKey: 'surface.runtime',
      capability: 'mcp',
      pillar: true,
    })
    expect(surfaceDef('runtime').id).toBe('runtime')
    expect(surfaceColor('runtime')).toBe(SURFACES.runtime.color)
  })

  it('keeps unknown as a non-product fallback bucket', () => {
    expect(surfaceDef('vmware-but-not-modelled').id).toBe('unknown')
    expect(SURFACES.unknown.pillar).toBe(false)
  })
})
