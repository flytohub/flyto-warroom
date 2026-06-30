/**
 * Scope Guard — enforces "what's in range for this campaign" before any
 * YAML leaves the client. Parses every URL out of the YAML (after
 * template-var expansion), matches host + path + method against the
 * declared scope, and returns violations. The hook aborts a round when
 * violations come back.
 *
 * We intentionally run this client-side because the AI-generated YAMLs
 * and the seed library can both reference places we never intended to
 * touch — Cloud worker may accept anything, so this is the operator's
 * red-line.
 */

export interface CampaignScope {
  /** Hosts that may be contacted. Supports a single leading-wildcard:
   *    "api.example.com"      → exact match only
   *    "*.example.com"        → matches example.com + any subdomain
   *  Empty / undefined list = nothing allowed (hard block). */
  allowedHosts: string[]
  /** Path prefixes to restrict to. Empty = all paths under allowed hosts. */
  allowedPathPrefixes?: string[]
  /** HTTP methods allowed. Empty = all methods. Upper-case; comparison is case-insensitive. */
  allowedMethods?: string[]
  /** If true, accept YAMLs that reference only `{{target_url}}` even when
   *  their hard-coded URLs haven't been resolved yet — useful for seed
   *  playbooks that rely on runtime substitution. Default true. */
  allowTemplateOnly?: boolean
}

export interface ScopeViolation {
  step: string
  reason: string
  url?: string
  method?: string
}

/** Match host against "*.example.com" / "example.com" / exact. */
export function isHostAllowed(host: string, allowed: string[]): boolean {
  const h = host.toLowerCase()
  for (const raw of allowed) {
    const pattern = raw.toLowerCase().trim()
    if (!pattern) continue
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(2)
      if (h === suffix || h.endsWith('.' + suffix)) return true
    } else if (h === pattern) {
      return true
    }
  }
  return false
}

function isPathAllowed(path: string, prefixes: string[] | undefined): boolean {
  if (!prefixes || prefixes.length === 0) return true
  const p = path || '/'
  return prefixes.some(prefix => p.startsWith(prefix))
}

function isMethodAllowed(method: string, methods: string[] | undefined): boolean {
  if (!methods || methods.length === 0) return true
  const m = method.toUpperCase()
  return methods.some(x => x.toUpperCase() === m)
}

/** Expand `{{var}}` tokens with the provided param map. Unresolved tokens
 *  stay in place so downstream code can flag them. */
export function expandTemplate(s: string, params: Record<string, string>): string {
  return s.replace(/\{\{\s*([a-zA-Z_][\w.]*)\s*\}\}/g, (_m, name) => {
    const v = params[name]
    return v !== undefined ? String(v) : `{{${name}}}`
  })
}

/** Pull (url, method) pairs out of a flyto-core pentest YAML. The canonical
 *  schema uses:
 *    - module: http.request  → params.url + params.method
 *    - module: http.batch    → params.requests: [{ method, url }, ...]
 *    - module: browser.goto  → params.url (method implicit GET)
 *  This parser is regex-based because the YAML may contain embedded JS
 *  blocks (browser.evaluate) that a strict YAML parser would choke on —
 *  and we only care about the URL payload, not full AST fidelity. */
export function extractRequests(yaml: string): Array<{ url: string; method: string; step: string }> {
  const out: Array<{ url: string; method: string; step: string }> = []
  const stepRe = /^ {2,4}- id:\s*(\S+)/gm
  const stepBoundaries: Array<{ id: string; start: number; end: number }> = []
  let m: RegExpExecArray | null
  while ((m = stepRe.exec(yaml)) !== null) {
    if (stepBoundaries.length > 0) stepBoundaries[stepBoundaries.length - 1].end = m.index
    stepBoundaries.push({ id: m[1], start: m.index, end: yaml.length })
  }

  for (const step of stepBoundaries) {
    const block = yaml.slice(step.start, step.end)
    const addedUrls = new Set<string>()

    // 1. http.batch / batched probe lists — `- method: X ... url: Y` pairs.
    //    Both orders matter because different YAMLs put them in different
    //    sequences. We scan for `- method:` first, then `- url:` first.
    const batchMethodFirst = /-\s+method:\s*([A-Z]+)[\s\S]*?url:\s*["']?([^"'\n]+)["']?/g
    const batchUrlFirst = /-\s+url:\s*["']?([^"'\n]+)["']?[\s\S]*?method:\s*([A-Z]+)/g
    let b: RegExpExecArray | null
    while ((b = batchMethodFirst.exec(block)) !== null) {
      const url = b[2].trim()
      out.push({ method: b[1].trim(), url, step: step.id })
      addedUrls.add(url)
    }
    while ((b = batchUrlFirst.exec(block)) !== null) {
      const url = b[1].trim()
      if (addedUrls.has(url)) continue
      out.push({ method: b[2].trim(), url, step: step.id })
      addedUrls.add(url)
    }

    // 2. Direct `url:` + `method:` (http.request, browser.goto). Anywhere
    //    in the block — order-independent because the flyto-core pentest
    //    YAMLs mix the two.
    const directUrlRe = /^\s+url:\s*["']?([^"'\n]+)["']?$/gm
    const directMethodRe = /^\s+method:\s*["']?([A-Z]+)["']?$/gm
    const urls: string[] = []
    const methods: string[] = []
    let u: RegExpExecArray | null
    while ((u = directUrlRe.exec(block)) !== null) {
      const v = u[1].trim()
      if (!addedUrls.has(v)) urls.push(v)
    }
    let mm: RegExpExecArray | null
    while ((mm = directMethodRe.exec(block)) !== null) methods.push(mm[1].trim())

    // Pair positionally (first url with first leftover method, etc.). For
    // the common single-request case this collapses to the obvious pair.
    for (let i = 0; i < urls.length; i++) {
      const method = methods[i] ?? methods[0] ?? 'GET'
      out.push({ method, url: urls[i], step: step.id })
      addedUrls.add(urls[i])
    }
  }
  return out
}

export function validateYamlInScope(
  yaml: string,
  scope: CampaignScope,
  params: Record<string, string> = {},
): ScopeViolation[] {
  const violations: ScopeViolation[] = []
  const allowTemplateOnly = scope.allowTemplateOnly ?? true
  const reqs = extractRequests(yaml)

  for (const { url, method, step } of reqs) {
    const expanded = expandTemplate(url, params)

    // Unresolved template — by policy we either allow (the cloud will fill
    // it) or reject (strict mode).
    if (/\{\{.+\}\}/.test(expanded)) {
      if (allowTemplateOnly) continue
      violations.push({ step, reason: 'unresolved template variable', url: expanded, method })
      continue
    }

    let parsed: URL
    try { parsed = new URL(expanded) }
    catch {
      violations.push({ step, reason: 'invalid URL', url: expanded, method })
      continue
    }

    if (!isHostAllowed(parsed.hostname, scope.allowedHosts)) {
      violations.push({ step, reason: `host '${parsed.hostname}' not in scope`, url: expanded, method })
      continue
    }
    if (!isPathAllowed(parsed.pathname, scope.allowedPathPrefixes)) {
      violations.push({ step, reason: `path '${parsed.pathname}' not in allowed prefixes`, url: expanded, method })
      continue
    }
    if (!isMethodAllowed(method, scope.allowedMethods)) {
      violations.push({ step, reason: `method '${method}' not allowed`, url: expanded, method })
      continue
    }
  }

  return violations
}

/** Build a default scope that locks the campaign to the target URL's host. */
export function scopeFromTargetUrl(targetUrl: string, extraHosts: string[] = []): CampaignScope {
  try {
    const u = new URL(targetUrl)
    return {
      allowedHosts: [u.hostname, ...extraHosts],
      allowTemplateOnly: true,
    }
  } catch {
    return { allowedHosts: extraHosts, allowTemplateOnly: true }
  }
}
