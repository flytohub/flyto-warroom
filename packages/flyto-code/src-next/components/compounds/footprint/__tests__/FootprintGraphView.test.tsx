/**
 * FootprintGraphView smoke test — mounts with empty engine data,
 * then with a populated graph, without crashing. The three.js
 * Canvas can't be deeply rendered in jsdom, so we stub the
 * `@react-three/fiber` + drei surface to plain divs and just
 * verify the side panel signal summary + header render.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => <div data-testid="canvas">{children}</div>,
  useFrame: () => undefined,
}))
vi.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
  Line: () => null,
  Html: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ orgId: 'org-1' }),
}))

vi.mock('@lib/engine/code/footprintGraph', () => ({
  promotionTier: () => 'confirmed' as const,
  relationshipScore: () => 75,
  actionability: () => null,
  getFootprintGraph: vi.fn(),
  getFootprintTimeseries: vi.fn(),
  getFootprintPathScore: vi.fn(),
  getFootprintLatestRun: vi.fn(),
  getFootprintActionable: vi.fn(),
  runFootprintExpansion: vi.fn(),
}))

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1', name: 'Test Org' } }),
  useConnectedRepos: () => ({ data: [] }),
}))

// useQuery — return whatever the test sets via __mockData below.
const __mockData: {
  graph?: { entities: unknown[]; relationships: unknown[] }
  ts?: { edges: unknown[]; signals: Array<{ signal: string; entity_id: string; type: string; first_seen_at: string; last_seen_at: string }> }
} = {}
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    const k = String(queryKey[0])
    if (k === 'footprint-graph') return { data: __mockData.graph, isLoading: false, refetch: vi.fn(), error: undefined }
    if (k === 'footprint-timeseries') return { data: __mockData.ts, isLoading: false, refetch: vi.fn(), error: undefined }
    return { data: undefined, isLoading: false, refetch: vi.fn() }
  },
  useMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}))

import { FootprintGraphView } from '../FootprintGraphView'
import { TIER_BADGE } from '../shared'

describe('FootprintGraphView', () => {
  it('renders the no-seed empty state when nothing is derivable', () => {
    __mockData.graph = { entities: [], relationships: [] }
    __mockData.ts = { edges: [], signals: [] }
    render(<FootprintGraphView orgId="org-1" />)
    // useOrg mock returns name 'Test Org' → defaultOrgName is non-empty
    // → the no-seed branch should NOT render. We expect the auto-fire
    // RunProgressCard instead (mutation isPending mock = false, so this
    // is the post-auto-fire branch text).
    expect(screen.getByText(/Mapping your footprint/i)).toBeTruthy()
  })

  it('renders the side panel signal summary when entities exist', () => {
    __mockData.graph = {
      entities: [
        {
          id: 'seed', type: 'organization', canonical_name: 'Acme',
          source: 'user_seed', confidence: 1, depth: 0, parent_entity_id: '',
          first_seen_at: '2026-05-20T00:00:00Z', last_seen_at: '2026-05-20T00:00:00Z',
          metadata: {}, evidence_refs: [],
        },
        {
          id: 'hop1', type: 'domain', canonical_name: 'acme.com',
          source: 'website_crawl', confidence: 0.9, depth: 1, parent_entity_id: 'seed',
          first_seen_at: '2026-05-19T00:00:00Z', last_seen_at: '2026-05-20T00:00:00Z',
          metadata: {}, evidence_refs: [],
        },
      ],
      relationships: [],
    }
    __mockData.ts = {
      edges: [],
      signals: [
        { entity_id: 'hop1', type: 'domain', signal: 'newly_exposed', first_seen_at: '', last_seen_at: '' },
      ],
    }
    render(<FootprintGraphView orgId="org-1" />)
    // Default view is now Recon Brief — assert the Section
    // headings render (Target Profile is section 1). The
    // list-only "Newly exposed" pill no longer renders by
    // default since Brief is the new entry point.
    expect(screen.getAllByText(/Target Profile/i).length).toBeGreaterThan(0)
  })

  it('uses ownership wording for promotion tiers', () => {
    expect(TIER_BADGE.confirmed.label).toBe('owned asset')
    expect(TIER_BADGE.candidate.label).toBe('candidate asset')
  })
})
