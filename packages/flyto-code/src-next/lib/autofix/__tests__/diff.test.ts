import { describe, it, expect } from 'vitest'
import { computeLineDiff } from '../diff'

describe('computeLineDiff', () => {
  it('no change → no hunks', () => {
    expect(computeLineDiff('a\nb\nc', 'a\nb\nc')).toEqual([])
  })

  it('a single replaced line is one add + one del with context', () => {
    const hunks = computeLineDiff('one\ntwo\nthree', 'one\nTWO\nthree')
    expect(hunks).toHaveLength(1)
    const kinds = hunks[0].lines.map((l) => l.type)
    expect(kinds).toContain('del')
    expect(kinds).toContain('add')
    expect(hunks[0].lines.find((l) => l.type === 'del')?.text).toBe('two')
    expect(hunks[0].lines.find((l) => l.type === 'add')?.text).toBe('TWO')
    // surrounding identical lines come through as context
    expect(kinds.filter((k) => k === 'context').length).toBeGreaterThan(0)
  })

  it('pure addition produces add lines and correct new-line numbering', () => {
    const hunks = computeLineDiff('a\nb', 'a\nx\nb')
    expect(hunks).toHaveLength(1)
    const add = hunks[0].lines.find((l) => l.type === 'add')
    expect(add?.text).toBe('x')
    expect(add?.newNo).toBe(2)
  })

  it('distant changes split into separate hunks (context window = 3)', () => {
    const before = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].join('\n')
    const after = ['A', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'J'].join('\n')
    const hunks = computeLineDiff(before, after)
    expect(hunks.length).toBe(2) // first + last line changed, far apart
  })
})
