/**
 * Unit tests for planToMarkdown — the Markdown export function in FixPlanPanel.
 *
 * Tests the output format for ticket-tracker pasting (Linear, Jira, Notion).
 */
import { describe, it, expect, vi } from 'vitest'

// Mock i18n — planToMarkdown doesn't use t() but the module imports it.
vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (key: string, fallback: string) => fallback,
}))

import { planToMarkdown } from '../FixPlanPanel'
import type { FixPlan } from '@lib/engine'

function makePlan(overrides?: Partial<FixPlan>): FixPlan {
  return {
    buckets: [
      {
        week: 1,
        label: 'Stop the bleeding',
        effort_hours: 12,
        items: [
          { id: 'item-1', title: 'CVE-2024-1234 in express', kind: 'cve', severity: 'CRITICAL', effort_hours: 4, rationale: 'Critical path', files: ['package.json'] },
          { id: 'item-2', title: 'Hardcoded secret', kind: 'secret', severity: 'HIGH', effort_hours: 8 },
        ],
      },
      {
        week: 2,
        label: 'Cleanup',
        effort_hours: 4,
        items: [
          { id: 'item-3', title: 'Dead handler removal', kind: 'dead_code', severity: 'LOW', effort_hours: 4 },
        ],
      },
    ],
    dependencies: [{ from: 'item-1', to: 'item-2' }],
    total_effort_hours: 16,
    critical_path: ['item-1', 'item-2'],
    summary: 'Focus on security first.',
    generated_at: '2026-04-23T00:00:00Z',
    ...overrides,
  }
}

describe('planToMarkdown', () => {
  it('produces valid Markdown with heading, summary, and effort total', () => {
    const md = planToMarkdown(makePlan(), 'my-repo')

    expect(md).toContain('# Fix Plan — my-repo')
    expect(md).toContain('Focus on security first.')
    expect(md).toContain('Total effort: **16h**')
  })

  it('renders week buckets with labels and effort', () => {
    const md = planToMarkdown(makePlan(), 'r')

    expect(md).toContain('## Week 1 — Stop the bleeding (12h)')
    expect(md).toContain('## Week 2 — Cleanup (4h)')
  })

  it('renders items with severity, title, and effort', () => {
    const md = planToMarkdown(makePlan(), 'r')

    expect(md).toContain('- **[CRITICAL]** CVE-2024-1234 in express — 4h')
    expect(md).toContain('- **[HIGH]** Hardcoded secret — 8h')
  })

  it('includes rationale and files when present', () => {
    const md = planToMarkdown(makePlan(), 'r')

    expect(md).toContain('  - Critical path')
    expect(md).toContain('  - files: package.json')
  })

  it('renders critical path', () => {
    const md = planToMarkdown(makePlan(), 'r')

    expect(md).toContain('Critical path: item-1 → item-2')
  })

  it('renders dependencies section', () => {
    const md = planToMarkdown(makePlan(), 'r')

    expect(md).toContain('## Dependencies')
    expect(md).toContain('- `item-1` → `item-2`')
  })

  it('handles empty buckets gracefully', () => {
    const md = planToMarkdown(makePlan({ buckets: [], critical_path: [], dependencies: [] }), 'r')

    expect(md).toContain('# Fix Plan — r')
    expect(md).toContain('Total effort: **16h**')
    // No week sections
    expect(md).not.toContain('## Week')
  })

  it('omits dependencies section when empty', () => {
    const md = planToMarkdown(makePlan({ dependencies: [] }), 'r')

    expect(md).not.toContain('## Dependencies')
  })

  it('handles bucket without label', () => {
    const plan = makePlan({
      buckets: [{ week: 1, effort_hours: 4, items: [{ id: 'x', title: 'Fix', kind: 'cve', severity: 'HIGH', effort_hours: 4 }] }],
    })
    const md = planToMarkdown(plan, 'r')

    expect(md).toContain('## Week 1 (4h)')
    // Heading should NOT have " — label" part (no label provided)
    expect(md).not.toContain('## Week 1 —')
  })
})
