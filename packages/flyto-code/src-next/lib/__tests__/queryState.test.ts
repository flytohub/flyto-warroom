import { describe, expect, it } from 'vitest'
import {
  emptyStateReady,
  queryBoundaryState,
  queryFailed,
  queryResolved,
  querySucceeded,
  queryUnresolved,
  resolvedList,
} from '../queryState'

describe('queryState', () => {
  it('treats disabled queries as settled but not as successful empty data', () => {
    const query = { isSuccess: false, isError: false }

    expect(queryBoundaryState(query, false)).toBe('disabled')
    expect(queryResolved(query, false)).toBe(true)
    expect(queryUnresolved(query, false)).toBe(false)
    expect(querySucceeded(query, false)).toBe(false)
    expect(emptyStateReady(query, false)).toBe(false)
    expect(resolvedList(['stale'], query, false)).toEqual([])
  })

  it('only allows empty-state decisions after a successful query', () => {
    const loading = { isLoading: true }
    const failed = { isError: true }
    const success = { isSuccess: true }

    expect(queryBoundaryState(loading)).toBe('loading')
    expect(emptyStateReady(loading)).toBe(false)
    expect(resolvedList(['hidden'], loading)).toEqual([])

    expect(queryBoundaryState(failed)).toBe('error')
    expect(queryFailed(failed)).toBe(true)
    expect(emptyStateReady(failed)).toBe(false)
    expect(resolvedList(['hidden'], failed)).toEqual([])

    expect(queryBoundaryState(success)).toBe('success')
    expect(emptyStateReady(success)).toBe(true)
    expect(resolvedList(['visible'], success)).toEqual(['visible'])
  })
})
