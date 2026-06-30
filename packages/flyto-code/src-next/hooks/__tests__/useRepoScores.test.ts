/**
 * Unit tests for getRepoScore — the pure helper that resolves a repo's
 * unified score from the score map, with safe defaults for missing repos.
 */
import { describe, it, expect } from 'vitest'
import { getRepoScore, normaliseRepoScoreRow, type RepoScore } from '../useRepoScores'

function makeMap(entries: [string, RepoScore][]): Map<string, RepoScore> {
  return new Map(entries)
}

describe('getRepoScore', () => {
  const scored: RepoScore = { grade: 'B', raw: 72, display: 718, scorable: true }
  const map = makeMap([
    ['repo-1', scored],
    ['repo-2', { grade: 'A', raw: 91, display: 842, scorable: true }],
  ])

  it('returns the score for an existing repo', () => {
    expect(getRepoScore(map, 'repo-1')).toEqual(scored)
  })

  // A3 (2026-05-25): the safe-default values changed from
  // `{ grade: '--', raw: 0, display: 250 }` to all-null. The
  // previous defaults silently rendered unscored repos as the
  // visually lowest-scored repo on every dashboard / list. See
  // docs/API_RESPONSE_FIELD_MAP.md Critical #4.
  it('returns A3 nullable defaults for a missing repo', () => {
    expect(getRepoScore(map, 'repo-unknown')).toEqual({
      grade: null,
      raw: null,
      display: null,
      scorable: false,
    })
  })

  it('returns A3 nullable defaults for an empty map', () => {
    const empty = new Map<string, RepoScore>()
    expect(getRepoScore(empty, 'anything')).toEqual({
      grade: null,
      raw: null,
      display: null,
      scorable: false,
    })
  })

  it('distinguishes repos with identical grades', () => {
    const m = makeMap([
      ['a', { grade: 'C', raw: 55, display: 607, scorable: true }],
      ['b', { grade: 'C', raw: 60, display: 640, scorable: true }],
    ])
    expect(getRepoScore(m, 'a').raw).toBe(55)
    expect(getRepoScore(m, 'b').raw).toBe(60)
  })

})

// Wire-normalisation pin — Codex review of 97e3d90 caught: the
// previous "non-scorable map entries" test handed a Map<> directly
// to getRepoScore, which bypasses the per-row scrub that
// useRepoScores does when building the Map from a wire payload.
// So the prior test would still pass even if the scrub were
// deleted. These tests exercise normaliseRepoScoreRow — the
// extracted pure helper — so deleting the scrub fails CI.
describe('normaliseRepoScoreRow', () => {
  it('returns null fields when scorable=false, even if wire ships stale 0/F/250', () => {
    const wire = { repo_id: 'r1', name: 'r1', grade: 'F', raw: 0, display: 250, scorable: false }
    expect(normaliseRepoScoreRow(wire)).toEqual({
      grade: null,
      raw: null,
      display: null,
      scorable: false,
    })
  })

  it('returns null fields when scorable=false even if wire ships a real-looking score', () => {
    // Defensive: some backends fill stale values from a prior
    // scan even when the current state is `scorable=false`. The
    // normaliser is the one place that scrubs.
    const wire = { repo_id: 'r2', name: 'r2', grade: 'B', raw: 72, display: 718, scorable: false }
    expect(normaliseRepoScoreRow(wire)).toEqual({
      grade: null,
      raw: null,
      display: null,
      scorable: false,
    })
  })

  it('passes the score through when scorable=true', () => {
    const wire = { repo_id: 'r3', name: 'r3', grade: 'A', raw: 91, display: 842, scorable: true }
    expect(normaliseRepoScoreRow(wire)).toEqual({
      grade: 'A',
      raw: 91,
      display: 842,
      scorable: true,
    })
  })

  it('preserves a real zero score (real 0 vs no-data distinction)', () => {
    // A3 Hard rule #1: 0 + scorable=true is a real score (engine
    // computed zero). Normaliser MUST NOT swap it to null — only
    // the scorable=false branch nulls things out.
    const wire = { repo_id: 'r4', name: 'r4', grade: 'F', raw: 0, display: 250, scorable: true }
    expect(normaliseRepoScoreRow(wire)).toEqual({
      grade: 'F',
      raw: 0,
      display: 250,
      scorable: true,
    })
  })
})
