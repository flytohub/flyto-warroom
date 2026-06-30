import React from 'react'
import '../../../../test/i18nTestSetup'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1', name: 'Test Org' } }),
  // IssuesView now sources its repo picker / sidebar repo list from the
  // org's connected repos (so server-side repo filtering doesn't collapse
  // the dropdown). Stub it empty here — the test asserts tab/filter logic,
  // not the repo picker, and an empty list falls back to issue-derived repos.
  useConnectedRepos: () => ({ data: [] }),
}))

vi.mock('@lib/engine', () => ({
  getOrgIssues: vi.fn().mockResolvedValue({ issues: [], counts: { total: 0 } }),
  updateIssueStatus: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { issues: mockIssues }, isLoading: false }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock('@atoms/Pagination', () => ({
  Pagination: () => null,
}))

// FlytoSelect needs a MantineProvider. Stubbing it here keeps the test
// focused on IssuesView's tab + filter logic without pulling all of Mantine
// into JSDOM (it's heavy + has its own test boilerplate).
vi.mock('@atoms/FlytoSelect', () => ({
  FlytoSelect: (props: { value: string; options: Array<{ value: string; label: string }> }) => (
    <select value={props.value} onChange={() => {}}>
      {props.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
}))

import { MemoryRouter } from 'react-router-dom'
import { IssuesView } from '../IssuesView'
import { FixQueueProvider } from '@/contexts/FixQueueContext'

// IssuesView reads from FixQueueContext for the "Open Fix Queue"
// CTA (added 2026-05-20). Tests must wrap in the provider.
function renderIssues() {
  return render(
    <MemoryRouter>
      <FixQueueProvider>
        <IssuesView />
      </FixQueueProvider>
    </MemoryRouter>,
  )
}

const mockIssues = [
  {
    fingerprint: 'fp-1',
    title: 'CVE-2024-1234',
    description: 'Test vuln',
    severity: 'CRITICAL',
    type: 'cve',
    package: 'lodash',
    repo_id: 'r-1',
    repo_name: 'test/repo',
    status: 'open',
  },
  {
    fingerprint: 'fp-2',
    title: 'Exposed secret',
    description: 'AWS key found',
    severity: 'HIGH',
    type: 'secret',
    package: '',
    repo_id: 'r-1',
    repo_name: 'test/repo',
    status: 'snoozed',
  },
  {
    fingerprint: 'fp-3',
    title: 'SQL injection risk',
    description: 'Found in handler.go',
    severity: 'HIGH',
    type: 'security_finding',
    package: '',
    repo_id: 'r-2',
    repo_name: 'test/api',
    status: 'open',
  },
]

describe('IssuesView', () => {
  afterEach(() => cleanup())

  it('renders issue tabs', () => {
    renderIssues()
    expect(screen.getByText('Feed')).toBeDefined()
    expect(screen.getByText('Snoozed')).toBeDefined()
    expect(screen.getByText('Ignored')).toBeDefined()
    expect(screen.getByText('Solved')).toBeDefined()
  })

  it('shows open issues by default', () => {
    renderIssues()
    // Should show the open issues (fp-1 and fp-3)
    expect(screen.getByText('CVE-2024-1234')).toBeDefined()
    expect(screen.getByText('SQL injection risk')).toBeDefined()
  })

  it('switches tab on click and resets page', () => {
    renderIssues()
    const snoozedTab = screen.getByText('Snoozed')
    fireEvent.click(snoozedTab)
    // After clicking snoozed tab, only snoozed issues show
    expect(screen.getByText('Exposed secret')).toBeDefined()
  })
})
