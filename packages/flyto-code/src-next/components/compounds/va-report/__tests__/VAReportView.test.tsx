/**
 * VAReportView smoke test — the VA report is now a NATIVE PAGE (not an
 * embedded iframe artifact, operator 2026-06-12). It composes the
 * structured external-posture data into exec-summary + domains sections,
 * and keeps Open HTML / Download PDF as the server-rendered deliverable.
 */
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

const { mockPosture } = vi.hoisted(() => ({
  mockPosture: {
    score_available: true,
    avg_score: 880,
    avg_grade: 'A',
    domain_count: 1,
    domains: [{ domain: 'flyto2.com', asset_count: 5, issue_count: 0, score: 880, grade: 'A' }],
    risk_summary: { critical_count: 0, high_count: 1, medium_count: 2, low_count: 0, sla_breaches: 0 },
    last_scan_at: null,
  },
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: mockPosture, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock('@lib/engine', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@lib/engine')
  return { ...actual, buildReportHTML: vi.fn(), downloadBuiltReport: vi.fn() }
})

import { VAReportView } from '@compounds/va-report'

describe('VAReportView (native page)', () => {
  it('renders title + deliverable export buttons', () => {
    render(<VAReportView />)
    expect(screen.getByText('Vulnerability Assessment Report')).toBeTruthy()
    expect(screen.getByText('Open HTML')).toBeTruthy()
    expect(screen.getByText('Download PDF')).toBeTruthy()
  })

  it('renders native sections (not an embedded report iframe)', () => {
    const { container } = render(<VAReportView />)
    // The exec-summary section + the assessed domain render as real DOM…
    expect(screen.getByText('Executive summary')).toBeTruthy()
    expect(screen.getByText('flyto2.com')).toBeTruthy()
    // …and there is NO server-HTML iframe artifact anymore.
    expect(container.querySelector('iframe')).toBeNull()
  })
})
