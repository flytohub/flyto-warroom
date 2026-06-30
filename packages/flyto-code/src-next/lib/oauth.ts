import {
  GithubAuthProvider,
  signInWithPopup,
} from 'firebase/auth'
import { auth } from './firebase'

export const GITHUB_TOKEN_KEY = 'flyto-code:github-token'

/**
 * GitHub App install URL. Reads VITE_GITHUB_APP_SLUG at build time —
 * if unset, the App flow isn't deployed yet, and the caller should
 * fall back to the OAuth path (`connectGitHub`).
 *
 * The `state` query param carries the Flyto orgID through GitHub's
 * redirect so the callback page knows which org to bind the
 * installation to. GitHub passes it back verbatim.
 */
export function getGitHubAppInstallURL(orgID: string): string | null {
  const slug = (import.meta.env.VITE_GITHUB_APP_SLUG as string | undefined)?.trim()
  if (!slug) return null
  return `https://github.com/apps/${slug}/installations/new?state=${encodeURIComponent(orgID)}`
}

/** True when the engine has been provisioned with a GitHub App. */
export function isGitHubAppAvailable(): boolean {
  return getGitHubAppInstallURL('_') !== null
}

/**
 * Connect GitHub via Firebase OAuth popup.
 * Returns the GitHub access token and persists it.
 */
export async function connectGitHub(): Promise<string> {
  const provider = new GithubAuthProvider()
  provider.addScope('repo')
  provider.addScope('read:user')
  // read:org lets /user/orgs return the user's GitHub orgs (e.g. flytohub).
  // Without it the repo picker only shows personal-account repos.
  provider.addScope('read:org')

  const result = await signInWithPopup(auth, provider)
  const credential = GithubAuthProvider.credentialFromResult(result)
  if (!credential?.accessToken) throw new Error('No access token returned')

  storeGitHubToken(credential.accessToken)
  return credential.accessToken
}

/** Store GitHub token in sessionStorage (reduces XSS window vs localStorage) */
export function storeGitHubToken(token: string): void {
  sessionStorage.setItem(GITHUB_TOKEN_KEY, token)
}

/** Get stored GitHub token */
export function getStoredGitHubToken(): string | null {
  return sessionStorage.getItem(GITHUB_TOKEN_KEY)
}

/** Clear stored GitHub token */
export function clearGitHubToken(): void {
  sessionStorage.removeItem(GITHUB_TOKEN_KEY)
}

// ── GitLab OAuth (Authorization Code + PKCE) ──

const GITLAB_STATE_KEY = 'flyto-code:gitlab-oauth-state'
const GITLAB_VERIFIER_KEY = 'flyto-code:gitlab-pkce-verifier'
const GITLAB_RETURN_KEY = 'flyto-code:gitlab-return-path'
export const GITLAB_TOKEN_KEY = 'flyto-code:gitlab-token'

export function storeGitLabToken(token: string): void {
  sessionStorage.setItem(GITLAB_TOKEN_KEY, token)
}

export function getStoredGitLabToken(): string | null {
  return sessionStorage.getItem(GITLAB_TOKEN_KEY)
}

export function clearGitLabToken(): void {
  sessionStorage.removeItem(GITLAB_TOKEN_KEY)
}

export function rememberGitLabReturnPath(path: string): void {
  sessionStorage.setItem(GITLAB_RETURN_KEY, path)
}

export function consumeGitLabReturnPath(): string {
  const path = sessionStorage.getItem(GITLAB_RETURN_KEY) || '/'
  sessionStorage.removeItem(GITLAB_RETURN_KEY)
  return path
}

/** Generate a cryptographically random string for OAuth state / PKCE verifier */
function generateRandomString(length = 64): string {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, length)
}

/** Derive SHA-256 code_challenge from code_verifier (S256 method) */
async function deriveCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  // Base64url encode
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Build GitLab OAuth URL using Authorization Code flow + PKCE.
 * Stores state + code_verifier in localStorage for validation on callback.
 */
export async function getGitLabOAuthUrl(): Promise<string> {
  const clientId = import.meta.env.VITE_GITLAB_CLIENT_ID as string
  const baseUrl = (import.meta.env.VITE_GITLAB_BASE_URL as string) || 'https://gitlab.com'
  const redirectUri = `${window.location.origin}/callback/gitlab`
  const scope = 'read_user read_api read_repository'

  // CSRF protection: random state
  const state = generateRandomString(32)
  sessionStorage.setItem(GITLAB_STATE_KEY, state)

  // PKCE: code_verifier + code_challenge
  const codeVerifier = generateRandomString(64)
  sessionStorage.setItem(GITLAB_VERIFIER_KEY, codeVerifier)
  const codeChallenge = await deriveCodeChallenge(codeVerifier)

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })

  return `${baseUrl}/oauth/authorize?${params.toString()}`
}

/** Validate the state parameter returned from GitLab OAuth callback */
export function validateGitLabState(returnedState: string): boolean {
  const stored = sessionStorage.getItem(GITLAB_STATE_KEY)
  sessionStorage.removeItem(GITLAB_STATE_KEY)
  return !!stored && stored === returnedState
}

/** Get the stored PKCE code_verifier for token exchange */
export function getGitLabCodeVerifier(): string | null {
  const verifier = sessionStorage.getItem(GITLAB_VERIFIER_KEY)
  sessionStorage.removeItem(GITLAB_VERIFIER_KEY)
  return verifier
}

/**
 * Exchange the authorization code for an access_token (PKCE, no client_secret).
 * The GitLab Application must be registered as public (confidential = false).
 */
export async function exchangeGitLabCode(
  code: string,
  verifier: string,
): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
  const clientId = import.meta.env.VITE_GITLAB_CLIENT_ID as string
  const baseUrl = (import.meta.env.VITE_GITLAB_BASE_URL as string) || 'https://gitlab.com'
  const redirectUri = `${window.location.origin}/callback/gitlab`

  const body = new URLSearchParams({
    client_id: clientId,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code_verifier: verifier,
  })

  const res = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`GitLab token exchange failed (${res.status}): ${detail || res.statusText}`)
  }

  const data = (await res.json()) as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }
  if (!data.access_token) throw new Error('GitLab returned no access_token')
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  }
}
