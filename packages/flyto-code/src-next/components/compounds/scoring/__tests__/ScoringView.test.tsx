/**
 * ScoringView smoke test — verifies the click-through wiring added
 * 2026-05-20. Before the wire-up, every interactive element on this
 * page was a dead-end (cross-dim chips, evidence rows, domain rows
 * had no onClick). The tests below assert that:
 *
 *   - Cross-Dimensional Adjustment chips render and respond to click
 *     by routing to the right target (navigate vs Fix Queue).
 *   - Confidence badges + observation tooltips don't crash on render.
 *   - Effective weight (not static def.weight) drives the percentage
 *     shown on the left-panel category headers.
 *
 * The Fix Queue interaction is exercised through a spied provider —
 * we want to confirm the OPEN call fires with the right filter, not
 * to exercise the drawer itself (which has its own tests).
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_k: string, fb: string) => fb,
}))

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1', name: 'Test Org' } }),
}))

const { mockServerScore, mockOpen } = vi.hoisted(() => ({
  mockServerScore: {
    overall_raw: 720, overall_display: 720, overall_grade: 'B',
    overall_grade_color: '#06b6d4',
    active_count: 8, total_count: 12,
    categories: [
      {
        id: 'code-security', label: 'Code Security', weight: 0.35, color: '#ef4444',
        raw: 70, display: 70, grade: 'B', grade_color: '#06b6d4',
        effective_weight: 0.40,  // redistributed up from 0.35
        sub_vectors: [
          {
            id: 'vuln-cve', label: 'CVE Findings', weight: 0.45, color: '#ef4444',
            mode: 'scored', drill_down_type: 'repo',
            raw: 75, display: 75, grade: 'B', grade_color: '#06b6d4',
            repo_scores: [
              { id: 'repo-a', name: 'org/repo-a', raw: 75, display: 75, grade: 'B', grade_color: '#06b6d4', label: '2 CVE' },
            ],
          },
        ],
      },
      {
        id: 'code-quality', label: 'Code Quality', weight: 0.10, color: '#f97316',
        raw: null, display: null, grade: null, grade_color: '#94a3b8',
        effective_weight: 0.0,
        sub_vectors: [
          { id: 'q-complex', label: 'Complex Functions', weight: 0.0, color: '#eab308', mode: 'context', drill_down_type: 'repo', raw: null, display: null, grade: null, grade_color: '#94a3b8' },
        ],
      },
    ],
    cross_dim: {
      blast_radius_penalty: -2,
      pr_adjacency_penalty: -1,
      taint_adjacency_penalty: 0,
      pentest_verdict_modifier: 0,
      autofix_coverage_bonus: 3,
      total: 0,  // -2 + -1 + 3 = 0; chip still renders because individual signals are non-zero
    },
    explanations: [],
  },
  mockOpen: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    const key = Array.isArray(queryKey) ? queryKey[0] : ''
    if (key === 'computed-score') {
      return { data: mockServerScore, isLoading: false, isError: false, error: null, refetch: vi.fn() }
    }
    return { data: null, isLoading: false, isError: false, error: null, refetch: vi.fn() }
  },
}))

vi.mock('@lib/engine', async () => {
  const actual = await vi.importActual<any>('@lib/engine')
  return {
    ...actual,
    getComputedScore: vi.fn().mockResolvedValue(mockServerScore),
    getOrgBenchmark: vi.fn().mockResolvedValue(null),
  }
})

vi.mock('@/contexts/FixQueueContext', async () => {
  const actual = await vi.importActual<any>('@/contexts/FixQueueContext')
  return {
    ...actual,
    useFixQueue: () => ({
      state: { open: false, filter: 'all' },
      open: mockOpen,
      close: vi.fn(),
    }),
  }
})

vi.mock('../BenchmarkCard', () => ({
  BenchmarkCard: () => <div data-testid="benchmark-card" />,
}))

import { ScoringView } from '../ScoringView'

describe('ScoringView', () => {
  it('renders the overview with category headers + cross-dim chips', () => {
    render(<ScoringView />)
    // Category labels appear in BOTH the left panel and the right
    // panel legend — both surfaces are valid, just want at least one.
    expect(screen.getAllByText('Code Security').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Code Quality').length).toBeGreaterThan(0)
    // Cross-Dim panel surfaces individual non-zero signals even when
    // the net total is zero (-2 + -1 + +3 here).
    expect(screen.getByText('Blast Radius')).toBeTruthy()
    expect(screen.getByText('AutoFix Coverage')).toBeTruthy()
  })

  it('uses effective_weight on category headers (40%, not the static 35%)', () => {
    render(<ScoringView />)
    // Code Security effective_weight 0.40 → 40%. The static def.weight
    // (35%) must NOT appear anywhere as a category percentage; only
    // effective_weight is the truthful number we show. 40% appears on
    // both the left nav header and the right panel legend.
    expect(screen.getAllByText('40%').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('35%')).toBeNull()
  })

  it('flags categories with only observing/context sub-vectors', () => {
    render(<ScoringView />)
    // Code Quality has only a context sub-vector — should be tagged
    // so operators know its weight in the donut doesn't impact rating.
    expect(screen.getByText(/observation only/i)).toBeTruthy()
  })

  it('cross-dim Blast Radius chip routes to Pulse via onNavigate', () => {
    const onNavigate = vi.fn()
    render(<ScoringView onNavigate={onNavigate} />)
    fireEvent.click(screen.getByText('Blast Radius'))
    expect(onNavigate).toHaveBeenCalledWith('_pulse')
  })

  it('cross-dim AutoFix Coverage chip opens Fix Queue with autofix filter', () => {
    mockOpen.mockClear()
    render(<ScoringView onNavigate={vi.fn()} />)
    fireEvent.click(screen.getByText('AutoFix Coverage'))
    expect(mockOpen).toHaveBeenCalledWith({ filter: 'autofix' })
  })
})
