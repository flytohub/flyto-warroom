import { env } from '@lib/env'

const JWT_SESSION_KEY = 'jwt_access_token'

function readSessionToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(JWT_SESSION_KEY)
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

export async function getEngineToken(): Promise<string> {
  const sessionToken = readSessionToken()
  if (sessionToken) return sessionToken

  if (import.meta.env.DEV && env.devAuthBypass) {
    return buildDevToken()
  }

  if (env.authMode === 'enterprise' || env.authMode === 'enterprise_airgap' || env.authMode === 'jwt') {
    throw new Error('Not authenticated')
  }

  const { auth } = await import('@lib/firebase')
  const user = auth.currentUser
  if (!user) throw new Error('Not authenticated')
  return user.getIdToken()
}
