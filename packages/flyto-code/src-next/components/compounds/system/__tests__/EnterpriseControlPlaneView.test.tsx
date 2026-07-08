import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const useOrgMock = vi.hoisted(() => vi.fn())
const useCapabilitiesMock = vi.hoisted(() => vi.fn())
const engineMocks = vi.hoisted(() => ({
  getEventScope: vi.fn(),
  getEnterpriseProfile: vi.fn(),
  getEnterpriseReadiness: vi.fn(),
  listEnterpriseAuditEvents: vi.fn(),
  downloadEnterpriseAuditExport: vi.fn(),
}))
const createObjectURLMock = vi.hoisted(() => vi.fn(() => 'blob:enterprise-audit'))
const revokeObjectURLMock = vi.hoisted(() => vi.fn())

vi.mock('@hooks/useOrg', () => ({
  useOrg: useOrgMock,
}))

vi.mock('@hooks/useCapabilities', () => ({
  useCapabilities: useCapabilitiesMock,
}))

vi.mock('@atoms/FlytoPageHeader', () => ({
  FlytoPageHeader: ({ title, subtitle }: { title: string; subtitle: string }) => (
    <header>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  ),
}))

vi.mock('@lib/engine', () => ({
  getEventScope: engineMocks.getEventScope,
  getEnterpriseProfile: engineMocks.getEnterpriseProfile,
  getEnterpriseReadiness: engineMocks.getEnterpriseReadiness,
  listEnterpriseAuditEvents: engineMocks.listEnterpriseAuditEvents,
  downloadEnterpriseAuditExport: engineMocks.downloadEnterpriseAuditExport,
}))

import { EnterpriseControlPlaneView } from '../EnterpriseControlPlaneView'

function tx(key: string, params?: Record<string, string | number>) {
  return globalThis.__flytoTestT?.(key, params) ?? key
}

function caps(actions: string[]) {
  return {
    ready: true,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    canDoAction: vi.fn((action: string) => actions.includes(action)),
    canUseAction: vi.fn((action: string) => actions.includes(action)),
  }
}

function enterpriseProfile(overrides: Record<string, unknown> = {}) {
  return {
    edition: 'enterprise_airgap',
    deploy_mode: 'airgap',
    license_class: 'enterprise',
    providers: {
      auth: 'saml',
      billing: 'offline',
      storage: 'customer',
      ai: 'disabled',
      threat_intel: 'byo',
    },
    enterprise_enabled: true,
    control_plane: 'enterprise_airgap',
    separated_from_saas: true,
    ...overrides,
  }
}

function auditResponse() {
  return {
    schema_version: 'flyto.enterprise-audit.v1',
    profile: {
      edition: 'enterprise_airgap',
      deploy_mode: 'airgap',
      license_class: 'enterprise',
      providers: {},
      control_plane: 'enterprise_airgap',
      separated_from_saas: true,
    },
    count: 1,
    verification: {
      org_id: 'org-1',
      intact: true,
      count: 1,
      last_hash: 'sha256:last',
    },
    events: [{
      id: 'evt-1',
      org_id: 'org-1',
      actor_type: 'user',
      actor_id: 'user-1',
      action: 'license.updated',
      surface: 'enterprise',
      resource_type: 'license',
      resource_id: 'lic-1',
      outcome: 'success',
      reason: '',
      edition: 'enterprise_airgap',
      deploy_mode: 'airgap',
      source: 'api',
      request_id: 'req-1',
      evidence_id: 'ev-1',
      metadata_json: '{}',
      prev_hash: 'sha256:prev',
      entry_hash: 'sha256:0123456789abcdef',
      created_at: '2026-07-01T01:02:03Z',
    }],
  }
}

function readinessResponse() {
  return {
    schema_version: 'flyto.enterprise-readiness.v1',
    org_id: 'org-1',
    profile: {
      edition: 'enterprise_airgap',
      deploy_mode: 'airgap',
      license_class: 'enterprise',
      providers: {},
      control_plane: 'enterprise_airgap',
      separated_from_saas: true,
    },
    generated_at: '2026-07-01T01:02:03Z',
    summary: {
      status: 'operator_action_required',
      pass: 5,
      warn: 3,
      fail: 0,
      total: 8,
    },
    verification: {
      org_id: 'org-1',
      intact: true,
      count: 1,
      last_hash: 'sha256:last',
    },
    domains: [{
      id: 'audit_evidence',
      status: 'pass',
      controls: [{
        id: 'tamper_evident_ledger',
        status: 'pass',
        capability: 'system:compliance:read',
        evidence: [
          '/api/v1/system/enterprise/audit/events',
          '/api/v1/system/enterprise/audit/export',
        ],
      }],
    }, {
      id: 'operations_resilience',
      status: 'warn',
      controls: [{
        id: 'backup_restore_runbook',
        status: 'warn',
        evidence: ['deploy/enterprise-airgap'],
        operator_action: 'attach_backup_restore_evidence',
      }],
    }],
  }
}

function renderView() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={qc}>
      <EnterpriseControlPlaneView />
    </QueryClientProvider>,
  )
}

describe('EnterpriseControlPlaneView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useOrgMock.mockReturnValue({ org: { id: 'org-1', name: 'Acme' } })
    useCapabilitiesMock.mockReturnValue(caps(['audit:export']))
    engineMocks.getEventScope.mockResolvedValue({ is_platform_admin: true })
    engineMocks.getEnterpriseProfile.mockResolvedValue(enterpriseProfile())
    engineMocks.getEnterpriseReadiness.mockResolvedValue(readinessResponse())
    engineMocks.listEnterpriseAuditEvents.mockResolvedValue(auditResponse())
    engineMocks.downloadEnterpriseAuditExport.mockResolvedValue(new Blob(['{}'], { type: 'application/json' }))
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURLMock })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURLMock })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  })

  it('renders the enterprise audit ledger and exports evidence only through the gated action', async () => {
    renderView()

    expect(await screen.findByText(tx('enterprise.title'))).toBeTruthy()
    expect(await screen.findByText(tx('enterprise.readiness.title'))).toBeTruthy()
    expect(await screen.findByText(tx('enterprise.readiness.domain.audit_evidence'))).toBeTruthy()
    expect(await screen.findByText(tx('enterprise.readiness.control.tamper_evident_ledger'))).toBeTruthy()
    expect(await screen.findByText('/api/v1/system/enterprise/audit/export')).toBeTruthy()
    expect(engineMocks.getEnterpriseReadiness).toHaveBeenCalledWith('org-1')
    expect(await screen.findByText('license.updated')).toBeTruthy()
    expect(screen.getByText(tx('enterprise.audit.chainIntact'))).toBeTruthy()
    expect(engineMocks.listEnterpriseAuditEvents).toHaveBeenCalledWith({
      org: 'org-1',
      outcome: undefined,
      limit: 100,
    })

    const exportButton = screen.getByRole('button', { name: tx('enterprise.audit.exportJson') })
    expect(exportButton.hasAttribute('disabled')).toBe(false)
    fireEvent.click(exportButton)

    await waitFor(() => {
      expect(engineMocks.downloadEnterpriseAuditExport).toHaveBeenCalledWith({
        org: 'org-1',
        outcome: undefined,
        limit: 100,
        format: 'json',
      })
    })
    expect(createObjectURLMock).toHaveBeenCalled()
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:enterprise-audit')
  })

  it('fails closed on export when action permission is missing', async () => {
    useCapabilitiesMock.mockReturnValue(caps([]))

    renderView()

    await screen.findByText('license.updated')
    const exportButton = screen.getByRole('button', { name: tx('enterprise.audit.exportJson') })
    expect(exportButton.hasAttribute('disabled')).toBe(true)
    fireEvent.click(exportButton)

    expect(engineMocks.downloadEnterpriseAuditExport).not.toHaveBeenCalled()
  })

  it('shows SaaS/community boundaries without loading the enterprise-only ledger', async () => {
    engineMocks.getEnterpriseProfile.mockResolvedValue(enterpriseProfile({
      edition: 'saas',
      deploy_mode: 'managed',
      license_class: 'saas',
      enterprise_enabled: false,
      control_plane: 'saas',
      separated_from_saas: false,
    }))

    renderView()

    expect(await screen.findByText(tx('enterprise.saas.disabledTitle'))).toBeTruthy()
    expect(engineMocks.getEnterpriseReadiness).not.toHaveBeenCalled()
    expect(engineMocks.listEnterpriseAuditEvents).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: tx('enterprise.audit.exportJson') })).toBeNull()
  })

  it('fails closed for non-platform admins without calling enterprise-only APIs', async () => {
    engineMocks.getEventScope.mockResolvedValue({ is_platform_admin: false })

    renderView()

    expect((await screen.findAllByText('Platform admin access required')).length).toBeGreaterThan(0)
    expect(screen.getByText('Enterprise control-plane evidence is restricted to platform administrators.')).toBeTruthy()
    expect(engineMocks.getEnterpriseProfile).not.toHaveBeenCalled()
    expect(engineMocks.getEnterpriseReadiness).not.toHaveBeenCalled()
    expect(engineMocks.listEnterpriseAuditEvents).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: tx('enterprise.audit.exportJson') })).toBeNull()
  })
})
