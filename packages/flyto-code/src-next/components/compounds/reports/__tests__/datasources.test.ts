import { describe, expect, it } from 'vitest'

import { DATA_SOURCE_MAP, canUseDataSource } from '../datasources'

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
})
