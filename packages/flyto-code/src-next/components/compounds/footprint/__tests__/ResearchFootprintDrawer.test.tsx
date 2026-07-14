import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { ResearchFootprintDrawer } from '../ResearchFootprintDrawer'
import { buildResearchFootprintReportSections } from '../researchFootprintReport'
import {
  completeBOYValidationTask,
  attachPentestEvidenceToValidationTask,
  createBOYValidationTask,
  exportResearchFootprintBundle,
  getResearchFootprint,
  recompileBOYBreakthroughPaths,
  type ResearchFootprintResponse,
} from '@lib/engine/code/footprintSurface'
import { downloadBuiltReport } from '@lib/engine/reports/vaReport'

vi.mock('@lib/engine/code/footprintSurface', async () => {
  const actual = await vi.importActual<typeof import('@lib/engine/code/footprintSurface')>('@lib/engine/code/footprintSurface')
  return {
    ...actual,
    getResearchFootprint: vi.fn(),
    recompileBOYBreakthroughPaths: vi.fn(),
    createBOYValidationTask: vi.fn(),
    createBOYMissingEvidenceTask: vi.fn(),
    completeBOYValidationTask: vi.fn(),
    attachPentestEvidenceToValidationTask: vi.fn(),
    exportResearchFootprintBundle: vi.fn(),
  }
})

vi.mock('@lib/engine/reports/vaReport', () => ({
  downloadBuiltReport: vi.fn(),
}))

function renderDrawer() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ResearchFootprintDrawer
        orgId="org-1"
        open
        selector={{ path_id: 'path-1' }}
        onClose={() => {}}
      />
    </QueryClientProvider>,
  )
}

function response(overrides: Partial<ResearchFootprintResponse> = {}): ResearchFootprintResponse {
  return {
    org_id: 'org-1',
    generated_at: '2026-06-15T00:00:00Z',
    subject: { selector_type: 'path_id', type: 'supplier', value: 'sms-gateway', path_id: 'path-1', hypothesis_id: 'hyp-1', state: 'needs_validation' },
    summary: {
      title: 'Supplier breakthrough for sms-gateway',
      description: 'Evidence-derived route needing validation.',
      kind: 'supplier_breakthrough',
      state: 'needs_validation',
      priority_score: 92,
      confidence_score: 80,
      impact_score: 90,
      exploitability_score: 70,
      validation_readiness: 60,
      recommended_verifier: 'supplier_assessment',
      observation_count: 1,
      relation_count: 1,
      missing_evidence_count: 1,
      validation_task_count: 0,
      source_count: 1,
      dimensions: { source_reliability: 95 },
      why_now: ['New supplier signal'],
      positioning: 'Flyto2 complements existing scanner signals.',
    },
    path: {
      id: 'path-1',
      hypothesis_id: 'hyp-1',
      kind: 'supplier_breakthrough',
      title: 'Supplier breakthrough for sms-gateway',
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
      updated_at: '2026-06-15T00:00:00Z',
    },
    candidate: {
      id: 'hyp-1',
      kind: 'supplier_breakthrough',
      title: 'Supplier breakthrough for sms-gateway',
      description: 'Evidence-derived route needing validation.',
      state: 'needs_validation',
      subject_type: 'supplier',
      subject_value: 'sms-gateway',
      priority_score: 92,
      dimensions: {},
      evidence_ids: ['obs-1'],
      relation_ids: ['rel-1'],
      recommended_verifier: 'supplier_assessment',
      updated_at: '2026-06-15T00:00:00Z',
    },
    observations: [{
      id: 'obs-1',
      source_type: 'supplier',
      source_name: 'fixture',
      source_reliability: 95,
      subject_type: 'supplier',
      subject_value: 'sms-gateway',
      observation_type: 'otp_vendor_exposure',
      confidence: 95,
      severity: 'critical',
      business_impact: 95,
      validation_status: 'unvalidated',
      raw_ref: 'supplier-risk-1',
      metadata_summary: { region: 'us' },
      first_seen_at: '2026-06-15T00:00:00Z',
      last_seen_at: '2026-06-15T00:00:00Z',
    }],
    relations: [{
      id: 'rel-1',
      from_observation_id: 'obs-1',
      to_observation_id: 'obs-2',
      relation_kind: 'supports_business_process',
      confidence: 92,
      metadata_summary: {},
      observed_at: '2026-06-15T00:00:00Z',
    }],
    source_ledger: [{
      id: 'supplier:fixture',
      source_type: 'supplier',
      source_name: 'fixture',
      observation_count: 1,
      source_reliability: 95,
      max_confidence: 95,
      max_business_impact: 95,
      max_severity: 'critical',
      first_seen_at: '2026-06-15T00:00:00Z',
      last_seen_at: '2026-06-15T00:00:00Z',
      observation_ids: ['obs-1'],
    }],
    evidence_timeline: [{ id: 'obs:obs-1', kind: 'observation', title: 'OTP Vendor Exposure', detail: 'fixture observed sms-gateway', timestamp: '2026-06-15T00:00:00Z', citations: ['obs-1'] }],
    route_nodes: [{ id: 'node-1', node_order: 1, node_type: 'supplier', label: 'Supplier', value: 'sms-gateway', evidence_id: 'obs-1', metadata_summary: {}, citations: ['obs-1'] }],
    route_edges: [{ id: 'edge-1', edge_order: 1, from_node_id: 'node-1', to_node_id: 'node-2', relation_id: 'rel-1', relation_kind: 'supports_business_process', confidence: 92, metadata_summary: {}, citations: ['rel-1'] }],
    missing_evidence: [],
    validation_tasks: [],
    decision_states: { current_state: 'needs_validation', validation_status: 'needs_validation', task_counts: {}, missing_evidence_counts: {}, open_task_ids: [], completed_task_ids: [] },
    decision_log: [{
      id: 'task_created:task-1',
      kind: 'validation_task_created',
      state: 'queued_for_validation',
      title: 'Validation task queued',
      detail: 'Queued from Research Footprint',
      actor: 'analyst-1',
      result: '',
      notes: '',
      timestamp: '2026-06-15T00:00:00Z',
      citations: ['task-1', 'obs-1'],
    }],
    evidence_quality: {
      weighted_confidence: 95,
      reliability_band: 'high',
      corroboration_count: 1,
      conflict_count: 0,
      stale_source_count: 0,
      top_source_ids: ['supplier:fixture'],
      support_relation_ids: ['rel-1'],
      conflict_relation_ids: [],
    },
    audit_integrity: {
      generated_at: '2026-06-15T00:00:00Z',
      bundle_sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      hash_recipe: 'flyto.research-footprint.v1:sha256(canonical-redacted-projection-without-generated_at)',
      citation_count: 9,
      resolved_citation_count: 9,
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
      linked_validation_task_ids: [],
      last_empirical_validation_at: null,
    },
    citation_index: [
      { id: 'hyp-1', kind: 'boy_hypothesis', title: 'Supplier breakthrough for sms-gateway', source_type: 'supplier', subject_type: 'supplier', subject_value: 'sms-gateway', confidence: 80, severity: 'critical', business_impact: 90, validation_status: 'needs_validation', raw_ref: 'boy_hypothesis:hyp-1', observed_at: '2026-06-15T00:00:00Z', related_ids: ['obs-1', 'rel-1'], metadata_summary: {} },
      { id: 'path-1', kind: 'breakthrough_path', title: 'Supplier breakthrough for sms-gateway', source_type: 'supplier', subject_type: 'supplier', subject_value: 'sms-gateway', confidence: 80, severity: 'critical', business_impact: 90, validation_status: 'needs_validation', raw_ref: 'breakthrough_path:path-1', observed_at: '2026-06-15T00:00:00Z', related_ids: ['obs-1', 'rel-1'], metadata_summary: {} },
      { id: 'obs-1', kind: 'boy_observation', title: 'OTP Vendor Exposure', source_type: 'supplier', source_name: 'fixture', source_reliability: 95, subject_type: 'supplier', subject_value: 'sms-gateway', confidence: 95, severity: 'critical', business_impact: 95, validation_status: 'unvalidated', raw_ref: 'boy_observation:obs-1', observed_at: '2026-06-15T00:00:00Z', related_ids: [], metadata_summary: { region: 'us' } },
      { id: 'rel-1', kind: 'boy_relation', title: 'Supports Business Process', confidence: 92, raw_ref: 'boy_relation:rel-1', observed_at: '2026-06-15T00:00:00Z', related_ids: ['obs-1', 'obs-2'], metadata_summary: {} },
      { id: 'supplier:fixture', kind: 'source_ledger', title: 'Supplier / fixture', source_type: 'supplier', source_name: 'fixture', source_reliability: 95, confidence: 95, severity: 'critical', business_impact: 95, raw_ref: 'source_ledger:supplier:fixture', observed_at: '2026-06-15T00:00:00Z', related_ids: ['obs-1'], metadata_summary: {} },
      { id: 'node-1', kind: 'route_node', title: 'Supplier', raw_ref: 'route_node:node-1', related_ids: ['obs-1'], metadata_summary: {} },
      { id: 'edge-1', kind: 'route_edge', title: 'Supports Business Process', confidence: 92, raw_ref: 'route_edge:edge-1', related_ids: ['node-1', 'node-2', 'rel-1'], metadata_summary: {} },
      { id: 'task-1', kind: 'validation_task', title: 'Queued For Validation', source_type: 'supplier_assessment', subject_type: 'supplier', subject_value: 'sms-gateway', validation_status: 'queued_for_validation', raw_ref: 'validation_task:task-1', observed_at: '2026-06-15T00:00:00Z', related_ids: ['hyp-1', 'obs-1'], metadata_summary: {} },
    ],
    narrative: { claims: [{ id: 'claim-1', kind: 'source', text: 'Supplier fixture contributes evidence.', citations: ['obs-1'] }] },
    evidence_bundle: {
      generated_at: '2026-06-15T00:00:00Z',
      subject: { selector_type: 'path_id', type: 'supplier', value: 'sms-gateway', path_id: 'path-1', hypothesis_id: 'hyp-1', state: 'needs_validation' },
      claims: [{ id: 'claim-1', kind: 'source', text: 'Supplier fixture contributes evidence.', citations: ['obs-1'] }],
      source_ledger: [],
      evidence_quality: {
        weighted_confidence: 95,
        reliability_band: 'high',
        corroboration_count: 1,
        conflict_count: 0,
        stale_source_count: 0,
        top_source_ids: ['supplier:fixture'],
        support_relation_ids: ['rel-1'],
        conflict_relation_ids: [],
      },
      verification_summary: {
        level: 'indirectly_supported',
        status: 'needs_validation',
        pentest_observation_count: 0,
        pentest_finding_count: 0,
        linked_validation_task_ids: [],
        last_empirical_validation_at: null,
      },
      citation_index: [],
      observation_ids: ['obs-1'],
      relation_ids: ['rel-1'],
      validation_task_ids: [],
      missing_evidence_ids: [],
      decision_log_ids: ['task_created:task-1'],
      route_node_ids: ['node-1'],
      route_edge_ids: ['edge-1'],
      bundle_sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      hash_recipe: 'flyto.research-footprint.v1:sha256(canonical-redacted-projection-without-generated_at)',
      integrity_warnings: [],
      export_name: 'supplier-sms-gateway-research-footprint',
    },
    ...overrides,
  }
}

function nanshanContestedResponse(): ResearchFootprintResponse {
  return response({
    subject: { selector_type: 'hypothesis_id', type: 'domain', value: 'nanshanlife.com.tw', hypothesis_id: 'hyp-nanshan', state: 'needs_validation' },
    summary: {
      title: 'Nanshan darkweb identity hypothesis',
      description: 'Fusion evidence prioritizes identity-safe validation without marking exploitation as proven.',
      kind: 'darkweb_identity',
      state: 'needs_validation',
      priority_score: 76,
      confidence_score: 74,
      impact_score: 88,
      exploitability_score: 82,
      validation_readiness: 58,
      recommended_verifier: 'darkweb_review',
      observation_count: 3,
      relation_count: 2,
      missing_evidence_count: 1,
      validation_task_count: 1,
      source_count: 3,
      dimensions: { conflict_penalty: 50, corroboration_score: 85 },
      why_now: [],
      positioning: 'BOY prioritizes validation and preserves contested evidence before any terminal decision.',
    },
    path: undefined,
    candidate: {
      id: 'hyp-nanshan',
      kind: 'darkweb_identity',
      title: 'Nanshan darkweb identity hypothesis',
      description: 'Fusion evidence prioritizes identity-safe validation.',
      state: 'needs_validation',
      subject_type: 'domain',
      subject_value: 'nanshanlife.com.tw',
      priority_score: 76,
      dimensions: { conflict_penalty: 50 },
      evidence_ids: ['obs-cyble', 'obs-bitsight', 'obs-flyto'],
      relation_ids: ['rel-support', 'rel-conflict'],
      recommended_verifier: 'darkweb_review',
      updated_at: '2026-06-15T00:00:00Z',
    },
    observations: [
      { id: 'obs-cyble', source_type: 'fusion', source_name: 'cyble', source_reliability: 84, subject_type: 'domain', subject_value: 'nanshanlife.com.tw', observation_type: 'darkweb_identity_credential_leak', confidence: 82, severity: 'high', business_impact: 90, validation_status: 'unvalidated', raw_ref: 'fusion:cyble:darkweb_identity:nanshanlife.com.tw:abc', metadata_summary: {}, first_seen_at: '2026-06-13T00:00:00Z', last_seen_at: '2026-06-13T00:00:00Z' },
      { id: 'obs-bitsight', source_type: 'fusion', source_name: 'bitsight', source_reliability: 82, subject_type: 'domain', subject_value: 'nanshanlife.com.tw', observation_type: 'darkweb_identity_support_external_exposure', confidence: 90, severity: 'critical', business_impact: 82, validation_status: 'unvalidated', raw_ref: 'fusion:bitsight:posture:nanshanlife.com.tw:external.posture:def', metadata_summary: {}, first_seen_at: '2026-06-12T00:00:00Z', last_seen_at: '2026-06-12T00:00:00Z' },
      { id: 'obs-flyto', source_type: 'fusion', source_name: 'flyto.native', source_reliability: 90, subject_type: 'domain', subject_value: 'nanshanlife.com.tw', observation_type: 'darkweb_identity_native_contradicted', confidence: 65, severity: 'info', business_impact: 55, validation_status: 'unvalidated', raw_ref: 'fusion:flyto.native:native_conflict:nanshanlife.com.tw:ghi', metadata_summary: {}, first_seen_at: '2026-06-13T01:00:00Z', last_seen_at: '2026-06-13T01:00:00Z' },
    ],
    relations: [
      { id: 'rel-support', from_observation_id: 'obs-cyble', to_observation_id: 'obs-bitsight', relation_kind: 'supports_external_exposure_context', confidence: 90, metadata_summary: {}, observed_at: '2026-06-15T00:00:00Z' },
      { id: 'rel-conflict', from_observation_id: 'obs-cyble', to_observation_id: 'obs-flyto', relation_kind: 'contradicts_darkweb_identity', confidence: 65, metadata_summary: {}, observed_at: '2026-06-15T00:00:00Z' },
    ],
    source_ledger: [
      { id: 'fusion:cyble', source_type: 'fusion', source_name: 'cyble', observation_count: 1, source_reliability: 84, max_confidence: 82, max_business_impact: 90, max_severity: 'high', first_seen_at: '2026-06-13T00:00:00Z', last_seen_at: '2026-06-13T00:00:00Z', observation_ids: ['obs-cyble'] },
      { id: 'fusion:bitsight', source_type: 'fusion', source_name: 'bitsight', observation_count: 1, source_reliability: 82, max_confidence: 90, max_business_impact: 82, max_severity: 'critical', first_seen_at: '2026-06-12T00:00:00Z', last_seen_at: '2026-06-12T00:00:00Z', observation_ids: ['obs-bitsight'] },
      { id: 'fusion:flyto.native', source_type: 'fusion', source_name: 'flyto.native', observation_count: 1, source_reliability: 90, max_confidence: 65, max_business_impact: 55, max_severity: 'info', first_seen_at: '2026-06-13T01:00:00Z', last_seen_at: '2026-06-13T01:00:00Z', observation_ids: ['obs-flyto'] },
    ],
    validation_tasks: [{
      id: 'task-darkweb-review',
      hypothesis_id: 'hyp-nanshan',
      linked_gap_id: '',
      status: 'queued_for_validation',
      verifier: 'darkweb_review',
      result: '',
      notes: '',
      requested_by: 'boy',
      evidence_ids: ['obs-cyble', 'obs-bitsight', 'obs-flyto'],
      created_at: '2026-06-15T00:00:00Z',
      updated_at: '2026-06-15T00:00:00Z',
    }],
    decision_states: { current_state: 'needs_validation', validation_status: 'needs_validation', task_counts: { queued_for_validation: 1 }, missing_evidence_counts: { missing: 1 }, open_task_ids: ['task-darkweb-review'], completed_task_ids: [] },
    evidence_quality: {
      weighted_confidence: 78,
      reliability_band: 'contested',
      corroboration_count: 1,
      conflict_count: 1,
      stale_source_count: 0,
      top_source_ids: ['fusion:flyto.native', 'fusion:cyble', 'fusion:bitsight'],
      support_relation_ids: ['rel-support'],
      conflict_relation_ids: ['rel-conflict'],
    },
    citation_index: [
      { id: 'obs-cyble', kind: 'boy_observation', title: 'Cyble darkweb identity evidence', source_type: 'fusion', source_name: 'cyble', raw_ref: 'fusion:cyble:darkweb_identity:nanshanlife.com.tw:abc', related_ids: [], metadata_summary: {} },
      { id: 'obs-bitsight', kind: 'boy_observation', title: 'Bitsight exposure context', source_type: 'fusion', source_name: 'bitsight', raw_ref: 'fusion:bitsight:posture:nanshanlife.com.tw:external.posture:def', related_ids: [], metadata_summary: {} },
      { id: 'obs-flyto', kind: 'boy_observation', title: 'Flyto2 native conflict evidence', source_type: 'fusion', source_name: 'flyto.native', raw_ref: 'fusion:flyto.native:native_conflict:nanshanlife.com.tw:ghi', related_ids: [], metadata_summary: {} },
      { id: 'rel-support', kind: 'boy_relation', title: 'Supports external exposure context', raw_ref: 'boy_relation:rel-support', related_ids: ['obs-cyble', 'obs-bitsight'], metadata_summary: {} },
      { id: 'rel-conflict', kind: 'boy_relation', title: 'Contradicts darkweb identity', raw_ref: 'boy_relation:rel-conflict', related_ids: ['obs-cyble', 'obs-flyto'], metadata_summary: {} },
    ],
    narrative: { claims: [{ id: 'claim-nanshan', kind: 'evidence_quality', text: 'Nanshan remains contested and needs validation.', citations: ['obs-cyble', 'rel-conflict'] }] },
  })
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

describe('ResearchFootprintDrawer', () => {
  it('omits uncited narrative claims from audit report sections', () => {
    const sections = buildResearchFootprintReportSections(response({
      narrative: {
        claims: [
          { id: 'claim-cited', kind: 'source', text: 'Cited claim.', citations: ['obs-1'] },
          { id: 'claim-uncited', kind: 'source', text: 'Uncited claim.', citations: [] },
        ],
      },
    }))
    const narrativeSection = sections.find(section => section.title === 'AI Evidence-backed Narrative')
    expect(narrativeSection?.rows).toEqual([
      { Kind: 'Source', Claim: 'Cited claim.', Citations: 'obs-1' },
    ])
  })

  it('preserves zero confidence instead of falling back to another metric', () => {
    const data = response()
    data.summary.confidence_score = 0
    data.evidence_quality.weighted_confidence = 78
    const sections = buildResearchFootprintReportSections(data)
    const summary = sections.find(section => section.title === 'Research Summary')

    expect(summary?.content).toContain('Confidence: 0')
    expect(summary?.content).not.toContain('Confidence: 78')
  })

  it('renders loading state', () => {
    vi.mocked(getResearchFootprint).mockReturnValue(new Promise(() => {}))
    renderDrawer()
    expect(screen.getByText(/Loading cited research footprint/i)).toBeTruthy()
  })

  it('renders empty and error states', async () => {
    vi.mocked(getResearchFootprint).mockResolvedValueOnce(response({
      path: undefined,
      candidate: undefined,
      observations: [],
      source_ledger: [],
      evidence_timeline: [],
      narrative: { claims: [] },
    }))
    const { unmount } = renderDrawer()
    expect(await screen.findByText(/No cited BOY evidence/i)).toBeTruthy()
    unmount()

    vi.mocked(getResearchFootprint).mockRejectedValueOnce(new Error('boom'))
    renderDrawer()
    expect(await screen.findByText(/Research Footprint is unavailable/i)).toBeTruthy()
  })

  it('renders cited sections and exports the evidence bundle', async () => {
    vi.mocked(getResearchFootprint).mockResolvedValue(response())
    vi.mocked(downloadBuiltReport).mockResolvedValue(undefined)
    vi.mocked(exportResearchFootprintBundle).mockResolvedValue({
      filename: 'supplier-sms-gateway-research-footprint.json',
      bytes: 1234,
      bundleHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      response: {} as never,
    })
    vi.mocked(createBOYValidationTask).mockResolvedValue({ task: {} as never })
    renderDrawer()
    expect(await screen.findByText('AI Evidence-backed Narrative')).toBeTruthy()
    expect(screen.getByText('Source Ledger')).toBeTruthy()
    expect(screen.getByText('Evidence Timeline')).toBeTruthy()
    expect(screen.getByText('Evidence Quality')).toBeTruthy()
    expect(screen.getByText('Audit Integrity')).toBeTruthy()
    expect(screen.getByText('Pentest / Red Team Validation')).toBeTruthy()
    expect(screen.getByText('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')).toBeTruthy()
    expect(screen.getByText('Decision Log')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Export Evidence Bundle/i }))
    await waitFor(() => expect(exportResearchFootprintBundle).toHaveBeenCalledWith('org-1', { path_id: 'path-1' }))
    fireEvent.click(screen.getByRole('button', { name: /Export Audit Report/i }))
    await waitFor(() => expect(downloadBuiltReport).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        sections: expect.arrayContaining([
          expect.objectContaining({ title: 'AI Evidence-backed Narrative' }),
          expect.objectContaining({ title: 'Audit Integrity' }),
          expect.objectContaining({ title: 'Citation Index' }),
          expect.objectContaining({ title: 'Verification Summary' }),
          expect.objectContaining({ title: 'Decision Log' }),
        ]),
      }),
      'supplier-sms-gateway-research-footprint',
    ))
    fireEvent.click(screen.getByRole('button', { name: /Queue Validation/i }))
    await waitFor(() => expect(createBOYValidationTask).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ hypothesis_id: 'hyp-1' }),
    ))
  })

  it('renders the Nanshan contested three-source footprint without unsafe placeholders', async () => {
    vi.mocked(getResearchFootprint).mockResolvedValue(nanshanContestedResponse())
    renderDrawer()

    expect(await screen.findByText('Nanshan darkweb identity hypothesis')).toBeTruthy()
    expect(screen.getAllByText('Needs Validation').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Darkweb Review').length).toBeGreaterThan(0)
    expect(screen.getByText('Contested')).toBeTruthy()
    expect(screen.getByText('78')).toBeTruthy()
    expect(screen.getByText('Fusion / cyble')).toBeTruthy()
    expect(screen.getByText('Fusion / bitsight')).toBeTruthy()
    expect(screen.getByText('Fusion / flyto.native')).toBeTruthy()
    expect(screen.getByText(/Contradicts Darkweb Identity/i)).toBeTruthy()
    expect(screen.queryByText(/Validated exploitable/i)).toBeNull()
    expect(screen.queryByText(/Complete as exploitable/i)).toBeNull()
    expect(screen.queryByText(/undefined|null|NaN/)).toBeNull()
  })

  it('queues validation, recompiles, and completes active tasks', async () => {
    vi.mocked(getResearchFootprint).mockResolvedValue(response({
      validation_tasks: [{
        id: 'task-1',
        hypothesis_id: 'hyp-1',
        linked_gap_id: '',
        status: 'queued_for_validation',
        verifier: 'supplier_assessment',
        result: '',
        notes: '',
        requested_by: 'analyst-1',
        evidence_ids: ['obs-1'],
        created_at: '2026-06-15T00:00:00Z',
        updated_at: '2026-06-15T00:00:00Z',
      }],
    }))
    vi.mocked(recompileBOYBreakthroughPaths).mockResolvedValue({ org_id: 'org-1', compiled: 1, auto_queued: 0, bridged_attack_paths: 0, hypotheses: [] })
    vi.mocked(createBOYValidationTask).mockResolvedValue({ task: {} as never })
    vi.mocked(completeBOYValidationTask).mockResolvedValue({ task: {} as never })
    renderDrawer()

    expect(await screen.findByText('Validation Tasks')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Recompile/i }))
    await waitFor(() => expect(recompileBOYBreakthroughPaths).toHaveBeenCalledWith('org-1'))

    fireEvent.click(screen.getByRole('button', { name: /Complete Validation/i }))
    fireEvent.click(screen.getByRole('button', { name: /Save result/i }))
    await waitFor(() => expect(completeBOYValidationTask).toHaveBeenCalledWith(
      'org-1',
      'task-1',
      expect.objectContaining({ status: 'validated_exploitable' }),
    ))
  })

  it('opens citation inspector and attaches eligible pentest evidence', async () => {
    const pentestCitation = {
      id: 'obs-pentest-1',
      kind: 'pentest_finding',
      title: 'Empirical Pentest Finding',
      source_type: 'pentest',
      source_name: 'flyto-pentest',
      source_reliability: 95,
      subject_type: 'domain',
      subject_value: 'sms-gateway.example.com',
      confidence: 95,
      severity: 'critical',
      business_impact: 95,
      validation_status: 'observed',
      raw_ref: 'pentest_scan:scan-1/finding:finding-1',
      observed_at: '2026-06-15T00:00:00Z',
      related_ids: [],
      metadata_summary: { project_id: 'project-1', scan_id: 'scan-1', finding_id: 'finding-1', status: 'open' },
    }
    vi.mocked(getResearchFootprint).mockResolvedValue(response({
      verification_summary: {
        level: 'empirically_observed',
        status: 'validation_pending',
        pentest_observation_count: 1,
        pentest_finding_count: 1,
        linked_validation_task_ids: ['task-1'],
        last_empirical_validation_at: '2026-06-15T00:00:00Z',
      },
      validation_tasks: [{
        id: 'task-1',
        hypothesis_id: 'hyp-1',
        linked_gap_id: '',
        status: 'queued_for_validation',
        verifier: 'pentest_validation',
        result: '',
        notes: '',
        requested_by: 'analyst-1',
        evidence_ids: ['obs-pentest-1'],
        created_at: '2026-06-15T00:00:00Z',
        updated_at: '2026-06-15T00:00:00Z',
      }],
      narrative: { claims: [{ id: 'claim-1', kind: 'source', text: 'Pentest evidence supports the route.', citations: ['obs-pentest-1'] }] },
      evidence_timeline: [{ id: 'obs:obs-pentest-1', kind: 'observation', title: 'Empirical Pentest Finding', detail: 'flyto-pentest observed sms-gateway', timestamp: '2026-06-15T00:00:00Z', citations: ['obs-pentest-1'] }],
      citation_index: [pentestCitation, {
        id: 'task-1',
        kind: 'validation_task',
        title: 'Queued For Validation',
        source_type: 'pentest_validation',
        validation_status: 'queued_for_validation',
        raw_ref: 'validation_task:task-1',
        related_ids: ['obs-pentest-1'],
        metadata_summary: {},
      }],
    }))
    vi.mocked(attachPentestEvidenceToValidationTask).mockResolvedValue({ task: {} as never, observation_ids: ['obs-pentest-1'] })

    renderDrawer()
    await screen.findByText('Pentest evidence supports the route.')
    fireEvent.click(screen.getAllByText('obs-pentest-1')[0])
    expect(await screen.findByText('Citation Inspector')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Open in Pentest/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Attach Pentest Evidence/i }))

    await waitFor(() => expect(attachPentestEvidenceToValidationTask).toHaveBeenCalledWith(
      'org-1',
      'task-1',
      { project_id: 'project-1', scan_id: 'scan-1', finding_ids: ['finding-1'] },
    ))
  })
})
