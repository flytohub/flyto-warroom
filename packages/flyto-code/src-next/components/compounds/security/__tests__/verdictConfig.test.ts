/**
 * Tests for the verdict display config — ensures every known verdict
 * has a colour, label, and icon, and that hedged variants are present.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

import { verdictDisplayConfig, confidenceStyles } from '../verify/verdictConfig'

describe('verdictDisplayConfig', () => {
  const cfg = verdictDisplayConfig()

  it('contains all 7 verdict keys', () => {
    const keys = Object.keys(cfg)
    expect(keys).toContain('reachable')
    expect(keys).toContain('exploitable')
    expect(keys).toContain('suspected_exploitable')
    expect(keys).toContain('sanitized')
    expect(keys).toContain('likely_sanitized')
    expect(keys).toContain('unreachable')
    expect(keys).toContain('inconclusive')
    expect(keys).toHaveLength(7)
  })

  it('every entry has a non-empty color, label, and icon', () => {
    for (const [key, entry] of Object.entries(cfg)) {
      expect(entry.color, `${key}.color`).toBeTruthy()
      expect(entry.label, `${key}.label`).toBeTruthy()
      expect(entry.icon, `${key}.icon`).toBeDefined()
    }
  })

  it('hedged variants use distinct colours from definitive versions', () => {
    expect(cfg.suspected_exploitable.color).not.toBe(cfg.exploitable.color)
    expect(cfg.likely_sanitized.color).not.toBe(cfg.sanitized.color)
  })

  it('hedged labels include qualifier words', () => {
    expect(cfg.suspected_exploitable.label).toContain('SUSPECTED')
    expect(cfg.likely_sanitized.label).toContain('LIKELY')
  })
})

describe('confidenceStyles', () => {
  const styles = confidenceStyles()

  it('covers high, medium, low', () => {
    expect(Object.keys(styles)).toEqual(['high', 'medium', 'low'])
  })

  it('high is green, low is red', () => {
    expect(styles.high.color).toBe('green')
    expect(styles.low.color).toBe('red')
  })
})
