/**
 * useRepoScores — shared hook for per-repo grades from the unified scoring engine.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useOrg } from './useOrg'
import { getComputedScore, type RepoScoreResultServer } from '@lib/engine'
import { qk } from '@lib/queryKeys'
import { queryFailed, queryResolved, queryUnresolved, resolvedList } from '@lib/queryState'

export interface RepoScore {
  /** A3: `null` when this repo isn't scorable (default Map miss).
   *  Consumers MUST check `scorable` before reading; do NOT render
   *  `'--'` or `'F'` as a substitute for "no data". */
  grade: string | null
  /** A3: `null` when not scorable. Do NOT use `0` as a sentinel —
   *  `0` is a real low score. */
  raw: number | null
  /** A3: `null` when not scorable. Do NOT default to `250` — that
   *  matches the visual floor of the F band on the 250-900 scale
   *  and silently mis-renders no-data repos as the worst-scored
   *  repo. */
  display: number | null
  /** True when `repo_scores[]` covered this repo. False default for
   *  Map miss. This is the gate — every consumer of `raw / display
   *  / grade` MUST branch on `scorable` first. */
  scorable: boolean
}

/**
 * normaliseRepoScoreRow — exported for tests.
 *
 * The wire's RepoScoreResultServer carries `grade / raw / display`
 * as non-nullable fields even when `scorable === false` — backends
 * sometimes ship default zeros (0 / "F" / 250) in those slots.
 * That's exactly the "fake zero vs no-data" confusion the A3
 * envelope was designed to prevent. Scrub here so downstream
 * consumers can rely on `scorable === false ⇒ raw/display/grade
 * all null` without per-callsite re-checks.
 *
 * Pure function — same input always yields same output. Tests
 * call it directly so the contract is enforced at the source-of-
 * truth layer, not just at the Map-miss boundary in
 * getRepoScore.
 */
export function normaliseRepoScoreRow(rs: RepoScoreResultServer): RepoScore {
  const scorable = rs.scorable
  return {
    grade: scorable ? rs.grade : null,
    raw: scorable ? rs.raw : null,
    display: scorable ? rs.display : null,
    scorable,
  }
}

/**
 * Returns the score map plus readiness metadata. Use this when a caller needs
 * to decide between loading/error/empty/data states; `useRepoScores()` remains
 * as the backwards-compatible display-only wrapper.
 */
export function useRepoScoresState() {
  const { org } = useOrg()
  const enabled = !!org?.id

  const scoreQ = useQuery({
    queryKey: qk.computedScore(org?.id),
    queryFn: () => getComputedScore(org!.id),
    enabled,
    staleTime: 60_000,
  })

  const scoreMap = useMemo(() => {
    const m = new Map<string, RepoScore>()
    for (const rs of resolvedList(scoreQ.data?.repo_scores, scoreQ, enabled)) {
      m.set(rs.repo_id, normaliseRepoScoreRow(rs))
    }
    return m
  }, [enabled, scoreQ])

  return {
    scoreMap,
    isResolved: queryResolved(scoreQ, enabled),
    isLoading: queryUnresolved(scoreQ, enabled),
    isError: queryFailed(scoreQ, enabled),
    error: scoreQ.error,
  }
}

/**
 * Returns a Map<repo_id, RepoScore> from the unified computed-score engine.
 */
export function useRepoScores() {
  return useRepoScoresState().scoreMap
}

/**
 * Get a single repo's unified score. Returns nullable fields when
 * the repo has no scorable entry — consumers MUST branch on
 * `scorable` before reading `raw / display / grade`. Defaulting
 * the missing case to `{ grade: '--', raw: 0, display: 250,
 * scorable: false }` (the pre-A3 behaviour) silently rendered
 * unscored repos as the lowest-scored repo on the dashboard;
 * see SCORING_CONTRACT A3 / API_RESPONSE_FIELD_MAP Critical #4.
 */
export function getRepoScore(scoreMap: Map<string, RepoScore>, repoId: string): RepoScore {
  return scoreMap.get(repoId) ?? { grade: null, raw: null, display: null, scorable: false }
}
