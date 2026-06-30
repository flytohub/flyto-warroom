/**
 * RansomwareView smoke test — Phase 4.
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

const { mockList, mockFeedStatus } = vi.hoisted(() => ({ mockList: vi.fn(), mockFeedStatus: vi.fn() }))

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryFn }: { queryFn: () => unknown }) => ({
    data: (queryFn as () => unknown)(),
    isLoading: false, isError: false,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}))

vi.mock('@lib/engine', () => ({
  listRansomware: mockList,
  listFeedStatus: mockFeedStatus,
}))

vi.mock('../ThreatIntelRefreshButton', () => ({
  ThreatIntelRefreshButton: () => null,
}))

import { RansomwareView } from '../RansomwareView'

describe('RansomwareView', () => {
  it('renders empty state', () => {
    mockList.mockReturnValue({ incidents: [], count: 0, total: 0 })
    mockFeedStatus.mockReturnValue({ feeds: [], count: 0 })
    render(<RansomwareView />)
    expect(screen.getByRole('heading', { name: /Ransomware Incidents/i })).toBeTruthy()
    expect(screen.getByText(/no health record/i)).toBeTruthy()
  })

  it('renders an incident row with victim + group chip', () => {
    mockList.mockReturnValue({
      incidents: [{
        id: 'r-1', external_id: 'lockbit3::ACME::2026-05-20',
        victim_name: 'ACME Corp', victim_domain: 'acme.example.com',
        victim_country: 'US', victim_sector: 'Manufacturing',
        group_name: 'lockbit3', leak_url: 'https://example.onion/post/1',
        published_at: '2026-05-20T00:00:00Z',
        discovered_at: '2026-05-20T00:00:00Z',
        description: '', source: 'ransomware.live',
      }],
      count: 1, total: 1,
    })
    mockFeedStatus.mockReturnValue({
      feeds: [{
        source: 'ransomware.live',
        last_run_at: '2026-05-22T00:00:00Z',
        last_ok_at: '2026-05-22T00:00:00Z',
        last_error: '',
        rows_ingested: 100,
        total_rows: 100,
      }],
      count: 1,
    })
    render(<RansomwareView />)
    expect(screen.getByText('ACME Corp')).toBeTruthy()
    expect(screen.getByText('lockbit3')).toBeTruthy()
    expect(screen.getByText('US')).toBeTruthy()
  })
})
