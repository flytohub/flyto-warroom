#!/usr/bin/env node
/**
 * Audit state-changing org routes for explicit authorization gates.
 *
 * The baseline we want: a mutation route may not rely only on "is a member of
 * this org". It must carry a route-level srv.gated(...) action, a handler-level
 * action/feature request, org-admin/platform-admin assertion, or a documented
 * allowlist entry with a narrow reason.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENGINE_ROOT = process.env.FLYTO_ENGINE_ROOT || path.resolve(ROOT, '..', 'flyto-engine')
const API_DIR = path.join(ENGINE_ROOT, 'api')

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// Membership-only writes that are intentionally low-risk UX preferences or
// operator-owned artifacts. Keep this list small; every entry must explain why
// member-level write is acceptable.
const MEMBERSHIP_ONLY_ALLOWLIST = new Map([
])

function read(file) {
  return fs.readFileSync(file, 'utf8')
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/gm, (match, prefix) => `${prefix}${' '.repeat(match.length - prefix.length)}`)
}

function goFiles(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.endsWith('_test.go')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...goFiles(full))
    else if (entry.name.endsWith('.go')) out.push(full)
  }
  return out
}

function findMatchingBrace(src, openIndex) {
  let depth = 0
  let quote = ''
  let escape = false
  for (let i = openIndex; i < src.length; i += 1) {
    const ch = src[i]
    if (quote) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === '`' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '{') depth += 1
    if (ch === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

function parseHandlers() {
  const handlers = new Map()
  const fnRe = /func\s+\(s\s+\*Server\)\s+(\w+)\s*\(/g
  for (const file of goFiles(API_DIR)) {
    const code = stripComments(read(file))
    let m
    while ((m = fnRe.exec(code))) {
      const name = m[1]
      const open = code.indexOf('{', fnRe.lastIndex)
      const close = open === -1 ? -1 : findMatchingBrace(code, open)
      if (open === -1 || close === -1) continue
      handlers.set(name, { file, body: code.slice(open, close + 1) })
      fnRe.lastIndex = close + 1
    }
  }
  return handlers
}

function parseRoutes() {
  const routes = []
  const re = /mux\.HandleFunc\("([A-Z]+)\s+([^"]+)",\s*([^\n]+)\)/g
  for (const file of goFiles(API_DIR)) {
    const code = stripComments(read(file))
    let m
    while ((m = re.exec(code))) {
      const method = m[1]
      const routePath = m[2]
      const registration = m[3]
      const handlerMatches = [...registration.matchAll(/srv\.(handle\w+)/g)]
      const handler = handlerMatches.at(-1)?.[1]
      if (!handler) continue
      routes.push({
        method,
        path: routePath,
        handler,
        registration,
        routeKey: `${method} ${routePath}`,
      })
    }
  }
  return routes
}

function requestLiteralIsStrong(body) {
  const re = /requireOrgAccess\s*\([\s\S]{0,260}?accessctl\.Request\s*\{([\s\S]{0,420}?)\}\s*\)/g
  let m
  while ((m = re.exec(body))) {
    const req = m[1]
    if (/\b(Action|RequiredFeature|Surface|Sensitivity)\s*:/.test(req)) return true
  }
  return false
}

function bodyHasExplicitGate(body, functions, seen = new Set()) {
  if (/\brequirePlatformAdmin\s*\(/.test(body)) return true
  if (/\bassertOrgAdmin\s*\(/.test(body)) return true
  if (/\brequireAction\s*\(/.test(body)) return true
  if (/\brequireSensitiveEvidence\s*\(/.test(body)) return true
  if (/\brequireSurfaceRead\s*\(/.test(body)) return true
  if (/\bcheckAPIKeyScope\s*\(/.test(body)) return true
  if (requestLiteralIsStrong(body)) return true
  for (const m of body.matchAll(/\bs\.(\w+)\s*\(/g)) {
    const helper = m[1]
    if (seen.has(helper)) continue
    const fn = functions.get(helper)
    if (!fn) continue
    seen.add(helper)
    if (bodyHasExplicitGate(fn.body, functions, seen)) return true
  }
  return false
}

function hasExplicitGate(route, body, functions) {
  if (/srv\.gated\s*\(/.test(route.registration)) return true
  return bodyHasExplicitGate(body, functions)
}

function isOrgScopedMutation(route) {
  if (!MUTATING_METHODS.has(route.method)) return false
  return route.path.startsWith('/api/v1/code/orgs/{id}')
}

const handlers = parseHandlers()
const routes = parseRoutes()
const missing = []

for (const route of routes.filter(isOrgScopedMutation)) {
  const handler = handlers.get(route.handler)
  if (!handler) {
    missing.push(`${route.routeKey} -> ${route.handler} (handler body not found)`)
    continue
  }
  if (hasExplicitGate(route, handler.body, handlers)) continue
  const reason = MEMBERSHIP_ONLY_ALLOWLIST.get(route.routeKey)
  if (reason) continue
  missing.push(`${route.routeKey} -> ${route.handler} (${path.relative(ENGINE_ROOT, handler.file)})`)
}

const staleAllowlist = [...MEMBERSHIP_ONLY_ALLOWLIST.keys()]
  .filter((key) => !routes.some((r) => r.routeKey === key))

if (missing.length > 0 || staleAllowlist.length > 0) {
  if (missing.length > 0) {
    console.error(`Authz gate audit failed: ${missing.length} mutating org route(s) lack explicit action/feature/admin gate:`)
    for (const item of missing) console.error(`  - ${item}`)
  }
  if (staleAllowlist.length > 0) {
    console.error(`Authz gate audit failed: stale allowlist route(s):`)
    for (const item of staleAllowlist) console.error(`  - ${item}`)
  }
  process.exit(1)
}

console.log(`Authz gate OK: checked ${routes.filter(isOrgScopedMutation).length} mutating org routes`)
