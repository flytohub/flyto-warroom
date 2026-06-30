import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMyCapabilities, type Capabilities } from '@lib/engine'
import { useCapabilities } from '../useCapabilities'

vi.mock('@lib/engine', () => ({
  getMyCapabilities: vi.fn(),
}))

const baseCapabilities: Capabilities = {
  tier: 'code',
  plan: 'pro',
  billing_mode: 'live',
  role: 'member',
  project_type: 'code',
  edition: 'enterprise_airgap',
  deploy_mode: 'enterprise_airgap',
  license_class: 'commercial',
  providers: {
    auth: 'enterprise_jwt',
    billing: 'offline_license',
    storage: 'minio',
    ai: 'local_openai_compatible',
    threat_intel: 'offline_bundle',
  },
  hidden_surfaces: ['marketplace', 'billing'],
  unsupported_actions: ['billing.checkout', 'marketplace.open'],
  features: ['code_audit'],
  visible_pages: ['issues'],
  permissions: ['scan:trigger'],
  surfaces: {
    code: { state: 'enabled', billing_behavior: 'included' },
    darkweb: { state: 'locked_preview', billing_behavior: 'addon_required', paywall_key: 'darkweb_intel' },
    ai: { state: 'enabled', billing_behavior: 'credit_required', paywall_key: 'ai_credits' },
    cloud_cspm: { state: 'hidden', billing_behavior: 'blocked' },
  },
  page_states: {
    issues: { state: 'enabled' },
    threat_intel: { state: 'locked_preview', paywall_key: 'darkweb_intel' },
  },
  actions: {
    'report.export': { state: 'payment_required', billing_behavior: 'addon_required', reason: 'Report export requires an add-on.' },
    'ai.chat': { state: 'allowed', billing_behavior: 'included' },
    'ai.report': { state: 'payment_required', billing_behavior: 'credit_required', reason: 'AI report requires credits.', paywall_key: 'ai_credits' },
    'ai.redteam.plan': { state: 'blocked', billing_behavior: 'blocked', reason: 'Role cannot run AI red-team planning.', required_action: 'pentest:run' },
  },
  meters: {
    'ai.tokens': { billing_behavior: 'credit_required', quota: 1000, used: 750, remaining: 250 },
  },
  paywalls: {
    darkweb_intel: { title: 'Unlock Darkweb', message: 'Darkweb monitoring requires an add-on.', cta_key: 'buy_darkweb' },
    ai_credits: { title: 'Add AI credits', message: 'AI reports require available credits.', cta_key: 'buy_ai_credits' },
  },
  seat_cap: 10,
  repo_cap: 50,
  domain_cap: 0,
}

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

describe('useCapabilities', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fails closed before the backend snapshot resolves', () => {
    vi.mocked(getMyCapabilities).mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useCapabilities('org-1'), { wrapper: wrapper() })

    expect(result.current.ready).toBe(false)
    expect(result.current.canSeePage('issues')).toBe(false)
    expect(result.current.canOpenPage('issues')).toBe(false)
    expect(result.current.surfaceState('code').state).toBe('hidden')
    expect(result.current.canUseSurface('code')).toBe(false)
    expect(result.current.isSurfaceHidden('marketplace')).toBe(true)
    expect(result.current.canDoAction('scan:trigger')).toBe(false)
    expect(result.current.canUseAction('scan:trigger')).toBe(false)
    expect(result.current.isActionUnsupported('billing.checkout')).toBe(true)
    expect(result.current.isEdition('enterprise_airgap')).toBe(false)
    expect(result.current.providerFor('billing')).toBeUndefined()
    expect(result.current.hasFeature('code_audit')).toBe(false)
  })

  it('allows only pages, actions, and features returned by the backend', async () => {
    vi.mocked(getMyCapabilities).mockResolvedValue(baseCapabilities)

    const { result } = renderHook(() => useCapabilities('org-1'), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.canSeePage('issues')).toBe(true)
    expect(result.current.canOpenPage('issues')).toBe(true)
    expect(result.current.pageState('threat_intel').state).toBe('locked_preview')
    expect(result.current.surfaceState('darkweb').state).toBe('locked_preview')
    expect(result.current.canUseSurface('darkweb')).toBe(false)
    expect(result.current.surfaceState('ai').billing_behavior).toBe('credit_required')
    expect(result.current.canUseSurface('ai')).toBe(true)
    expect(result.current.surfaceState('cloud_cspm').state).toBe('hidden')
    expect(result.current.isSurfaceHidden('marketplace')).toBe(true)
    expect(result.current.isSurfaceHidden('cloud_cspm')).toBe(true)
    expect(result.current.isSurfaceHidden('code')).toBe(false)
    expect(result.current.canOpenPage('threat_intel')).toBe(true)
    expect(result.current.canSeePage('threat_intel')).toBe(false)
    expect(result.current.canSeePage('domains')).toBe(false)
    expect(result.current.canDoAction('scan:trigger')).toBe(true)
    expect(result.current.canUseAction('scan:trigger')).toBe(true)
    expect(result.current.canUseAction('report.export')).toBe(false)
    expect(result.current.actionAccess('report.export')?.state).toBe('payment_required')
    expect(result.current.canUseAction('ai.chat')).toBe(true)
    expect(result.current.canUseAction('ai.report')).toBe(false)
    expect(result.current.actionAccess('ai.report')?.billing_behavior).toBe('credit_required')
    expect(result.current.canUseAction('ai.redteam.plan')).toBe(false)
    expect(result.current.actionAccess('ai.redteam.plan')?.required_action).toBe('pentest:run')
    expect(result.current.canUseAction('billing.checkout')).toBe(false)
    expect(result.current.isActionUnsupported('billing.checkout')).toBe(true)
    expect(result.current.isActionUnsupported('ai.redteam.plan')).toBe(true)
    expect(result.current.isActionUnsupported('scan:trigger')).toBe(false)
    expect(result.current.isEdition('enterprise_airgap')).toBe(true)
    expect(result.current.isEdition('community')).toBe(false)
    expect(result.current.providerFor('billing')).toBe('offline_license')
    expect(result.current.providerFor('ai')).toBe('local_openai_compatible')
    expect(result.current.meters?.['ai.tokens']?.remaining).toBe(250)
    expect(result.current.paywallFor('ai_credits')?.cta_key).toBe('buy_ai_credits')
    expect(result.current.paywallFor('darkweb_intel')?.cta_key).toBe('buy_darkweb')
    expect(result.current.canDoAction('pentest:run')).toBe(false)
    expect(result.current.hasFeature('code_audit')).toBe(true)
    expect(result.current.hasFeature('ctem')).toBe(false)
  })

  it('normalizes payment gates while billing is in preview mode', async () => {
    vi.mocked(getMyCapabilities).mockResolvedValue({
      ...baseCapabilities,
      billing_mode: 'preview',
      permissions: ['scan:trigger', 'report:export', 'autofix:open_pr'],
    })

    const { result } = renderHook(() => useCapabilities('org-1'), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.pageState('threat_intel').state).toBe('enabled')
    expect(result.current.canSeePage('threat_intel')).toBe(true)
    expect(result.current.canOpenPage('threat_intel')).toBe(true)
    expect(result.current.surfaceState('darkweb')).toMatchObject({
      state: 'enabled',
      billing_behavior: 'included',
    })
    expect(result.current.canUseSurface('darkweb')).toBe(true)
    expect(result.current.surfaceState('ai')).toMatchObject({
      state: 'enabled',
      billing_behavior: 'included',
    })
    expect(result.current.canUseAction('report.export')).toBe(true)
    expect(result.current.actionAccess('report.export')).toMatchObject({
      state: 'allowed',
      billing_behavior: 'included',
    })
    expect(result.current.canUseAction('ai.report')).toBe(true)
    expect(result.current.actionAccess('ai.report')).toMatchObject({
      state: 'allowed',
      billing_behavior: 'included',
    })
    expect(result.current.canUseAction('ai.redteam.plan')).toBe(false)
    expect(result.current.actionAccess('ai.redteam.plan')?.required_action).toBe('pentest:run')
    expect(result.current.paywallFor('ai_credits')).toBeUndefined()
    expect(result.current.paywallFor('darkweb_intel')).toBeUndefined()
  })
})
