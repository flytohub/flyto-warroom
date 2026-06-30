import { describe, it, expect } from 'vitest'
import {
  classifyWidget, isWidgetSupported, partitionWidgetsBySupport,
  widgetToSection, computeWidgetExportData, tableColumns,
  BACKEND_SUPPORTED_SOURCES,
} from '../buildSections'
import type { DataWidgetConfig, ReportTemplate } from '../types'

function w(over: Partial<DataWidgetConfig>): DataWidgetConfig {
  return {
    id: 'w-1',
    dataSourceId: '',
    chartType: 'donut',
    cols: 6,
    ...over,
  }
}

const tpl = (widgets: DataWidgetConfig[]): ReportTemplate => ({
  id: 't', name: 't', description: '', category: 'custom',
  icon: () => null as any, sections: [{ id: 's1', widgets }],
})

describe('classifyWidget', () => {
  it('text widgets are always supported and need no data_source', () => {
    expect(classifyWidget(w({ chartType: 'text', content: 'hi' }))).toEqual({ ok: true, reason: 'text' })
  })

  it('chart widgets are supported via image-only path regardless of source', () => {
    expect(classifyWidget(w({ chartType: 'donut', dataSourceId: 'issues' })))
      .toEqual({ ok: true, reason: 'chart-image' })
  })

  it('kpi widgets are exportable regardless of source (inline data relayed)', () => {
    expect(classifyWidget(w({ chartType: 'kpi', dataSourceId: 'computed-score' })))
      .toEqual({ ok: true, reason: 'kpi' })
    // Previously blocked — `issues`/`pulse` now export via inline data.
    expect(classifyWidget(w({ chartType: 'kpi', dataSourceId: 'issues' })))
      .toEqual({ ok: true, reason: 'kpi' })
  })

  it('table widgets are exportable regardless of source (inline data relayed)', () => {
    expect(classifyWidget(w({ chartType: 'table', dataSourceId: 'top-risks' })))
      .toEqual({ ok: true, reason: 'table' })
    expect(classifyWidget(w({ chartType: 'table', dataSourceId: 'pulse' })))
      .toEqual({ ok: true, reason: 'table' })
  })

  it('gauge / radialBar are captured as chart images', () => {
    expect(classifyWidget(w({ chartType: 'gauge', dataSourceId: 'computed-score' })))
      .toEqual({ ok: true, reason: 'chart-image' })
    expect(classifyWidget(w({ chartType: 'radialBar', dataSourceId: 'unknown' })))
      .toEqual({ ok: true, reason: 'chart-image' })
  })

  it('JOIN widgets export by their chart type (frontend computes joined rows inline)', () => {
    // A JOIN bar chart rides the image path; a JOIN table relays joined rows.
    expect(classifyWidget(w({
      chartType: 'bar', dataSourceId: 'computed-score',
      joinConfig: { nodes: [{ sourceId: 'computed-score', selectedFields: [] }], edges: [] },
    }))).toEqual({ ok: true, reason: 'chart-image' })
    expect(classifyWidget(w({
      chartType: 'table', dataSourceId: 'issues',
      joinConfig: { nodes: [{ sourceId: 'issues', selectedFields: [] }], edges: [] },
    }))).toEqual({ ok: true, reason: 'table' })
  })

  it('only a genuinely unknown chart type is unsupported', () => {
    const bad = classifyWidget(w({ chartType: 'sankey' as any, dataSourceId: 'issues' }))
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.reason).toBe('unknown-chart-type')
  })
})

describe('partitionWidgetsBySupport', () => {
  it('every renderable widget is supported now that data is relayed inline', () => {
    const t = tpl([
      w({ id: 'a', chartType: 'text', content: 'intro' }),
      w({ id: 'b', chartType: 'kpi', dataSourceId: 'computed-score' }),
      w({ id: 'c', chartType: 'table', dataSourceId: 'issues', title: 'Issues' }),
      w({ id: 'd', chartType: 'bar', dataSourceId: 'pulse' }),
    ])
    const r = partitionWidgetsBySupport(t)
    expect(r.supported.map(x => x.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(r.unsupported).toHaveLength(0)
  })

  it('flags only genuinely unrenderable chart types', () => {
    const t = tpl([
      w({ id: 'ok', chartType: 'table', dataSourceId: 'pulse' }),
      w({ id: 'bad', chartType: 'sankey' as any, dataSourceId: 'issues', title: 'Sankey' }),
    ])
    const r = partitionWidgetsBySupport(t)
    expect(r.supported.map(x => x.id)).toEqual(['ok'])
    expect(r.unsupported).toHaveLength(1)
    expect(r.unsupported[0].reason).toBe('unknown-chart-type')
  })

  it('returns empty arrays for empty template', () => {
    expect(partitionWidgetsBySupport(tpl([]))).toEqual({ supported: [], unsupported: [] })
  })
})

describe('widgetToSection', () => {
  it('text → type=text with content + text_style', () => {
    const s = widgetToSection(
      w({ chartType: 'text', content: 'SLA targets...', textStyle: 'warning' }),
      'SLA Compliance',
    )
    expect(s).toEqual({
      title: 'SLA Compliance',
      type: 'text',
      content: 'SLA targets...',
      text_style: 'warning',
    })
  })

  it('chart → type=chart + chart_hint=donut + image (no data_source — image is the truth)', () => {
    const s = widgetToSection(
      w({ chartType: 'donut', dataSourceId: 'issues' }),
      'Severity distribution',
      { chartImage: 'data:image/png;base64,AAAA' },
    )
    expect(s).toEqual({
      title: 'Severity distribution',
      type: 'chart',
      chart_hint: 'donut',
      image: 'data:image/png;base64,AAAA',
    })
    expect(s.data_source).toBeUndefined()
  })

  it('chart hint falls back to auto for backend-unknown chart types', () => {
    const s = widgetToSection(w({ chartType: 'treemap', dataSourceId: 'issues' }), 'T', { chartImage: 'data:image/png;base64,X' })
    expect(s.chart_hint).toBe('auto')
  })

  it('kpi → type=kpi + inline kpis (no data_source)', () => {
    const s = widgetToSection(w({ chartType: 'kpi', dataSourceId: 'pulse' }), 'Active Findings', { kpis: { 'Open Findings': 42 } })
    expect(s).toEqual({
      title: 'Active Findings',
      type: 'kpi',
      kpis: { 'Open Findings': 42 },
    })
    expect(s.data_source).toBeUndefined()
  })

  it('table → type=table + inline rows/columns (no data_source)', () => {
    const s = widgetToSection(
      w({ chartType: 'table', dataSourceId: 'pulse' }),
      'Top Findings',
      { rows: [{ finding: 'SQLI', blast: 75 }], columns: ['finding', 'blast'] },
    )
    expect(s).toEqual({
      title: 'Top Findings',
      type: 'table',
      rows: [{ finding: 'SQLI', blast: 75 }],
      columns: ['finding', 'blast'],
      max_rows: 100,
    })
    expect(s.data_source).toBeUndefined()
  })

  it('throws on unsupported widget so a regression cannot silently drop a section', () => {
    expect(() => widgetToSection(
      w({ chartType: 'sankey' as any, dataSourceId: 'x' }),
      'oops',
    )).toThrow(/unsupported/i)
  })
})

describe('computeWidgetExportData', () => {
  const rows = [
    { repo: 'a', score: 30, cves: 5, _internal: 'x', id: 'r1' },
    { repo: 'b', score: 60, cves: 0, _internal: 'y', id: 'r2' },
  ]

  it('table → picks auto-detected columns (drops _internal + id), trims rows to columns', () => {
    const ex = computeWidgetExportData(w({ chartType: 'table', dataSourceId: 'pulse' }), rows)
    expect(ex.columns).toEqual(['repo', 'score', 'cves'])
    expect(ex.rows).toEqual([
      { repo: 'a', score: 30, cves: 5 },
      { repo: 'b', score: 60, cves: 0 },
    ])
  })

  it('table → honours explicit valueFields as the column list', () => {
    const ex = computeWidgetExportData(w({ chartType: 'table', dataSourceId: 'pulse', valueFields: ['repo', 'score'] }), rows)
    expect(ex.columns).toEqual(['repo', 'score'])
  })

  it('kpi with numeric valueField → sums', () => {
    const ex = computeWidgetExportData(w({ chartType: 'kpi', dataSourceId: 'pulse', valueField: 'score' }), rows)
    expect(ex.kpis).toEqual({ Score: 90 })
  })

  it('kpi with no valueField → row count under Total Records', () => {
    const ex = computeWidgetExportData(w({ chartType: 'kpi', dataSourceId: 'pulse' }), rows)
    expect(ex.kpis).toEqual({ 'Total Records': 2 })
  })

  it('kpi with non-numeric string valueField → passes the string through', () => {
    const ex = computeWidgetExportData(
      w({ chartType: 'kpi', dataSourceId: 'pulse', valueField: 'grade' }),
      [{ grade: 'A' }],
    )
    expect(ex.kpis).toEqual({ Grade: 'A' })
  })
})

describe('tableColumns', () => {
  it('drops all-empty columns', () => {
    const cols = tableColumns([{ a: 1, b: null, c: '' }, { a: 2, b: null, c: '' }])
    expect(cols).toEqual(['a'])
  })
})

describe('BACKEND_SUPPORTED_SOURCES sanity', () => {
  it('exposes all 17 documented backend registry IDs', () => {
    expect(BACKEND_SUPPORTED_SOURCES.size).toBe(17)
  })

  it('uses kebab-case (matches engine api/report_engine.go registry keys)', () => {
    for (const id of BACKEND_SUPPORTED_SOURCES) {
      expect(id).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/)
    }
  })

  it('isWidgetSupported is the boolean form of classifyWidget', () => {
    expect(isWidgetSupported(w({ chartType: 'table', dataSourceId: 'pulse' }))).toBe(true)
    expect(isWidgetSupported(w({ chartType: 'sankey' as any, dataSourceId: 'x' }))).toBe(false)
  })
})
