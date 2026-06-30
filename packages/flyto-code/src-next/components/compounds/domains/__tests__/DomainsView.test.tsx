import React from 'react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

vi.mock('../DomainImportModal', () => ({
  DomainImportModal: () => null,
}))

vi.mock('../GroupedDomainList', () => ({
  GroupedDomainList: () => null,
  // groupRows is called by DomainsView's count chip — stub returns
  // an empty array so the empty / loading branches the test exercises
  // render without throwing. Real grouping is covered by the
  // GroupedDomainList implementation directly.
  groupRows: () => [],
}))

vi.mock('../DomainDetail', () => ({
  DomainDetail: () => null,
}))

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1', name: 'Test Org' } }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: null, isLoading: false, isError: false }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock('@lib/engine', () => ({
  getEnrichedAttackSurface: vi.fn(),
  listPentestProjects: vi.fn(),
  createExternalTarget: vi.fn(),
  deleteDomain: vi.fn(),
  triggerDiscovery: vi.fn(),
  discoverAllDomains: vi.fn(),
}))

vi.mock('@atoms/Pagination', () => ({
  Pagination: () => null,
}))

import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DomainsView } from '../DomainsView'

describe('DomainsView', () => {
  it('renders domain and checks tabs', () => {
    render(<MemoryRouter><DomainsView /></MemoryRouter>)
    expect(screen.getByText('Domain Name')).toBeDefined()
    expect(screen.getByText('Checks')).toBeDefined()
  })

  it('renders search input', () => {
    const { container } = render(<MemoryRouter><DomainsView /></MemoryRouter>)
    // MUI TextField renders an <input> element; find by placeholder
    const input = container.querySelector('input')
    expect(input).not.toBeNull()
  })

  it('shows empty state when no domains', () => {
    render(<MemoryRouter><DomainsView /></MemoryRouter>)
    // Empty state uses tOr('dast.emptyTitle', 'Map your attack surface')
    expect(screen.getByText('Map your attack surface')).toBeDefined()
  })
})
