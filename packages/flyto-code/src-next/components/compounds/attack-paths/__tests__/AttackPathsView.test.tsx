/**
 * AttackPathsView smoke test — verifies the convergence-layer page
 * mounts with empty engine data without crashing. Attack Paths is
 * the cross-dim hypothesis surface so a render regression here
 * defeats the whole product positioning (Pulse / Attack Paths /
 * Dashboard triplet).
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1', name: 'Test Org' } }),
}))

vi.mock('@lib/engine', () => ({
  getAttackPaths: vi.fn().mockResolvedValue({
    candidates: [],
    total: 0,
    generated_at: '2026-05-20T12:00:00Z',
    signals_summary: {
      external_assets: 0,
      leak_signals: 0,
      dmarc_status: '',
      spf_status: '',
      dkim_status: '',
      tech_fingerprints: 0,
      pentest_projects: 0,
      why_now_signals_last_30d: 0,
    },
  }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: {
      candidates: [],
      total: 0,
      generated_at: '2026-05-20T12:00:00Z',
      signals_summary: {
        external_assets: 0,
        leak_signals: 0,
        dmarc_status: '',
        spf_status: '',
        dkim_status: '',
        tech_fingerprints: 0,
        pentest_projects: 0,
        why_now_signals_last_30d: 0,
      },
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))

vi.mock('@atoms/FlytoSelect', () => ({
  FlytoSelect: () => null,
}))

vi.mock('@atoms/FlytoPageHeader', () => ({
  FlytoPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

vi.mock('@atoms/QueryError', () => ({ QueryError: () => null }))

import { render, screen } from '@testing-library/react'
import { AttackPathsView } from '../AttackPathsView'

describe('AttackPathsView smoke', () => {
  it('renders empty-state without crashing', () => {
    render(<AttackPathsView />)
    expect(screen.getAllByRole('heading').length).toBeGreaterThan(0)
  })
})
