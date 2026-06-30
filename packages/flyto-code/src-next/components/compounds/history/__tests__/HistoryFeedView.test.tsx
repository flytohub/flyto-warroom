/**
 * HistoryFeedView smoke test — tests the convenience wrappers (audit /
 * code variants) that the war-room navigation uses directly. Empty
 * timeline data; we're only verifying the variant-keyed shell composes.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

vi.mock('@lib/engine', () => ({
  renderHtmlToPdf: vi.fn().mockResolvedValue(new Blob()),
}))

vi.mock('../useHistoryFilters', () => ({
  useHistoryFilters: (variant: string) => ({
    variant,
    since: '7d',          setSince: vi.fn(),
    from: '', to: '',     setFrom: vi.fn(), setTo: vi.fn(), setCustomRange: vi.fn(),
    kinds: [],            setKinds: vi.fn(),
    domain: '',           setDomain: vi.fn(),
    q: '',                setQ: vi.fn(),
    period: '',           setPeriod: vi.fn(), clearPeriod: vi.fn(),
    customRange: false,
    windowLabel: '7d',
    periodWindows: null,
    query:         { data: { items: [], score_series: [], total: 0 }, isLoading: false, isError: false },
    previousQuery: { data: undefined, isLoading: false, isError: false },
    defaultKinds: [],
  }),
}))

vi.mock('../historyReport', () => ({
  buildStats: () => ({
    eventCount: 0,
    findingCount: 0,
    resolvedCount: 0,
    scoreDelta: 0,
  }),
  buildHistoryReportHtml: () => '<html></html>',
}))

vi.mock('../dimensions/ScoreSparkline', () => ({ ScoreSparkline: () => null }))
vi.mock('../dimensions/CompositionBars', () => ({ CompositionBars: () => null }))
vi.mock('../dimensions/FeedRow', () => ({ FeedRow: () => null }))
vi.mock('../dimensions/KindFilters', () => ({ KindFilters: () => null }))

vi.mock('@atoms/JellyCard', () => ({
  JellyCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('notistack', () => ({
  useSnackbar: () => ({ enqueueSnackbar: vi.fn() }),
}))

import { render } from '@testing-library/react'
import { AuditTimelineView, CodeActivityView } from '../HistoryFeedView'

describe('HistoryFeedView smoke', () => {
  it('AuditTimelineView mounts with empty history', () => {
    const { container } = render(<AuditTimelineView orgId="org-1" />)
    expect(container.firstChild).toBeTruthy()
  })

  it('CodeActivityView mounts with empty history', () => {
    const { container } = render(<CodeActivityView orgId="org-1" />)
    expect(container.firstChild).toBeTruthy()
  })
})
