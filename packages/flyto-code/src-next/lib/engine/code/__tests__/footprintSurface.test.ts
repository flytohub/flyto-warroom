import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { request } from '../../client'
import {
  attachPentestEvidenceToValidationTask,
  exportResearchFootprintBundle,
  getCompanyScopeGraph,
  getResearchFootprint,
  seedCompanyScope,
  listResearchFootprintsForReports,
  researchFootprintCandidateSelector,
  researchFootprintPathSelector,
  researchFootprintSelectorKey,
  researchFootprintSubjectSelector,
  type ResearchFootprintResponse,
} from '../footprintSurface'

vi.mock('../../client', () => ({
  request: vi.fn(),
}))

function footprint(overrides: Partial<ResearchFootprintResponse> = {}): ResearchFootprintResponse {
  return {
    org_id: 'org-1',
    generated_at: '2026-06-15T00:00:00Z',
    subject: { selector_type: 'path_id', type: 'supplier', value: 'sms-gateway', path_id: 'path-1', hypothesis_id: 'hyp-1', state: 'needs_validation' },
    summary: {
      title: 'Supplier breakthrough',
      description: 'Evidence-derived route needing validation.',
      kind: 'supplier_breakthrough',
      state: 'needs_validation',
      priority_score: 92,
      confidence_score: 80,
      impact_score: 90,
      exploitability_score: 70,
      validation_readiness: 60,
      recommended_verifier: 'supplier_assessment',
      observation_count: 2,
      relation_count: 1,
      missing_evidence_count: 1,
      validation_task_count: 1,
      source_count: 2,
      dimensions: {},
      why_now: [],
      positioning: 'Flyto2 complements existing scanner signals.',
    },
    path: {
      id: 'path-1',
      hypothesis_id: 'hyp-1',
      kind: 'supplier_breakthrough',
      title: 'Supplier breakthrough',
      description: 'Evidence-derived route needing validation.',
      state: 'needs_validation',
      subject_type: 'supplier',
      subject_value: 'sms-gateway',
      priority_score: 92,
      confidence_score: 80,
      impact_score: 90,
      exploitability_score: 70,
      validation_readiness: 60,
      missing_evidence: 1,
      dimensions: {},
      evidence_ids: ['obs-1'],
      relation_ids: ['rel-1'],
      why_now: [],
      recommended_verifier: 'supplier_assessment',
      updated_at: '2026-06-15T01:00:00Z',
    },
    candidate: undefined,
    observations: [],
    relations: [],
    source_ledger: [],
    evidence_timeline: [],
    route_nodes: [],
    route_edges: [],
    missing_evidence: [],
    validation_tasks: [],
    decision_states: {
      current_state: 'needs_validation',
      validation_status: 'needs_validation',
      task_counts: { queued_for_validation: 1 },
      missing_evidence_counts: { missing: 1 },
      open_task_ids: ['task-1'],
      completed_task_ids: [],
    },
    decision_log: [{
      id: 'task_created:task-1',
      kind: 'validation_task_created',
      state: 'queued_for_validation',
      title: 'Validation task queued',
      detail: 'Queued from Research Footprint',
      actor: 'analyst-1',
      timestamp: '2026-06-15T00:30:00Z',
      citations: ['task-1', 'obs-1'],
    }],
    evidence_quality: {
      weighted_confidence: 88,
      reliability_band: 'high',
      corroboration_count: 1,
      conflict_count: 0,
      stale_source_count: 0,
      top_source_ids: ['scanner:fixture'],
      support_relation_ids: ['rel-1'],
      conflict_relation_ids: [],
    },
    audit_integrity: {
      generated_at: '2026-06-15T00:00:00Z',
      bundle_sha256: 'abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      hash_recipe: 'flyto.research-footprint.v1:sha256(canonical-redacted-projection-without-generated_at)',
      citation_count: 7,
      resolved_citation_count: 7,
      unresolved_citation_count: 0,
      uncited_claim_count: 0,
      redaction_applied: true,
      integrity_warnings: [],
    },
    verification_summary: {
      level: 'indirectly_supported',
      status: 'needs_validation',
      pentest_observation_count: 0,
      pentest_finding_count: 0,
      linked_validation_task_ids: ['task-1'],
      last_empirical_validation_at: null,
    },
    citation_index: [
      { id: 'obs-1', kind: 'boy_observation', title: 'Observation', raw_ref: 'boy_observation:obs-1', related_ids: [], metadata_summary: {} },
      { id: 'task-1', kind: 'validation_task', title: 'Validation Task', raw_ref: 'validation_task:task-1', related_ids: ['obs-1'], metadata_summary: {} },
    ],
    narrative: { claims: [{ id: 'claim-1', kind: 'source', text: 'Cited claim.', citations: ['obs-1'] }] },
    evidence_bundle: {
      generated_at: '2026-06-15T00:00:00Z',
      subject: { selector_type: 'path_id', type: 'supplier', value: 'sms-gateway', path_id: 'path-1', hypothesis_id: 'hyp-1', state: 'needs_validation' },
      claims: [{ id: 'claim-1', kind: 'source', text: 'Cited claim.', citations: ['obs-1'] }],
      source_ledger: [],
      evidence_quality: undefined,
      verification_summary: undefined,
      citation_index: undefined,
      bundle_sha256: 'abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      hash_recipe: 'flyto.research-footprint.v1:sha256(canonical-redacted-projection-without-generated_at)',
      integrity_warnings: [],
      observation_ids: ['obs-1'],
      relation_ids: ['rel-1'],
      validation_task_ids: ['task-1'],
      missing_evidence_ids: ['gap-1'],
      decision_log_ids: ['task_created:task-1'],
      route_node_ids: [],
      route_edge_ids: [],
      export_name: 'supplier-sms-gateway-research-footprint',
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:research-footprint'),
    revokeObjectURL: vi.fn(),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('footprintSurface research footprint client helpers', () => {
  it('reads and seeds company scope under the Footprint API', async () => {
    vi.mocked(request)
      .mockResolvedValueOnce({
        org_id: 'org-1',
        generated_at: '2026-06-18T00:00:00Z',
        nodes: [{ resource_id: 'res-bank', canonical_value: 'cathay united bank', source_quality: { coverage_status: 'confirmed' } }],
        edges: [],
        gaps: [],
        summary: {
          business_entities: 1,
          owned_assets: 0,
          confirmed: 1,
          corroborated: 0,
          candidate: 0,
          conflict: 0,
          not_collected: 0,
          gap_count: 0,
        },
        source_status: { coverage_status: 'confirmed' },
      })
      .mockResolvedValueOnce({ entities_written: 1 })

    const graph = await getCompanyScopeGraph('org-1')
    expect(request).toHaveBeenNthCalledWith(1, 'GET', '/api/v1/code/orgs/org-1/footprint/company-scope')
    expect(graph.nodes).toHaveLength(1)
    expect(graph.summary.business_entities).toBe(1)

    await seedCompanyScope('org-1', {
      source_id: 'company_scope_kb',
      entities: [{ key: 'bank', canonical_name: 'Cathay United Bank', verification: 'confirmed' }],
    })
    expect(request).toHaveBeenNthCalledWith(2, 'POST', '/api/v1/code/orgs/org-1/footprint/company-scope', {
      source_id: 'company_scope_kb',
      entities: [{ key: 'bank', canonical_name: 'Cathay United Bank', verification: 'confirmed' }],
    })
  })

  it('normalizes research footprint selectors and cache keys', () => {
    expect(researchFootprintPathSelector({ id: 'path-1' })).toEqual({ path_id: 'path-1' })
    expect(researchFootprintCandidateSelector({ id: 'hyp-1' })).toEqual({ hypothesis_id: 'hyp-1' })
    expect(researchFootprintSubjectSelector('supplier', 'sms-gateway')).toEqual({ subject_type: 'supplier', subject_value: 'sms-gateway' })
    expect(researchFootprintSubjectSelector('', 'sms-gateway')).toBeNull()
    expect(researchFootprintSelectorKey({ path_id: 'path-1' })).toBe('path:path-1')
  })

  it('projects research footprints into report rows', async () => {
    vi.mocked(request)
      .mockResolvedValueOnce({ org_id: 'org-1', count: 1, paths: [{ id: 'path-1' }] })
      .mockResolvedValueOnce(footprint())

    const result = await listResearchFootprintsForReports('org-1', 1)

    expect(request).toHaveBeenNthCalledWith(1, 'GET', '/api/v1/code/orgs/org-1/breakthrough-paths?limit=1')
    expect(request).toHaveBeenNthCalledWith(2, 'GET', '/api/v1/code/orgs/org-1/research-footprint?path_id=path-1')
    expect(result.rows).toEqual([
      expect.objectContaining({
        path_id: 'path-1',
        hypothesis_id: 'hyp-1',
        subject_value: 'sms-gateway',
        latest_decision_state: 'queued_for_validation',
        bundle_sha256: 'abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      }),
    ])
  })

  it('normalizes citation index and verification summary defaults', async () => {
    vi.mocked(request).mockResolvedValueOnce({
      ...footprint(),
      citation_index: undefined,
      verification_summary: undefined,
      evidence_bundle: { ...footprint().evidence_bundle, verification_summary: undefined },
      audit_integrity: undefined,
    })

    const result = await getResearchFootprint('org-1', { path_id: 'path-1' })

    expect(request).toHaveBeenCalledWith('GET', '/api/v1/code/orgs/org-1/research-footprint?path_id=path-1')
    expect(result.citation_index).toEqual([])
    expect(result.verification_summary.level).toBe('unverified')
    expect(result.audit_integrity.resolved_citation_count).toBe(0)
  })

  it('posts manual pentest evidence attachment payloads', async () => {
    vi.mocked(request).mockResolvedValueOnce({ task: { id: 'task-1' }, observation_ids: ['obs-1'] })

    await attachPentestEvidenceToValidationTask('org-1', 'task-1', {
      project_id: 'project-1',
      scan_id: 'scan-1',
      finding_ids: ['finding-1'],
    })

    expect(request).toHaveBeenCalledWith(
      'POST',
      '/api/v1/code/orgs/org-1/validation-tasks/task-1/pentest-evidence',
      { project_id: 'project-1', scan_id: 'scan-1', finding_ids: ['finding-1'] },
    )
  })

  it('downloads the server-generated export bundle', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    vi.mocked(request).mockResolvedValueOnce({
      schema_version: 'flyto.research-footprint.v1',
      org_id: 'org-1',
      generated_at: '2026-06-15T00:00:00Z',
      bundle_sha256: 'abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      hash_recipe: 'flyto.research-footprint.v1:sha256(canonical-redacted-projection-without-generated_at)',
      audit_integrity: footprint().audit_integrity,
      research_footprint: footprint(),
    })

    const result = await exportResearchFootprintBundle('org-1', { path_id: 'path-1' })

    expect(request).toHaveBeenCalledWith('GET', '/api/v1/code/orgs/org-1/research-footprint/export?path_id=path-1')
    expect(result.filename).toBe('supplier-sms-gateway-research-footprint.json')
    expect(result.bundleHash).toBe('abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd')
    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
  })
})
