/**
 * SLAMonitorView Phase A component tests.
 *
 * Covers the two new sub-components exposed by SLAMonitorView:
 *   - ErrorBudgetPanel: SRE-style remaining-budget bars
 *   - MTTRTrendStrip:   weekly P50 delta arrow per severity
 *
 * The parent view itself remains tested by integration via the
 * existing posture / monitoring path; these tests pin the new
 * status-mapping + delta-direction rules that distinguish v5
 * from earlier SLA renderings.
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_k: string, fb: string) => fb,
}))

import { ErrorBudgetPanel, MTTRTrendStrip } from '../SLAMonitorView'
import type { BudgetUsage, MTTRHistoryRow } from '@lib/engine'

function budget(over: Partial<BudgetUsage>): BudgetUsage {
  return {
    severity: 'critical',
    allowed_breaches: 4,
    used_breaches: 1,
    remaining_breaches: 3,
    used_percent: 25,
    window_start: '2026-02-17T00:00:00Z',
    window_end: '2026-05-18T00:00:00Z',
    alert_at_percent: 80,
    status: 'healthy',
    ...over,
  }
}

describe('ErrorBudgetPanel', () => {
  it('renders all declared severities even with zero usage', () => {
    render(
      <ErrorBudgetPanel
        items={[
          budget({ severity: 'critical', used_breaches: 0, used_percent: 0 }),
          budget({ severity: 'high', allowed_breaches: 6, used_breaches: 0, used_percent: 0 }),
        ]}
      />,
    )
    expect(screen.getByText(/critical/i)).toBeTruthy()
    expect(screen.getByText(/high/i)).toBeTruthy()
  })

  it('shows "over budget" text on exhausted policies', () => {
    render(
      <ErrorBudgetPanel
        items={[budget({ used_breaches: 5, used_percent: 125, remaining_breaches: 0, status: 'exhausted' })]}
      />,
    )
    expect(screen.getByText(/over budget/i)).toBeTruthy()
  })

  it('shows "policy paused" copy on inactive rows', () => {
    render(
      <ErrorBudgetPanel
        items={[budget({ status: 'inactive' })]}
      />,
    )
    expect(screen.getByText(/policy paused/i)).toBeTruthy()
  })

  it('renders used/allowed counter for every row', () => {
    render(
      <ErrorBudgetPanel
        items={[budget({ used_breaches: 3, allowed_breaches: 4 })]}
      />,
    )
    expect(screen.getByText('3 / 4')).toBeTruthy()
  })
})

function mttr(over: Partial<MTTRHistoryRow>): MTTRHistoryRow {
  return {
    org_id: 'org_1',
    severity: 'critical',
    week_start: '2026-05-12',
    p50_hours: 18,
    p75_hours: 24,
    p90_hours: 48,
    count_resolved: 3,
    backfilled: false,
    computed_at: '2026-05-18T00:00:00Z',
    ...over,
  }
}

describe('MTTRTrendStrip', () => {
  it('renders nothing when no severity has ≥2 weeks of history', () => {
    const { container } = render(
      <MTTRTrendStrip rows={[mttr({ severity: 'critical' })]} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders one row per severity with at least 2 weeks of history', () => {
    const rows: MTTRHistoryRow[] = [
      // Most recent first → 4 critical + 4 critical prior
      ...Array.from({ length: 4 }, (_, i) =>
        mttr({ severity: 'critical', p50_hours: 12, week_start: `2026-05-${12 - i * 7}` }),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        mttr({ severity: 'critical', p50_hours: 18, week_start: `2026-04-${14 - i * 7}` }),
      ),
    ]
    render(<MTTRTrendStrip rows={rows} />)
    // Should show 12.0h (recent) and a down-arrow showing 6h improvement.
    expect(screen.getByText(/12\.0h/)).toBeTruthy()
    expect(screen.getByText(/6\.0h/)).toBeTruthy()
    // Direction arrow: down (▼) because recent < prior
    expect(screen.getByText(/▼/)).toBeTruthy()
  })

  it('shows up-arrow when MTTR is regressing', () => {
    const rows: MTTRHistoryRow[] = [
      ...Array.from({ length: 4 }, (_, i) =>
        mttr({ severity: 'high', p50_hours: 24, week_start: `2026-05-${12 - i * 7}` }),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        mttr({ severity: 'high', p50_hours: 12, week_start: `2026-04-${14 - i * 7}` }),
      ),
    ]
    render(<MTTRTrendStrip rows={rows} />)
    expect(screen.getByText(/▲/)).toBeTruthy()
  })

  it('skips severities with only 1 row (no prior-period to compare)', () => {
    const rows: MTTRHistoryRow[] = [
      // critical has enough; medium has only 1
      ...Array.from({ length: 8 }, (_, i) =>
        mttr({ severity: 'critical', p50_hours: 18, week_start: `2026-05-${12 - i * 7}` }),
      ),
      mttr({ severity: 'medium' }),
    ]
    render(<MTTRTrendStrip rows={rows} />)
    expect(screen.queryByText(/medium/i)).toBeNull()
    expect(screen.getByText(/critical/i)).toBeTruthy()
  })
})
