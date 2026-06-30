/**
 * CampaignBudgetPanel render smoke tests — stand-in for visual QA in
 * a no-GUI environment. Verifies the component:
 *   - mounts without runtime error
 *   - reads from the mocked query
 *   - renders incidents + policy rows
 *   - opens the form on "New" click
 *   - surfaces the right labels for hard vs soft incidents
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_k: string, fb: string) => fb,
}))

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1', name: 'Test Org' } }),
}))

const mockPolicies = [
  {
    id: 'p1', orgId: 'org-1',
    metric: 'total_tokens', windowDays: 30,
    amount: 500000, warnPercent: 80,
    hardStopEnabled: true, isActive: true,
    createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z',
  },
]
const mockIncidents = [
  {
    id: 'inc1', orgId: 'org-1', policyId: 'p1',
    thresholdType: 'hard', status: 'open',
    amountObserved: 600000, amountLimit: 500000,
    windowFrom: '2026-03-01', windowTo: '2026-04-01',
    createdAt: '2026-04-01T00:00:00Z',
  },
  {
    id: 'inc2', orgId: 'org-1', policyId: 'p1',
    thresholdType: 'soft', status: 'open',
    amountObserved: 420000, amountLimit: 500000,
    windowFrom: '2026-03-01', windowTo: '2026-04-01',
    createdAt: '2026-04-01T00:00:00Z',
  },
]

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    const key = Array.isArray(queryKey) ? queryKey[0] : ''
    if (key === 'campaign-budget-policies') {
      return { data: { policies: mockPolicies }, isLoading: false, isError: false }
    }
    if (key === 'campaign-budget-incidents') {
      return { data: { incidents: mockIncidents }, isLoading: false, isError: false }
    }
    return { data: null, isLoading: false, isError: false }
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: ({ onSuccess }: { onSuccess?: () => void }) => ({
    mutate: vi.fn(() => { onSuccess?.() }),
    isPending: false,
  }),
}))

vi.mock('@lib/engine/platform/campaignBudget', () => ({
  listCampaignBudgetPolicies: vi.fn(),
  upsertCampaignBudgetPolicy: vi.fn(),
  deleteCampaignBudgetPolicy: vi.fn(),
  listCampaignBudgetIncidents: vi.fn(),
  resolveCampaignBudgetIncident: vi.fn(),
}))

import { CampaignBudgetPanel } from '../CampaignBudgetPanel'

describe('CampaignBudgetPanel', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('mounts without crashing', () => {
    render(<CampaignBudgetPanel />)
    expect(screen.getByText('Open incidents')).toBeDefined()
    expect(screen.getByText('Token caps')).toBeDefined()
  })

  it('renders both hard and soft incidents with correct badges', () => {
    render(<CampaignBudgetPanel />)
    expect(screen.getByText('Hard breach')).toBeDefined()
    expect(screen.getByText('Soft warn')).toBeDefined()
    // 600,000 / 500,000 — formatted with thousands separator.
    expect(screen.getByText(/600,000/)).toBeDefined()
    // 420,000 / 500,000
    expect(screen.getByText(/420,000/)).toBeDefined()
  })

  it('renders policy row with metric label and cap', () => {
    render(<CampaignBudgetPanel />)
    // Multi-element queries — same numbers appear in both the
    // incident progress and the policy meta row.
    expect(screen.getAllByText(/Total tokens/).length).toBeGreaterThan(0)
    expect(screen.getByText(/rolling 30d/)).toBeDefined()
    expect(screen.getAllByText(/500,000/).length).toBeGreaterThan(0)
    expect(screen.getByText('80%')).toBeDefined()
    expect(screen.getByText('hard-stop on')).toBeDefined()
  })

  it('opens the form when "New policy" is clicked', () => {
    render(<CampaignBudgetPanel />)
    fireEvent.click(screen.getByText('New policy'))
    // Form fields appear — MUI TextField renders labels in multiple spots,
    // so use getAllByText for labels that may appear more than once.
    expect(screen.getAllByText(/Window \(days\)/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Token cap').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Hard-stop dispatch/).length).toBeGreaterThan(0)
    // Default amount = 1_000_000 from DEFAULT_POLICY
    const amountInput = screen.getByDisplayValue('1000000') as HTMLInputElement
    expect(amountInput.type).toBe('number')
  })

  it('includes a Resolve button per open incident', () => {
    render(<CampaignBudgetPanel />)
    const resolveButtons = screen.getAllByText('Mark resolved')
    expect(resolveButtons.length).toBe(mockIncidents.length)
  })
})
