import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1', name: 'Test Org', role: 'owner', isAdmin: true } }),
}))

// Mock SettingsNav to render clickable buttons for tab switching
let onSelectCapture: ((cat: string) => void) | null = null
vi.mock('../SettingsNav', () => ({
  SettingsNav: ({ active, onSelect }: { active: string; onSelect: (cat: string) => void }) => {
    onSelectCapture = onSelect
    return (
      <div data-testid="settings-nav" data-active={active}>
        <button onClick={() => onSelect('general')}>General</button>
        <button onClick={() => onSelect('launchpad')}>Admin Launchpad</button>
        <button onClick={() => onSelect('members')}>Members</button>
        <button onClick={() => onSelect('source-control')}>Source Control</button>
        <button onClick={() => onSelect('notifications')}>Notifications</button>
        <button onClick={() => onSelect('scanning')}>Scanning</button>
        <button onClick={() => onSelect('ci-gate')}>CI Gate</button>
        <button onClick={() => onSelect('budget-policies')}>Budget Policies</button>
        <button onClick={() => onSelect('api-keys')}>API Keys</button>
        <button onClick={() => onSelect('scan-log')}>Scan Log</button>
        <button onClick={() => onSelect('local-upload')}>Local Upload</button>
      </div>
    )
  },
}))

// Mock all tab components
vi.mock('../GeneralTab', () => ({
  GeneralTab: () => <div data-testid="general-tab">General Content</div>,
}))
vi.mock('../AdminLaunchpadTab', () => ({
  AdminLaunchpadTab: () => <div data-testid="launchpad-tab">Launchpad Content</div>,
}))
vi.mock('../MembersTab', () => ({
  MembersTab: () => <div data-testid="members-tab">Members Content</div>,
}))
vi.mock('../SourceControlTab', () => ({
  SourceControlTab: () => <div data-testid="source-control-tab">Source Control Content</div>,
}))
vi.mock('../NotificationsTab', () => ({
  NotificationsTab: () => <div data-testid="notifications-tab">Notifications Content</div>,
}))
vi.mock('../LocalUploadTab', () => ({
  LocalUploadTab: () => <div data-testid="local-upload-tab">Local Upload Content</div>,
}))
vi.mock('../ScanningTab', () => ({
  ScanningTab: () => <div data-testid="scanning-tab">Scanning Content</div>,
}))
vi.mock('../CIGateTab', () => ({
  CIGateTab: () => <div data-testid="ci-gate-tab">CI Gate Content</div>,
}))
vi.mock('../BudgetPoliciesTab', () => ({
  BudgetPoliciesTab: () => <div data-testid="budget-policies-tab">Budget Policies Content</div>,
}))
vi.mock('../APIKeysTab', () => ({
  APIKeysTab: () => <div data-testid="api-keys-tab">API Keys Content</div>,
}))
vi.mock('../ScanLogTab', () => ({
  ScanLogTab: () => <div data-testid="scan-log-tab">Scan Log Content</div>,
}))

import { SettingsView } from '../SettingsView'

function renderSettingsView(initialPath = '/projects/org-1/settings') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <SettingsView />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SettingsView', () => {
  it('renders the settings nav sidebar', () => {
    renderSettingsView()
    expect(screen.getByTestId('settings-nav')).toBeDefined()
  })

  it('shows general tab by default', () => {
    renderSettingsView()
    expect(screen.getByTestId('general-tab')).toBeDefined()
  })

  it('opens tab from URL query', () => {
    renderSettingsView('/projects/org-1/settings?tab=source-control')
    expect(screen.getByTestId('source-control-tab')).toBeDefined()
    expect(screen.getByTestId('settings-nav').getAttribute('data-active')).toBe('source-control')
  })

  it('maps legacy integrations tab URL to source control', () => {
    renderSettingsView('/projects/org-1/settings?tab=integrations')
    expect(screen.getByTestId('source-control-tab')).toBeDefined()
    expect(screen.getByTestId('settings-nav').getAttribute('data-active')).toBe('source-control')
  })

  it('switches to notifications tab on click', () => {
    renderSettingsView()
    fireEvent.click(screen.getByText('Notifications'))
    expect(screen.getByTestId('notifications-tab')).toBeDefined()
  })

  it('switches to admin launchpad tab on click', () => {
    renderSettingsView()
    fireEvent.click(screen.getByText('Admin Launchpad'))
    expect(screen.getByTestId('launchpad-tab')).toBeDefined()
  })

  it('switches to scanning tab on click', () => {
    renderSettingsView()
    fireEvent.click(screen.getByText('Scanning'))
    expect(screen.getByTestId('scanning-tab')).toBeDefined()
  })
})
