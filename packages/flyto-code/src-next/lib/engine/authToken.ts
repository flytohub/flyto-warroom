import { env } from '@lib/env'

const JWT_SESSION_KEY = 'jwt_access_token'

export function isSessionJWTAuthMode(mode = env.authMode): boolean {
  return mode === 'enterprise' ||
    mode === 'enterprise_jwt' ||
    mode === 'enterprise_airgap' ||
    mode === 'jwt' ||
    mode === 'local' ||
    mode === 'local_jwt' ||
    mode === 'community'
}

function readSessionToken(): string | null {
  if (typeof globalThis.sessionStorage === 'undefined') return null
  try {
    const raw = globalThis.sessionStorage.getItem(JWT_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return typeof parsed === 'string' && parsed ? parsed : null
  } catch {
    return null
  }
}

function buildDevToken(): string {
  const header = btoa(JSON.stringify({ alg: 'none' }))
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  const payload = btoa(JSON.stringify({
    sub: env.devAuthUid,
    email: env.devAuthEmail,
  })).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${header}.${payload}.`
}

export async function getOptionalAuthToken(): Promise<string | null> {
  const sessionToken = readSessionToken()
  if (sessionToken) return sessionToken

  if (import.meta.env.DEV && env.devAuthBypass) {
    return buildDevToken()
  }

  if (isSessionJWTAuthMode()) {
    return null
  }

  const { auth } = await import('@lib/firebase')
  const user = auth.currentUser
  if (!user) return null
  return user.getIdToken()
}

export async function getEngineToken(): Promise<string> {
  const token = await getOptionalAuthToken()
  if (!token) throw new Error('Not authenticated')
  return token
}
