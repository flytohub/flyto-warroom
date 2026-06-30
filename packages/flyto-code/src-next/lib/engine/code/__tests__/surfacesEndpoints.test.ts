import { describe, expect, it, vi } from 'vitest'

const { envMock } = vi.hoisted(() => ({
  envMock: {
    engineUrl: 'https://engine.local',
  },
}))

vi.mock('@lib/env', () => ({ env: envMock }))
vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key, getLocale: () => 'en' }))

import {
  ciCheckEndpoint,
  mcpIngestEndpoint,
  runtimeEventsEndpoint,
  scanUploadEndpoint,
} from '../surfaces'

describe('engine code surface endpoint helpers', () => {
  it('builds integration snippets from the configured engine URL', () => {
    expect(mcpIngestEndpoint()).toBe('https://engine.local/api/v1/agent-firewall/ingest')
    expect(runtimeEventsEndpoint()).toBe('https://engine.local/api/v1/runtime/events')
    expect(ciCheckEndpoint()).toBe('https://engine.local/api/v1/code/repos/{REPO_ID}/ci-check')
    expect(scanUploadEndpoint()).toBe('https://engine.local/api/v1/code/repos/{REPO_ID}/scan-upload')
  })
})
