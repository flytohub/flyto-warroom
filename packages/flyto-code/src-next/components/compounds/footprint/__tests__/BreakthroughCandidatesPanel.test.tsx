import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { BreakthroughCandidatesPanel } from '../BreakthroughCandidatesPanel'
import {
  getBOYAttackPathCandidates,
  getBOYBreakthroughPaths,
  getBOYValidationTasks,
} from '@lib/engine/code/footprintSurface'

vi.mock('../ResearchFootprintDrawer', () => ({
  ResearchFootprintDrawer: ({ open, selector }: { open: boolean; selector: unknown }) => (
    open ? <div data-testid="research-footprint-drawer">{JSON.stringify(selector)}</div> : null
  ),
}))

vi.mock('@lib/engine/code/footprintSurface', async () => {
  const actual = await vi.importActual<typeof import('@lib/engine/code/footprintSurface')>('@lib/engine/code/footprintSurface')
  return {
    ...actual,
    getBOYAttackPathCandidates: vi.fn(),
    getBOYAttackPathCandidateDetail: vi.fn(),
    getBOYBreakthroughPathDetail: vi.fn(),
    getBOYBreakthroughPaths: vi.fn(),
    getBOYValidationTasks: vi.fn(),
    createBOYValidationTask: vi.fn(),
    createBOYMissingEvidenceTask: vi.fn(),
    completeBOYValidationTask: vi.fn(),
    recompileBOYBreakthroughPaths: vi.fn(),
  }
})

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BreakthroughCandidatesPanel orgId="org-1" />
    </QueryClientProvider>,
  )
}

describe('BreakthroughCandidatesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getBOYAttackPathCandidates).mockResolvedValue({
      org_id: 'org-1',
      count: 1,
      candidates: [{
        id: 'hyp-1',
        kind: 'darkweb_identity',
        title: 'Darkweb identity hypothesis for flyto2.com',
        description: 'Evidence needs validation.',
        state: 'needs_validation',
        subject_type: 'domain',
        subject_value: 'flyto2.com',
        priority_score: 90,
        dimensions: {},
        evidence_ids: ['obs-1'],
        relation_ids: ['rel-1'],
        evidence_count: 1,
        relation_count: 1,
        recommended_verifier: 'darkweb_review',
        validation_playbook: { verifier: 'darkweb_review', steps: [], required_evidence: [], allowed_results: [], restrictions: [] },
        confidence_explanation: [],
        why_now: [],
        updated_at: '2026-06-16T00:00:00Z',
      }],
    } as any)
    vi.mocked(getBOYBreakthroughPaths).mockResolvedValue({
      org_id: 'org-1',
      count: 1,
      paths: [{
        id: 'path-1',
        hypothesis_id: 'hyp-1',
        kind: 'darkweb_identity',
        title: 'Multi-hop breakthrough path for flyto2.com',
        description: 'Evidence forms a route.',
        state: 'needs_validation',
        subject_type: 'domain',
        subject_value: 'flyto2.com',
        priority_score: 83,
        confidence_score: 88,
        impact_score: 91,
        exploitability_score: 80,
        validation_readiness: 80,
        missing_evidence: 0,
        dimensions: {},
        evidence_ids: ['obs-1'],
        relation_ids: ['rel-1'],
        why_now_json: '[]',
        recommended_verifier: 'darkweb_review',
        updated_at: '2026-06-16T00:00:00Z',
        missing_evidence_items: [],
      }],
    } as any)
    vi.mocked(getBOYValidationTasks).mockResolvedValue({
      org_id: 'org-1',
      count: 0,
      tasks: [],
    } as any)
  })

  it('keeps visible path actions and opens Research Footprint from a path row', async () => {
    renderPanel()

    expect((await screen.findAllByText('flyto2.com')).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /Details/i }).length).toBeGreaterThan(0)

    fireEvent.click(screen.getAllByRole('button', { name: /Research/i })[0])

    await waitFor(() => {
      expect(screen.getByTestId('research-footprint-drawer').textContent).toContain('path-1')
    })
  })
})
