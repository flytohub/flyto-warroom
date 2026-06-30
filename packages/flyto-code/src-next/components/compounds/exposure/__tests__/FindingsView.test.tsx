import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1', name: 'Test Org' } }),
}))

vi.mock('notistack', () => ({
  useSnackbar: () => ({ enqueueSnackbar: vi.fn() }),
}))

const {
  mockBulkFindingsAction,
  mockListFindingFacets,
  mockListFindings,
} = vi.hoisted(() => ({
  mockBulkFindingsAction: vi.fn(),
  mockListFindingFacets: vi.fn(),
  mockListFindings: vi.fn(),
}))

vi.mock('@lib/engine', () => ({
  bulkFindingsAction: mockBulkFindingsAction,
  listFindingFacets: mockListFindingFacets,
  listFindings: mockListFindings,
  parseJSONArray: (raw?: string) => {
    if (!raw) return []
    try {
      const value = JSON.parse(raw)
      return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
    } catch {
      return []
    }
  },
}))

import {
  FindingsView,
  findingsHeaderActionsSx,
  findingsHeaderIconButtonSx,
  findingsHeaderLayoutSx,
  findingsSavedSetButtonSx,
} from '../FindingsView'
import { FindingRow } from '../findings/FindingRow'
import { COLUMNS } from '../findings/types'

function renderFindings() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <FindingsView />
    </QueryClientProvider>,
  )
}

describe('FindingsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListFindingFacets.mockResolvedValue({ counts_by_category: {} })
    mockListFindings.mockResolvedValue({ findings: [], count: 0 })
  })

  it('keeps header actions in a stable grid so controls cannot squeeze closed', async () => {
    renderFindings()

    expect(await screen.findByText('Findings')).toBeTruthy()
    expect(screen.getByTestId('findings-header-actions')).toBeTruthy()
    expect(screen.getByPlaceholderText('Search asset / description / id...')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Saved filter sets' }).textContent).toContain('Sets')
    expect(screen.getByLabelText('Save current filter')).toBeTruthy()
    expect(screen.getByLabelText('Customize columns')).toBeTruthy()

    expect(findingsHeaderLayoutSx.display).toBe('grid')
    expect(findingsHeaderActionsSx.display).toBe('grid')
    expect(findingsHeaderActionsSx.gridTemplateColumns.xs).toContain('max-content')
    expect(findingsSavedSetButtonSx.whiteSpace).toBe('nowrap')
    expect(findingsSavedSetButtonSx.minWidth).toBeGreaterThanOrEqual(78)
    expect(findingsHeaderIconButtonSx.width).toBe(34)
    expect(findingsHeaderIconButtonSx.height).toBe(34)
  })

  it('does not present missing CTEM data as a clean result', async () => {
    renderFindings()

    expect(await screen.findByText('No findings loaded')).toBeTruthy()
    expect(screen.getByText(/not a clean verdict/i)).toBeTruthy()
  })

  it('renders lifecycle, Footprint owner, and source-quality evidence on finding rows', () => {
    const visibleColumns = COLUMNS.filter(c => c.defaultVisible)
    render(
      <FindingRow
        f={{
          id: 'finding-good',
          org_id: 'org-1',
          resource_id: 'res-ssh',
          domain: 'ssh.cathay.example',
          category: 'server_software',
          description: 'SSH encryption configuration is acceptable.',
          severity: 'low',
          fingerprint: 'fp-good',
          first_seen_at: '2026-01-01T00:00:00Z',
          last_seen_at: '2026-02-10T00:00:00Z',
          resolved_at: null,
          grade: 'good',
          source: 'bitsight',
          external_id: 'ssh-weak-cipher',
          details_text: 'SSH encryption configuration is acceptable.',
          threat_groups: '[]',
          tags: '[]',
          lifecycle_summary: {
            status: 'current_good',
            status_label: 'Current good',
            observation_state: 'current_good',
            is_current: true,
            is_historical: false,
            state_family_key: 'bitsight|server_software|ssh.cathay.example|ssh-weak-cipher',
            state_version_count: 2,
            recorded_event_count: 4,
            reconfirmed_count: 1,
            last_recorded_event_type: 'created',
          },
          state_family_key: 'bitsight|server_software|ssh.cathay.example|ssh-weak-cipher',
          state_version_count: 2,
          owner_resource_id: 'biz-cathay',
          owner_display_name: 'Cathay Financial Holding',
          owner_relation_type: 'owns_domain',
          source_quality: {
            coverage_status: 'confirmed',
            confidence: 95,
            source_count: 2,
            distinct_source_count: 2,
            evidence_count: 2,
            corroboration_count: 1,
            conflict_count: 0,
            missing_evidence_count: 0,
          },
        }}
        orgId="org-1"
        visibleColumns={visibleColumns}
        gridTemplate={visibleColumns.map(c => c.width).join(' ')}
        selected={false}
        onToggleSelect={vi.fn()}
        expanded={false}
        onToggleExpand={vi.fn()}
        onOpen={vi.fn()}
      />,
    )

    expect(screen.getByText('ssh.cathay.example')).toBeTruthy()
    expect(screen.getByText('Cathay Financial Holding')).toBeTruthy()
    expect(screen.getByText('Confirmed source')).toBeTruthy()
    expect(screen.getByText(/2 states/)).toBeTruthy()
    expect(screen.getByText(/4 events/)).toBeTruthy()
    expect(screen.getByText('Good')).toBeTruthy()
  })
})
