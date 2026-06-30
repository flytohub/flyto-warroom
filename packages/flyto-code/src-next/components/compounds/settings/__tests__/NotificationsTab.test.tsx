import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1', name: 'Test Org', role: 'owner', isAdmin: true } }),
}))

const engineMocks = vi.hoisted(() => ({
  listWebhooks: vi.fn(async () => ({ webhooks: [] })),
  createWebhook: vi.fn(),
  deleteWebhook: vi.fn(),
  getScanSchedule: vi.fn(async () => ({ schedule: 'daily' })),
  setScanSchedule: vi.fn(),
  listOrgNotificationChannels: vi.fn(async () => ({
    channels: [{
      id: 'ch-1',
      channel_type: 'slack',
      display_name: 'SOC Slack',
      target_ref: 'sealed:notifsec_abc',
      status: 'active',
    }],
  })),
  createOrgNotificationChannel: vi.fn(async () => ({
    ok: true,
    channel: { id: 'ch-2', channel_type: 'slack', display_name: 'New Slack', target_ref: 'sealed:notifsec_new', status: 'unverified' },
  })),
  testOrgNotificationChannel: vi.fn(async () => ({
    ok: true,
    delivery: {
      status: 'dry_run',
      channel_id: 'ch-1',
      channel_type: 'slack',
      target_ref_status: 'sealed',
      message: 'Dry run only; no outbound notification was sent.',
    },
  })),
  listOrgNotificationRules: vi.fn(async () => ({
    rules: [{
      id: 'rule-1',
      rule_key: 'org_darkweb',
      enabled: true,
      severity: 'critical',
      event_source: 'credential',
      channel_ids: ['ch-1'],
      cooldown_seconds: 1800,
    }],
  })),
  createOrgNotificationRule: vi.fn(),
}))

vi.mock('@lib/engine', () => engineMocks)

import { NotificationsTab } from '../NotificationsTab'

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <NotificationsTab />
    </QueryClientProvider>,
  )
}

describe('NotificationsTab', () => {
  beforeEach(() => {
    Object.values(engineMocks).forEach(mock => mock.mockClear())
  })

  it('uses org-scoped sealed notification channels and dry-run testing', async () => {
    renderTab()

    expect(await screen.findByText('Notification routing')).toBeTruthy()
    expect(await screen.findByText('SOC Slack')).toBeTruthy()
    expect(screen.getByText('sealed destination')).toBeTruthy()
    expect(screen.getByText('org_darkweb · critical · 1')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Dry run'))
    await waitFor(() => expect(engineMocks.testOrgNotificationChannel).toHaveBeenCalledWith('org-1', 'ch-1'))
    expect(await screen.findByText('Last dry run: dry_run / sealed')).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('Channel name'), { target: { value: 'New Slack' } })
    fireEvent.change(screen.getByPlaceholderText('https://hooks.example.com/services/...'), { target: { value: 'https://hooks.slack.com/services/T/B/C' } })
    fireEvent.click(screen.getByText('Add channel'))
    await waitFor(() => expect(engineMocks.createOrgNotificationChannel).toHaveBeenCalledWith('org-1', expect.objectContaining({
      channel_type: 'slack',
      display_name: 'New Slack',
      target_ref: 'https://hooks.slack.com/services/T/B/C',
    })))
  })
})
