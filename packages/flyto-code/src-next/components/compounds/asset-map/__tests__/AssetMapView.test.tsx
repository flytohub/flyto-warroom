/**
 * AssetMapView smoke test — verifies the 3-row asset-mapping page mounts
 * with empty engine data without crashing. The view fans out into many
 * MUI primitives + Mantine FlytoSelect, but the smoke gate just confirms
 * the shell composes.
 */
import { describe, it, expect, vi } from 'vitest'

const { mockUseDiscoverySeed } = vi.hoisted(() => ({
  mockUseDiscoverySeed: vi.fn(),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1', name: 'Test Org' } }),
  useConnectedRepos: () => ({ data: [] }),
}))

vi.mock('@lib/engine', () => ({
  getKernelAssetMap: vi.fn().mockResolvedValue({
    org_id: 'org-1',
    generated_at: '2026-05-28T00:00:00Z',
    resource_limit: 50000,
    truncated: false,
    node_count: 0,
    edge_count: 0,
    nodes: [],
    edges: [],
    summary: {
      by_category: {},
      by_type: {},
      by_tier: {},
      by_dimension: {},
      by_surface: {},
    },
  }),
}))

vi.mock('@hooks/useDiscoveryStatus', () => ({
  markDiscoveryComplete: vi.fn(),
  markDiscoveryStarted: vi.fn(),
  useDiscoverySeed: mockUseDiscoverySeed,
  useDiscoveryStatus: () => ({
    isScanning: () => false,
  }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, isLoading: false }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock('@atoms/FlytoSelect', () => ({
  FlytoSelect: () => null,
}))

vi.mock('@atoms/JellyCard', () => ({
  JellyCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@compounds/domains/buildDomainRows', () => ({
  buildDomainRows: () => [],
}))

import { render } from '@testing-library/react'
import { AssetMapView } from '../AssetMapView'

describe('AssetMapView smoke', () => {
  it('mounts with empty engine data', () => {
    const { container } = render(<AssetMapView />)
    expect(container.firstChild).toBeTruthy()
    expect(mockUseDiscoverySeed).toHaveBeenCalledWith('org-1')
  })
})
