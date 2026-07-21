import type { PropsWithChildren } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const orgState = vi.hoisted(() => ({ id: 'org-1' }))
const engine = vi.hoisted(() => ({
  listRuns: vi.fn(),
  createRun: vi.fn(),
  getEvidence: vi.fn(),
  getScope: vi.fn(),
  listScanner: vi.fn(),
  patchScanner: vi.fn(),
  runScanner: vi.fn(),
}))

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: orgState.id ? { id: orgState.id, name: 'Flyto2' } : null }),
}))

vi.mock('@lib/engine', () => ({
  listWarroomVerificationRuns: engine.listRuns,
  createWarroomVerificationRun: engine.createRun,
  getWarroomVerificationEvidence: engine.getEvidence,
  getEventScope: engine.getScope,
  listProductVerificationScanner: engine.listScanner,
  patchProductVerificationScanner: engine.patchScanner,
  runProductVerificationScannerNow: engine.runScanner,
}))

import { useProductVerificationController } from '../useProductVerificationController'

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { queryClient, wrapper }
}

describe('useProductVerificationController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    orgState.id = 'org-1'
    engine.listRuns.mockResolvedValue({ ok: true, graph_contract: 'warroom.product_verification.v1', runs: [] })
    engine.createRun.mockResolvedValue({ ok: true, graph_contract: 'warroom.product_verification.v1' })
    engine.getScope.mockResolvedValue({ is_platform_admin: true })
    engine.listScanner.mockResolvedValue({ scanners: [], scanner: null })
    engine.getEvidence.mockResolvedValue({ ok: true, artifacts: [] })
    engine.patchScanner.mockResolvedValue({ ok: true })
    engine.runScanner.mockResolvedValue({ ok: true })
  })

  it('submits a normalized run payload and invalidates the run ledger', async () => {
    const { queryClient, wrapper } = createHarness()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useProductVerificationController(), { wrapper })
    await waitFor(() => expect(engine.listRuns).toHaveBeenCalledWith('org-1'))

    act(() => {
      result.current.setTargetUrl('  https://customer.example/app  ')
      result.current.setRepoId('  repo-42  ')
      result.current.setDryRun(false)
    })
    expect(result.current.canRun).toBe(true)

    await act(async () => {
      await result.current.createRun.mutateAsync()
    })

    expect(engine.createRun).toHaveBeenCalledWith('org-1', {
      target_url: 'https://customer.example/app',
      repo_id: 'repo-42',
      dry_run: false,
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['warroom-verification-runs', 'org-1'] })
  })

  it('does not read an organization run ledger when no organization is selected', async () => {
    orgState.id = ''
    const { wrapper } = createHarness()
    const { result } = renderHook(() => useProductVerificationController(), { wrapper })

    await waitFor(() => expect(engine.getScope).toHaveBeenCalledTimes(1))
    expect(engine.listRuns).not.toHaveBeenCalled()
    expect(engine.getEvidence).not.toHaveBeenCalled()
    expect(result.current.canRun).toBe(false)
  })

  it('invalidates scanner and run state after a manual scheduler execution', async () => {
    const { queryClient, wrapper } = createHarness()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useProductVerificationController(), { wrapper })
    await waitFor(() => expect(engine.listScanner).toHaveBeenCalledTimes(1))

    await act(async () => {
      await result.current.runScannerNow.mutateAsync()
    })

    expect(engine.runScanner).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['system-scanners'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['warroom-verification-runs', 'org-1'] })
  })
})
