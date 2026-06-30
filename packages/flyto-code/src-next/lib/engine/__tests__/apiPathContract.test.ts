import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Frontend ↔ backend API path contract.
 *
 * Every path the frontend calls must be a route the backend actually
 * registers — otherwise it's a silent 404 (the "backend uses xxx, frontend
 * uses yyy" class). The backend's registered routes are snapshotted in
 * __generated__/backend-routes.txt (regenerate with
 * `npm run sync:backend-routes` when engine routes change). This test extracts
 * every `/api/v1/...` path literal under lib/engine, normalises path params +
 * query strings, and asserts each one exists in that snapshot — or is in
 * KNOWN_MISSING, the
 * documented list of frontend clients whose backend endpoint isn't built yet.
 *
 * A NEW frontend call to a non-existent route fails here instead of shipping
 * a dead feature.
 */
const here = dirname(fileURLToPath(import.meta.url))
const engineDir = join(here, '..')
const srcRoot = join(here, '..', '..', '..') // src-next/

const KNOWN_MISSING = new Set<string>()

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) {
      if (name === '__generated__' || name === '__tests__' || name === 'node_modules') continue
      out.push(...walk(p))
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !/\.gen\.ts$/.test(name)) {
      out.push(p)
    }
  }
  return out
}

/** Collapse a path into "{x}"-param, query-stripped canonical form. */
function normalize(path: string): string {
  let p = path
  // Simple path params first: ${orgId}, ${repo.id}, ${encodeURIComponent(x)}.
  p = p.replace(/\$\{\s*encodeURIComponent\([^)]*\)\s*\}/g, '{x}')
  p = p.replace(/\$\{\s*[\w.]+\s*\}/g, '{x}')
  // Anything still starting with `$` is a complex query expression
  // (`${q ? '?'+q : ''}`) or an extraction truncation — drop from there.
  const dollar = p.indexOf('$')
  if (dollar >= 0) p = p.slice(0, dollar)
  const q = p.indexOf('?')
  if (q >= 0) p = p.slice(0, q)
  // A `{x}` glued directly onto a word (no slash) is an interpolated query
  // string, not a path param — drop it.
  p = p.replace(/([A-Za-z]){x}$/g, '$1')
  p = p.replace(/\{[^}]+\}/g, '{x}')   // any remaining {id} → {x}
  p = p.replace(/\{x\}(\{x\})+/g, '{x}')
  return p.replace(/\/+$/, '')
}

function loadBackendRoutes(): { methodPaths: Set<string>; paths: Set<string> } {
  const txt = readFileSync(join(engineDir, '__generated__', 'backend-routes.txt'), 'utf8')
  const methodPaths = new Set<string>()
  const paths = new Set<string>()
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z]+)\s+(\/api\/v1\/\S+)/)
    if (m) {
      const norm = normalize(m[2])
      methodPaths.add(`${m[1]} ${norm}`)
      paths.add(norm)
    }
  }
  return { methodPaths, paths }
}

/** Every `/api/v1/...` path literal anywhere under src-next (method-agnostic:
 *  catches direct fetch/EventSource/request calls outside lib/engine too). */
function allApiPathLiterals(): { path: string; file: string }[] {
  const out: { path: string; file: string }[] = []
  const litRe = /[`'"](\/api\/v1\/[^`'"]*)/g
  for (const file of walk(srcRoot)) {
    const src = readFileSync(file, 'utf8')
    let m: RegExpExecArray | null
    while ((m = litRe.exec(src)) !== null) {
      out.push({ path: m[1], file: file.slice(srcRoot.length + 1) })
    }
  }
  return out
}

// Path-only forms of the dead endpoints (method dropped for the broad check).
const KNOWN_MISSING_PATHS = new Set(
  [...KNOWN_MISSING].map((k) => k.replace(/^[A-Z]+\s+/, '')),
)

function frontendCalls(): { method: string; path: string; file: string }[] {
  const calls: { method: string; path: string; file: string }[] = []
  const reqRe = /request(?:Blob)?<[^>]*>?\(\s*['"]([A-Z]+)['"]\s*,\s*[`'"](\/api\/v1\/[^`'"]+)[`'"]/g
  for (const file of walk(engineDir)) {
    const src = readFileSync(file, 'utf8')
    let m: RegExpExecArray | null
    while ((m = reqRe.exec(src)) !== null) {
      calls.push({ method: m[1], path: m[2], file: file.slice(engineDir.length + 1) })
    }
  }
  return calls
}

describe('frontend ↔ backend API path contract', () => {
  const backend = loadBackendRoutes()

  it('the backend route snapshot loaded', () => {
    expect(backend.methodPaths.size).toBeGreaterThan(300)
  })

  it('every lib/engine API call hits a registered backend route (method-aware)', () => {
    const calls = frontendCalls()
    expect(calls.length).toBeGreaterThan(80) // sanity: we actually parsed clients
    const dead: string[] = []
    for (const c of calls) {
      const key = `${c.method} ${normalize(c.path)}`
      if (backend.methodPaths.has(key) || KNOWN_MISSING.has(key)) continue
      dead.push(`${key}   (${c.file})`)
    }
    expect(dead, `lib/engine calls with no backend route:\n${dead.join('\n')}`).toEqual([])
  })

  it('every /api/v1 path used ANYWHERE in src-next exists on the backend (incl. direct fetch/SSE)', () => {
    const lits = allApiPathLiterals()
    const dead: string[] = []
    for (const l of lits) {
      const norm = normalize(l.path)
      if (!norm.startsWith('/api/v1/')) continue // truncated/garbage
      if (backend.paths.has(norm) || KNOWN_MISSING_PATHS.has(norm)) continue
      dead.push(`${norm}   (${l.file})`)
    }
    expect([...new Set(dead)], `/api/v1 paths with no backend route:\n${[...new Set(dead)].join('\n')}`).toEqual([])
  })

  it('KNOWN_MISSING entries are still actually missing (prune when backend ships them)', () => {
    for (const k of KNOWN_MISSING) {
      expect(backend.methodPaths.has(k), `${k} now EXISTS on the backend — remove it from KNOWN_MISSING`).toBe(false)
    }
  })
})
