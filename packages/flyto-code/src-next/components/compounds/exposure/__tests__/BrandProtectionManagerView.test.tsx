import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { BrandProtectionResponse } from '@lib/engine/code/pentest'

const managerResponse: BrandProtectionResponse = {
  assets: [],
  stage_counts: { case: 1, candidate: 1, owned: 1 },
  quality: {
    score: 91,
    grade: 'A',
    precision_mode: 'precision_first',
    evidence_coverage: 80,
    freshness_coverage: 67,
    footprint_coverage: 50,
    learning_coverage: 67,
    machine_case_count: 0,
    human_review_count: 2,
    similarity_only_watch_count: 1,
    stale_count: 1,
    confirmed_feedback_count: 1,
    suppressed_feedback_count: 0,
  },
  cases: [{
    id: 'case-1',
    asset_id: 'case-1',
    asset_type: 'phishing_url',
    source: 'analyst_feed',
    value: 'https://family-tw.guimejj.link/ht3',
    display_value: 'family-tw.guimejj.link',
    stage: 'case',
    workflow_stage: 'action_ready',
    verdict: 'confirmed_campaign_match',
    confidence: 95,
    risk: 'high',
    relationship_score: 90,
    intent_score: 90,
    ownership: 'third_party',
    decision_authority: { mode: 'analyst_confirmed', label: 'Analyst confirmed' },
    learning_context: { state: 'confirmed_pattern', confirmed_count: 1 },
    freshness: { status: 'stale' },
    asset: {
      id: 'case-1',
      asset_type: 'phishing_url',
      value: 'https://family-tw.guimejj.link/ht3',
      metadata: '{}',
      status: 'active',
      discovered_at: '2026-06-18T00:00:00Z',
    },
  }],
  candidates: [{
    id: 'candidate-1',
    asset_id: 'candidate-1',
    asset_type: 'impersonation',
    source: 'high_similarity_watch',
    value: 'flyto2.net',
    display_value: 'flyto2.net',
    stage: 'candidate',
    workflow_stage: 'needs_evidence',
    verdict: 'similar_domain_only',
    confidence: 65,
    risk: 'medium',
    relationship_score: 55,
    intent_score: 0,
    domain_similarity_class: 'high',
    ownership: 'third_party',
    decision_authority: { mode: 'human_review', label: 'Human review' },
    learning_context: { state: 'known_pattern', confirmed_count: 1 },
    freshness: { status: 'fresh' },
    evidence_axes: [{ key: 'abuse_intent', label: 'Abuse intent', status: 'missing', score: 0, missing_evidence: ['abuse evidence'] }],
    asset: {
      id: 'candidate-1',
      asset_type: 'impersonation',
      value: 'flyto2.net',
      metadata: '{}',
      status: 'active',
      discovered_at: '2026-06-18T00:00:00Z',
    },
  }],
  owned: [{
    id: 'owned-1',
    asset_id: 'owned-1',
    asset_type: 'impersonation',
    source: 'defensive',
    value: 'flyto-login.example',
    display_value: 'flyto-login.example',
    stage: 'owned',
    workflow_stage: 'closed',
    verdict: 'defensive_registration',
    confidence: 40,
    risk: 'low',
    relationship_score: 100,
    intent_score: 0,
    ownership: 'self_owned',
    decision_authority: { mode: 'human_closed', label: 'Defensive / owned' },
    freshness: { status: 'fresh' },
    asset: {
      id: 'owned-1',
      asset_type: 'impersonation',
      value: 'flyto-login.example',
      metadata: '{}',
      status: 'active',
      discovered_at: '2026-06-18T00:00:00Z',
    },
  }],
}

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1' } }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: managerResponse, isLoading: false, isError: false }),
}))

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

vi.mock('@lib/engine/code/pentest', async () => {
  const actual = await vi.importActual<typeof import('@lib/engine/code/pentest')>('@lib/engine/code/pentest')
  return {
    ...actual,
    getBrandProtection: vi.fn(),
  }
})

import { BrandProtectionManagerView } from '../BrandProtectionManagerView'

describe('BrandProtectionManagerView', () => {
  it('renders quality-first KPIs and review queue metadata', () => {
    render(<BrandProtectionManagerView />)

    expect(screen.getByText('Precision quality')).toBeTruthy()
    expect(screen.getByText('91')).toBeTruthy()
    expect(screen.getAllByText('Human review').length).toBeGreaterThan(0)
    expect(screen.getByText('Fresh evidence')).toBeTruthy()
    expect(screen.getByText('Learning coverage')).toBeTruthy()
    expect(screen.getByText('family-tw.guimejj.link')).toBeTruthy()
    expect(screen.getAllByText(/stale/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/confirmed learning/i)).toBeTruthy()
  })
})
