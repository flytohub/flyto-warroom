import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RuntimeEventsView } from '../Runtime'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1', name: 'Test Org' } }),
}))

const mockListRuntimeEvents = vi.fn()

vi.mock('@lib/engine', () => ({
  listRuntimeEvents: (...args: unknown[]) => mockListRuntimeEvents(...args),
}))

function renderView() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={qc}>
      <RuntimeEventsView />
    </QueryClientProvider>,
  )
}

describe('RuntimeEventsView RASP coverage', () => {
  beforeEach(() => {
    mockListRuntimeEvents.mockReset()
  })

  it('renders no_agent as a coverage gap instead of a safe empty state', async () => {
    mockListRuntimeEvents.mockResolvedValue({
      count: 0,
      events: [],
      rasp_coverage: {
        status: 'no_agent',
        gap_reason: 'No RASP agent telemetry has been observed in the returned window.',
        stale_after_sec: 900,
        services: [],
      },
    })

    renderView()

    expect(await screen.findByText('No agent observed')).toBeTruthy()
    expect(screen.getByText(/not proof of safety/i)).toBeTruthy()
    expect(screen.getByText('no_agent')).toBeTruthy()
  })

  it('renders degraded RASP service gaps with reasons', async () => {
    mockListRuntimeEvents.mockResolvedValue({
      count: 1,
      rasp_coverage: {
        status: 'degraded',
        gap_reason: 'unsupported',
        stale_after_sec: 900,
        services: [{
          agent_id: 'agent-python-worker',
          service: 'billing-worker',
          runtime: 'python',
          environment: 'prod',
          status: 'unsupported',
          gap_reason: 'runtime not instrumented',
          last_event_at: '2026-06-18T12:00:00Z',
          observed_events: 1,
        }],
      },
      events: [{
        id: 'evt-1',
        org_id: 'org-1',
        api_key_id: 'key-1',
        event_type: 'rasp_coverage_gap',
        source: 'rasp',
        agent_id: 'agent-python-worker',
        service: 'billing-worker',
        runtime: 'python',
        decision: 'gap',
        coverage_status: 'unsupported',
        gap_reason: 'runtime not instrumented',
        threat: 'RASP coverage gap: unsupported',
        path: '',
        ip: '',
        details: 'runtime not instrumented',
        occurred_at: '2026-06-18T12:00:00Z',
        received_at: '2026-06-18T12:00:00Z',
      }],
    })

    renderView()

    expect(await screen.findByText('Coverage degraded')).toBeTruthy()
    expect(screen.getAllByText('billing-worker').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Unsupported runtime').length).toBeGreaterThan(0)
    expect(screen.getByText(/runtime not instrumented/)).toBeTruthy()
    expect(screen.getByText('gap')).toBeTruthy()
  })

  it('marks runtime coverage as not_collected when telemetry read fails', async () => {
    const err = Object.assign(new Error('internal error'), { requestId: 'req-runtime-1' })
    mockListRuntimeEvents.mockRejectedValue(err)

    renderView()

    expect(await screen.findByText('Runtime telemetry unavailable')).toBeTruthy()
    expect(screen.getByText('Not collected')).toBeTruthy()
    expect(screen.getByText('not_collected')).toBeTruthy()
    expect(screen.queryByText('no_agent')).toBeNull()
    expect(screen.getByText(/req-runtime-1/)).toBeTruthy()
  })
})
