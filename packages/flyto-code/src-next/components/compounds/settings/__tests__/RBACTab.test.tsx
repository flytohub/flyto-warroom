import React from 'react'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SnackbarProvider } from 'notistack'

const useOrgMock = vi.hoisted(() => vi.fn())
const useCapabilitiesMock = vi.hoisted(() => vi.fn())
const useProjectCapabilitiesMock = vi.hoisted(() => vi.fn())
const rbacMocks = vi.hoisted(() => ({
  listRBACRoles: vi.fn(async () => ({
    roles: [
      { id: 'role-viewer', org_id: 'org-1', name: 'viewer-lite', description: '', is_system: false, capabilities: ['asset:read'] },
      { id: 'role-system', name: 'system-auditor', description: '', is_system: true, capabilities: ['system:authz:read'] },
    ],
  })),
  createRBACRole: vi.fn(async () => ({ ok: true })),
  addRBACRoleCapability: vi.fn(async () => ({ ok: true })),
  removeRBACRoleCapability: vi.fn(async () => ({ ok: true })),
  assignRBACUserRole: vi.fn(async () => ({ ok: true })),
  revokeRBACUserRole: vi.fn(async () => ({ ok: true })),
  getRBACUserCapabilities: vi.fn(async () => ({
    org_id: 'org-1',
    user_id: 'user-1',
    capabilities: ['asset:read'],
    count: 1,
    role_ids: ['role-viewer'],
    is_platform_admin: false,
  })),
}))

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

vi.mock('@hooks/useOrg', () => ({
  useOrg: useOrgMock,
}))

vi.mock('@hooks/useCapabilities', () => ({
  useCapabilities: useCapabilitiesMock,
}))

vi.mock('@hooks/useProjectCapabilities', () => ({
  useProjectCapabilities: useProjectCapabilitiesMock,
}))

vi.mock('@lib/engine/system/rbac', () => rbacMocks)

import { RBACTab } from '../RBACTab'

function caps(actions: string[]) {
  return {
    ready: true,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    canDoAction: vi.fn((action: string) => actions.includes(action)),
  }
}

function projectCaps(actions: string[]) {
  return {
    ready: true,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    canUseAction: vi.fn((action: string) => actions.includes(action)),
    actionAccess: vi.fn(),
    canOpenPage: vi.fn(() => true),
  }
}

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <SnackbarProvider>
        <RBACTab />
      </SnackbarProvider>
    </QueryClientProvider>,
  )
}

describe('RBACTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useOrgMock.mockReturnValue({ org: { id: 'org-1', name: 'Acme' } })
    useCapabilitiesMock.mockReturnValue(caps(['system:rbac:read', 'system:rbac:write']))
    useProjectCapabilitiesMock.mockReturnValue(projectCaps(['system:rbac:read', 'system:rbac:write']))
  })

  it('does not list roles without system RBAC read access', () => {
    useCapabilitiesMock.mockReturnValue(caps([]))
    useProjectCapabilitiesMock.mockReturnValue(projectCaps([]))

    renderTab()

    expect(screen.getByRole('alert').textContent).toContain('Roles and permissions require system RBAC read access.')
    expect(rbacMocks.listRBACRoles).not.toHaveBeenCalled()
  })

  it('renders read-only RBAC without mutation controls when write access is missing', async () => {
    useCapabilitiesMock.mockReturnValue(caps(['system:rbac:read']))
    useProjectCapabilitiesMock.mockReturnValue(projectCaps(['system:rbac:read']))

    renderTab()

    expect((await screen.findAllByText('viewer-lite')).length).toBeGreaterThan(0)
    expect(screen.getByText('You can review roles and resolved member access. Editing requires system RBAC write access.')).toBeTruthy()
    expect(screen.getByText('Inspect member access')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /create role/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^assign$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^revoke$/i })).toBeNull()
  })

  it('creates roles only when system RBAC write access is present', async () => {
    renderTab()

    expect((await screen.findAllByText('viewer-lite')).length).toBeGreaterThan(0)
    fireEvent.change(screen.getByLabelText('New role name'), { target: { value: 'security-analyst' } })
    fireEvent.click(screen.getByRole('button', { name: /create role/i }))

    await waitFor(() => {
      expect(rbacMocks.createRBACRole).toHaveBeenCalledWith({
        name: 'security-analyst',
        org_id: 'org-1',
      })
    })
  })
})
