import { describe, expect, it } from 'vitest'

import {
  FOOTPRINT_STALE_RUN_GRACE_MS,
  footprintRunDeadlineMs,
  isFootprintRunActive,
  isFootprintRunStale,
} from '../footprintRunState'
import type { FootprintRunRow } from '../engine/code/footprintGraph'

function run(overrides: Partial<FootprintRunRow> = {}): FootprintRunRow {
  return {
    id: 'run-1',
    org_id: 'org-1',
    status: 'running',
    stop_reason: '',
    started_at: '2026-06-06T10:00:00.000Z',
    max_depth: 6,
    max_runtime_secs: 60,
    entities_created: 0,
    relationships_created: 0,
    connectors_called: 0,
    cost_used_usd: 0,
    depth_reached: 0,
    rounds_completed: 0,
    tokens_harvested: 0,
    ...overrides,
  }
}

describe('footprint run state', () => {
  it('treats running rows inside runtime + grace as active', () => {
    const r = run()
    const now = Date.parse(r.started_at) + 60_000 + FOOTPRINT_STALE_RUN_GRACE_MS - 1
    expect(isFootprintRunActive(r, now)).toBe(true)
    expect(isFootprintRunStale(r, now)).toBe(false)
  })

  it('treats running rows beyond runtime + grace as stale', () => {
    const r = run()
    const now = Date.parse(r.started_at) + 60_000 + FOOTPRINT_STALE_RUN_GRACE_MS + 1
    expect(isFootprintRunActive(r, now)).toBe(false)
    expect(isFootprintRunStale(r, now)).toBe(true)
  })

  it('does not treat completed rows as active or stale', () => {
    const r = run({ status: 'complete' })
    const now = Date.parse(r.started_at) + 10 * 60_000
    expect(isFootprintRunActive(r, now)).toBe(false)
    expect(isFootprintRunStale(r, now)).toBe(false)
  })

  it('uses the default runtime when the backend omits max_runtime_secs', () => {
    const r = run({ max_runtime_secs: undefined })
    expect(footprintRunDeadlineMs(r)).toBe(Date.parse(r.started_at) + 35 * 60_000)
  })
})
