/**
 * Pentest authentication config — credentials / session material for
 * authenticated scanning.
 *
 * Two entry shapes the user can set (stored in pentest.config.auth):
 *
 *   1. Static session (simplest, use for short-lived tests):
 *      { kind: 'cookie',  value: 'sid=abc; token=xyz' }
 *      { kind: 'bearer',  value: 'eyJhbGci...' }
 *      { kind: 'headers', headers: { 'X-Api-Key': 'xxx', 'X-Csrf': 'yyy' } }
 *
 *   2. Dynamic login (re-authenticates per campaign, robuster):
 *      { kind: 'login', loginUrl: 'https://.../login',
 *        method: 'POST', body: {...}, capture: 'cookie' | 'bearer' | 'header:X-Auth' }
 *      // runner executes this as a FIRST step and captures the
 *      // resulting credential; later rounds reference {{auth_*}}.
 *
 * Red team playbooks referencing `{{auth_cookie}}` / `{{auth_bearer}}`
 * / `{{auth_header_<NAME>}}` in header values get the captured creds
 * injected via params expansion. Playbooks without those templates
 * remain unauthenticated (backwards compat).
 */

export type PentestAuthConfig =
  | { kind: 'none' }
  | { kind: 'cookie'; value: string }
  | { kind: 'bearer'; value: string }
  | { kind: 'headers'; headers: Record<string, string> }
  | {
      kind: 'login'
      loginUrl: string
      method?: 'POST' | 'GET'
      body?: Record<string, unknown>
      headers?: Record<string, string>
      /** Where to capture the credential from the login response. */
      capture:
        | { from: 'cookie'; name: string }
        | { from: 'header'; name: string }
        | { from: 'body'; jsonPath: string }  // e.g. "access_token"
    }

/** Parse the auth field from pentest.config JSON, tolerantly. */
export function readAuthConfig(rawConfig: string | null | undefined): PentestAuthConfig {
  if (!rawConfig) return { kind: 'none' }
  let cfg: unknown
  try { cfg = JSON.parse(rawConfig) } catch { return { kind: 'none' } }
  if (!cfg || typeof cfg !== 'object') return { kind: 'none' }
  const auth = (cfg as { auth?: unknown }).auth
  if (!auth || typeof auth !== 'object') return { kind: 'none' }
  const kind = (auth as { kind?: string }).kind
  switch (kind) {
    case 'cookie':
    case 'bearer':
    case 'headers':
    case 'login':
      return auth as PentestAuthConfig
    default:
      return { kind: 'none' }
  }
}

/**
 * Convert a static auth config into flat template variables the
 * playbook YAML can reference. Dynamic (login) configs are NOT
 * handled here — they require a runtime login step (see
 * generateLoginPrelude below). The template keys are:
 *
 *   auth_cookie       — full Cookie header value
 *   auth_bearer       — just the token (without "Bearer " prefix)
 *   auth_bearer_hdr   — "Bearer <token>" for Authorization header
 *   auth_header_<KEY> — custom header value, KEY uppercased
 */
export function authToTemplateVars(auth: PentestAuthConfig): Record<string, string> {
  switch (auth.kind) {
    case 'none':
      return {}
    case 'cookie':
      return { auth_cookie: auth.value }
    case 'bearer':
      return {
        auth_bearer: auth.value,
        auth_bearer_hdr: `Bearer ${auth.value}`,
      }
    case 'headers': {
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(auth.headers)) {
        out[`auth_header_${k.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`] = v
      }
      return out
    }
    case 'login':
      // Login flows run as a dedicated prelude step at round -1; the
      // captured credential is then injected into the campaign's
      // shared params ref at runtime. Nothing to stamp statically.
      return {}
  }
}

/**
 * Synthesize a one-step YAML playbook that logs in and captures the
 * credential to the execution context. The executor then makes the
 * capture available to subsequent rounds via params.
 *
 * Returns null when no dynamic login is needed.
 */
export function generateLoginPrelude(auth: PentestAuthConfig): string | null {
  if (auth.kind !== 'login') return null
  const headers = auth.headers ?? {}
  const headerLines = Object.entries(headers)
    .map(([k, v]) => `            ${k}: ${JSON.stringify(v)}`)
    .join('\n')
  const body = auth.body ? JSON.stringify(auth.body) : ''
  return [
    '# Authenticated scanning prelude — captures session before exploits fire.',
    'steps:',
    '  - id: login',
    '    module: http.batch',
    '    params:',
    '      requests:',
    '        - method: ' + (auth.method ?? 'POST'),
    '          url: ' + auth.loginUrl,
    headerLines ? '          headers:' : '',
    headerLines,
    body ? '          body: ' + JSON.stringify(body) : '',
    '      timeout: 15',
    '      verify_ssl: true',
  ].filter(Boolean).join('\n')
}
