/**
 * flyto-cloud client — POSTs to cloud.flyto2.com, the live SaaS that wraps
 * flyto-core as a worker with Chrome + Playwright + AI tool calls.
 *
 * The Red Team War Room uses this directly instead of going through
 * flyto-engine + flyto-runner, because the cloud worker is already deployed
 * and handles YAML execution end-to-end.
 */

import { env } from '@lib/env'
import { getLocale } from '@lib/i18n'
import { getOptionalAuthToken } from '@lib/engine/authToken'

export const CLOUD_BASE = env.automationUrl

async function getToken(): Promise<string | null> {
  try { return await getOptionalAuthToken() } catch { return null }
}

export interface CloudRequestOptions {
  headers?: Record<string, string>
  /** Require auth — throws if no active identity token. Defaults to false; the
   *  /workflows/run endpoint accepts anonymous callers. */
  requireAuth?: boolean
}

export async function cloudRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  opts?: CloudRequestOptions,
): Promise<T> {
  const token = await getToken()
  if (opts?.requireAuth && !token) throw new Error('Not authenticated')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept-Language': getLocale(),
    ...(opts?.headers ?? {}),
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${CLOUD_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const j = await res.json().catch(() => null) as { detail?: string; message?: string } | null
    throw new Error(j?.detail || j?.message || `${res.status} ${res.statusText}`)
  }
  return res.json()
}

/** Build a WebSocket URL on the cloud side. The token is no longer placed
 *  in the query string (it would leak into server logs, Referer headers,
 *  and browser history). Instead callers should pass the token as the
 *  first message after `onopen`, or use the WebSocket subprotocol header
 *  via `cloudWsConnect`. */
export function cloudWsUrl(path: string): string {
  const base = CLOUD_BASE.replace(/^http/, 'ws')
  return `${base}${path}`
}

/** Open a WebSocket that authenticates via the first binary message after
 *  `onopen` instead of putting the token in the URL. The cloud worker
 *  expects an initial text frame `AUTH <token>` before streaming data.
 *  Falls back to unauthenticated if no identity session is active. */
export async function cloudWsConnect(path: string): Promise<{ url: string; token: string | null }> {
  const token = await getToken()
  return { url: cloudWsUrl(path), token }
}
