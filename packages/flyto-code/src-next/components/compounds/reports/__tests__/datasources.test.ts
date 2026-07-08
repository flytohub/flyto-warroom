import { describe, expect, it } from 'vitest'

import {
  DATA_SOURCE_MAP,
  backendReportSourceMap,
  canUseDataSource,
  reportSourceRuntimeState,
} from '../datasources'

describe('report data source entitlement gates', () => {
  it('gates CSPM on the backend cspm page capability', () => {
    const cspm = DATA_SOURCE_MAP.cspm
    expect(cspm.requiredPage).toBe('cspm')
    expect(canUseDataSource(cspm, { ready: false, canSeePage: page => page === 'cspm' })).toBe(false)
    expect(canUseDataSource(cspm, { ready: true, canSeePage: page => page !== 'cspm' })).toBe(false)
    expect(canUseDataSource(cspm, { ready: true, canSeePage: page => page === 'cspm' })).toBe(true)
  })

  it('keeps ungated sources available without waiting for capabilities', () => {
    const source = { ...DATA_SOURCE_MAP.cspm, requiredPage: undefined }
    expect(canUseDataSource(source, { ready: false, canSeePage: () => false })).toBe(true)
  })

  it('registers research footprints as a report-ready external evidence source', () => {
    const source = DATA_SOURCE_MAP['research-footprints']
    expect(source.name).toBe('Research Footprints')
    expect(source.category).toBe('external')
    expect(source.requiredPage).toBe('domains')
    expect(source.rowsPath).toBe('rows')
    expect(source.joinableOn).toEqual(['subject_value', 'path_id', 'hypothesis_id'])
    expect(source.fields.map(field => field.key)).toEqual(expect.arrayContaining([
      'subject_value',
      'state',
      'weighted_confidence',
      'latest_decision_state',
      'bundle_sha256',
    ]))
  })

  it('maps backend report source catalog state by id', () => {
    const map = backendReportSourceMap([
      {
        id: 'containers',
        name: 'Container Findings',
        category: 'code',
        available: true,
        readiness: 'ready',
        has_data: true,
        sample_count: 1,
        kpi_signal_count: 2,
        supported_chart_types: ['table'],
      },
    ])
    expect(map.containers?.sample_count).toBe(1)
    expect(map.containers?.kpi_signal_count).toBe(2)
  })

  it('keeps backend unavailable sources fail-closed even when the page is visible', () => {
    const source = DATA_SOURCE_MAP.containers
    const state = reportSourceRuntimeState(
      source,
      { ready: true, canSeePage: page => page === 'containers' },
      {
        id: 'containers',
        name: 'Container Findings',
        category: 'code',
        available: false,
        unavailable_reason: 'missing feature',
        supported_chart_types: ['table'],
      },
    )
    expect(state.status).toBe('locked')
    expect(state.disabled).toBe(true)
    expect(state.detail).toBe('missing feature')
  })

  it('surfaces backend readiness without disabling non-locked sources', () => {
    const source = DATA_SOURCE_MAP.containers
    const gate = { ready: true, canSeePage: (page: string) => page === 'containers' }

    expect(reportSourceRuntimeState(source, gate, {
      id: 'containers',
      name: 'Container Findings',
      category: 'code',
      available: true,
      readiness: 'empty',
      has_data: false,
      supported_chart_types: ['table'],
    })).toMatchObject({ status: 'empty', disabled: false })

    expect(reportSourceRuntimeState(source, gate, {
      id: 'containers',
      name: 'Container Findings',
      category: 'code',
      available: true,
      readiness: 'error',
      probe_error: 'store offline',
      supported_chart_types: ['table'],
    })).toMatchObject({ status: 'error', disabled: false, detail: 'store offline' })

    expect(reportSourceRuntimeState(source, gate, {
      id: 'containers',
      name: 'Container Findings',
      category: 'code',
      available: true,
      readiness: 'ready',
      has_data: true,
      supported_chart_types: ['table'],
    })).toMatchObject({ status: 'ready', disabled: false })
  })
})
