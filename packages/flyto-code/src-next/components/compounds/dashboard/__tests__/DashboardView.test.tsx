import React from 'react'
import { beforeEach, describe, it, expect, vi } from 'vitest'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (key: string, fallback: string) => fallback,
}))

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1', name: 'Test Org' }, ready: true, notFound: false, error: null }),
  useConnectedRepos: () => connectedReposState.value,
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

const capabilityState = vi.hoisted(() => ({
  ready: false,
  pages: [] as string[],
}))

const connectedReposState = vi.hoisted(() => ({
  value: {
    data: [] as unknown[],
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null,
    refetch: vi.fn(),
  },
}))

const queryStates = vi.hoisted(() => ({
  byKey: new Map<string, Record<string, unknown>>(),
}))

vi.mock('@hooks/useCapabilities', () => ({
  useCapabilities: () => ({
    ready: capabilityState.ready,
    isLoading: !capabilityState.ready,
    isError: false,
    refetch: vi.fn(),
    canSeePage: (page: string) => (capabilityState.ready ? capabilityState.pages.includes(page) : false),
    canDoAction: () => false,
    hasFeature: () => false,
  }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryKey?: readonly unknown[]; enabled?: boolean }) => {
    const refetch = vi.fn()
    if (options.enabled === false) {
      return { data: undefined, isLoading: false, isError: false, isSuccess: false, error: null, refetch }
    }
    const key = Array.isArray(options.queryKey) ? String(options.queryKey[0]) : 'unknown'
    const state = queryStates.byKey.get(key)
    if (state) return { refetch, error: null, ...state }
    return { data: undefined, isLoading: false, isError: false, isSuccess: true, error: null, refetch }
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock('@lib/engine', () => ({
  getOrgHealthSummary: vi.fn(),
  listAttackSurface: vi.fn(),
  listPentestProjects: vi.fn(),
  getOrgPulse: vi.fn(),
  getComputedScore: vi.fn(),
  getCTEMPriorities: vi.fn(),
  getPeerBaseline: vi.fn(),
  getLeakExposure: vi.fn(),
  getOrgScoreEvents: vi.fn(),
  getCloudPosture: vi.fn(),
  getMcpOverview: vi.fn(),
  getOrgScanDiff: vi.fn(),
}))

import { render, screen } from '@testing-library/react'
import { DashboardView } from '../DashboardView'
import { FixQueueProvider } from '@/contexts/FixQueueContext'

// DashboardView reads from FixQueueContext (added 2026-05-20 for
// the "walk me through fixing" drawer). Tests must wrap in the
// provider — same wrapper the workspace layout uses in production.
function renderDashboard() {
  return render(
    <FixQueueProvider>
      <DashboardView />
    </FixQueueProvider>,
  )
}

describe('DashboardView', () => {
  beforeEach(() => {
    capabilityState.ready = false
    capabilityState.pages = []
    connectedReposState.value = {
      data: [],
      isLoading: false,
      isError: false,
      isSuccess: true,
      error: null,
      refetch: vi.fn(),
    }
    queryStates.byKey.clear()
    queryStates.byKey.set('attack-surface', {
      data: { assets: [] },
      isLoading: false,
      isError: false,
      isSuccess: true,
    })
    queryStates.byKey.set('cloud-posture', {
      data: { resource_count: 0 },
      isLoading: false,
      isError: false,
      isSuccess: true,
    })
    queryStates.byKey.set('mcp-overview', {
      data: { configured: false, servers: [], serverStatusCounts: {}, toolTotal: 0, unclassifiedTools: 0, recentDecisions: [], decisionCounts: {} },
      isLoading: false,
      isError: false,
      isSuccess: true,
    })
  })

  it('does not render empty state before presence queries resolve', () => {
    capabilityState.ready = true
    capabilityState.pages = ['domains', 'repos', 'cspm']
    queryStates.byKey.set('attack-surface', {
      data: undefined,
      isLoading: true,
      isError: false,
      isSuccess: false,
    })
    renderDashboard()
    expect(screen.queryByText('Welcome to Warroom')).toBeNull()
  })

  it('renders empty state after presence queries resolve empty', () => {
    capabilityState.ready = true
    capabilityState.pages = ['repos']
    renderDashboard()
    expect(screen.getByText('Welcome to Warroom')).toBeDefined()
  })

  it('does not crash with empty data', () => {
    const { container } = renderDashboard()
    expect(container).toBeDefined()
  })

  it('does not show product CTAs before capabilities are ready', () => {
    renderDashboard()
    expect(screen.queryByText('Welcome to Warroom')).toBeNull()
    expect(screen.queryByText('Add a domain')).toBeNull()
    expect(screen.queryByText('Connect repositories')).toBeNull()
    expect(screen.queryByText('Connect a cloud account')).toBeNull()
  })

  it('shows only server-authorized empty-state CTAs', () => {
    capabilityState.ready = true
    capabilityState.pages = ['repos']
    renderDashboard()
    expect(screen.queryByText('Add a domain')).toBeNull()
    expect(screen.getByText('Connect repositories')).toBeDefined()
    expect(screen.queryByText('Connect a cloud account')).toBeNull()
    expect(screen.queryByText('Connect runtime telemetry')).toBeNull()
  })

  it('offers runtime onboarding when only the runtime surface is entitled', () => {
    capabilityState.ready = true
    capabilityState.pages = ['mcp']
    renderDashboard()
    expect(screen.getByText('Welcome to Warroom')).toBeDefined()
    expect(screen.getByText('Connect runtime telemetry')).toBeDefined()
    expect(screen.queryByText('Connect repositories')).toBeNull()
  })

  it('does not render empty state when runtime telemetry exists', () => {
    capabilityState.ready = true
    capabilityState.pages = ['mcp']
    queryStates.byKey.set('mcp-overview', {
      data: {
        configured: true,
        servers: [{ id: 'mcp-1', name: 'Gateway', transport: 'sse', deploymentKind: 'edge', status: 'active', toolCount: 2, unclassifiedTools: 0, writeTools: 1 }],
        serverStatusCounts: { active: 1 },
        toolTotal: 2,
        unclassifiedTools: 0,
        recentDecisions: [],
        decisionCounts: {},
      },
      isLoading: false,
      isError: false,
      isSuccess: true,
    })
    renderDashboard()
    expect(screen.queryByText('Welcome to Warroom')).toBeNull()
  })

  it('renders cockpit navigation and the human posture model for active surfaces', async () => {
    capabilityState.ready = true
    capabilityState.pages = ['mcp']
    queryStates.byKey.set('mcp-overview', {
      data: {
        configured: true,
        servers: [{ id: 'mcp-1', name: 'Gateway', transport: 'sse', deploymentKind: 'edge', status: 'active', toolCount: 2, unclassifiedTools: 0, writeTools: 1 }],
        serverStatusCounts: { active: 1 },
        toolTotal: 2,
        unclassifiedTools: 0,
        recentDecisions: [],
        decisionCounts: {},
      },
      isLoading: false,
      isError: false,
      isSuccess: true,
    })

    renderDashboard()

    expect(screen.getByRole('navigation', { name: 'Dashboard workbench navigation' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Open Runtime' })).toBeDefined()
    expect(screen.getByText('Human security posture')).toBeDefined()
    expect(screen.getByText('Your org as a living attack surface')).toBeDefined()
    expect(await screen.findByRole('img', { name: 'Human security posture model' })).toBeDefined()
  })
})
