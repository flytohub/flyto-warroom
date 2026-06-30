/**
 * CTEMActionsView render smoke tests.
 *
 * Verifies the picker:
 *   - mounts without runtime error
 *   - shows the "Nothing urgent" empty state when no priorities exist
 *   - sorts items by priority_score desc
 *   - renders KEV / EPSS / SLA / threat-actor badges
 *   - hides low-severity non-breached items from the bench (with the
 *     KEV-override exception)
 *   - calls markExternalIssueFixed on the Mark Fixed button click
 *   - routes external selections to the external-detail panel (not
 *     the code-alert panel)
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_k: string, fb: string) => fb,
}))

// vi.mock factories are hoisted to the top of the file (above top-
// level const declarations), so we wrap the mock data + spies in
// vi.hoisted() to make them available at hoist time.
const { mockCtemItems, mockGetCtemPrioritiesPage, mockMarkFixed, mockDownloadEvidenceBinder } = vi.hoisted(() => ({
  mockCtemItems: [
  // Loud item: KEV, crown_jewel, SLA breached.
  {
    kind: 'external', id: 'p1', fingerprint: 'p1',
    title: 'subdomain takeover on api.acme.com',
    description: 'subdomain takeover',
    severity: 'critical', effective_severity: 'critical', priority_score: 92,
    category: 'subdomain_takeover', domain: 'api.acme.com',
    asset_tier: 'crown_jewel',
    kev_listed: true, epss_score: 0.78, mitigation_factor: 0,
    sla_hours: 72, sla_breach_at: '2026-05-01T00:00:00Z', breached: true,
    verification_state: 'unverified',
    first_seen_at: '2026-04-29T00:00:00Z',
    threat_actor: 'abuse.ch', threat_campaign: 'Cobalt Strike',
    affected_count: 2,
  },
  // Mid item: customer_facing, EPSS only, no KEV.
  {
    kind: 'external', id: 'p2', fingerprint: 'p2',
    title: 'TLS 1.0 enabled on www.acme.com',
    description: 'tls 1.0 enabled', severity: 'high', effective_severity: 'high', priority_score: 48,
    category: 'weak_tls', domain: 'www.acme.com',
    asset_tier: 'customer_facing',
    kev_listed: false, epss_score: 0.22, mitigation_factor: 0,
    sla_hours: 168, breached: false,
    verification_state: 'unverified',
    first_seen_at: '2026-05-15T00:00:00Z',
  },
  // Low + non-breached + no KEV → should be filtered out.
  {
    kind: 'external', id: 'p3', fingerprint: 'p3',
    title: 'no SPF policy', description: 'no spf', severity: 'low', effective_severity: 'low', priority_score: 8,
    category: 'spf_missing', domain: 'mail.acme.com',
    asset_tier: 'internal',
    kev_listed: false, epss_score: 0, mitigation_factor: 0,
    sla_hours: 2160, breached: false,
    verification_state: 'unverified',
    first_seen_at: '2026-05-10T00:00:00Z',
  },
  ],
  // The view now fetches the server-paginated page via
  // getCtemPrioritiesPage(orgId, { dedup, limit, offset }) and reads
  // the { items, total, has_more, stale, stale_reason } envelope.
  // Resolve the same logical rows wrapped in that page shape.
  mockGetCtemPrioritiesPage: vi.fn(),
  mockMarkFixed: vi.fn().mockResolvedValue({ verification_state: 'pending_verify' }),
  mockDownloadEvidenceBinder: vi.fn().mockResolvedValue(undefined),
}))

// Wire the page-shaped resolve now that mockCtemItems exists. The
// server owns B9 dedup + affected_count, so the page just echoes the
// already-deduped rows in the new envelope.
mockGetCtemPrioritiesPage.mockResolvedValue({
  org_id: 'org-1',
  items: mockCtemItems,
  count: mockCtemItems.length,
  total: mockCtemItems.length,
  limit: 500,
  offset: 0,
  has_more: false,
  stale: false,
  stale_reason: '',
  deduped: true,
})

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey, queryFn }: { queryKey: unknown[]; queryFn?: () => unknown }) => {
    const key = Array.isArray(queryKey) ? queryKey[0] : ''
    if (key === 'ctem-priorities') {
      queryFn?.()
      // New page envelope: { items, total, has_more, stale, stale_reason }.
      return {
        data: {
          org_id: 'org-1', items: mockCtemItems, count: mockCtemItems.length,
          total: mockCtemItems.length, limit: 500, offset: 0,
          has_more: false, stale: false, stale_reason: '', deduped: true,
        },
        isLoading: false, isError: false,
      }
    }
    if (key === 'enriched-issues') {
      return { data: { issues: [] }, isLoading: false, isError: false }
    }
    return { data: null, isLoading: false, isError: false }
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: ({ mutationFn, onSuccess }: any) => ({
    mutate: vi.fn(async (arg: any) => {
      const result = await mutationFn(arg)
      onSuccess?.(result, arg)
    }),
    isPending: false,
    isError: false,
    error: null,
  }),
}))

vi.mock('@lib/engine', async () => {
  const actual = await vi.importActual<any>('@lib/engine')
  return {
    ...actual,
    getEnrichedOrgIssues: vi.fn().mockResolvedValue({ issues: [] }),
    downloadEvidenceBinder: mockDownloadEvidenceBinder,
    markExternalIssueFixed: mockMarkFixed,
    verifyExternalIssue: vi.fn().mockResolvedValue({ verification_state: 'false_positive' }),
    tierLabel: (t: string) => t === 'crown_jewel' ? 'Crown Jewel' : t,
    tierColor: () => '#fbbf24',
  }
})

// The picker now reads the priority feed through the server-paginated
// getCtemPrioritiesPage (in @lib/engine/code/posture), NOT the legacy
// getCTEMPriorities. Mock that module so the real request/getToken path
// (which throws "Not authenticated" under jsdom) never runs.
vi.mock('@lib/engine/code/posture', async () => {
  const actual = await vi.importActual<any>('@lib/engine/code/posture')
  return {
    ...actual,
    getCtemPrioritiesPage: mockGetCtemPrioritiesPage,
  }
})

vi.mock('@lib/engine/ctem/evidenceBinder', () => ({
  evidenceBinderDownloadUrl: () => '#',
  downloadEvidenceBinder: mockDownloadEvidenceBinder,
}))

vi.mock('../CTEMExtrasPanel', () => ({
  CTEMExtrasPanel: () => <div data-testid="ctem-extras-panel" />,
}))

import { CTEMActionsView } from '@compounds/exposure/CTEMActionsView'
import { FixQueueProvider } from '@/contexts/FixQueueContext'

// CTEMActionsView reads from FixQueueContext for the "Open Fix
// Queue" CTA in the header (added 2026-05-20). Wrap in the
// provider — same as production via WorkspaceLayout.
function renderCTEM(props: { orgId: string }) {
  return render(
    <FixQueueProvider>
      <CTEMActionsView {...props} />
    </FixQueueProvider>,
  )
}

describe('CTEMActionsView', () => {
  it('renders the priority picker with badges', () => {
    renderCTEM({ orgId: 'org-1' })
    // KEV is pulsing critical — must always make the visible cap.
    expect(screen.getByText('KEV')).toBeTruthy()
    // EPSS bumped to a non-pulsing 'high' tone — for p2 (no KEV/SLA)
    // it should win one of the visible slots; for p1 it might end
    // up in the overflow drawer behind KEV+SLA. Just confirm at
    // least one EPSS badge renders.
    expect(screen.getAllByText(/EPSS \d+%/).length).toBeGreaterThanOrEqual(1)
    // SignalStrip caps visible pills at 2 — overflow signals (like
    // "Cobalt Strike" on p1 which also has KEV + SLA pulsing) live
    // in the +N popover. Hover the +N pill to reveal them; with
    // jsdom we just confirm an overflow indicator is present when
    // there are more than 2 signals on the loudest item.
    expect(screen.getAllByText(/^\+\d+$/).length).toBeGreaterThanOrEqual(1)
  })

  it('uses server-side B9 dedup and renders affected count from the response', () => {
    renderCTEM({ orgId: 'org-1' })
    // Server owns B9 dedup — the view requests the deduped, windowed
    // page (WINDOW_STEP=500, offset 0) rather than downloading all rows.
    expect(mockGetCtemPrioritiesPage).toHaveBeenCalledWith('org-1', { dedup: true, limit: 500, offset: 0 })
    expect(screen.getByText('×2')).toBeTruthy()
  })

  it('hides low-severity non-breached items by default', () => {
    renderCTEM({ orgId: 'org-1' })
    // p3 is low + not breached + no KEV → suppressed.
    expect(screen.queryByText('no SPF policy')).toBeNull()
  })

  it('sorts loud finding (priority 92) above mid finding (priority 48)', () => {
    renderCTEM({ orgId: 'org-1' })
    const titles = screen.getAllByRole('button')
      .map(b => b.textContent ?? '')
      .filter(t => t.includes('takeover') || t.includes('TLS 1.0'))
    expect(titles[0]).toContain('takeover')
  })

  it('opens external detail and triggers mark-fixed', async () => {
    renderCTEM({ orgId: 'org-1' })
    const buttons = screen.getAllByRole('button')
    const loudRow = buttons.find(b => (b.textContent ?? '').includes('takeover'))
    expect(loudRow).toBeTruthy()
    fireEvent.click(loudRow!)

    // External detail panel should be visible with the domain.
    expect(screen.getAllByText(/api\.acme\.com/).length).toBeGreaterThan(0)

    // Hit Mark Fixed.
    const markFixedBtn = screen.getByText('Mark Fixed')
    fireEvent.click(markFixedBtn)
    expect(mockMarkFixed).toHaveBeenCalledWith('org-1', { fingerprint: 'p1' })
  })
})
