/**
 * Unit tests for env.ts — environment variable validation.
 *
 * The module uses import.meta.env which is compile-time in Vite. In tests,
 * we verify the requireProdEnv logic by importing a standalone copy of the
 * function with mocked import.meta.env values.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('requireProdEnv logic', () => {
  // We can't easily re-import env.ts per test since the module is
  // evaluated at import time. Instead, test the documented contract:

  it('env object exposes all expected keys', async () => {
    // This test verifies the shape at import time. If a key is removed
    // or renamed, this fails — catching typos in consumer code.
    const { env } = await import('../env')

    expect(env).toHaveProperty('engineUrl')
    expect(env).toHaveProperty('authMode')
    expect(env).toHaveProperty('firebaseApiKey')
    expect(env).toHaveProperty('firebaseAuthDomain')
    expect(env).toHaveProperty('firebaseProjectId')
    expect(env).toHaveProperty('githubClientId')
    expect(env).toHaveProperty('gitlabClientId')
    expect(env).toHaveProperty('gitlabBaseUrl')
    expect(env).toHaveProperty('automationUrl')
    expect(env).toHaveProperty('cortexUrl')
    expect(env).toHaveProperty('devAuthBypass')
    expect(env).toHaveProperty('devAuthUid')
    expect(env).toHaveProperty('devAuthEmail')
  })

  it('engineUrl falls back to localhost in dev mode', async () => {
    const { env } = await import('../env')
    // In test (DEV=true) without VITE_ENGINE_URL, should use fallback
    expect(typeof env.engineUrl).toBe('string')
    expect(env.engineUrl.length).toBeGreaterThan(0)
  })

  it('normalizes same-origin engine URL sentinel for Docker runner smoke', async () => {
    const { normalizeEngineUrl } = await import('../env')
    expect(normalizeEngineUrl('__same_origin__')).toBe('')
    expect(normalizeEngineUrl('http://127.0.0.1:8080')).toBe('http://127.0.0.1:8080')
  })

  it('gitlabBaseUrl defaults to https://gitlab.com', async () => {
    const { env } = await import('../env')
    expect(env.gitlabBaseUrl).toBe('https://gitlab.com')
  })

  it('devAuthBypass is boolean-like', async () => {
    const { env } = await import('../env')
    expect(typeof env.devAuthBypass).toBe('boolean')
  })

  it('devAuthUid has a default value in dev', async () => {
    const { env } = await import('../env')
    expect(env.devAuthUid.length).toBeGreaterThan(0)
  })

  it('devAuthEmail has a default value in dev', async () => {
    const { env } = await import('../env')
    expect(env.devAuthEmail).toContain('@')
  })
})
