import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bootstrapLocalAdmin,
  getLocalBootstrapStatus,
  LocalAuthRequestError,
} from '../auth'

const fetchMock = vi.fn<typeof fetch>()

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function registrationInput() {
  const nonce = crypto.randomUUID()
  return {
    email: `${nonce}@example.test`,
    password: `Aa1!${nonce}`,
    displayName: 'Warroom Admin',
  }
}

describe('local first-run administrator API', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads one-time registration status without a session', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {
      enabled: true,
      required: true,
      registrationOpen: true,
    }))

    await expect(getLocalBootstrapStatus()).resolves.toEqual({
      enabled: true,
      required: true,
      registrationOpen: true,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/auth\/local\/bootstrap$/),
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('submits administrator details to the one-time endpoint', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { user: { id: crypto.randomUUID() } }))

    const input = registrationInput()
    await bootstrapLocalAdmin(input)

    const [, init] = fetchMock.mock.calls[0]
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual(input)
  })

  it('preserves the engine conflict when another request won setup', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(409, {
      error: { code: 'CONFLICT', message: 'administrator account has already been created' },
    }))

    const error = await bootstrapLocalAdmin(registrationInput()).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(LocalAuthRequestError)
    expect(error).toMatchObject({ status: 409, message: 'administrator account has already been created' })
  })
})
