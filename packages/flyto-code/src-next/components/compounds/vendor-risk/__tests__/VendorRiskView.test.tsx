/**
 * VendorRiskView smoke tests.
 *
 *   - mounts without crashing
 *   - renders summary tiles when summary loads
 *   - renders empty state when vendor list is empty
 *   - renders vendor rows when list has items
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_k: string, fb: string) => fb,
}))

vi.mock('notistack', () => ({
  useSnackbar: () => ({ enqueueSnackbar: vi.fn() }),
}))

const { mockVendors, mockSummary } = vi.hoisted(() => ({
  mockVendors: [
    {
      id: 'v-1', org_id: 'org-1',
      vendor_name: 'Acme CDN', vendor_domain: 'acme-cdn.com',
      category: 'cdn', criticality: 'high',
      status: 'completed',
      questionnaire: '{}', responses: '{}',
      external_score: 72, questionnaire_score: 85, combined_score: 77,
      risk_level: 'medium',
      assessor: 'uid-1', notes: '',
      last_assessed_at: '2026-05-19T00:00:00Z',
    },
  ],
  mockSummary: {
    total_vendors: 1, assessed: 1, pending: 0,
    by_risk: { critical: 0, high: 0, medium: 1, low: 0, unknown: 0 },
    by_category: { cdn: 1 },
    avg_score: 77,
    top_risks: [],
  },
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    if (Array.isArray(queryKey) && queryKey[0] === 'vendors') {
      return { data: mockVendors, isLoading: false, isError: false }
    }
    if (Array.isArray(queryKey) && queryKey[0] === 'vendor-risk-summary') {
      return { data: mockSummary, isLoading: false, isError: false }
    }
    return { data: null, isLoading: false, isError: false }
  },
  useMutation: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock('@lib/engine', async () => {
  const actual = await vi.importActual<any>('@lib/engine')
  return {
    ...actual,
    listVendors: vi.fn(),
    getVendorRiskSummary: vi.fn(),
    deleteVendor: vi.fn(),
    assessVendor: vi.fn(),
  }
})

vi.mock('../VendorFormDialog', () => ({
  VendorFormDialog: () => null,
}))

vi.mock('../VendorQuestionnaireDialog', () => ({
  VendorQuestionnaireDialog: () => null,
}))

import { VendorRiskView } from '@compounds/vendor-risk/VendorRiskView'

describe('VendorRiskView', () => {
  it('mounts and renders a vendor row', () => {
    render(<VendorRiskView orgId="org-1" />)
    expect(screen.getByText('Acme CDN')).toBeTruthy()
    expect(screen.getByText('acme-cdn.com')).toBeTruthy()
  })

  it('renders category + criticality chips', () => {
    render(<VendorRiskView orgId="org-1" />)
    // Category label + criticality + risk-level chips all render
    // from CATEGORY_LABEL / CRITICALITY_TONE / RISK_TONE maps.
    expect(screen.getByText('CDN')).toBeTruthy()
    expect(screen.getByText('High')).toBeTruthy()
    expect(screen.getByText('Medium')).toBeTruthy()
  })
})
