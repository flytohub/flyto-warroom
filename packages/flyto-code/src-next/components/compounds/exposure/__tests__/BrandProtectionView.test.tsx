import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { BrandProtectionResponse } from '@lib/engine/code/pentest'

const brandResponse: BrandProtectionResponse = {
  assets: [],
  stage_counts: { case: 1, candidate: 1, owned: 0 },
  campaigns: [{
    family_key: 'logistics_lure|link|random_apex',
    status: 'confirmed',
    confidence: 95,
    seed_count: 1,
    related_count: 7,
  }],
  quality: {
    score: 88,
    grade: 'B',
    precision_mode: 'precision_first',
    evidence_coverage: 50,
    freshness_coverage: 50,
    footprint_coverage: 50,
    learning_coverage: 100,
    machine_case_count: 0,
    human_review_count: 2,
    similarity_only_watch_count: 1,
    stale_count: 1,
    confirmed_feedback_count: 1,
    suppressed_feedback_count: 0,
    reasons: ['High-similarity-only rows are held for review instead of auto-escalation.'],
  },
  cases: [{
    id: 'brand-case-1',
    asset_id: 'case-1',
    asset_type: 'phishing_url',
    source: 'analyst_feed',
    value: 'https://family-tw.guimejj.link/ht3',
    display_value: 'family-tw.guimejj.link',
    target: 'family myship',
    stage: 'case',
    workflow_stage: 'action_ready',
    verdict: 'confirmed_campaign_match',
    confidence: 95,
    risk: 'high',
    relationship: 'confirmed_targeting',
    relationship_score: 90,
    intent: 'confirmed_phishing',
    intent_score: 90,
    ownership: 'third_party',
    decision_authority: {
      mode: 'analyst_confirmed',
      label: 'Analyst confirmed',
      reason: 'Human feedback confirmed phishing and created a campaign seed.',
      requires_human_action: true,
      external_action_requires_human: true,
    },
    learning_context: {
      state: 'confirmed_pattern',
      family_key: 'logistics_lure|link|random_apex',
      confirmed_count: 1,
      confidence_delta: 3,
      reason: 'Analyst feedback confirmed this item.',
    },
    freshness: {
      status: 'stale',
      reason: 'Evidence has not been refreshed recently.',
    },
    evidence_axes: [{
      key: 'brand_relationship',
      label: 'Brand relationship',
      status: 'supported',
      score: 90,
    }, {
      key: 'abuse_intent',
      label: 'Abuse intent',
      status: 'supported',
      score: 90,
    }],
    campaign_context: {
      family_key: 'logistics_lure|link|random_apex',
      status: 'confirmed',
      confidence: 95,
      seed_count: 1,
      related_count: 7,
    },
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
    id: 'brand-candidate-1',
    asset_id: 'candidate-1',
    asset_type: 'impersonation',
    source: 'high_similarity_watch',
    value: 'flyto2.net',
    display_value: 'flyto2.net',
    target: 'flyto.com',
    stage: 'candidate',
    workflow_stage: 'needs_evidence',
    verdict: 'similar_domain_only',
    confidence: 64,
    risk: 'medium',
    relationship: 'similar',
    relationship_score: 55,
    intent: 'none',
    intent_score: 0,
    domain_similarity_class: 'high',
    ownership: 'third_party',
    decision_authority: {
      mode: 'human_review',
      label: 'Human review',
      reason: 'The score or evidence shape needs analyst judgment before escalation.',
      requires_human_review: true,
      requires_human_action: true,
    },
    learning_context: {
      state: 'known_pattern',
      family_key: 'logistics_lure|link|random_apex',
      confirmed_count: 1,
      confidence_delta: 6,
    },
    freshness: {
      status: 'fresh',
      reason: 'Recently discovered row awaiting normal evidence refresh.',
    },
    evidence_axes: [{
      key: 'abuse_intent',
      label: 'Abuse intent',
      status: 'missing',
      score: 0,
      missing_evidence: ['login, payment, credential, or takedown-worthy abuse evidence'],
    }],
    asset: {
      id: 'candidate-1',
      asset_type: 'impersonation',
      value: 'flyto2.net',
      metadata: '{}',
      status: 'active',
      discovered_at: '2026-06-18T00:00:00Z',
    },
  }],
  owned: [],
}

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1' } }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[0] === 'brand-protection') {
      return { data: brandResponse, isLoading: false, isError: false, error: null, refetch: vi.fn() }
    }
    return { data: { chain: [], paths: [] }, isLoading: false, isError: false, error: null, refetch: vi.fn() }
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
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
    getAttackSurfaceScreenshotBlobUrl: vi.fn(),
    submitBrandProtectionFeedback: vi.fn(),
    setTakedownState: vi.fn(),
    downloadEvidenceBundle: vi.fn(),
  }
})

vi.mock('@lib/engine/code/footprintSurface', () => ({
  getCandidatePaths: vi.fn(),
  getSurfaceEvidence: vi.fn(),
}))

vi.mock('../TakedownLetterDialog', () => ({
  TakedownLetterDialog: () => null,
}))

import { BrandProtectionView } from '../BrandProtectionView'

describe('BrandProtectionView', () => {
  it('renders backend quality, learning, freshness, and authority context', () => {
    render(<BrandProtectionView />)

    expect(screen.getByText('88 B')).toBeTruthy()
    expect(screen.getAllByText('Human review').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Stale evidence').length).toBeGreaterThan(0)
    expect(screen.getByText('Confirmed pattern')).toBeTruthy()
    expect(screen.getAllByText('Analyst confirmed').length).toBeGreaterThan(0)
  })

  it('keeps high-similarity-only candidates in review context', () => {
    render(<BrandProtectionView />)

    fireEvent.click(screen.getByRole('button', { name: /Candidates/i }))

    expect(screen.getAllByText('flyto2.net').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Similar domain only').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Human review').length).toBeGreaterThan(0)
    expect(screen.getByText('Known pattern')).toBeTruthy()
    expect(screen.getAllByText('Fresh evidence').length).toBeGreaterThan(0)
  })
})
