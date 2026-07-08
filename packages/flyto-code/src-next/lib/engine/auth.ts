import { env } from '@lib/env'

export type EngineAuthUser = {
  id: string
  email?: string
  displayName?: string
  photoURL?: string | null
}

export type LocalLoginResponse = {
  accessToken?: string
  access_token?: string
  user?: EngineAuthUser
}

export async function loginWithLocalEngine(email: string, password: string): Promise<LocalLoginResponse> {
  const res = await fetch(`${env.engineUrl}/api/v1/auth/local/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error('auth/invalid-credential')
  return res.json() as Promise<LocalLoginResponse>
}
