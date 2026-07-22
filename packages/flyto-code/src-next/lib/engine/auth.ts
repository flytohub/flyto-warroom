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

export type LocalBootstrapStatus = {
  enabled: boolean
  required: boolean
  registrationOpen: boolean
}

export class LocalAuthRequestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'LocalAuthRequestError'
    this.status = status
  }
}

async function localAuthError(res: Response, fallback: string): Promise<LocalAuthRequestError> {
  let message = fallback
  try {
    const body = await res.json() as { error?: string | { message?: string }, message?: string }
    if (typeof body.error === 'string') message = body.error
    else if (body.error?.message) message = body.error.message
    else if (body.message) message = body.message
  } catch {
    // Preserve the stable fallback when a proxy returned a non-JSON error.
  }
  return new LocalAuthRequestError(message, res.status)
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

export async function getLocalBootstrapStatus(): Promise<LocalBootstrapStatus> {
  const res = await fetch(`${env.engineUrl}/api/v1/auth/local/bootstrap`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw await localAuthError(res, 'Local registration status is unavailable')
  return res.json() as Promise<LocalBootstrapStatus>
}

export async function bootstrapLocalAdmin(input: {
  email: string
  password: string
  displayName: string
}): Promise<LocalLoginResponse> {
  const res = await fetch(`${env.engineUrl}/api/v1/auth/local/bootstrap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw await localAuthError(res, 'Administrator account could not be created')
  return res.json() as Promise<LocalLoginResponse>
}
