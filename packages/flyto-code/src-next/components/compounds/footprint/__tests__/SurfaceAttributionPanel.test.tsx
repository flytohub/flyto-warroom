import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

vi.mock('@compounds/_shared', () => ({
  DataTable: ({ data }: { data: Array<{ CanonicalValue: string; owner_display_name?: string; source_quality?: { coverage_status?: string } }> }) => (
    <div data-testid="surface-table">
      {data.map(row => (
        <div key={row.CanonicalValue}>
          <span>{row.CanonicalValue}</span>
          <span>{row.owner_display_name ?? 'Unattributed'}</span>
          <span>{row.source_quality?.coverage_status ?? 'not_collected'}</span>
        </div>
      ))}
    </div>
  ),
  EvidenceDrawer: () => null,
}))

const {
  mockGetCompanyScopeGraph,
  mockGetFootprintSurface,
  mockGetSurfaceEvidence,
} = vi.hoisted(() => ({
  mockGetCompanyScopeGraph: vi.fn(),
  mockGetFootprintSurface: vi.fn(),
  mockGetSurfaceEvidence: vi.fn(),
}))

vi.mock('@lib/engine/code/footprintSurface', () => ({
  getCompanyScopeGraph: mockGetCompanyScopeGraph,
  getFootprintSurface: mockGetFootprintSurface,
  getSurfaceEvidence: mockGetSurfaceEvidence,
}))

import { SurfaceAttributionPanel } from '../SurfaceAttributionPanel'

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <SurfaceAttributionPanel orgId="org-1" />
    </QueryClientProvider>,
  )
}

describe('SurfaceAttributionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCompanyScopeGraph.mockResolvedValue({
      org_id: 'org-1',
      generated_at: '2026-06-18T00:00:00Z',
      nodes: [],
      edges: [{ id: 'edge-1' }],
      gaps: [{ id: 'gap-1', severity: 'warning', kind: 'missing_seed_domain', message: 'Missing seed domain' }],
      summary: {
        business_entities: 2,
        owned_assets: 1,
        confirmed: 1,
        corroborated: 1,
        candidate: 0,
        conflict: 0,
        not_collected: 0,
        gap_count: 1,
      },
      source_status: {
        coverage_status: 'corroborated',
        confidence: 80,
        source_count: 2,
        distinct_source_count: 2,
        evidence_count: 2,
        corroboration_count: 1,
        conflict_count: 0,
        missing_evidence_count: 0,
      },
    })
    mockGetFootprintSurface.mockResolvedValue({
      org_id: 'org-1',
      pool: 'main',
      count: 1,
      items: [{
        ResourceID: 'res-domain',
        OrgID: 'org-1',
        Category: 'infrastructure',
        Type: 'domain',
        CanonicalValue: 'cathaylife.com.tw',
        DisplayName: 'cathaylife.com.tw',
        Sources: ['footprint', 'company_scope_kb'],
        LegacyRefs: {},
        FirstSeenAt: '2026-06-18T00:00:00Z',
        LastSeenAt: '2026-06-18T00:00:00Z',
        Confidence: 0.8,
        owner_display_name: 'Cathay Financial Holding',
        source_quality: {
          coverage_status: 'corroborated',
          confidence: 80,
          source_count: 2,
          distinct_source_count: 2,
          evidence_count: 2,
          corroboration_count: 1,
          conflict_count: 0,
          missing_evidence_count: 0,
        },
      }],
    })
    mockGetSurfaceEvidence.mockResolvedValue({ chain: [] })
  })

  it('renders company scope closure, owner attribution, and source quality', async () => {
    renderPanel()

    expect(await screen.findByText('Cathay Financial Holding')).toBeTruthy()
    expect(screen.getByText('cathaylife.com.tw')).toBeTruthy()
    expect(screen.getAllByText('corroborated').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Owned assets').length).toBeGreaterThan(0)
    expect(screen.getByText('1 gaps')).toBeTruthy()
  })
})
