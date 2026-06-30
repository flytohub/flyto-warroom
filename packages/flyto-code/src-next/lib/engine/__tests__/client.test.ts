/**
 * Unit tests for the engine HTTP client.
 *
 * Covers both auth paths:
 *   1. Prod: uses auth.currentUser.getIdToken()
 *   2. Dev bypass: builds an unsigned JWT when env.devAuthBypass is true
 *
 * The dev bypass branch is gated on `import.meta.env.DEV` — in a prod build
 * that evaluates to `false`, so the bypass code is tree-shaken (verified
 * separately by grepping the built bundle).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock is hoisted above imports, so the mock factories need to be
// self-contained. Use vi.hoisted to share mutable references with tests.
const { envMock, firebaseAuthMock } = vi.hoisted(() => ({
  envMock: {
    authMode: 'firebase',
    engineUrl: 'https://engine.example.com',
    devAuthBypass: false,
    devAuthUid: 'test-uid',
    devAuthEmail: 'test@example.com',
  },
  firebaseAuthMock: {
    currentUser: null as null | { getIdToken: () => Promise<string> },
  },
}))

vi.mock('@lib/env', () => ({ env: envMock }))
vi.mock('@lib/firebase', () => ({ auth: firebaseAuthMock }))
vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key, getLocale: () => 'en' }))

// Intercept fetch so we can read the Authorization header the client sends.
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import { EngineRequestError, request } from '../client'

function okJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response
}

function errJson(status: number, statusText: string, body: unknown) {
  return {
    ok: false,
    status,
    statusText,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response
}

function errText(status: number, statusText: string, body: string) {
  return {
    ok: false,
    status,
    statusText,
    text: async () => body,
  } as unknown as Response
}

describe('engine client — token handling', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    sessionStorage.clear()
    envMock.authMode = 'firebase'
    envMock.devAuthBypass = false
    firebaseAuthMock.currentUser = null
  })

  it('in prod mode, sends Firebase ID token from auth.currentUser', async () => {
    firebaseAuthMock.currentUser = {
      getIdToken: vi.fn().mockResolvedValue('real-firebase-id-token'),
    }
    fetchMock.mockResolvedValueOnce(okJson({ ok: true }))

    await request('GET', '/api/v1/me')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer real-firebase-id-token')
    expect(firebaseAuthMock.currentUser.getIdToken).toHaveBeenCalled()
  })

  it('in prod mode, throws "Not authenticated" when no user', async () => {
    firebaseAuthMock.currentUser = null
    await expect(request('GET', '/api/v1/me')).rejects.toThrow('Not authenticated')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('with devAuthBypass on, sends an unsigned JWT without calling Firebase', async () => {
    envMock.devAuthBypass = true
    firebaseAuthMock.currentUser = null // MUST NOT be touched
    fetchMock.mockResolvedValueOnce(okJson({ ok: true }))

    await request('GET', '/api/v1/me')

    const [, init] = fetchMock.mock.calls[0]
    const auth: string = init.headers.Authorization
    expect(auth).toMatch(/^Bearer /)
    const token = auth.replace(/^Bearer /, '')
    // Three dot-separated segments with an empty signature.
    const [, payload, sig] = token.split('.')
    expect(sig).toBe('')
    // Payload decodes to the configured dev claims.
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    expect(decoded.sub).toBe('test-uid')
    expect(decoded.email).toBe('test@example.com')
  })

  it('with enterprise auth mode, sends the session JWT without calling Firebase', async () => {
    envMock.authMode = 'enterprise'
    sessionStorage.setItem('jwt_access_token', JSON.stringify('enterprise-session-token'))
    firebaseAuthMock.currentUser = {
      getIdToken: vi.fn().mockResolvedValue('should-not-be-used'),
    }
    fetchMock.mockResolvedValueOnce(okJson({ ok: true }))

    await request('GET', '/api/v1/me')

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer enterprise-session-token')
    expect(firebaseAuthMock.currentUser.getIdToken).not.toHaveBeenCalled()
  })

  it('with local_jwt auth mode, sends the session JWT without calling Firebase', async () => {
    envMock.authMode = 'local_jwt'
    sessionStorage.setItem('jwt_access_token', JSON.stringify('local-session-token'))
    firebaseAuthMock.currentUser = {
      getIdToken: vi.fn().mockResolvedValue('should-not-be-used'),
    }
    fetchMock.mockResolvedValueOnce(okJson({ ok: true }))

    await request('GET', '/api/v1/me')

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer local-session-token')
    expect(firebaseAuthMock.currentUser.getIdToken).not.toHaveBeenCalled()
  })

  it('with enterprise auth mode, fails closed when no session JWT exists', async () => {
    envMock.authMode = 'enterprise'
    firebaseAuthMock.currentUser = {
      getIdToken: vi.fn().mockResolvedValue('firebase-token'),
    }

    await expect(request('GET', '/api/v1/me')).rejects.toThrow('Not authenticated')
    expect(firebaseAuthMock.currentUser.getIdToken).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws on 4xx response with the server-side error message', async () => {
    firebaseAuthMock.currentUser = {
      getIdToken: vi.fn().mockResolvedValue('t'),
    }
    fetchMock.mockResolvedValueOnce(errJson(403, 'Forbidden', { message: 'not your org' }))

    await expect(request('GET', '/api/v1/x')).rejects.toThrow('not your org')
  })
})

describe('engine client — error envelope parsing', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    envMock.devAuthBypass = true // simplify auth for these tests
  })

  it('extracts message from nested { error: { message } } envelope', async () => {
    fetchMock.mockResolvedValueOnce(errJson(400, 'Bad Request', { error: { code: 'BAD_REQUEST', message: 'invalid repo id' } }))

    await expect(request('GET', '/api/v1/x')).rejects.toThrow('invalid repo id')
  })

  it('extracts message from flat { error: "string" } envelope', async () => {
    fetchMock.mockResolvedValueOnce(errJson(500, 'Internal Server Error', { error: 'something broke' }))

    await expect(request('GET', '/api/v1/x')).rejects.toThrow('something broke')
  })

  it('extracts top-level { message } field', async () => {
    fetchMock.mockResolvedValueOnce(errJson(422, 'Unprocessable Entity', { message: 'validation failed' }))

    await expect(request('GET', '/api/v1/x')).rejects.toThrow('validation failed')
  })

  it('falls back to statusText when json parse fails', async () => {
    fetchMock.mockResolvedValueOnce(errText(502, 'Bad Gateway', '502 Bad Gateway'))

    await expect(request('GET', '/api/v1/x')).rejects.toThrow('502 Bad Gateway')
  })

  it('prefers nested error.message over top-level message', async () => {
    fetchMock.mockResolvedValueOnce(errJson(400, 'Bad Request', { error: { message: 'nested wins' }, message: 'top level' }))

    await expect(request('GET', '/api/v1/x')).rejects.toThrow('nested wins')
  })

  it('preserves status, code, and body on structured engine errors', async () => {
    const body = {
      ok: false,
      error: 'config_required',
      code: 'execution_backend_unavailable',
      message: 'Execution backend is unavailable for red-team campaign probes.',
      preflight: { ready: false, blocking_reason: 'execution_backend_unavailable' },
    }
    fetchMock.mockResolvedValueOnce(errJson(409, 'Conflict', body))

    try {
      await request('POST', '/api/v1/code/pipeline/runs', {})
      throw new Error('request should have failed')
    } catch (err) {
      expect(err).toBeInstanceOf(EngineRequestError)
      const engineErr = err as EngineRequestError
      expect(engineErr.status).toBe(409)
      expect(engineErr.code).toBe('execution_backend_unavailable')
      expect(engineErr.body).toEqual(body)
    }
  })

  it('preserves nested details, retryable, and requestId on engine envelopes', async () => {
    const body = {
      error: {
        code: 'FORBIDDEN',
        message: 'verify example.com with DNS TXT before active scans',
        retryable: false,
        requestId: 'req-123',
        details: {
          reason: 'target_unattributed',
          required_action: 'verify_domain_dns',
          domain: 'example.com',
          record_name: '_flyto-verify.example.com',
        },
      },
    }
    fetchMock.mockResolvedValueOnce(errJson(403, 'Forbidden', body))

    try {
      await request('POST', '/api/v1/code/pentests/p1/run', {})
      throw new Error('request should have failed')
    } catch (err) {
      expect(err).toBeInstanceOf(EngineRequestError)
      const engineErr = err as EngineRequestError
      expect(engineErr.status).toBe(403)
      expect(engineErr.code).toBe('FORBIDDEN')
      expect(engineErr.requestId).toBe('req-123')
      expect(engineErr.retryable).toBe(false)
      expect(engineErr.details).toEqual(body.error.details)
    }
  })
})

describe('engine client — 401 auth expiry', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    envMock.devAuthBypass = true
  })

  it('dispatches flyto:auth-expired event on 401 response', async () => {
    const handler = vi.fn()
    window.addEventListener('flyto:auth-expired', handler)

    fetchMock.mockResolvedValueOnce(errJson(401, 'Unauthorized', { message: 'token expired' }))

    await expect(request('GET', '/api/v1/me')).rejects.toThrow('token expired')
    expect(handler).toHaveBeenCalledTimes(1)

    window.removeEventListener('flyto:auth-expired', handler)
  })

  it('does NOT dispatch auth-expired on non-401 errors', async () => {
    const handler = vi.fn()
    window.addEventListener('flyto:auth-expired', handler)

    fetchMock.mockResolvedValueOnce(errJson(403, 'Forbidden', { message: 'not allowed' }))

    await expect(request('GET', '/api/v1/me')).rejects.toThrow('not allowed')
    expect(handler).not.toHaveBeenCalled()

    window.removeEventListener('flyto:auth-expired', handler)
  })
})

describe('engine client — request options', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    envMock.devAuthBypass = true
  })

  it('merges custom headers from opts.headers', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ ok: true }))

    await request('GET', '/api/v1/repos', undefined, {
      headers: { 'X-GitHub-Token': 'ghp_abc123' },
    })

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers['X-GitHub-Token']).toBe('ghp_abc123')
    // Default headers still present
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.headers['Authorization']).toMatch(/^Bearer /)
  })

  it('sends JSON body for POST requests', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ id: '123' }))

    await request('POST', '/api/v1/orgs', { name: 'test-org' })

    const [, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ name: 'test-org' })
  })

  it('sends no body for GET requests', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ ok: true }))

    await request('GET', '/api/v1/me')

    const [, init] = fetchMock.mock.calls[0]
    expect(init.body).toBeUndefined()
  })
})

describe('engine client — Accept-Language header', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    envMock.devAuthBypass = true
  })

  it('sends Accept-Language header derived from i18n locale', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ ok: true }))

    await request('GET', '/api/v1/me')

    const [, init] = fetchMock.mock.calls[0]
    // getLocale() returns 'en' from the mock
    expect(init.headers['Accept-Language']).toBe('en')
  })
})
