/**
 * IoCLookupView smoke test — Phase 4.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_k: string, fb: string) => fb,
}))

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1' } }),
}))

// The view now calls useNavigate() (from 'react-router') for the
// "Run domain discovery" CTA on the no-attack-surface empty state.
// Without a Router in the render tree this throws, so stub the hook.
vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
}))

const { mockList, mockFeedStatus } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockFeedStatus: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey, queryFn }: { queryKey: unknown[]; queryFn: () => unknown }) => ({
    data: (queryFn as () => unknown)(),
    isLoading: false, isError: false,
  }),
}))

vi.mock('@lib/engine', () => ({
  listIoCs: mockList,
  listFeedStatus: mockFeedStatus,
}))

import { IoCLookupView } from '../IoCLookupView'

describe('IoCLookupView', () => {
  it('renders empty state', () => {
    // No filter applied + empty_reason='no_attack_surface' → the view
    // renders the explicit "no attack surface mapped" empty state with
    // the Run-discovery CTA, instead of a bare "no match" (which now
    // only fires when a search/kind filter is active).
    mockList.mockReturnValue({
      iocs: [], count: 0, stats: {}, global_stats: {}, scope: 'both',
      empty_reason: 'no_attack_surface',
    })
    mockFeedStatus.mockReturnValue({ feeds: [], count: 0 })
    render(<IoCLookupView />)
    // Title is the h1 heading — scope to the role so it doesn't collide
    // with the new empty-state body copy ("IoC lookups match indicators…").
    expect(screen.getByRole('heading', { name: /IoC Lookup/i })).toBeTruthy()
    expect(screen.getByText(/No attack surface mapped yet/i)).toBeTruthy()
  })

  it('renders stat tiles + IoC row', () => {
    mockList.mockReturnValue({
      iocs: [{
        ioc: 'malicious.example.com', kind: 'c2',
        source: 'otx', confidence: 0.6,
        first_seen_at: '2026-05-22T00:00:00Z',
        last_seen_at: '2026-05-22T00:00:00Z',
      }],
      count: 1, stats: { c2: 1 }, global_stats: { c2: 100 }, scope: 'both',
      empty_reason: '',
    })
    mockFeedStatus.mockReturnValue({
      feeds: [{
        source: 'otx', last_run_at: '2026-05-22T00:00:00Z',
        last_ok_at: '2026-05-22T00:00:00Z', last_error: '',
        rows_ingested: 100, total_rows: 100,
      }],
      count: 1,
    })
    render(<IoCLookupView />)
    expect(screen.getByText('malicious.example.com')).toBeTruthy()
    // Tile shows label "C2"
    expect(screen.getAllByText('C2').length).toBeGreaterThan(0)
  })
})
