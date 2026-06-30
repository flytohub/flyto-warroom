/**
 * Unit tests for the OAuth helpers — covers token storage,
 * GitLab CSRF state validation, and PKCE verifier handling.
 *
 * The Firebase popup flow (`connectGitHub`) and GitLab token-exchange
 * (`exchangeGitLabCode`) are NOT tested here — they call out to network
 * / SDK boundaries and would need fakes for every assertion. The high
 * blast-radius things this file exists for — state mismatch +
 * verifier consumption — are pure storage interactions and DO get
 * tested.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  GITHUB_TOKEN_KEY,
  GITLAB_TOKEN_KEY,
  storeGitHubToken,
  getStoredGitHubToken,
  clearGitHubToken,
  storeGitLabToken,
  getStoredGitLabToken,
  clearGitLabToken,
  rememberGitLabReturnPath,
  consumeGitLabReturnPath,
  validateGitLabState,
  getGitLabCodeVerifier,
} from '../oauth'

describe('oauth — token storage', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('GitHub token roundtrips through sessionStorage', () => {
    storeGitHubToken('gho_abc')
    expect(getStoredGitHubToken()).toBe('gho_abc')
    expect(sessionStorage.getItem(GITHUB_TOKEN_KEY)).toBe('gho_abc')
  })

  it('clearGitHubToken removes the entry', () => {
    storeGitHubToken('gho_abc')
    clearGitHubToken()
    expect(getStoredGitHubToken()).toBeNull()
  })

  it('GitLab token roundtrips through sessionStorage', () => {
    storeGitLabToken('glpat_xyz')
    expect(getStoredGitLabToken()).toBe('glpat_xyz')
    expect(sessionStorage.getItem(GITLAB_TOKEN_KEY)).toBe('glpat_xyz')
  })

  it('clearGitLabToken removes the entry', () => {
    storeGitLabToken('glpat_xyz')
    clearGitLabToken()
    expect(getStoredGitLabToken()).toBeNull()
  })

  it('GitHub and GitLab tokens use distinct keys (no cross-talk)', () => {
    storeGitHubToken('gh-1')
    storeGitLabToken('gl-1')
    expect(getStoredGitHubToken()).toBe('gh-1')
    expect(getStoredGitLabToken()).toBe('gl-1')
    clearGitHubToken()
    expect(getStoredGitLabToken()).toBe('gl-1') // not collateral-cleared
  })
})

describe('oauth — GitLab return-path memory', () => {
  beforeEach(() => sessionStorage.clear())

  it('remembers a path then consumes it once', () => {
    rememberGitLabReturnPath('/workspace/abc')
    expect(consumeGitLabReturnPath()).toBe('/workspace/abc')
    // consumed — second call falls back to "/"
    expect(consumeGitLabReturnPath()).toBe('/')
  })

  it('falls back to "/" when nothing remembered', () => {
    expect(consumeGitLabReturnPath()).toBe('/')
  })
})

describe('oauth — GitLab CSRF state validation', () => {
  beforeEach(() => sessionStorage.clear())

  it('validates a matching state and consumes it', () => {
    sessionStorage.setItem('flyto-code:gitlab-oauth-state', 'state-abc')
    expect(validateGitLabState('state-abc')).toBe(true)
    // Consumed — re-validating fails (replay protection)
    expect(validateGitLabState('state-abc')).toBe(false)
  })

  it('rejects a mismatched state', () => {
    sessionStorage.setItem('flyto-code:gitlab-oauth-state', 'state-abc')
    expect(validateGitLabState('attacker-supplied')).toBe(false)
  })

  it('rejects when no state was stored', () => {
    expect(validateGitLabState('anything')).toBe(false)
  })

  it('rejects empty stored state even if returned matches', () => {
    sessionStorage.setItem('flyto-code:gitlab-oauth-state', '')
    expect(validateGitLabState('')).toBe(false)
  })
})

describe('oauth — PKCE verifier handling', () => {
  beforeEach(() => sessionStorage.clear())

  it('returns the stored verifier and consumes it', () => {
    sessionStorage.setItem('flyto-code:gitlab-pkce-verifier', 'verifier-xyz')
    expect(getGitLabCodeVerifier()).toBe('verifier-xyz')
    // Consumed — second call returns null (single-use)
    expect(getGitLabCodeVerifier()).toBeNull()
  })

  it('returns null when no verifier was stored', () => {
    expect(getGitLabCodeVerifier()).toBeNull()
  })
})
