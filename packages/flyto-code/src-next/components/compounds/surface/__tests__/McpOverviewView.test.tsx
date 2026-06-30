import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { McpOverviewView } from '../McpOverviewView'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1', name: 'Test Org' } }),
}))

vi.mock('../mcp/AgentFirewallFlow3D', () => ({
  AgentFirewallFlow3D: () => null,
}))

const mockGetMcpOverview = vi.fn()
const mockGetMcpPolicy = vi.fn()
const mockTestMcpConnection = vi.fn()

vi.mock('@lib/engine', () => ({
  getMcpOverview: (...args: unknown[]) => mockGetMcpOverview(...args),
  getMcpPolicy: (...args: unknown[]) => mockGetMcpPolicy(...args),
  mcpIngestEndpoint: () => 'https://engine.local/api/v1/agent-firewall/ingest',
  testMcpConnection: (...args: unknown[]) => mockTestMcpConnection(...args),
}))

function emptyOverview() {
  return {
    configured: false,
    servers: [],
    serverStatusCounts: {},
    toolTotal: 0,
    unclassifiedTools: 0,
    recentDecisions: [],
    decisionCounts: {},
  }
}

function renderView() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
  render(
    <QueryClientProvider client={qc}>
      <McpOverviewView />
    </QueryClientProvider>,
  )
  return { invalidateSpy }
}

describe('McpOverviewView connection loop', () => {
  beforeEach(() => {
    mockGetMcpOverview.mockReset()
    mockGetMcpPolicy.mockReset()
    mockTestMcpConnection.mockReset()
    mockGetMcpOverview.mockResolvedValue(emptyOverview())
    mockGetMcpPolicy.mockResolvedValue({ defaultMode: 'observe' })
    mockTestMcpConnection.mockResolvedValue({
      eventId: 'mcp_evt_1',
      verdict: 'allow',
      effective: 'proceed',
      rollout: 'observe',
      source: 'policy',
      blocked: false,
    })
  })

  it('renders setup instructions and records a dashboard test connection', async () => {
    const { invalidateSpy } = renderView()

    expect(await screen.findByText('Connect Agent Firewall')).toBeTruthy()
    expect(screen.getByText(/Create an Agent Firewall ingest key/i)).toBeTruthy()
    expect(screen.getAllByText(/https:\/\/engine\.local\/api\/v1\/agent-firewall\/ingest/).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: /Test connection/i }))

    await waitFor(() => expect(mockTestMcpConnection).toHaveBeenCalledWith('org-1'))
    expect(await screen.findByText(/Diagnostic event recorded/)).toBeTruthy()
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['mcp-overview', 'org-1'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['mcp-egress', 'org-1'] })
  })

  it('shows recent decisions even before static server inventory syncs', async () => {
    mockGetMcpOverview.mockResolvedValue({
      ...emptyOverview(),
      recentDecisions: [{
        toolName: 'connection_probe',
        verb: 'READ',
        verdict: 'allow',
        effective: 'proceed',
        stateChange: false,
        externalSideEffect: false,
      }],
      decisionCounts: { proceed: 1 },
    })

    renderView()

    expect(await screen.findByText('Recent Agent Firewall decisions')).toBeTruthy()
    expect(screen.getByText('connection_probe')).toBeTruthy()
    // P2-14 honesty fix: a probe-ONLY state must not claim live agent traffic.
    // The header status chip flips to the diagnostic-only label, and the
    // inventory panel renders the honest "only the dashboard diagnostic probe
    // has been recorded — no live agent traffic yet" message (mcp.diagnosticOnly
    // + mcp.noRegistryDiagnosticOnly). "diagnostic probe" appears in both, so
    // assert each distinctly to lock the intent without a multi-match.
    expect(screen.getByText('diagnostic probe only')).toBeTruthy()
    expect(
      screen.getByText(/Only the dashboard diagnostic probe has been recorded so far/),
    ).toBeTruthy()
  })
})
