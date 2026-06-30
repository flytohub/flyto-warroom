/**
 * ScoringConfigTab smoke test — mounts + renders sliders for default weights.
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_k: string, fb: string) => fb,
}))

vi.mock('notistack', () => ({
  useSnackbar: () => ({ enqueueSnackbar: vi.fn() }),
}))

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1', name: 'Test Org' } }),
}))

const { mockConfig } = vi.hoisted(() => ({
  mockConfig: {
    category_weights: {
      'code-security': 0.35,
      'attack-surface': 0.30,
      'diligence': 0.20,
      'code-quality': 0.10,
    },
    confidence_multipliers: { L0: 0.3, L1: 0.7, L2: 1.0 },
    risk_factors: {
      epss_no_data_default: 0.3,
      reach_unknown: 0.5,
      reach_unreachable: 0.1,
      impact_default: 0.6,
    },
    source: 'default' as const,
    score_runs: 7,
  },
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: mockConfig, isLoading: false, isError: false }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}))

vi.mock('@lib/engine', async () => {
  const actual = await vi.importActual<any>('@lib/engine')
  return {
    ...actual,
    getScoringConfig: vi.fn(),
    updateScoringConfig: vi.fn(),
    resetScoringConfig: vi.fn(),
    DEFAULT_CATEGORY_WEIGHTS: {
      'code-security': 0.35, 'attack-surface': 0.30, 'diligence': 0.20, 'code-quality': 0.10,
    },
    DEFAULT_CONFIDENCE_MULTIPLIERS: { L0: 0.3, L1: 0.7, L2: 1.0 },
    DEFAULT_RISK_FACTORS: {
      epss_no_data_default: 0.3, reach_unknown: 0.5, reach_unreachable: 0.1, impact_default: 0.6,
    },
  }
})

import { ScoringConfigTab } from '@compounds/settings/ScoringConfigTab'

describe('ScoringConfigTab', () => {
  it('renders all 3 section headers + score-runs counter', () => {
    render(<ScoringConfigTab />)
    expect(screen.getByText('Category Weights')).toBeTruthy()
    expect(screen.getByText('Confidence Multipliers')).toBeTruthy()
    expect(screen.getByText('Risk Factors')).toBeTruthy()
    expect(screen.getByText('7')).toBeTruthy()  // score_runs
  })

  it('renders category labels with their pretty names', () => {
    render(<ScoringConfigTab />)
    expect(screen.getByText('Code Security')).toBeTruthy()
    expect(screen.getByText('Attack Surface')).toBeTruthy()
  })
})
