import { describe, it, expect, vi } from 'vitest'
import { timeAgo, sevBadge } from '../types'

// Mock i18n
vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
}))

describe('timeAgo', () => {
  it('returns minutes ago for recent times', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString()
    expect(timeAgo(fiveMinAgo)).toBe('5m ago')
  })

  it('returns hours ago for times within a day', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600_000).toISOString()
    expect(timeAgo(threeHoursAgo)).toBe('3h ago')
  })

  it('returns days ago for times beyond a day', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400_000).toISOString()
    expect(timeAgo(twoDaysAgo)).toBe('2d ago')
  })

  it('returns 0m ago for just now', () => {
    const now = new Date().toISOString()
    expect(timeAgo(now)).toBe('0m ago')
  })
})

describe('sevBadge', () => {
  it('returns correct class for CRITICAL', () => {
    const result = sevBadge('CRITICAL')
    expect(result.cls).toContain('dom-sev-crit')
    expect(result.label).toBe('Critical')
  })

  it('returns correct class for HIGH', () => {
    const result = sevBadge('HIGH')
    expect(result.cls).toContain('dom-sev-high')
    expect(result.label).toBe('High')
  })

  it('returns correct class for MEDIUM', () => {
    const result = sevBadge('MEDIUM')
    expect(result.cls).toContain('dom-sev-med')
    expect(result.label).toBe('Moderate')
  })

  it('returns correct class for LOW', () => {
    const result = sevBadge('LOW')
    expect(result.cls).toContain('dom-sev-low')
    expect(result.label).toBe('Low')
  })

  it('returns raw severity for unknown values', () => {
    const result = sevBadge('UNKNOWN')
    expect(result.cls).toBe('dom-sev-badge ')
    expect(result.label).toBe('UNKNOWN')
  })
})
