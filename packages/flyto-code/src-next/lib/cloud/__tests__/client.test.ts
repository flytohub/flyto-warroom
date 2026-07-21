import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getOptionalAuthTokenMock } = vi.hoisted(() => ({
  getOptionalAuthTokenMock: vi.fn<() => Promise<string | null>>(),
}))

vi.mock('@lib/env', () => ({
  env: { automationUrl: 'https://automation.example.com' },
}))
vi.mock('@lib/i18n', () => ({ getLocale: () => 'en' }))
vi.mock('@lib/engine/authToken', () => ({
  getOptionalAuthToken: getOptionalAuthTokenMock,
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import { cloudRequest, cloudWsConnect } from '../client'

function okJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
  } as Response
}

describe('automation client identity tokens', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    getOptionalAuthTokenMock.mockReset()
  })

  it('sends the provider-neutral identity token', async () => {
    getOptionalAuthTokenMock.mockResolvedValue('enterprise-session-token')
    fetchMock.mockResolvedValue(okJson({ ok: true }))

    await cloudRequest('GET', '/api/workflows', undefined, { requireAuth: true })

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer enterprise-session-token')
  })

  it('fails closed when authentication is required without a token', async () => {
    getOptionalAuthTokenMock.mockResolvedValue(null)

    await expect(
      cloudRequest('GET', '/api/workflows', undefined, { requireAuth: true }),
    ).rejects.toThrow('Not authenticated')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses the same identity token for WebSocket authentication', async () => {
    getOptionalAuthTokenMock.mockResolvedValue('enterprise-session-token')

    await expect(cloudWsConnect('/ws/browser/execution-1')).resolves.toEqual({
      url: 'wss://automation.example.com/ws/browser/execution-1',
      token: 'enterprise-session-token',
    })
  })
})
