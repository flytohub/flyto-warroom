/**
 * Score Trends (formerly ScoreTrendsView) smoke test.
 *
 * The page was redesigned 2026-05-19 from a per-domain hash-chain
 * inspector to an aggregate sector-level trend view. The old tests
 * verified the domain picker + chain-intact card; both UIs are gone.
 * This file is the replacement smoke test for the new view.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_k: string, fb: string) => fb,
}))

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1', name: 'Test Org', industrySector: 'finance' } }),
}))

const { mockScore, mockEvents, mockPeer } = vi.hoisted(() => ({
  mockScore: {
    overall_raw: 720, overall_display: 720, overall_grade: 'B',
  },
  mockEvents: {
    events: [{
      date: '2026-05-15T00:00:00Z',
      from_grade: 'C', to_grade: 'B',
      from_score: 660, to_score: 720,
      direction: 'upgrade',
      reasons: ['SSL renewed', 'TLS hardening'],
    }],
  },
  mockPeer: {
    org_id: 'org-1', sector: 'finance', metric: 'overall',
    latest: {
      50: { sector: 'finance', metric: 'overall', percentile: 50, value: 650, snapshot_date: '', corpus_size: 100, corpus_version: '', source: '', created_at: '' },
      90: { sector: 'finance', metric: 'overall', percentile: 90, value: 800, snapshot_date: '', corpus_size: 100, corpus_version: '', source: '', created_at: '' },
    },
    history: [],
  },
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey, enabled }: { queryKey: unknown[]; enabled?: boolean }) => {
    if (!enabled) return { data: undefined, isLoading: false, isError: false }
    if (Array.isArray(queryKey) && queryKey[0] === 'computed-score') {
      return { data: mockScore, isLoading: false, isError: false }
    }
    if (Array.isArray(queryKey) && queryKey[0] === 'score-events') {
      return { data: mockEvents, isLoading: false, isError: false }
    }
    if (Array.isArray(queryKey) && queryKey[0] === 'peer-baseline') {
      return { data: mockPeer, isLoading: false, isError: false }
    }
    return { data: null, isLoading: false, isError: false }
  },
}))

vi.mock('@lib/engine', async () => {
  const actual = await vi.importActual<any>('@lib/engine')
  return {
    ...actual,
    getComputedScore: vi.fn(),
    getOrgScoreEvents: vi.fn(),
    getPeerBaseline: vi.fn(),
  }
})

import { ScoreTrendsView } from '@compounds/scoring'

describe('ScoreTrendsView (Score Trends)', () => {
  it('renders the page title + current grade tile', () => {
    render(<ScoreTrendsView />)
    expect(screen.getByText('Score Trends')).toBeTruthy()
    expect(screen.getByText('Current grade')).toBeTruthy()
    expect(screen.getByText('B')).toBeTruthy()
  })

  it('renders the sector baseline with org position label', () => {
    render(<ScoreTrendsView />)
    expect(screen.getByText('Finance')).toBeTruthy()
    // org at 720 vs P50 650 / P90 800 → above median, below top decile
    expect(screen.getByText(/Above sector median/)).toBeTruthy()
  })

  it('renders the upgrade event in the timeline', () => {
    render(<ScoreTrendsView />)
    expect(screen.getByText('C 660')).toBeTruthy()
    expect(screen.getByText('B 720')).toBeTruthy()
  })
})
