#!/usr/bin/env node
/**
 * Audit platform loop closure across the 8 product surfaces.
 *
 * This guard is intentionally contract-driven. It does not prove every endpoint
 * returns meaningful tenant data; it proves the system still has the structural
 * loop a maintainer expects:
 *
 *   module route -> API client path -> qk cache key -> SSE invalidation ->
 *   flyto-core/YAML verification recipe
 *
 * If an AI-generated branch adds or moves a surface and breaks one of these
 * structural links, CI should catch it before the platform turns into another
 * set of isolated pages.
 *
 * Two things this guard refuses to let a surface fake:
 *
 *   1. Closure cannot be silently waived. The legacy `allowMissingApi` /
 *      `allowMissingQk` booleans are rejected — a surface that genuinely cannot
 *      close a dimension yet must declare a `waivers` object with `reason`,
 *      `expiry` (a future ISO date) and `ownedBy`, all validated here. Expired
 *      or malformed waivers fail the build.
 *   2. Recipes cannot be prose. Every recipe assertion must be a structured,
 *      machine-checkable `assert:` entry. Static assertions (event/qk/api) are
 *      cross-checked against the real source so a recipe cannot claim a loop the
 *      code does not actually wire.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseYaml } from './lib/recipe-yaml.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const json = process.argv.includes('--json')

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function readIfExists(rel) {
  const abs = path.join(ROOT, rel)
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : ''
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel))
}

function walk(dirRel, out = []) {
  const dir = path.join(ROOT, dirRel)
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(dirRel, entry.name)
    if (entry.isDirectory()) walk(rel, out)
    else out.push(rel)
  }
  return out
}

const modulesText = read('src-next/types/modules.ts')
const queryKeysText = read('src-next/lib/queryKeys.ts')
const orgEventsText = read('src-next/hooks/useOrgEvents.ts')
// SSE handlers delegate fan-out invalidation to small helper modules
// (e.g. invalidateFootprintClosure / invalidateThreatIntelQueries). Fold their bodies in so an
// `event_invalidates_query` assertion against a footprint event resolves the
// builders the helper actually invalidates, not just the literal case block.
const invalidationHelperText = readIfExists('src-next/lib/footprintLoop.ts')
const threatIntelInvalidationHelperText = readIfExists('src-next/lib/threatIntelLoop.ts')
const invalidationSourceText = `${orgEventsText}\n${invalidationHelperText}\n${threatIntelInvalidationHelperText}`
const engineClientText = walk('src-next/lib/engine')
  .filter((file) => /\.(ts|tsx)$/.test(file))
  .map((file) => read(file))
  .join('\n')

/* ---------------------------------------------------------------------------
 * Source cross-check helpers.
 * ------------------------------------------------------------------------- */
function modulePresent(id) {
  return new RegExp(`id:\\s*['"]${id}['"]`).test(modulesText)
}

function apiPresent(fragment) {
  return engineClientText.includes(fragment)
}

function qkPresent(fragment) {
  return queryKeysText.includes(`'${fragment}'`) || queryKeysText.includes(`"${fragment}"`)
}

function eventHandled(event) {
  return orgEventsText.includes(`case '${event}'`) || orgEventsText.includes(`case "${event}"`)
}

function functionBody(text, name) {
  const idx = text.search(new RegExp(`function\\s+${name}\\s*\\(`))
  if (idx === -1) return ''
  const open = text.indexOf('{', idx)
  if (open === -1) return ''
  let depth = 0
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return text.slice(open + 1, i)
    }
  }
  return ''
}

function expandInvalidationHelpers(body, seen = new Set()) {
  let expanded = body
  const helperRe = /\binvalidate[A-Z]\w*\s*\(/g
  for (const match of body.matchAll(helperRe)) {
    const name = match[0].replace(/\s*\($/, '')
    if (name === 'invalidateQueries' || seen.has(name)) continue
    const helperBody = functionBody(invalidationSourceText, name)
    if (!helperBody) continue
    seen.add(name)
    expanded += `\n${expandInvalidationHelpers(helperBody, seen)}`
  }
  return expanded
}

// Effective body for an SSE event case, including fall-through group siblings
// (captured up to the block's `return`) and any invalidation-helper bodies the
// case delegates to. Used to verify an event truly invalidates a given builder.
function eventInvalidationBody(event) {
  const idx = orgEventsText.search(new RegExp(`case ['"]${event}['"]`))
  if (idx === -1) return ''
  const after = orgEventsText.slice(idx)
  const retIdx = after.search(/\breturn\b/)
  let block = retIdx === -1 ? after.slice(0, 2000) : after.slice(0, retIdx)
  block = expandInvalidationHelpers(block)
  return block
}

/* ---------------------------------------------------------------------------
 * Structured recipe assertions.
 *
 * Recognized kinds and their required fields. Static kinds are cross-checked
 * against the live source; runtime kinds (executed by a flyto-core browser
 * run) are validated for structural well-formedness against the recipe steps.
 * ------------------------------------------------------------------------- */
const ASSERTION_KINDS = {
  event_invalidates_query: { fields: ['event', 'invalidates'], runtime: false },
  query_key_present: { fields: ['query_key'], runtime: false },
  api_path_present: { fields: ['path'], runtime: false },
  event_routed: { fields: ['event'], runtime: false },
  route_renders_without_error: { fields: ['step'], runtime: true },
  dom_contains: { fields: ['step', 'text'], runtime: true },
  http_status: { fields: ['step', 'status'], runtime: true },
  command_succeeds: { fields: ['step'], runtime: true },
}

function stepModule(steps, oneBasedIndex) {
  const i = Number(oneBasedIndex)
  if (!Number.isInteger(i) || i < 1 || i > steps.length) return null
  const step = steps[i - 1]
  return step && typeof step === 'object' ? String(step.module ?? '') : null
}

function checkAssertion(a, steps) {
  if (!a || typeof a !== 'object' || typeof a.assert !== 'string') {
    return `prose or unstructured assertion (every assertion needs "assert: <kind>")`
  }
  const spec = ASSERTION_KINDS[a.assert]
  if (!spec) return `unknown assertion kind "${a.assert}"`
  for (const field of spec.fields) {
    if (a[field] === undefined || a[field] === null || String(a[field]).trim() === '') {
      return `assertion "${a.assert}" missing field "${field}"`
    }
  }

  switch (a.assert) {
    case 'event_invalidates_query': {
      if (!eventHandled(a.event)) return `event "${a.event}" is not handled in useOrgEvents`
      if (!eventInvalidationBody(a.event).includes(a.invalidates)) {
        return `event "${a.event}" does not invalidate ${a.invalidates}`
      }
      return null
    }
    case 'query_key_present':
      return qkPresent(a.query_key) ? null : `query key "${a.query_key}" not defined in queryKeys.ts`
    case 'api_path_present':
      return apiPresent(a.path) ? null : `api path "${a.path}" not found in engine client`
    case 'event_routed':
      return eventHandled(a.event) ? null : `event "${a.event}" is not routed in useOrgEvents`
    case 'route_renders_without_error': {
      const mod = stepModule(steps, a.step)
      if (mod === null) return `route_renders_without_error step ${a.step} is out of range`
      if (!mod.startsWith('browser.')) return `route_renders_without_error step ${a.step} is not a browser step`
      return null
    }
    case 'dom_contains': {
      const mod = stepModule(steps, a.step)
      if (mod === null) return `dom_contains step ${a.step} is out of range`
      if (!mod.startsWith('browser.')) return `dom_contains step ${a.step} is not a browser step`
      return null
    }
    case 'http_status': {
      const mod = stepModule(steps, a.step)
      if (mod === null) return `http_status step ${a.step} is out of range`
      if (mod !== 'api.request') return `http_status step ${a.step} is not an api.request step`
      if (!Number.isInteger(Number(a.status))) return `http_status step ${a.step} status must be numeric`
      return null
    }
    case 'command_succeeds': {
      const mod = stepModule(steps, a.step)
      if (mod === null) return `command_succeeds step ${a.step} is out of range`
      if (mod !== 'shell.run') return `command_succeeds step ${a.step} is not a shell.run step`
      return null
    }
    default:
      return `unhandled assertion kind "${a.assert}"`
  }
}

function recipeValid(file) {
  const rel = `docs/platform-loops/recipes/${file}`
  if (!exists(rel)) return { ok: false, reasons: ['missing'] }

  let doc
  try {
    doc = parseYaml(read(rel))
  } catch (err) {
    return { ok: false, reasons: [`unparseable: ${err.message}`] }
  }

  const reasons = []
  for (const token of ['id', 'surface', 'steps', 'assertions']) {
    if (doc[token] === undefined) reasons.push(`missing ${token}`)
  }

  const steps = Array.isArray(doc.steps) ? doc.steps : []
  if (steps.length === 0) reasons.push('no steps')

  const assertions = Array.isArray(doc.assertions) ? doc.assertions : []
  if (assertions.length === 0) {
    reasons.push('no structured assertions (prose-only recipes are not machine-checkable)')
  }
  let staticCount = 0
  assertions.forEach((a, i) => {
    const problem = checkAssertion(a, steps)
    if (problem) reasons.push(`assertion #${i + 1}: ${problem}`)
    else if (a && typeof a === 'object' && ASSERTION_KINDS[a.assert] && !ASSERTION_KINDS[a.assert].runtime) {
      staticCount += 1
    }
  })
  // A recipe that drives the browser or hits an API must carry at least one
  // statically verifiable loop link (event/qk/api), so a stale recipe cannot
  // pass forever without ever touching the real source. Shell-only CI recipes
  // (e.g. running guard:branch) are exempt — command_succeeds is their check.
  const browserOrApi = steps.some((s) => {
    const m = s && typeof s === 'object' ? String(s.module ?? '') : ''
    return m.startsWith('browser.') || m === 'api.request'
  })
  if (assertions.length > 0 && staticCount === 0 && browserOrApi) {
    reasons.push('no statically cross-checkable assertion (needs at least one event/qk/api assertion)')
  }

  return reasons.length === 0 ? { ok: true, reasons: [] } : { ok: false, reasons }
}

/* ---------------------------------------------------------------------------
 * Registry loading + waiver validation.
 * ------------------------------------------------------------------------- */
function requireStringArray(loop, key) {
  if (!Array.isArray(loop[key]) || loop[key].some((value) => typeof value !== 'string' || !value)) {
    throw new Error(`platform-loop-registry: ${loop.id ?? '<unknown>'}.${key} must be a non-empty string array`)
  }
}

const TODAY = new Date()

function validateWaiver(loop, dimension) {
  const waiver = loop.waivers?.[dimension]
  if (waiver === undefined) return null
  if (typeof waiver !== 'object' || Array.isArray(waiver)) {
    throw new Error(`platform-loop-registry: ${loop.id}.waivers.${dimension} must be an object with reason/expiry/ownedBy`)
  }
  for (const field of ['reason', 'expiry', 'ownedBy']) {
    if (typeof waiver[field] !== 'string' || !waiver[field].trim()) {
      throw new Error(`platform-loop-registry: ${loop.id}.waivers.${dimension}.${field} is required and must be a non-empty string`)
    }
  }
  const expiry = new Date(waiver.expiry)
  if (Number.isNaN(expiry.getTime())) {
    throw new Error(`platform-loop-registry: ${loop.id}.waivers.${dimension}.expiry "${waiver.expiry}" is not a valid date (use ISO YYYY-MM-DD)`)
  }
  if (expiry.getTime() < TODAY.getTime()) {
    throw new Error(`platform-loop-registry: ${loop.id}.waivers.${dimension} expired on ${waiver.expiry} — close the loop or re-justify, do not extend silently`)
  }
  return { dimension, ...waiver }
}

function loadLoopRegistry() {
  const rel = 'docs/platform-loops/platform-loop-registry.json'
  const registry = JSON.parse(read(rel))
  if (registry.schema !== 'flyto-code.platform-loop-registry.v1') {
    throw new Error(`${rel}: unsupported schema ${registry.schema ?? '<missing>'}`)
  }
  if (!Array.isArray(registry.surfaces) || registry.surfaces.length === 0) {
    throw new Error(`${rel}: surfaces must be a non-empty array`)
  }

  const seen = new Set()
  for (const loop of registry.surfaces) {
    if (typeof loop.id !== 'string' || !loop.id) throw new Error(`${rel}: every surface needs id`)
    if (seen.has(loop.id)) throw new Error(`${rel}: duplicate surface id ${loop.id}`)
    seen.add(loop.id)
    if (typeof loop.label !== 'string' || !loop.label) throw new Error(`${rel}: ${loop.id}.label is required`)
    if ('allowMissingApi' in loop || 'allowMissingQk' in loop) {
      throw new Error(
        `${rel}: ${loop.id} uses the removed allowMissingApi/allowMissingQk bypass. ` +
        `Close the loop, or declare a validated waiver: ` +
        `"waivers": { "api": { "reason": "...", "expiry": "YYYY-MM-DD", "ownedBy": "..." } }`,
      )
    }
    for (const key of ['modules', 'api', 'qk', 'events', 'recipes']) requireStringArray(loop, key)
    loop._waivers = {
      api: validateWaiver(loop, 'api'),
      qk: validateWaiver(loop, 'qk'),
    }
  }

  return registry.surfaces
}

const loops = loadLoopRegistry()

const surfaceReports = loops.map((loop) => {
  const moduleGaps = loop.modules.filter((id) => !modulePresent(id))
  const apiGaps = loop.api.filter((fragment) => !apiPresent(fragment))
  const qkGaps = loop.qk.filter((fragment) => !qkPresent(fragment))
  const eventGaps = loop.events.filter((event) => !eventHandled(event))
  const recipeGaps = loop.recipes
    .map((file) => ({ file, ...recipeValid(file) }))
    .filter((r) => !r.ok)

  const apiWaiver = loop._waivers.api
  const qkWaiver = loop._waivers.qk

  const gaps = [
    ...moduleGaps.map((id) => `missing module ${id}`),
    ...(apiWaiver ? [] : apiGaps.map((fragment) => `missing api client fragment ${fragment}`)),
    ...(qkWaiver ? [] : qkGaps.map((fragment) => `missing qk fragment ${fragment}`)),
    ...eventGaps.map((event) => `missing event handler ${event}`),
    ...recipeGaps.flatMap((r) => r.reasons.map((reason) => `recipe ${r.file}: ${reason}`)),
  ]

  const waivedNotes = [
    ...(apiWaiver && apiGaps.length ? [`api gaps waived by ${apiWaiver.ownedBy} until ${apiWaiver.expiry}: ${apiGaps.join(', ')}`] : []),
    ...(qkWaiver && qkGaps.length ? [`qk gaps waived by ${qkWaiver.ownedBy} until ${qkWaiver.expiry}: ${qkGaps.join(', ')}`] : []),
  ]

  let status = 'pass'
  if (gaps.length > 0) status = 'fail'
  else if (waivedNotes.length > 0) status = 'waived'

  return {
    id: loop.id,
    label: loop.label,
    status,
    modules: loop.modules,
    recipes: loop.recipes,
    gaps,
    waived: waivedNotes,
    observed_gaps: {
      modules: moduleGaps,
      api: apiGaps,
      query_keys: qkGaps,
      events: eventGaps,
      recipes: recipeGaps,
    },
  }
})

const failed = surfaceReports.filter((r) => r.status === 'fail')
const waived = surfaceReports.filter((r) => r.status === 'waived')
const report = {
  schema: 'flyto-code.platform-loop-audit.v1',
  generated_at: new Date().toISOString(),
  summary: {
    total: surfaceReports.length,
    pass: surfaceReports.filter((r) => r.status === 'pass').length,
    waived: waived.length,
    fail: failed.length,
  },
  surfaces: surfaceReports,
}

if (json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} else {
  console.log(`platform loops: ${report.summary.pass}/${report.summary.total} passing` +
    (waived.length ? ` (${waived.length} waived)` : ''))
  for (const surface of surfaceReports) {
    const tag = surface.status === 'pass' ? 'PASS' : surface.status === 'waived' ? 'WAIVED' : 'FAIL'
    console.log(`${tag} ${surface.id} — ${surface.label}`)
    for (const note of surface.waived) console.log(`  ~ ${note}`)
    for (const gap of surface.gaps) console.log(`  - ${gap}`)
  }
}

if (failed.length > 0) process.exitCode = 1
