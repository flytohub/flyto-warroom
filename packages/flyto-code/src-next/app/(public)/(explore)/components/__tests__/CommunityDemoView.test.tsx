import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { envMock, getLoopMock } = vi.hoisted(() => ({
  envMock: { authMode: 'community' },
  getLoopMock: vi.fn(),
}))

vi.mock('@lib/env', () => ({ env: envMock }))
vi.mock('@lib/engine/platform/community', () => ({
  getCEProductLoop: getLoopMock,
}))

import CommunityDemoView from '../CommunityDemoView'

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <CommunityDemoView />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('CommunityDemoView', () => {
  beforeEach(() => {
    envMock.authMode = 'community'
    getLoopMock.mockReset()
    getLoopMock.mockResolvedValue({
      schema: 'flyto.engine-ce-product-loop.v1',
      product: 'Flyto2 Warroom CE',
      edition: 'community',
      data_mode: 'deterministic_demo_seed',
      provider_execution: 'none',
      scope: { workspace_id: 'demo', org_id: 'demo', surfaces: [], safe_mode: 'read_only' },
      summary: {
        asset_count: 0,
        finding_count: 0,
        attack_path_count: 0,
        evidence_count: 0,
        remediation_count: 0,
        validation_count: 0,
        impacted_assets: [],
      },
      evidence: [],
      enterprise_overlay: [],
      generated_at: '2026-07-21T00:00:00Z',
    })
  })

  it('renders the source-built CE product loop without authentication', async () => {
    renderView()

    await waitFor(() => {
      expect(screen.getAllByText(globalThis.__flytoTestT?.('communityLoop.title'))).toHaveLength(2)
    })
    expect(getLoopMock).toHaveBeenCalledTimes(1)
  })

  it('does not expose the public CE route in non-community builds', () => {
    envMock.authMode = 'enterprise'
    const { container } = renderView()

    expect(container.textContent).toBe('')
    expect(getLoopMock).not.toHaveBeenCalled()
  })
})
