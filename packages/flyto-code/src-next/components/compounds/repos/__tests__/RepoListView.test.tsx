import React from 'react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (key: string, fallback: string) => fallback,
}))

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1', name: 'Test Org' }, ready: true, notFound: false, error: null }),
  useConnectedRepos: () => ({
    data: [
      { id: 'r1', repoName: 'repo-one', fullName: 'org/repo-one', ownerName: 'org', isPrivate: false, language: 'TypeScript', htmlUrl: 'https://github.com/org/repo-one' },
      { id: 'r2', repoName: 'repo-two', fullName: 'org/repo-two', ownerName: 'org', isPrivate: true, language: 'Go', htmlUrl: 'https://github.com/org/repo-two' },
    ],
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null,
    refetch: vi.fn(),
  }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: null, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('@hooks/useRepoDetails', () => ({
  useRepoDetail: () => ({ data: null }),
}))

vi.mock('@lib/engine', () => ({
  triggerScan: vi.fn(),
  listRepoScans: vi.fn().mockResolvedValue({ scans: [] }),
  getOrgHealthSummary: vi.fn(),
  cancelOrgScans: vi.fn().mockResolvedValue({ cancelled: 0 }),
  setRepoTier: vi.fn(),
  setAssetTier: vi.fn(),
  tierLabel: (t: string | undefined) => t ?? 'standard',
  tierColor: () => 'default',
}))

vi.mock('@atoms/Pagination', () => ({
  Pagination: () => null,
}))

vi.mock('@compounds/_shared/picker', () => ({
  RepoPickerModal: () => null,
}))

import { render, screen } from '@testing-library/react'
import { RepoListView } from '../RepoListView'

describe('RepoListView', () => {
  it('renders repo table with header columns', () => {
    render(<RepoListView />)
    expect(screen.getByText('Repository')).toBeDefined()
    expect(screen.getByText('Language')).toBeDefined()
    expect(screen.getByText('Health')).toBeDefined()
  })

  it('renders repos from connected list', () => {
    render(<RepoListView />)
    expect(screen.getByText('repo-one')).toBeDefined()
    expect(screen.getByText('repo-two')).toBeDefined()
  })

  it('shows repo count badge', () => {
    render(<RepoListView />)
    expect(screen.getByText('2')).toBeDefined()
  })

  it('renders scan all button', () => {
    render(<RepoListView />)
    expect(screen.getByText('Scan all')).toBeDefined()
  })
})
