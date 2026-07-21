/**
 * Shared client for flyto-engine.
 * All requests include the active identity token for authentication.
 */

import { env } from '@lib/env'
import { getEngineToken } from './authToken'
import { getLocale } from '@lib/i18n'

export const BASE = env.engineUrl

export class EngineRequestError extends Error {
  status: number
  code?: string
  body?: unknown
  requestId?: string
  retryable?: boolean
  details?: Record<string, unknown>

  constructor(message: string, opts: {
    status: number
    code?: string
    body?: unknown
    requestId?: string
    retryable?: boolean
    details?: Record<string, unknown>
  }) {
    super(message)
    this.name = 'EngineRequestError'
    this.status = opts.status
    this.code = opts.code
    this.body = opts.body
    this.requestId = opts.requestId
    this.retryable = opts.retryable
    this.details = opts.details
  }
}

// authHeader returns a fully-formed "Bearer <token>" string for
// the current user, or empty when unauthenticated. Exported for
// callers that need to drive a non-JSON fetch (multipart upload,
// streaming download) where the request() helper's JSON
// serialisation doesn't fit.
export async function authHeader(): Promise<string> {
  try {
    const token = await getToken()
    return `Bearer ${token}`
  } catch {
    return ''
  }
}

async function getToken(): Promise<string> {
  return getEngineToken()
}

function dispatchBrowserEvent(factory: () => Event): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  window.dispatchEvent(factory())
}

export interface RequestOptions {
  /** Extra headers merged on top of Content-Type + Authorization. Used for
   *  endpoint-specific hints like X-GitHub-Token that engine looks for. */
  headers?: Record<string, string>
}

const PUBLIC_CE_PREFIX = ['/api', 'v1', 'ce'].join('/') + '/'

export async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts?: RequestOptions,
): Promise<T> {
  const token = await getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    // Surface the UI locale to the engine so AI-generated responses
    // (verdict explanations, Domain Insights, fix-plan narrative) come
    // back in the user's language. Backend handlers read Accept-Language
    // and prepend "Respond in <language>" to the prompt; non-AI
    // endpoints ignore the header.
    'Accept-Language': getLocale(),
    ...(opts?.headers ?? {}),
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    // 401 — token expired or revoked. Dispatch a global event so the auth
    // layer can force sign-out + redirect without every component needing
    // its own 401 handling.
    if (res.status === 401) {
      dispatchBrowserEvent(() => new Event('flyto:auth-expired'))
    }

    // Engine error envelope: { error: { code, message, requestId, ... } }.
    // Historically we read err.message || err.error which worked for flat
    // responses but stringified the envelope object as "[object Object]"
    // whenever the nested shape appeared. Prefer the nested message first.
    const errorText = await res.text().catch(() => '')
    let body: { error?: { message?: string; code?: string; requestId?: string; retryable?: boolean; details?: Record<string, unknown> } | string; code?: string; blocking_reason?: string; message?: string; feature?: string; action?: string; cap?: number; current?: number; plan?: string } | null = null
    if (errorText) {
      try {
        body = JSON.parse(errorText) as typeof body
      } catch {
        body = { message: errorText }
      }
    }
    body = body as
      | { error?: { message?: string; code?: string; requestId?: string; retryable?: boolean; details?: Record<string, unknown> } | string; code?: string; blocking_reason?: string; message?: string; feature?: string; action?: string; cap?: number; current?: number; plan?: string }
      | null

    // 403 with a capability-shaped error: backend rejected because the
    // org isn't on the right plan / role / has hit a cap. Dispatch a
    // typed event so a global listener can show an "upgrade" toast
    // without each call site needing its own handling.
    // Body shapes (from internal/permission + handlers_code_*):
    //   {error:"feature_required", feature:"ctem"}
    //   {error:"action_required", action:"pentest:run"}
    //   {error:"seat_cap_exceeded", cap:3, current:3, plan:"free"}
    //   {error:"repo_cap_exceeded", cap:3, current:3, plan:"free"}
    if (res.status === 403 && typeof body?.error === 'string') {
      const code = body.error
      if (code === 'feature_required' || code === 'action_required'
          || code === 'seat_cap_exceeded' || code === 'repo_cap_exceeded'
          || code === 'domain_cap_exceeded') {
        dispatchBrowserEvent(() => new CustomEvent('flyto:entitlement-denied', {
          detail: {
            kind: code,
            feature: body.feature,
            action: body.action,
            cap: body.cap,
            current: body.current,
            plan: body.plan,
          },
        }))
      }
    }

    const nested = typeof body?.error === 'object' ? body.error?.message : undefined
    const flat = typeof body?.error === 'string' ? body.error : undefined
    const nestedCode = typeof body?.error === 'object' ? body.error?.code : undefined
    const flatCode = typeof body?.error === 'string' ? body.error : undefined
    const requestId = typeof body?.error === 'object' ? body.error?.requestId : undefined
    const retryable = typeof body?.error === 'object' ? body.error?.retryable : undefined
    const details = typeof body?.error === 'object' ? body.error?.details : undefined
    const code = nestedCode || body?.code || body?.blocking_reason || flatCode
    const msg = nested || body?.message || flat || `${res.status} ${res.statusText}`
    throw new EngineRequestError(msg, { status: res.status, code, body, requestId, retryable, details })
  }
  const text = await res.text()
  if (!text.trim()) return null as T
  return JSON.parse(text) as T
}

/** Public, read-only CE contract client. The path guard intentionally keeps
 * anonymous access from becoming a general escape hatch around request(). */
export async function requestPublicCE<T>(path: string): Promise<T> {
  if (!path.startsWith(PUBLIC_CE_PREFIX)) {
    throw new Error('Public CE requests are restricted to the CE product API')
  }
  const res = await fetch(`${BASE}${path}`, {
    method: 'GET',
    headers: {
      'Accept-Language': getLocale(),
    },
  })
  if (!res.ok) {
    const errorText = await res.text().catch(() => '')
    let body: { error?: { message?: string; code?: string } | string; message?: string } | null = null
    if (errorText) {
      try {
        body = JSON.parse(errorText) as typeof body
      } catch {
        body = { message: errorText }
      }
    }
    const nested = typeof body?.error === 'object' ? body.error?.message : undefined
    const flat = typeof body?.error === 'string' ? body.error : undefined
    const code = typeof body?.error === 'object' ? body.error?.code : flat
    throw new EngineRequestError(
      nested || body?.message || flat || `${res.status} ${res.statusText}`,
      { status: res.status, code, body },
    )
  }
  const text = await res.text()
  if (!text.trim()) return null as T
  return JSON.parse(text) as T
}

/** Same auth + error handling as request(), but returns the raw
 *  response body as a Blob. Use for PDF / HTML / image downloads
 *  where JSON parsing would mangle the bytes. */
export async function requestBlob(
  method: string,
  path: string,
  body?: unknown,
  opts?: RequestOptions,
): Promise<Blob> {
  const token = await getToken()
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Accept-Language': getLocale(),
    ...(opts?.headers ?? {}),
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    if (res.status === 401) {
      dispatchBrowserEvent(() => new Event('flyto:auth-expired'))
    }
    const text = await res.text().catch(() => '')
    throw new Error(text || `${res.status} ${res.statusText}`)
  }
  return res.blob()
}

/** Detail shape carried by the `flyto:entitlement-denied` event. */
export interface EntitlementDeniedDetail {
  kind: 'feature_required' | 'action_required' | 'seat_cap_exceeded' | 'repo_cap_exceeded' | 'domain_cap_exceeded'
  feature?: string
  action?: string
  cap?: number
  current?: number
  plan?: string
}
