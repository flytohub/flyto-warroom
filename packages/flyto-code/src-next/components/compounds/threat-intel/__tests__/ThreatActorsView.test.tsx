/**
 * ThreatActorsView smoke test — renders with empty + populated
 * actor lists. Phase 4 of REFACTOR_PLAN.md.
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

const { mockList, mockFeedStatus } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockFeedStatus: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryFn }: { queryFn: () => unknown }) => {
    const data = (queryFn as () => unknown)()
    return { data, isLoading: false, isError: false }
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}))

vi.mock('@lib/engine', () => ({
  listThreatActors: mockList,
  listFeedStatus: mockFeedStatus,
  parseJsonArray: (s?: string) => {
    try { return JSON.parse(s ?? '[]') } catch { return [] }
  },
}))

vi.mock('../ThreatIntelRefreshButton', () => ({
  ThreatIntelRefreshButton: () => null,
}))

import { ThreatActorsView } from '../ThreatActorsView'

describe('ThreatActorsView', () => {
  it('renders empty state when actors list is zero', () => {
    mockList.mockReturnValue({ actors: [], count: 0, total: 0 })
    mockFeedStatus.mockReturnValue({ feeds: [], count: 0 })
    render(<ThreatActorsView />)
    expect(screen.getByText(/Threat Actor Library/i)).toBeTruthy()
    expect(screen.getByText(/No actors loaded yet/i)).toBeTruthy()
    expect(screen.getByText(/no health record/i)).toBeTruthy()
  })

  it('renders a populated actor card with country + counts', () => {
    mockList.mockReturnValue({
      actors: [{
        id: 'a-1',
        external_id: 'G0001',
        name: 'APT 1',
        aliases: '["Comment Crew","Byzantine Candor"]',
        description: 'PLA 61398',
        country: 'China',
        region: 'Asia & Pacific',
        sectors: '[]',
        target_countries: '["US","TW","KR"]',
        techniques: '["T1059","T1027","T1003"]',
        malware_used: '["S0002","S0003"]',
        source: 'mitre_attack',
        source_url: 'https://attack.mitre.org/groups/G0001/',
        updated_at: '2026-05-22T00:00:00Z',
      }],
      count: 1, total: 1,
    })
    mockFeedStatus.mockReturnValue({
      feeds: [{
        source: 'mitre_attack',
        last_run_at: '2026-05-22T00:00:00Z',
        last_ok_at: '2026-05-22T00:00:00Z',
        last_error: '',
        rows_ingested: 135,
        total_rows: 135,
      }],
      count: 1,
    })
    render(<ThreatActorsView />)
    expect(screen.getByText('APT 1')).toBeTruthy()
    expect(screen.getByText('G0001')).toBeTruthy()
    expect(screen.getByText(/Comment Crew/)).toBeTruthy()
  })
})
