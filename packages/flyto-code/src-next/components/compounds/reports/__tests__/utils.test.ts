import { describe, expect, it } from 'vitest'

import { countReportWidgets, normalizeReportSections } from '../utils'

describe('normalizeReportSections', () => {
  it('keeps report saves from crashing on legacy sections without widgets', () => {
    const sections = normalizeReportSections([
      { id: 'saved-section', name: 'Saved Section' },
      null,
      { id: '', widgets: [{ id: 'w1', dataSourceId: 'issues', chartType: 'table', cols: 6 }] },
    ])

    expect(sections).toEqual([
      { id: 'saved-section', name: 'Saved Section', widgets: [] },
      {
        id: 's3',
        name: 'Section 3',
        widgets: [{ id: 'w1', dataSourceId: 'issues', chartType: 'table', cols: 6 }],
      },
    ])
    expect(countReportWidgets(sections)).toBe(1)
  })

  it('returns a safe empty section for missing or invalid configs', () => {
    expect(normalizeReportSections(undefined)).toEqual([{ id: 's1', name: 'Section 1', widgets: [] }])
    expect(countReportWidgets([{ id: 'broken' }])).toBe(0)
  })
})
