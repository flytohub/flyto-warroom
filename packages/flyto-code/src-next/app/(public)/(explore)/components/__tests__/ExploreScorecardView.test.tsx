import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import ExploreScorecardView from '../ExploreScorecardView'

const api = vi.hoisted(() => ({
  getExplorePosture: vi.fn(),
}))

vi.mock('@lib/engine/apiExplore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@lib/engine/apiExplore')>()
  return {
    ...actual,
    getExplorePosture: api.getExplorePosture,
  }
})

function renderView() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/explore/domain/acme.test/posture']}>
        <Routes>
          <Route path="/explore/domain/:domain/posture" element={<ExploreScorecardView />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ExploreScorecardView public rating boundary', () => {
  beforeEach(() => {
    api.getExplorePosture.mockResolvedValue({
      company: {
        legal_name: 'Acme Security Inc.',
        brand_name: 'Acme',
        primary_domain: 'acme.test',
        industry: 'technology',
        size_bucket: 'mid',
        country: 'US',
      },
      status: 'scanned',
      grade: 'B',
      issuesFound: 5,
      visibleFacts: [{ category: 'subdomains discovered', count: 5 }],
      lockedCount: 3,
      ratingAuthority: {
        level: 'local',
        mode: 'ce_local',
        label_key: 'rating.authority.localExternal',
        algorithm_version: '2.0',
        model_version: '2026.06',
        display_scale_id: 'flyto2-250-900.v1',
        source_manifest_version: 'flyto2.external-public.v1',
        calibration_version: 'local',
        evidence_completeness: 0,
        signature_status: 'not_required',
        comparable: false,
        scope: 'external',
      },
      codeLinkedExternalImpact: true,
      codeLinkedExternalImpactBand: 'medium',
      industryRank: 'top 50%',
      lastScanned: '2026-07-18',
      cta: { headline: 'See more', body: 'Open a workspace.', action: 'signup' },
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows rating authority and code-linked public evidence without raw private detail', async () => {
    renderView()

    expect(await screen.findByText('Local external rating')).toBeTruthy()
    expect(screen.getByText('Code-linked public evidence: medium')).toBeTruthy()
    expect(screen.getByText('Grade B · top 50% in industry')).toBeTruthy()
    expect(screen.queryByText(/file_path|secret|sast|repo_id/i)).toBeNull()
  })
})
