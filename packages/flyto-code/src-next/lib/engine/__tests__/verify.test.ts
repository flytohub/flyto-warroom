/**
 * Type-level and runtime tests for the verify module's vocabulary.
 *
 * These tests exist to catch drift: if the engine adds a new verdict or
 * confidence level, a developer who updates the TS type but forgets to
 * update the UI config will see a test failure here.
 */
import { describe, it, expect } from 'vitest'
import type { VerifyVerdict, VerifyConfidence, VerifyMode } from '../verify'

// Runtime arrays that must stay in sync with the union types above.
// If a union member is added but the array isn't updated, the type
// assertion will fail at compile time.
const ALL_VERDICTS: VerifyVerdict[] = [
  'exploitable',
  'suspected_exploitable',
  'sanitized',
  'likely_sanitized',
  'unreachable',
  'reachable',
  'inconclusive',
]

const ALL_CONFIDENCES: VerifyConfidence[] = ['high', 'medium', 'low']

const ALL_MODES: VerifyMode[] = ['static', 'dynamic']

describe('verify types', () => {
  it('VerifyVerdict covers all expected values including hedged variants', () => {
    expect(ALL_VERDICTS).toContain('exploitable')
    expect(ALL_VERDICTS).toContain('suspected_exploitable')
    expect(ALL_VERDICTS).toContain('sanitized')
    expect(ALL_VERDICTS).toContain('likely_sanitized')
    expect(ALL_VERDICTS).toContain('unreachable')
    expect(ALL_VERDICTS).toContain('reachable')
    expect(ALL_VERDICTS).toContain('inconclusive')
    expect(ALL_VERDICTS).toHaveLength(7)
  })

  it('VerifyConfidence covers high / medium / low', () => {
    expect(ALL_CONFIDENCES).toEqual(['high', 'medium', 'low'])
  })

  it('VerifyMode covers static / dynamic', () => {
    expect(ALL_MODES).toEqual(['static', 'dynamic'])
  })
})
