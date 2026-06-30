import React from 'react'
import { beforeEach, describe, it, expect, vi } from 'vitest'

const connectedReposState = vi.hoisted(() => ({
  value: {
    data: [] as unknown[] | undefined,
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null,
    refetch: vi.fn(),
  },
}))

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (key: string, fallback: string) => {
    const translated = globalThis.__flytoTestT?.(key)
    return translated && translated !== key ? translated : fallback
  },
}))

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1', name: 'Test Org' }, ready: true, notFound: false, error: null }),
  useConnectedRepos: () => connectedReposState.value,
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: null, isLoading: false, isError: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock('@lib/engine', () => ({
  getOrgHealthSummary: vi.fn(),
  getOrgAPIDefinitions: vi.fn(),
}))

vi.mock('@hooks/useGitHubConnection', () => ({
  useGitHubConnection: () => ({ connected: false, login: '', loading: false, refresh: () => {} }),
}))

vi.mock('@hooks/useOrgMembers', () => ({
  useGitHubOrg: () => ({ data: null }),
}))

vi.mock('@hooks/usePRActivity', () => ({
  usePRActivity: () => ({ data: null }),
}))

import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { WarRoomView } from '../WarRoomView'
import { SECTION_REGISTRY, isKnownSection } from '../sectionRegistry'

// Mirror of WARROOM_ID_REDIRECTS in
// app/(control-panel)/flyto/workspace/route.tsx. Kept as a literal so
// this test stays hermetic (route.tsx pulls the full Fuse + lazy
// route graph). If you add/remove a key there, mirror it here — the
// assertion below is what guarantees the route-layer redirect and the
// registry never both claim the same id.
const WARROOM_ID_REDIRECTS = [
  'exp-findings', 'exp-posture', 'exp-ctem', 'exp-brand', 'exp-paths',
  'exp-mitigations', 'exp-vendors', 'history-ctem', 'history-vareport',
  'scoring-overview', 'scoring-trends', 'scoring-compliance', 'threat-intel',
]

// The section ids that legitimately still render through WarRoomView
// after the 2026-06-05 accordion collapse: arch-* + sec-* (now served
// via the /architecture/* + /code-scans/* modules) and the orphan
// history-va (CodeActivityView, no promoted home).
const EXPECTED_REGISTRY_IDS = [
  'arch-overview', 'arch-api', 'arch-deps', 'arch-dead-code',
  'arch-complexity', 'arch-frameworks', 'arch-imports', 'arch-repos', 'arch-scan-diff',
  'sec-overview', 'sec-container', 'sec-iac', 'sec-license', 'sec-malware', 'sec-cspm', 'sec-runtime',
  'sec-reachability', 'sec-redteam', 'sec-asset-map', 'sec-news',
  'history-va',
]

// WarRoomView now calls useNavigate (added when sidebar sections
// became clickable routes). Tests must render inside a router or
// the hook throws "may be used only in the context of a <Router>".
function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('WarRoomView', () => {
  beforeEach(() => {
    connectedReposState.value = {
      data: [],
      isLoading: false,
      isError: false,
      isSuccess: true,
      error: null,
      refetch: vi.fn(),
    }
  })

  it('shows no repos message when repos is empty', () => {
    renderWithRouter(<WarRoomView activeSection="arch-overview" />)
    expect(screen.getByText('No repositories connected. Connect a repo to view data.')).toBeDefined()
  })

  it('does not show no-repos while repos are unresolved', () => {
    connectedReposState.value = {
      data: undefined,
      isLoading: true,
      isError: false,
      isSuccess: false,
      error: null,
      refetch: vi.fn(),
    }
    renderWithRouter(<WarRoomView activeSection="arch-overview" />)
    expect(screen.queryByText('No repositories connected. Connect a repo to view data.')).toBeNull()
    expect(screen.getByRole('progressbar')).toBeDefined()
  })

  it('does not crash for coming-soon sections', () => {
    const { container } = renderWithRouter(<WarRoomView activeSection="unknown-section" />)
    expect(container).toBeDefined()
  })
})

describe('sectionRegistry ↔ route-redirect invariant', () => {
  it('no redirected war-room id has a (now-dead) registry entry', () => {
    for (const id of WARROOM_ID_REDIRECTS) {
      expect(isKnownSection(id), `${id} is redirected at the route layer but still has a SECTION_REGISTRY entry — dead code`).toBe(false)
    }
  })

  it('every remaining registry id resolves to a renderable section', () => {
    for (const id of Object.keys(SECTION_REGISTRY)) {
      expect(isKnownSection(id)).toBe(true)
      expect(typeof SECTION_REGISTRY[id].render).toBe('function')
    }
  })

  it('registry contains exactly the expected arch-* / sec-* / history-va ids', () => {
    expect(Object.keys(SECTION_REGISTRY).sort()).toEqual([...EXPECTED_REGISTRY_IDS].sort())
  })
})
