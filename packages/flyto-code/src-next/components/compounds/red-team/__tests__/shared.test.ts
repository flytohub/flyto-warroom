import { describe, expect, it } from 'vitest'

import { buildPipelineLog } from '../shared'

describe('red-team shared logging', () => {
  it('emits an explicit preflight blocked line before scans exist', () => {
    const log = buildPipelineLog({
      status: 'blocked',
      phases: [],
      preflight: {
        ready: false,
        message: 'Execution backend is unavailable for red-team campaign probes.',
      },
      now: Date.UTC(2026, 5, 16, 12, 0, 0),
    })

    expect(log.map(line => line.text)).toContain(
      '[hold] preflight blocked - Execution backend is unavailable for red-team campaign probes.',
    )
  })

  it('keeps the live log non-empty while a pipeline is running before pentest scans land', () => {
    const log = buildPipelineLog({
      status: 'running',
      phases: [
        {
          phase: 'baseline',
          status: 'running',
          evidence: [],
          tokensUsed: { input: 0, output: 0 },
        },
      ],
      preflight: { ready: true },
      evidenceCount: 0,
      tokenCount: 0,
      now: Date.UTC(2026, 5, 16, 12, 0, 0),
    })

    expect(log.some(line => line.text === '[ok]  preflight ready')).toBe(true)
    expect(log.some(line => line.text === '[...] baseline running')).toBe(true)
  })
})
