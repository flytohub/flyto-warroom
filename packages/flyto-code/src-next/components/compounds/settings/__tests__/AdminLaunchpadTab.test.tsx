import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SnackbarProvider } from 'notistack'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1', role: 'owner', isAdmin: true } }),
}))

const launchpadMocks = vi.hoisted(() => ({
  applyLaunchpadPack: vi.fn(async () => ({ applied: true, packId: 'ctem-intelligence', actions: [], counts: {} })),
}))

vi.mock('@lib/engine/platform/launchpad', () => ({
  listLaunchpadPacks: vi.fn(async () => ({
    packs: [{
      id: 'ctem-intelligence',
      name: 'CTEM Intelligence Pack',
      description: 'Bootstraps CTEM and BOY validation.',
      category: 'security-intelligence',
      rolePresets: [{ name: 'CTEM Analyst', description: 'Investigates evidence.', capabilities: ['asset:read'] }],
      notificationRules: [{ ruleKey: 'launchpad_fusion_divergence', severity: 'warning', eventSource: 'fusion_divergence', conditionJson: '{}', cooldownSeconds: 1800 }],
      reportTemplates: [{ id: 'tpl', name: 'CTEM Intelligence Overview', category: 'ctem', config: {} }],
      reportComponents: [{ id: 'cmp', name: 'Research Footprints', dataSourceId: 'research-footprints', chartType: 'table', defaultCols: 12 }],
      apiKeyPresets: [{ name: 'Read-only reporting bot', scopes: 'read,report:view' }],
      connectorHints: [{ providerId: 'bitsight', mappingId: 'bitsight.v1', sourceSystemType: 'external_posture', recommendedRunbook: 'portfolio_companies_to_findings' }],
    }],
  })),
  dryRunLaunchpadPack: vi.fn(async () => ({
    packId: 'ctem-intelligence',
    counts: { roles: 1, notification_rules: 1 },
    actions: [
      { kind: 'role', target: 'CTEM Analyst', state: 'create', summary: 'Investigates evidence.' },
      { kind: 'notification_rule', target: 'launchpad_fusion_divergence', state: 'create_or_update', summary: 'fusion_divergence / warning' },
      { kind: 'report_template', target: 'CTEM Intelligence Overview', state: 'create', summary: 'ctem' },
      { kind: 'connector_hint', target: 'bitsight', state: 'template', summary: 'bitsight.v1 / portfolio_companies_to_findings' },
      { kind: 'api_key_preset', target: 'Read-only reporting bot', state: 'documented', summary: 'read,report:view' },
    ],
  })),
  applyLaunchpadPack: launchpadMocks.applyLaunchpadPack,
}))

import { AdminLaunchpadTab } from '../AdminLaunchpadTab'

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <SnackbarProvider>
        <AdminLaunchpadTab />
      </SnackbarProvider>
    </QueryClientProvider>,
  )
}

describe('AdminLaunchpadTab', () => {
  it('shows launchpad pack dry-run actions and applies through the engine client', async () => {
    renderTab()
    expect((await screen.findAllByText('CTEM Intelligence Pack')).length).toBeGreaterThan(0)
    expect(await screen.findByText('CTEM Analyst')).toBeTruthy()
    expect(screen.getByText('launchpad_fusion_divergence')).toBeTruthy()
    expect(screen.getByText('CTEM Intelligence Overview')).toBeTruthy()
    expect(screen.getByText('bitsight')).toBeTruthy()
    expect(screen.getByText('Read-only reporting bot')).toBeTruthy()

    fireEvent.click(screen.getByText('Apply pack'))
    await waitFor(() => expect(launchpadMocks.applyLaunchpadPack).toHaveBeenCalledWith('org-1', 'ctem-intelligence'))
  })
})
