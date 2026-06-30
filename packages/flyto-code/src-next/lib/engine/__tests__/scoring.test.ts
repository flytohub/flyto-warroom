/**
 * Unit tests for the scoring API module.
 *
 * Tests cover the fetch wrappers and error handling. The actual scoring
 * logic lives server-side; these tests verify the client correctly calls
 * the engine and handles both success and failure paths.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { envMock } = vi.hoisted(() => ({
  envMock: {
    engineUrl: 'https://engine.test',
    devAuthBypass: true,
    devAuthUid: 'u1',
    devAuthEmail: 'u@test.dev',
  },
}))

vi.mock('@lib/env', () => ({ env: envMock }))
vi.mock('@lib/firebase', () => ({ auth: { currentUser: null } }))
vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key, getLocale: () => 'en' }))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import {
  getComputedScore,
  submitUnifiedScore,
  getUnifiedScoreHistory,
  getLatestUnifiedScore,
  getOrgBenchmark,
} from '../scoring/scoring'

function okJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => body === undefined ? '' : JSON.stringify(body),
    json: async () => body,
  } as unknown as Response
}
function errJson(status: number, body: unknown) {
  return {
    ok: false, status, statusText: 'Error',
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response
}

describe('getComputedScore', () => {
  beforeEach(() => fetchMock.mockReset())

  it('calls the correct endpoint and returns the response', async () => {
    const payload = {
      overall_raw: 72,
      overall_display: 718,
      overall_grade: 'B',
      overall_grade_color: '#22c55e',
      active_count: 4,
      total_count: 6,
      cross_dim: { blast_radius_penalty: 0, pr_adjacency_penalty: 0, taint_adjacency_penalty: 0, pentest_verdict_modifier: 0, autofix_coverage_bonus: 0, total: 0 },
      mode: 'internal' as const,
      repo_scores: [{ repo_id: 'r1', name: 'app', raw: 72, display: 718, grade: 'B', scorable: true }],
    }
    fetchMock.mockResolvedValueOnce(okJson(payload))

    const result = await getComputedScore('org-1')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('https://engine.test/api/v1/code/orgs/org-1/computed-score')
    expect(result.overall_raw).toBe(72)
    expect(result.mode).toBe('internal')
    expect(result.repo_scores).toHaveLength(1)
  })
})

describe('submitUnifiedScore', () => {
  beforeEach(() => fetchMock.mockReset())

  it('POSTs the score payload to the correct endpoint', async () => {
    fetchMock.mockResolvedValueOnce(okJson(undefined))

    await submitUnifiedScore('org-1', {
      overall_raw: 80,
      overall_display: 770,
      overall_grade: 'A',
      categories: '[]',
      cross_dim: '{}',
      active_sub_vectors: 5,
      total_sub_vectors: 8,
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://engine.test/api/v1/code/orgs/org-1/unified-score')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body)
    expect(body.overall_raw).toBe(80)
    expect(body.overall_grade).toBe('A')
  })
})

describe('getUnifiedScoreHistory', () => {
  beforeEach(() => fetchMock.mockReset())

  it('passes days param in the URL', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ entries: [], count: 0 }))

    const result = await getUnifiedScoreHistory('org-1', 30)

    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('days=30')
    expect(result.count).toBe(0)
  })

  it('defaults to 90 days', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ entries: [], count: 0 }))

    await getUnifiedScoreHistory('org-1')

    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('days=90')
  })
})

describe('getLatestUnifiedScore', () => {
  beforeEach(() => fetchMock.mockReset())

  it('returns the score entry on success', async () => {
    const entry = { id: 's1', orgId: 'org-1', overallRaw: 65, overallGrade: 'B' }
    fetchMock.mockResolvedValueOnce(okJson(entry))

    const result = await getLatestUnifiedScore('org-1')
    expect(result?.overallRaw).toBe(65)
  })

  it('returns null on error instead of throwing', async () => {
    fetchMock.mockResolvedValueOnce(errJson(404, { message: 'not found' }))

    const result = await getLatestUnifiedScore('org-1')
    expect(result).toBeNull()
  })
})

describe('getOrgBenchmark', () => {
  beforeEach(() => fetchMock.mockReset())

  it('returns benchmark data on success', async () => {
    const data = { org_score: 75, percentile: 68, sector: 'fintech', benchmark: { p25: 40, p50: 60, p75: 78, p90: 90, sample_size: 120 }, comparison: 'above average', display_text: 'Top 32%' }
    fetchMock.mockResolvedValueOnce(okJson(data))

    const result = await getOrgBenchmark('org-1')
    expect(result?.percentile).toBe(68)
  })

  it('returns null on error instead of throwing', async () => {
    fetchMock.mockResolvedValueOnce(errJson(500, { message: 'oops' }))

    const result = await getOrgBenchmark('org-1')
    expect(result).toBeNull()
  })
})
