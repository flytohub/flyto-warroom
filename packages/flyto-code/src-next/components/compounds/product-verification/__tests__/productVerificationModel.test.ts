import { describe, expect, it } from 'vitest'
import type {
  WarroomAutomationTestModel,
  WarroomCampaignExecution,
  WarroomEvidenceArtifact,
  WarroomEvidencePack,
  WarroomVerificationEvidenceResponse,
} from '@lib/engine'
import {
  artifactPreview,
  formatGateScore,
  formatScore,
  ghostApiCount,
  normalizeAutomationModel,
  normalizeEvidenceFindings,
  normalizeEvidenceGate,
  readNumber,
  summarizeDeterministicRules,
  summarizeRuns,
} from '../productVerificationModel'

describe('productVerificationModel', () => {
  it('prefers the response gate contract and reports complete metadata', () => {
    const pack = {
      gate_verdict: 'blocked',
      gate_score: 20,
      gate_blockers: ['pack blocker'],
    } as unknown as WarroomEvidencePack
    const response = {
      gateVerdict: 'pass',
      gateScore: 96,
      gateBlockers: [],
      scoreBreakdown: { evidence: { points: 30, max: 30 } },
    } as unknown as WarroomVerificationEvidenceResponse

    const gate = normalizeEvidenceGate(response, pack)

    expect(gate.verdict).toBe('pass')
    expect(gate.score).toBe(96)
    expect(gate.blockers).toEqual([])
    expect(gate.hasGateMetadata).toBe(true)
  })

  it('normalizes legacy graph findings and counts every ghost API type', () => {
    const pack = {
      site_graph: {
        findings: [
          { code: 'ghost_api_type_a' },
          { type: 'ghost_api_type_b' },
          { code: 'state_contradiction' },
        ],
      },
    } as unknown as WarroomEvidencePack

    expect(normalizeEvidenceFindings(pack)).toHaveLength(3)
    expect(ghostApiCount(pack)).toBe(2)
  })

  it('blocks the deterministic summary when RBAC closure evidence is false', () => {
    const model = {
      deterministic_rules: { counts: {}, samples: {}, required: [], has_blockers: false },
      rbac_matrix: { status: 'captured', fail_closed: false },
    } as unknown as WarroomAutomationTestModel

    const summary = summarizeDeterministicRules(null, model)
    const rbac = summary.rows.find((row) => row.code === 'rbac_fail_open')

    expect(rbac).toMatchObject({ count: 1, status: 'blocked' })
    expect(summary.total).toBe(1)
  })

  it('builds a deterministic fallback without granting missing authorization evidence', () => {
    const pack = {
      findings: [{ code: 'state_contradiction' }],
      scores: { observed_coverage: 0.75, p0: 1 },
    } as unknown as WarroomEvidencePack
    const artifacts = [
      { kind: 'screenshot' },
      { kind: 'network_log' },
    ] as WarroomEvidenceArtifact[]
    const gate = normalizeEvidenceGate(undefined, null)

    const model = normalizeAutomationModel(pack, artifacts, gate)

    expect(model.engine_mode?.llm_required).toBe(false)
    expect(model.authorization_gate?.fail_closed).toBe(false)
    expect(model.rbac_matrix?.fail_closed).toBe(false)
    expect(model.evidence_chain?.artifact_completeness?.missing).toEqual(['dom_snapshot'])
    expect(model.business_invariants?.state_contradictions).toBe(1)
  })

  it('formats scores and artifact previews deterministically', () => {
    const artifact = {
      name: 'network.json',
      mimeType: 'application/json',
      sizeBytes: 2048,
    } as WarroomEvidenceArtifact

    expect(formatScore(0.92)).toBe('92%')
    expect(formatGateScore(91.25)).toBe('91.3 / 100')
    expect(artifactPreview(artifact)).toContain('2 KB')
    expect(readNumber({ score: Number.POSITIVE_INFINITY }, 'score')).toBeUndefined()
  })

  it('summarizes active and evidence-backed executions independently', () => {
    const runs = [
      { status: 'running', evidenceSig: '' },
      { status: 'complete', evidenceSig: 'sig-1' },
      { status: 'dispatched', evidenceSig: 'sig-2' },
    ] as WarroomCampaignExecution[]

    expect(summarizeRuns(runs)).toEqual({ active: 2, withEvidence: 2 })
  })
})
