import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { MCPPolicySimulate } from '../MCPPolicySimulate'

// tOr → identity-on-fallback so assertions read against the English defaults.
vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

const mockSimulate = vi.fn()
vi.mock('@lib/engine/code/mcp', () => ({
  simulateMCPPolicy: (...args: unknown[]) => mockSimulate(...args),
}))

// Lightweight stand-ins for the shared atoms so the test exercises the
// compound's own logic (mutation wiring, JSON validation, diff rendering)
// without dragging in material-react-table.
vi.mock('@compounds/_shared', () => ({
  KpiCard: ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div data-testid="kpi">{label}: {String(value)}</div>
  ),
  SeverityChip: ({ label }: { label: string }) => <span data-testid="sev-chip">{label}</span>,
  DataTable: ({ data }: { data: Array<{ toolName: string }> }) => (
    <div data-testid="flip-table">
      {data.map((r, i) => <div key={i} data-testid="flip-row">{r.toolName}</div>)}
    </div>
  ),
}))

function renderSimulate(props?: Partial<React.ComponentProps<typeof MCPPolicySimulate>>) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={qc}>
      <MCPPolicySimulate
        orgId="org-1"
        mode="enforce"
        policyJson=""
        {...props}
      />
    </QueryClientProvider>,
  )
}

const SIM_RESULT = {
  evaluated: 12,
  wouldBlock: 4,
  newlyBlocked: 2,
  newlyAllowed: 1,
  byVerdict: { block: 4, allow: 8 },
  sampleFlips: [
    {
      eventId: 'mcp_evt_1',
      toolName: 'fs.write',
      verb: 'WRITE',
      wasBlocked: false,
      nowBlocked: true,
      verdict: 'block',
      floorRule: 'floor.state_change',
    },
  ],
}

describe('MCPPolicySimulate', () => {
  beforeEach(() => {
    mockSimulate.mockReset()
    mockSimulate.mockResolvedValue(SIM_RESULT)
  })

  it('runs the simulation against the candidate mode and renders the decision diff', async () => {
    renderSimulate({ mode: 'enforce', policyJson: '' })

    fireEvent.click(screen.getByRole('button', { name: /Simulate draft policy/i }))

    await waitFor(() =>
      expect(mockSimulate).toHaveBeenCalledWith('org-1', { defaultMode: 'enforce', policy: undefined }),
    )

    // KPI tiles reflect the returned diff.
    expect(await screen.findByText('Evaluated: 12')).toBeTruthy()
    expect(screen.getByText('Would block: 4')).toBeTruthy()
    expect(screen.getByText('Newly blocked: 2')).toBeTruthy()
    expect(screen.getByText('Newly allowed: 1')).toBeTruthy()

    // Sample flip row surfaces.
    expect(screen.getByTestId('flip-table')).toBeTruthy()
    expect(screen.getByText('fs.write')).toBeTruthy()
  })

  it('forwards a parsed candidate policy when valid JSON is supplied', async () => {
    renderSimulate({ mode: 'soft_enforce', policyJson: '{"floors":["x"]}' })

    fireEvent.click(screen.getByRole('button', { name: /Simulate draft policy/i }))

    await waitFor(() =>
      expect(mockSimulate).toHaveBeenCalledWith('org-1', {
        defaultMode: 'soft_enforce',
        policy: { floors: ['x'] },
      }),
    )
  })

  it('surfaces a JSON error without calling the endpoint when policyJson is invalid', async () => {
    renderSimulate({ mode: 'enforce', policyJson: '{ not valid json' })

    fireEvent.click(screen.getByRole('button', { name: /Simulate draft policy/i }))

    expect(await screen.findByText(/Policy JSON is invalid/i)).toBeTruthy()
    expect(mockSimulate).not.toHaveBeenCalled()
  })
})
