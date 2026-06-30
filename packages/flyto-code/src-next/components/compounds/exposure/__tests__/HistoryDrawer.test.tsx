import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_k: string, fb: string) => fb,
}))

const { mockListFindingHistory } = vi.hoisted(() => ({
  mockListFindingHistory: vi.fn(),
}))

vi.mock('@lib/engine', async () => {
  const actual = await vi.importActual<any>('@lib/engine')
  return {
    ...actual,
    listFindingHistory: mockListFindingHistory,
  }
})

import { HistoryDrawer } from '../findings/HistoryDrawer'
import type { Finding } from '@lib/engine'

const finding: Finding = {
  id: 'finding-1',
  org_id: 'org-1',
  resource_id: 'res-1',
  domain: 'api.example.com',
  category: 'weak_tls',
  description: 'TLS 1.0 enabled',
  severity: 'high',
  fingerprint: 'fp-1',
  first_seen_at: '2026-05-01T00:00:00Z',
  last_seen_at: '2026-05-17T00:00:00Z',
  source: 'bitsight',
  verification_state: 'verified_fixed',
  owner_resource_id: 'biz-1',
  owner_display_name: 'Cathay Financial Holding',
  owner_relation_type: 'owns_domain',
  state_family_key: 'bitsight|weak_tls|api.example.com|tls-1',
  state_version_count: 2,
  lifecycle_summary: {
    status: 'verified_fixed',
    status_label: 'Verified fixed',
    observation_state: 'fixed',
    is_current: false,
    is_historical: true,
    state_family_key: 'bitsight|weak_tls|api.example.com|tls-1',
    state_version_count: 2,
    recorded_event_count: 4,
    reconfirmed_count: 1,
    last_recorded_event_type: 'verified_fixed',
  },
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
}

function renderDrawer() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <HistoryDrawer orgId="org-1" finding={finding} />
    </QueryClientProvider>,
  )
}

describe('HistoryDrawer', () => {
  it('renders unified CTEM timeline events and inferred anchors', async () => {
    mockListFindingHistory.mockResolvedValue({
      finding: {
        id: 'finding-1',
        org_id: 'org-1',
        resource_id: 'res-1',
        domain: 'api.example.com',
        category: 'weak_tls',
        description: 'TLS 1.0 enabled',
        severity: 'high',
        fingerprint: 'fp-1',
        first_seen_at: '2026-05-01T00:00:00Z',
        last_seen_at: '2026-05-17T00:00:00Z',
        source: 'bitsight',
        verification_state: 'verified_fixed',
      },
      count: 3,
      events: [
        {
          id: 'ev-verify',
          issue_id: 'finding-1',
          event_type: 'verified_fixed',
          title: 'Verified fixed',
          source: 'ctem',
          occurred_at: '2026-05-18T00:00:00Z',
        },
        {
          id: 'ev-field',
          issue_id: 'finding-1',
          event_type: 'field_changed',
          title: 'Severity changed',
          field: 'severity',
          old_value: 'medium',
          new_value: 'high',
          source: 'bitsight_ingest',
          occurred_at: '2026-05-17T00:00:00Z',
        },
        {
          id: 'synthetic:finding-1:first_seen',
          issue_id: 'finding-1',
          event_type: 'first_seen',
          title: 'First seen',
          occurred_at: '2026-05-01T00:00:00Z',
          synthetic: true,
          synthetic_reason: 'current row first_seen_at',
        },
      ],
    })

    renderDrawer()

    expect(await screen.findByText('Severity changed')).toBeTruthy()
    expect(screen.getAllByText('Verified fixed').length).toBeGreaterThan(0)
    expect(screen.getByText('medium')).toBeTruthy()
    expect(screen.getByText('high')).toBeTruthy()
    expect(screen.getByText('inferred')).toBeTruthy()
    expect(screen.getByText('Footprint-linked')).toBeTruthy()
    expect(screen.getByText('State versions')).toBeTruthy()
    expect(screen.getAllByText('2').length).toBeGreaterThan(0)
    expect(screen.getByText('Recorded events')).toBeTruthy()
    expect(screen.getByText('Owner: Cathay Financial Holding')).toBeTruthy()
    expect(screen.getByText('Confirmed source')).toBeTruthy()
    expect(screen.getByText('Last event: Verified fixed')).toBeTruthy()
  })
})
