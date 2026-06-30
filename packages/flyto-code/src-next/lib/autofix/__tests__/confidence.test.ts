import { describe, it, expect } from 'vitest'
import { computeConfidence } from '../confidence'

const mk = (rule_category: string, gates: { name: string; status: string }[]) =>
  // minimal shape — computeConfidence only reads verify_gates + rule_category
  ({ rule_category, verify_gates: gates } as unknown as Parameters<typeof computeConfidence>[0])

describe('computeConfidence', () => {
  it('undefined detail → null', () => {
    expect(computeConfidence(undefined)).toBeNull()
  })
  it('any failed gate → low', () => {
    const v = computeConfidence(mk('dependencies', [{ name: 'build', status: 'fail' }, { name: 't', status: 'pass' }]))
    expect(v?.level).toBe('low')
    expect(v?.reason).toContain('build')
  })
  it('only skipped (no pass) → low', () => {
    const v = computeConfidence(mk('iac', [{ name: 'gate', status: 'skipped' }]))
    expect(v?.level).toBe('low')
  })
  it('tier-1 category + passing gates → high', () => {
    const v = computeConfidence(mk('dependencies', [{ name: 'build', status: 'pass' }]))
    expect(v?.level).toBe('high')
  })
  it('non-tier-1 (sast) + passing → medium', () => {
    const v = computeConfidence(mk('sast', [{ name: 'build', status: 'pass' }]))
    expect(v?.level).toBe('medium')
  })
  it('server-canonical confidence overrides local gate guessing', () => {
    const v = computeConfidence({
      rule_category: 'dependencies',
      verify_gates: [{ name: 'build', status: 'pass' }],
      confidence: {
        level: 'low',
        tier: 1,
        reason_key: 'autofix.confidenceReasonFailed',
        reason_gates: ['test'],
      },
    } as unknown as Parameters<typeof computeConfidence>[0])
    expect(v?.level).toBe('low')
    expect(v?.reason).toContain('test')
  })
})
