import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FeatureGate } from '../FeatureGate'

const useCapabilitiesMock = vi.hoisted(() => vi.fn())
const useProjectCapabilitiesMock = vi.hoisted(() => vi.fn())

vi.mock('@hooks/useCapabilities', () => ({
  useCapabilities: useCapabilitiesMock,
}))

vi.mock('@hooks/useProjectCapabilities', () => ({
  useProjectCapabilities: useProjectCapabilitiesMock,
}))

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

function renderGate(page = 'cloud_posture') {
  return render(
    <MemoryRouter initialEntries={['/projects/org-1/cloud-posture']}>
      <Routes>
        <Route
          path="/projects/:orgId/cloud-posture"
          element={(
            <FeatureGate page={page}>
              <div>gated page content</div>
            </FeatureGate>
          )}
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('FeatureGate', () => {
  afterEach(() => {
    useCapabilitiesMock.mockReset()
    useProjectCapabilitiesMock.mockReset()
  })

  beforeEach(() => {
    useProjectCapabilitiesMock.mockReturnValue({
      isLoading: false,
      isError: false,
      ready: true,
      refetch: vi.fn(),
      canOpenPage: vi.fn(() => true),
      canUseAction: vi.fn(() => true),
      actionAccess: vi.fn(),
    })
  })

  it('shows a stable loading state before capabilities resolve', () => {
    useCapabilitiesMock.mockReturnValue({
      isLoading: true,
      isError: false,
      ready: false,
      refetch: vi.fn(),
      canSeePage: vi.fn(),
      pageState: vi.fn(() => ({ state: 'hidden' })),
      paywallFor: vi.fn(),
    })

    renderGate()

    expect(screen.getByRole('progressbar')).toBeTruthy()
    expect(screen.queryByText('gated page content')).toBeNull()
  })

  it('renders an explicit disabled-module state instead of flashing or redirecting', () => {
    useCapabilitiesMock.mockReturnValue({
      isLoading: false,
      isError: false,
      ready: true,
      refetch: vi.fn(),
      canSeePage: vi.fn(() => false),
      pageState: vi.fn(() => ({ state: 'hidden' })),
      paywallFor: vi.fn(),
    })

    renderGate()

    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.getByText('Module not enabled')).toBeTruthy()
    expect(screen.getByText('cloud_posture')).toBeTruthy()
    expect(screen.getByRole('button', { name: /back to dashboard/i })).toBeTruthy()
    expect(screen.queryByText('gated page content')).toBeNull()
  })

  it('renders children when the backend capability allows the page', () => {
    useCapabilitiesMock.mockReturnValue({
      isLoading: false,
      isError: false,
      ready: true,
      refetch: vi.fn(),
      canSeePage: vi.fn((page: string) => page === 'cloud_posture'),
      pageState: vi.fn((page: string) => ({ state: page === 'cloud_posture' ? 'enabled' : 'hidden' })),
      paywallFor: vi.fn(),
    })

    renderGate()

    expect(screen.getByText('gated page content')).toBeTruthy()
    expect(screen.queryByText('Module not enabled')).toBeNull()
  })

  it('fails closed when the project module registry does not expose the page', () => {
    useCapabilitiesMock.mockReturnValue({
      isLoading: false,
      isError: false,
      ready: true,
      refetch: vi.fn(),
      canSeePage: vi.fn((page: string) => page === 'cloud_posture'),
      pageState: vi.fn((page: string) => ({ state: page === 'cloud_posture' ? 'enabled' : 'hidden' })),
      paywallFor: vi.fn(),
    })
    useProjectCapabilitiesMock.mockReturnValue({
      isLoading: false,
      isError: false,
      ready: true,
      refetch: vi.fn(),
      canOpenPage: vi.fn(() => false),
      canUseAction: vi.fn(() => false),
      actionAccess: vi.fn(() => ({ state: 'blocked', reason: 'module_disabled' })),
    })

    renderGate()

    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.getByText('Module not enabled')).toBeTruthy()
    expect(screen.queryByText('gated page content')).toBeNull()
  })

  it('fails closed and offers retry when the capability snapshot errors', () => {
    const refetch = vi.fn()
    useCapabilitiesMock.mockReturnValue({
      isLoading: false,
      isError: true,
      ready: false,
      refetch,
      canSeePage: vi.fn((page: string) => page === 'cloud_posture'),
      pageState: vi.fn(() => ({ state: 'hidden' })),
      paywallFor: vi.fn(),
    })

    renderGate()

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('Capabilities unavailable')).toBeTruthy()
    expect(screen.queryByText('gated page content')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('renders locked-preview paywall when the backend exposes a page preview', () => {
    useCapabilitiesMock.mockReturnValue({
      isLoading: false,
      isError: false,
      ready: true,
      refetch: vi.fn(),
      canSeePage: vi.fn(() => false),
      pageState: vi.fn(() => ({
        state: 'locked_preview',
        paywall_key: 'darkweb_intel',
        required_sku: 'flyto_darkweb_monthly',
      })),
      paywallFor: vi.fn(() => ({
        title: 'Unlock Darkweb intelligence',
        message: 'Monitor leaked credentials and threat catalogs.',
        cta_key: 'buy_darkweb',
      })),
    })

    renderGate('threat_intel')

    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.getByText('Unlock Darkweb intelligence')).toBeTruthy()
    expect(screen.getByText('flyto_darkweb_monthly')).toBeTruthy()
    expect(screen.queryByText('gated page content')).toBeNull()
  })
})
