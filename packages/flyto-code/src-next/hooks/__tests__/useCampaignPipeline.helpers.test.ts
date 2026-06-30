/**
 * Unit tests for the pure helpers extracted from useCampaignPipeline.
 *
 * The hook itself is heavy (SSE subscription, server polling, Firebase
 * token refresh) and is best exercised end-to-end. The pure pieces —
 * persistence + snapshot translation + initial state — are where the
 * tricky bugs hide: schema-version drift on load, phase reordering on
 * snapshot, and silent failure modes when localStorage is unavailable.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  storageKey,
  load,
  save,
  dropPersisted,
  emptyPhases,
  safeParse,
  snapshotToHookState,
  type PersistedCampaign,
} from '../useCampaignPipeline'
import type { PipelineSnapshot } from '@lib/engine/pipelineLog'

class MemoryStorage implements Storage {
  private data = new Map<string, string>()

  get length() {
    return this.data.size
  }

  clear() {
    this.data.clear()
  }

  getItem(key: string) {
    return this.data.get(key) ?? null
  }

  key(index: number) {
    return Array.from(this.data.keys())[index] ?? null
  }

  removeItem(key: string) {
    this.data.delete(key)
  }

  setItem(key: string, value: string) {
    this.data.set(key, String(value))
  }
}

beforeEach(() => {
  vi.stubGlobal('Storage', MemoryStorage)
  vi.stubGlobal('localStorage', new MemoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('storageKey', () => {
  it('namespaces by org + project', () => {
    expect(storageKey('org-1', 'proj-A')).toBe('flyto_pipeline_v1:org-1:proj-A')
  })
  it('keys differ across orgs even for the same project id', () => {
    expect(storageKey('a', 'p')).not.toBe(storageKey('b', 'p'))
  })
})

describe('load', () => {
  beforeEach(() => localStorage.clear())

  it('returns null when nothing stored', () => {
    expect(load('o', 'p')).toBeNull()
  })

  it('returns null when stored blob is not JSON', () => {
    localStorage.setItem(storageKey('o', 'p'), 'not-json')
    expect(load('o', 'p')).toBeNull()
  })

  it('returns null on schema mismatch (forces forward-compat upgrade)', () => {
    // schema:0 means an old persisted blob from a previous version of
    // the hook. We deliberately drop those rather than try to migrate.
    localStorage.setItem(storageKey('o', 'p'), JSON.stringify({ schema: 0 }))
    expect(load('o', 'p')).toBeNull()
  })

  it('round-trips a valid campaign blob', () => {
    const c: PersistedCampaign = {
      schema: 1,
      projectId: 'p',
      targetUrl: 'https://t',
      startedAt: 1700000000000,
      status: 'running',
      phases: emptyPhases(),
      evidence: [],
    }
    save('o', 'p', c)
    expect(load('o', 'p')).toEqual(c)
  })
})

describe('save / dropPersisted', () => {
  beforeEach(() => localStorage.clear())

  it('save then dropPersisted leaves an empty key', () => {
    const c: PersistedCampaign = {
      schema: 1, projectId: 'p', targetUrl: 't', startedAt: 0,
      status: 'running', phases: [], evidence: [],
    }
    save('o', 'p', c)
    expect(localStorage.getItem(storageKey('o', 'p'))).toBeTruthy()
    dropPersisted('o', 'p')
    expect(localStorage.getItem(storageKey('o', 'p'))).toBeNull()
  })

  // Quota / private-mode throw paths must NOT bubble — they degrade
  // silently because the campaign view should keep working without
  // persistence (server is the source of truth anyway).
  it('save degrades silently when localStorage throws (quota / private mode)', () => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = () => { throw new Error('QuotaExceeded') }
    try {
      const c: PersistedCampaign = {
        schema: 1, projectId: 'p', targetUrl: 't', startedAt: 0,
        status: 'running', phases: [], evidence: [],
      }
      // Must not throw
      save('o', 'p', c)
    } finally {
      Storage.prototype.setItem = original
    }
  })

  it('dropPersisted silently swallows storage errors', () => {
    const original = Storage.prototype.removeItem
    Storage.prototype.removeItem = () => { throw new Error('blocked') }
    try {
      dropPersisted('o', 'p')
    } finally {
      Storage.prototype.removeItem = original
    }
  })
})

describe('emptyPhases', () => {
  it('produces one entry per phase, all pending', () => {
    const phases = emptyPhases()
    expect(phases).toHaveLength(5)
    expect(phases.map(p => p.phase)).toEqual(['baseline', 'probe', 'verify', 'recheck', 'report'])
    for (const p of phases) {
      expect(p.status).toBe('pending')
      expect(p.evidence).toEqual([])
      expect(p.tokensUsed).toEqual({ input: 0, output: 0 })
      expect(p.durationMs).toBe(0)
    }
  })

  it('returns a fresh array each call (no shared mutation)', () => {
    const a = emptyPhases()
    const b = emptyPhases()
    expect(a).not.toBe(b)
    a[0].evidence.push({ url: 'x', method: 'GET' })
    expect(b[0].evidence).toEqual([])
  })
})

describe('safeParse', () => {
  it('parses valid JSON', () => {
    expect(safeParse('{"a":1}')).toEqual({ a: 1 })
  })
  it('returns undefined for invalid JSON instead of throwing', () => {
    expect(safeParse('not json')).toBeUndefined()
  })
  it('returns undefined for empty / null / undefined inputs', () => {
    expect(safeParse('')).toBeUndefined()
    expect(safeParse(null)).toBeUndefined()
    expect(safeParse(undefined)).toBeUndefined()
  })
})

describe('snapshotToHookState', () => {
  function baseSnapshot(): PipelineSnapshot {
    return {
      ok: true,
      run: {
        id: 'run-1',
        orgId: 'org-1',
        campaignId: 'proj-1',
        targetUrl: 'https://target',
        status: 'running',
        currentPhase: 'probe',
        totalInputTokens: 100,
        totalOutputTokens: 200,
        provenCount: 0,
        flakyCount: 0,
        startedAt: '2026-04-26T00:00:00Z',
        updatedAt: '2026-04-26T00:01:00Z',
      } as PipelineSnapshot['run'],
      phases: [],
      evidence: [],
    }
  }

  it('throws when run is null (caller-must-guard contract)', () => {
    expect(() => snapshotToHookState({ ok: true, run: null, phases: [], evidence: [] }))
      .toThrow(/run is null/)
  })

  it('emits all five phases in canonical order even when server omits some', () => {
    const out = snapshotToHookState(baseSnapshot())
    expect(out.phases.map(p => p.phase)).toEqual(['baseline', 'probe', 'verify', 'recheck', 'report'])
    // missing phases default to pending
    for (const p of out.phases) expect(p.status).toBe('pending')
  })

  it('preserves phase ordering regardless of server insertion order', () => {
    const snap = baseSnapshot()
    snap.phases = [
      // server returns out-of-order on purpose to test sort
      { id: '1', runId: 'r', phase: 'report', status: 'done', summary: 's', intelJson: '{}', confidence: 1, inputTokens: 0, outputTokens: 0, durationMs: 0 } as PipelineSnapshot['phases'][number],
      { id: '2', runId: 'r', phase: 'baseline', status: 'done', summary: '', intelJson: '', confidence: 1, inputTokens: 0, outputTokens: 0, durationMs: 0 } as PipelineSnapshot['phases'][number],
    ]
    const out = snapshotToHookState(snap)
    expect(out.phases[0].phase).toBe('baseline')
    expect(out.phases[4].phase).toBe('report')
  })

  it('parses report intel only when the report phase is done', () => {
    const snap = baseSnapshot()
    snap.phases = [
      { id: '1', runId: 'r', phase: 'report', status: 'running', summary: '', intelJson: '{"riskLevel":"HIGH"}', confidence: 0, inputTokens: 0, outputTokens: 0, durationMs: 0 } as PipelineSnapshot['phases'][number],
    ]
    expect(snapshotToHookState(snap).report).toBeNull()

    snap.phases[0].status = 'done'
    expect(snapshotToHookState(snap).report).toEqual({ riskLevel: 'HIGH' })
  })

  it('maps server status strings to the literal CampaignStatus union', () => {
    const cases: Array<[string, string]> = [
      ['running', 'running'],
      ['complete', 'complete'],
      ['stopped', 'stopped'],
      ['error', 'error'],
      ['orphaned', 'orphaned'],
      // unknown status → idle (defensive default)
      ['weird-future-status', 'idle'],
    ]
    for (const [serverStatus, want] of cases) {
      const snap = baseSnapshot()
      snap.run!.status = serverStatus
      expect(snapshotToHookState(snap).status).toBe(want)
    }
  })

  it('preserves terminal run error messages for blocked/error UI banners', () => {
    const snap = baseSnapshot()
    snap.run!.status = 'error'
    snap.run!.errorMessage = 'AI provider is not configured for red-team campaign orchestration.'
    const out = snapshotToHookState(snap)
    expect(out.status).toBe('error')
    expect(out.error).toBe('AI provider is not configured for red-team campaign orchestration.')
  })

  it('groups evidence by phase and rebuilds the flat list', () => {
    const snap = baseSnapshot()
    snap.evidence = [
      { phase: 'baseline', url: 'https://a', method: 'GET', statusCode: 200, timingMs: 10, snippet: '', payload: '' } as PipelineSnapshot['evidence'][number],
      { phase: 'probe', url: 'https://b', method: 'POST', statusCode: 500, timingMs: 50, snippet: 'err', payload: '{}' } as PipelineSnapshot['evidence'][number],
    ]
    snap.phases = [
      { id: '1', runId: 'r', phase: 'baseline', status: 'done', summary: '', intelJson: '', confidence: 1, inputTokens: 0, outputTokens: 0, durationMs: 0 } as PipelineSnapshot['phases'][number],
      { id: '2', runId: 'r', phase: 'probe', status: 'running', summary: '', intelJson: '', confidence: 1, inputTokens: 0, outputTokens: 0, durationMs: 0 } as PipelineSnapshot['phases'][number],
    ]
    const out = snapshotToHookState(snap)
    expect(out.evidence).toHaveLength(2)
    expect(out.phases.find(p => p.phase === 'baseline')?.evidence).toHaveLength(1)
    expect(out.phases.find(p => p.phase === 'probe')?.evidence[0].status).toBe(500)
  })

  it('preserves token counters from the server row', () => {
    const snap = baseSnapshot()
    snap.phases = [
      { id: '1', runId: 'r', phase: 'baseline', status: 'done', summary: '', intelJson: '', confidence: 1, inputTokens: 333, outputTokens: 444, durationMs: 12 } as PipelineSnapshot['phases'][number],
    ]
    const baseline = snapshotToHookState(snap).phases.find(p => p.phase === 'baseline')!
    expect(baseline.tokensUsed).toEqual({ input: 333, output: 444 })
    expect(baseline.durationMs).toBe(12)
  })
})

afterEach(() => vi.restoreAllMocks())
