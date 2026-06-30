import { describe, expect, it } from 'vitest'
import { flattenTranslations } from '@lib/i18nFlatten'

describe('flattenTranslations()', () => {
  it('lifts _self leaves to the bare parent key', () => {
    const flat = flattenTranslations({
      footprint: {
        panel: {
          topPaths: {
            _self: 'Top attack paths',
            empty: 'No red-team actionable findings yet.',
          },
          breakthroughs: {
            _self: 'Breakthrough candidates',
            loading: 'Loading breakthrough candidates...',
          },
        },
      },
    })

    expect(flat['footprint.panel.topPaths']).toBe('Top attack paths')
    expect(flat['footprint.panel.topPaths.empty']).toBe('No red-team actionable findings yet.')
    expect(flat['footprint.panel.breakthroughs']).toBe('Breakthrough candidates')
    expect(flat['footprint.panel.breakthroughs.loading']).toBe('Loading breakthrough candidates...')
    expect(flat['footprint.panel.topPaths._self']).toBeUndefined()
    expect(flat['footprint.panel.breakthroughs._self']).toBeUndefined()
  })

  it('keeps ordinary string leaves unchanged', () => {
    const flat = flattenTranslations({
      nav: {
        dashboard: 'Dashboard',
        productVerification: 'Product Verification',
      },
    })

    expect(flat).toEqual({
      'nav.dashboard': 'Dashboard',
      'nav.productVerification': 'Product Verification',
    })
  })
})
