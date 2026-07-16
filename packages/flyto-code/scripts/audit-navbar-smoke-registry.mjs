/**
 * Validate the navbar browser-smoke registry.
 *
 * The registry is not a live browser run. It is the machine-readable contract
 * that tells flyto-core/browser smoke tests which navbar routes matter, what
 * text should prove the page loaded, which product surface owns the route, and
 * which scroll policy the wrapper should follow.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WORKSPACE = path.resolve(ROOT, '..')
const GENERATED_WARROOM_CE = !fs.existsSync(path.join(WORKSPACE, 'flyto-engine'))

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function parseJson(rel) {
  return JSON.parse(read(rel))
}

function extractObjectBlocksFromArray(text, arrStart) {
  const blocks = []
  let quote = ''
  let comment = ''
  let braceDepth = 0
  let blockStart = -1

  for (let i = arrStart + 1; i < text.length; i += 1) {
    const ch = text[i]
    const next = text[i + 1]

    if (comment === 'line') {
      if (ch === '\n') comment = ''
      continue
    }
    if (comment === 'block') {
      if (ch === '*' && next === '/') {
        comment = ''
        i += 1
      }
      continue
    }
    if (quote) {
      if (ch === '\\') {
        i += 1
        continue
      }
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '/' && next === '/') {
      comment = 'line'
      i += 1
      continue
    }
    if (ch === '/' && next === '*') {
      comment = 'block'
      i += 1
      continue
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      quote = ch
      continue
    }

    if (ch === '{') {
      if (braceDepth === 0) blockStart = i
      braceDepth += 1
    } else if (ch === '}') {
      braceDepth -= 1
      if (braceDepth === 0 && blockStart >= 0) {
        blocks.push(text.slice(blockStart, i + 1))
        blockStart = -1
      }
    } else if (ch === ']' && braceDepth === 0) {
      break
    }
  }

  return blocks
}

function extractModuleBlocks(text, sourceName) {
  const legacyStart = text.indexOf('export const MODULES')
  if (legacyStart >= 0) {
    const assign = text.indexOf('=', legacyStart)
    if (assign < 0) throw new Error(`${sourceName}: MODULES assignment is missing`)
    const arrStart = text.indexOf('[', assign)
    if (arrStart < 0) throw new Error(`${sourceName}: MODULES is not an array`)
    return extractObjectBlocksFromArray(text, arrStart)
  }

  const packageStart = text.indexOf('defineModulePackage(')
  if (packageStart < 0) return []
  const arrStart = text.indexOf('[', packageStart)
  if (arrStart < 0) throw new Error(`${sourceName}: defineModulePackage is missing module array`)
  return extractObjectBlocksFromArray(text, arrStart)
}

function prop(block, key) {
  return block.match(new RegExp(`\\b${key}:\\s*['"]([^'"]+)['"]`))?.[1] ?? null
}

function sidebarGroup(block) {
  return block.match(/\bsidebar:\s*{[\s\S]*?\bgroup:\s*['"]([^'"]+)['"]/)?.[1] ?? null
}

function navPath(modulePath) {
  return modulePath.replace(/\/(:|\*).*$/, '')
}

function routePath(pathTemplate) {
  const prefix = '/projects/{orgId}/'
  if (!pathTemplate.startsWith(prefix)) return null
  return pathTemplate.slice(prefix.length).split('?')[0]
}

function loadVisibleModules() {
  const manifestDir = path.join(ROOT, 'src-next/types/module-manifests')
  const files = fs.readdirSync(manifestDir)
    .filter((file) => file.endsWith('.ts'))
    .filter((file) => !['boundary.ts', 'index.ts', 'packageManifest.ts'].includes(file))
    .sort()
  const blocks = files.flatMap((file) => {
    const rel = `src-next/types/module-manifests/${file}`
    return extractModuleBlocks(read(rel), rel)
  })
  if (blocks.length === 0) {
    throw new Error('src-next/types/module-manifests/*.ts: no module blocks found')
  }
  const modules = []
  for (const block of blocks) {
    const id = prop(block, 'id')
    const modulePath = prop(block, 'path')
    const group = sidebarGroup(block)
    if (!id || !modulePath || !group || group === 'hidden') continue
    modules.push({ id, path: modulePath, navPath: navPath(modulePath), group })
  }
  return modules
}

/* ---------------------------------------------------------------------------
 * Loop-island detection (H1).
 *
 * A navbar-smoke route being assigned a *valid* surface is not enough. The
 * route's module must also be wired into that surface's platform-loop modules
 * in docs/platform-loops/platform-loop-registry.json. Otherwise a page can sit
 * on the navbar, claim a surface, and never be part of the closed loop
 * (module -> api -> qk -> SSE -> recipe) - exactly the "isolated pages" the
 * platform fights. This is a reverse check (route -> platform-loop modules),
 * not just route.surface validity.
 *
 * The only escape hatch is a structured, time-boxed waiver on the route:
 *
 *   "loopWaiver": { "reason": "...", "expiry": "YYYY-MM-DD", "ownedBy": "..." }
 *
 * Malformed or expired waivers fail the build instead of silently passing.
 * ------------------------------------------------------------------------- */
export function validateLoopWaiver(route, now = new Date()) {
  const waiver = route?.loopWaiver
  if (waiver === undefined || waiver === null) return { active: false, failures: [] }
  if (typeof waiver !== 'object' || Array.isArray(waiver)) {
    return {
      active: false,
      failures: [{ kind: 'loop_waiver', route: route.id, detail: 'loopWaiver must be an object with reason/expiry/ownedBy' }],
    }
  }
  const failures = []
  for (const field of ['reason', 'expiry', 'ownedBy']) {
    if (typeof waiver[field] !== 'string' || !waiver[field].trim()) {
      failures.push({ kind: 'loop_waiver', route: route.id, detail: `loopWaiver.${field} is required and must be a non-empty string` })
    }
  }
  if (failures.length) return { active: false, failures }
  const expiry = new Date(waiver.expiry)
  if (Number.isNaN(expiry.getTime())) {
    return {
      active: false,
      failures: [{ kind: 'loop_waiver', route: route.id, detail: `loopWaiver.expiry "${waiver.expiry}" is not a valid date (use ISO YYYY-MM-DD)` }],
    }
  }
  if (expiry.getTime() < now.getTime()) {
    return {
      active: false,
      failures: [{ kind: 'loop_waiver', route: route.id, detail: `loopWaiver expired on ${waiver.expiry} - wire the route into a platform-loop surface or re-justify, do not extend silently` }],
    }
  }
  return { active: true, failures: [] }
}

export function detectLoopIslands(routes, loopRegistry, now = new Date()) {
  const surfaceModules = new Map(
    (loopRegistry?.surfaces ?? []).map((surface) => [surface.id, new Set(surface.modules ?? [])]),
  )
  const failures = []
  for (const route of routes ?? []) {
    if (typeof route?.id !== 'string' || typeof route?.moduleId !== 'string') continue
    const mods = surfaceModules.get(route.surface)
    // Unknown surface is reported by the main schema pass; don't double-report.
    if (!mods) continue
    if (mods.has(route.moduleId)) continue
    const waiver = validateLoopWaiver(route, now)
    failures.push(...waiver.failures)
    if (waiver.active) continue
    failures.push({
      kind: 'loop_island',
      route: route.id,
      detail: `moduleId ${route.moduleId} is not in platform-loop surface "${route.surface}" modules - route is an island outside the closed loop`,
    })
  }
  return failures
}

function main() {
  const json = process.argv.includes('--json')
  const registry = parseJson('docs/platform-loops/navbar-smoke-registry.json')
  if (GENERATED_WARROOM_CE && Array.isArray(registry.routes)) {
    registry.routes = registry.routes.filter((route) => route.moduleId !== 'enterprise_control_plane')
  }
  const loopRegistry = parseJson('docs/platform-loops/platform-loop-registry.json')
  if (GENERATED_WARROOM_CE && Array.isArray(loopRegistry.surfaces)) {
    loopRegistry.surfaces = loopRegistry.surfaces.filter((surface) => surface.id !== 'enterprise_control')
  }
  const surfaceIds = new Set(loopRegistry.surfaces.map((surface) => surface.id))
  const visibleModules = loadVisibleModules()
  const visibleById = new Map(visibleModules.map((module) => [module.id, module]))

  const failures = []
  if (registry.schema !== 'flyto-code.navbar-smoke-registry.v1') {
    failures.push({ kind: 'schema', detail: `unsupported schema ${registry.schema ?? '<missing>'}` })
  }
  if (!Array.isArray(registry.routes) || registry.routes.length === 0) {
    failures.push({ kind: 'routes', detail: 'routes must be a non-empty array' })
  }

  const routes = Array.isArray(registry.routes) ? registry.routes : []
  const ids = new Set()
  const moduleIds = new Set()

  for (const route of routes) {
    if (typeof route.id !== 'string' || !route.id) {
      failures.push({ kind: 'route', detail: 'route id is required' })
      continue
    }
    if (ids.has(route.id)) failures.push({ kind: 'duplicate_id', route: route.id })
    ids.add(route.id)

    if (typeof route.moduleId !== 'string' || !route.moduleId) {
      failures.push({ kind: 'module_id', route: route.id, detail: 'moduleId is required' })
      continue
    }
    if (moduleIds.has(route.moduleId)) failures.push({ kind: 'duplicate_module', route: route.id, moduleId: route.moduleId })
    moduleIds.add(route.moduleId)

    const module = visibleById.get(route.moduleId)
    if (!module) {
      failures.push({ kind: 'unknown_module', route: route.id, moduleId: route.moduleId })
    }

    if (!surfaceIds.has(route.surface)) {
      failures.push({ kind: 'surface', route: route.id, detail: `unknown surface ${route.surface ?? '<missing>'}` })
    }
    if (typeof route.label !== 'string' || !route.label) {
      failures.push({ kind: 'label', route: route.id, detail: 'label is required' })
    }
    if (typeof route.pathTemplate !== 'string' || !route.pathTemplate.includes('{orgId}')) {
      failures.push({ kind: 'path_template', route: route.id, detail: 'pathTemplate must include {orgId}' })
    } else if (module) {
      const smokePath = routePath(route.pathTemplate)
      if (smokePath !== module.navPath) {
        failures.push({
          kind: 'path_mismatch',
          route: route.id,
          detail: `registry path ${smokePath ?? '<invalid>'} does not match module path ${module.navPath}`,
        })
      }
    }
    if (!['engineer', 'manager', 'both'].includes(route.mode)) {
      failures.push({ kind: 'mode', route: route.id, detail: `invalid mode ${route.mode ?? '<missing>'}` })
    }
    if (!['host', 'self', 'delegated'].includes(route.scrollPolicy)) {
      failures.push({ kind: 'scroll_policy', route: route.id, detail: `invalid scrollPolicy ${route.scrollPolicy ?? '<missing>'}` })
    }
    if (!Array.isArray(route.expectedText) || route.expectedText.some((text) => typeof text !== 'string' || !text.trim())) {
      failures.push({ kind: 'expected_text', route: route.id, detail: 'expectedText must be a non-empty string array' })
    }
  }

  for (const module of visibleModules) {
    if (!moduleIds.has(module.id)) failures.push({ kind: 'missing_navbar_route', moduleId: module.id, detail: module.path })
  }

  // Reverse check: every route must land inside its surface's platform-loop.
  failures.push(...detectLoopIslands(routes, loopRegistry, new Date()))

  const report = {
    schema: 'flyto-code.navbar-smoke-audit.v1',
    summary: {
      visible_modules: visibleModules.length,
      registry_routes: routes.length,
      fail: failures.length,
    },
    failures,
  }

  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } else {
    console.log(`navbar smoke registry: ${failures.length === 0 ? 'PASS' : 'FAIL'}`)
    console.log(`visible modules: ${visibleModules.length}`)
    console.log(`registry routes: ${routes.length}`)
    for (const failure of failures.slice(0, 80)) {
      console.log(`  ${failure.kind}: ${failure.route ?? failure.moduleId ?? failure.detail} ${failure.detail ?? ''}`.trim())
    }
  }

  if (failures.length > 0) process.exitCode = 1
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href
if (isMain) main()
