import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getLoopMock = vi.hoisted(() => vi.fn())

vi.mock('@lib/engine/platform/community', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@lib/engine/platform/community')>()
  return { ...actual, getCEProductLoop: getLoopMock }
})

import { CommunityProductLoopPanel } from '../CommunityProductLoopPanel'

const loop = {
  schema: 'flyto.engine-ce-product-loop.v1',
  product: 'Flyto2 Warroom CE',
  edition: 'community' as const,
  data_mode: 'deterministic_demo_seed',
  provider_execution: 'none',
  scope: {
    workspace_id: 'ce-demo-workspace',
    org_id: 'ce-demo-org',
    surfaces: ['code', 'container', 'cloud', 'runtime', 'external'] as const,
    safe_mode: 'non_destructive_read_only',
  },
  summary: {
    asset_count: 5,
    finding_count: 4,
    attack_path_count: 1,
    evidence_count: 3,
    remediation_count: 3,
    validation_count: 2,
    impacted_assets: [],
  },
  evidence: [{
    id: 'ev-1',
    finding_id: 'finding-1',
    kind: 'package_graph',
    replayable: true,
    artifacts: ['dependency-path.json'],
    signature: 'ce-demo-sig',
    redaction: 'no_secrets',
    generated_by: 'ce_kernel',
  }],
  enterprise_overlay: [{
    capability: 'immutable_audit_export',
    ce_behavior: 'local_evidence_summary',
    paid_overlay: 'enterprise_audit_ledger',
  }],
  generated_at: '2026-07-21T00:00:00Z',
}

function renderPanel(enabled = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CommunityProductLoopPanel enabled={enabled} />
    </QueryClientProvider>,
  )
}

describe('CommunityProductLoopPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getLoopMock.mockResolvedValue(loop)
  })

  it('stays hidden when the community edition is not active', () => {
    const { container } = renderPanel(false)
    expect(container.innerHTML).toBe('')
    expect(getLoopMock).not.toHaveBeenCalled()
  })

  it('shows the deterministic multi-surface loop and expands evidence', async () => {
    renderPanel()

    expect(await screen.findByText(globalThis.__flytoTestT?.('communityLoop.title'))).toBeTruthy()
    expect(getLoopMock).toHaveBeenCalledTimes(1)
    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.getByText('4')).toBeTruthy()

    const inspect = screen.getByRole('button', {
      name: globalThis.__flytoTestT?.('communityLoop.inspectEvidence'),
    })
    expect(inspect.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(inspect)

    expect(await screen.findByText(/Package and reachability graph/)).toBeTruthy()
    expect(screen.getByText(/Immutable enterprise audit ledger and signed export/)).toBeTruthy()
    expect(inspect.getAttribute('aria-expanded')).toBe('true')
  })

  it('surfaces a failed CE contract and retries on demand', async () => {
    getLoopMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(loop)
    renderPanel()

    expect(await screen.findByText(globalThis.__flytoTestT?.('communityLoop.loadFailed'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: globalThis.__flytoTestT?.('communityLoop.retry') }))

    await waitFor(() => expect(getLoopMock).toHaveBeenCalledTimes(2))
    expect(await screen.findByText(globalThis.__flytoTestT?.('communityLoop.title'))).toBeTruthy()
  })
})
