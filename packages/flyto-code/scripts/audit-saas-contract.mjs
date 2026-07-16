#!/usr/bin/env node
/**
 * Audit the SaaS product/capability contract across flyto-code + flyto-engine.
 *
 * This guard is intentionally cross-stack: the frontend MODULES manifest,
 * platform-loop registry, report/Pulse/source gates, and backend
 * capabilities.yaml must describe the same single-product SaaS contract.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src-next')
const WORKSPACE = path.resolve(ROOT, '..')
const GENERATED_WARROOM_CE = !fs.existsSync(path.join(WORKSPACE, 'flyto-engine'))
const ENGINE_ROOT = process.env.FLYTO_ENGINE_ROOT || path.resolve(WORKSPACE, 'flyto-engine')
const CAPABILITIES_YAML = GENERATED_WARROOM_CE
  ? path.join(WORKSPACE, 'flyto-contracts', 'capabilities', 'capabilities.yaml')
  : path.join(ENGINE_ROOT, 'internal/permission/capabilities.yaml')
const MODULE_MANIFEST_DIR = path.join(SRC, 'types/module-manifests')
const SECTIONS_FILE = path.join(SRC, 'types/sections.ts')
const PULSE_FILE = path.join(SRC, 'components/compounds/pulse/PulseView.tsx')
const FOOTPRINT_SURFACE_FILE = path.join(SRC, 'lib/engine/code/footprintSurface.ts')
const LOOP_REGISTRY_FILE = path.join(ROOT, 'docs/platform-loops/platform-loop-registry.json')

const failures = []
const warnings = []

function fail(message) {
  failures.push(message)
}

function warn(message) {
  warnings.push(message)
}

function read(file) {
  if (!fs.existsSync(file)) {
    fail(`missing required file: ${path.relative(ROOT, file)}`)
    return ''
  }
  return fs.readFileSync(file, 'utf8')
}

function stripComments(src) {
  let out = ''
  let quote = ''
  let escape = false
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]
    const next = src[i + 1]
    if (quote) {
      out += ch
      if (escape) {
        escape = false
      } else if (ch === '\\') {
        escape = true
      } else if (ch === quote) {
        quote = ''
      }
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      out += ch
      continue
    }
    if (ch === '/' && next === '/') {
      out += '  '
      i += 1
      while (i + 1 < src.length && src[i + 1] !== '\n') {
        out += ' '
        i += 1
      }
      continue
    }
    if (ch === '/' && next === '*') {
      out += '  '
      i += 1
      while (i + 1 < src.length && !(src[i + 1] === '*' && src[i + 2] === '/')) {
        out += src[i + 1] === '\n' ? '\n' : ' '
        i += 1
      }
      if (i + 2 < src.length) {
        out += '  '
        i += 2
      }
      continue
    }
    out += ch
  }
  return out
}

function parseCapabilities() {
  const doc = yaml.load(read(CAPABILITIES_YAML))
  if (!doc || typeof doc !== 'object') {
    fail('capabilities.yaml did not parse to an object')
    return { pages: new Set(), features: new Set(), actions: new Set() }
  }
  const pages = new Set(Object.keys(doc.pages ?? {}))
  const features = new Set()
  const actions = new Set()

  for (const tier of Object.values(doc.tiers ?? {})) {
    for (const f of tier.features ?? []) features.add(f)
  }
  for (const plan of Object.values(doc.plans ?? {})) {
    for (const f of plan.plan_features ?? []) features.add(f)
  }
  for (const page of Object.values(doc.pages ?? {})) {
    for (const f of page.requires ?? []) features.add(f)
  }
  for (const role of Object.values(doc.roles ?? {})) {
    for (const p of role.permissions ?? []) actions.add(p)
  }

  return { pages, features, actions }
}

function findMatchingBracket(src, openIndex, openChar, closeChar) {
  let depth = 0
  let quote = ''
  let escape = false
  for (let i = openIndex; i < src.length; i += 1) {
    const ch = src[i]
    if (quote) {
      if (escape) {
        escape = false
      } else if (ch === '\\') {
        escape = true
      } else if (ch === quote) {
        quote = ''
      }
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      continue
    }
    if (ch === openChar) depth += 1
    if (ch === closeChar) {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

function objectBlocksFromArray(src, marker) {
  const start = src.indexOf(marker)
  if (start === -1) {
    fail(`could not find ${marker}`)
    return []
  }
  const equals = src.indexOf('=', start)
  const open = equals === -1 ? -1 : src.indexOf('[', equals)
  const close = findMatchingBracket(src, open, '[', ']')
  if (open === -1 || close === -1) {
    fail(`could not parse array for ${marker}`)
    return []
  }
  const body = src.slice(open + 1, close)
  const blocks = []
  let quote = ''
  let escape = false
  let depth = 0
  let blockStart = -1
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]
    if (quote) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === quote) quote = ''
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      continue
    }
    if (ch === '{') {
      if (depth === 0) blockStart = i
      depth += 1
    } else if (ch === '}') {
      depth -= 1
      if (depth === 0 && blockStart !== -1) {
        blocks.push(body.slice(blockStart, i + 1))
        blockStart = -1
      }
    }
  }
  return blocks
}

function objectBlocksFromPackageManifest(src, label) {
  const start = src.indexOf('defineModulePackage(')
  if (start === -1) return []
  const open = src.indexOf('[', start)
  const close = findMatchingBracket(src, open, '[', ']')
  if (open === -1 || close === -1) {
    fail(`${label}: could not parse defineModulePackage module array`)
    return []
  }
  return objectBlocksFromArray(`export const MODULES = ${src.slice(open, close + 1)}`, 'export const MODULES')
}

function moduleManifestFiles() {
  if (!fs.existsSync(MODULE_MANIFEST_DIR)) {
    fail(`missing required directory: ${path.relative(ROOT, MODULE_MANIFEST_DIR)}`)
    return []
  }
  return fs.readdirSync(MODULE_MANIFEST_DIR)
    .filter((file) => file.endsWith('.ts'))
    .filter((file) => !['boundary.ts', 'index.ts', 'packageManifest.ts'].includes(file))
    .sort()
    .map((file) => path.join(MODULE_MANIFEST_DIR, file))
}

function parseModules() {
  const files = moduleManifestFiles()
  const modules = []
  for (const file of files) {
    const code = stripComments(read(file))
    const label = path.relative(ROOT, file)
    for (const block of objectBlocksFromPackageManifest(code, label)) {
      const id = block.match(/\bid:\s*'([^']+)'/)?.[1]
      const capability = block.match(/\bcapability:\s*'([^']+)'/)?.[1]
      const group = block.match(/\bsidebar:\s*\{[\s\S]*?\bgroup:\s*'([^']+)'/)?.[1]
      if (!id) continue
      modules.push({
        id,
        capability,
        page: capability ?? id,
        group,
        visible: !!group && group !== 'hidden',
      })
    }
  }
  if (modules.length === 0) fail('parsed zero MODULES entries')
  return modules
}

function parseQuotedValues(code, re) {
  const out = []
  let m
  while ((m = re.exec(code))) {
    out.push(m[1] ?? m[2])
  }
  return out
}

function parsePulseSourceToPage() {
  const code = stripComments(read(PULSE_FILE))
  const start = code.indexOf('const SOURCE_TO_PAGE')
  if (start === -1) {
    fail('PulseView.tsx: SOURCE_TO_PAGE not found')
    return []
  }
  const open = code.indexOf('{', start)
  const close = findMatchingBracket(code, open, '{', '}')
  if (open === -1 || close === -1) {
    fail('PulseView.tsx: could not parse SOURCE_TO_PAGE object')
    return []
  }
  const pages = []
  for (const m of code.slice(open, close).matchAll(/['"]([^'"]+)['"]\s*:\s*['"]([^'"]+)['"]/g)) {
    pages.push(m[2])
  }
  return pages
}

function parseSectionRequirements() {
  const code = stripComments(read(SECTIONS_FILE))
  const reqs = []
  for (const m of code.matchAll(/\brequires:\s*\[([^\]]*)\]/g)) {
    reqs.push(...parseQuotedValues(m[1], /'([^']+)'|"([^"]+)"/g))
  }
  return reqs
}

function parseRequiredPages() {
  const files = [FOOTPRINT_SURFACE_FILE]
  const out = []
  for (const file of files) {
    for (const page of parseQuotedValues(stripComments(read(file)), /\brequiredPage:\s*'([^']+)'|\brequiredPage:\s*"([^"]+)"/g)) {
      out.push({ page, file })
    }
  }
  return out
}

function assertKnownPages({ pages, modules }) {
  for (const mod of modules.filter((m) => m.visible)) {
    if (!pages.has(mod.page)) {
      fail(`visible module "${mod.id}" gates on unknown backend page "${mod.page}"`)
    }
  }
  for (const { page, file } of parseRequiredPages()) {
    if (!pages.has(page)) {
      fail(`${path.relative(ROOT, file)} requiredPage "${page}" is not in backend pages`)
    }
  }
  for (const page of parsePulseSourceToPage()) {
    if (!pages.has(page)) {
      fail(`Pulse SOURCE_TO_PAGE targets unknown backend page "${page}"`)
    }
  }
}

function assertKnownFeatures({ features }) {
  for (const feature of parseSectionRequirements()) {
    if (!features.has(feature)) {
      fail(`sections.ts requires unknown backend feature "${feature}"`)
    }
  }
}

function assertLoopCoverage({ modules }) {
  const raw = read(LOOP_REGISTRY_FILE)
  let registry
  try {
    registry = JSON.parse(raw)
  } catch (err) {
    fail(`platform-loop-registry.json invalid JSON: ${err.message}`)
    return
  }
  const surfaces = (registry.surfaces ?? []).filter((surface) => !(GENERATED_WARROOM_CE && surface.id === 'enterprise_control'))
  if (surfaces.length === 0) {
    fail('platform-loop-registry.json has no surfaces')
    return
  }

  const modulesById = new Map(modules.map((m) => [m.id, m]))
  const visibleIds = new Set(modules.filter((m) => m.visible).map((m) => m.id))
  const loopOwner = new Map()

  for (const surface of surfaces) {
    for (const field of ['modules', 'api', 'qk', 'events', 'recipes']) {
      if (!Array.isArray(surface[field]) || surface[field].length === 0) {
        fail(`loop surface "${surface.id}" must declare non-empty ${field}`)
      }
    }
    for (const moduleId of surface.modules ?? []) {
      const mod = modulesById.get(moduleId)
      if (!mod) {
        fail(`loop surface "${surface.id}" references unknown module "${moduleId}"`)
        continue
      }
      if (!mod.visible) {
        fail(`loop surface "${surface.id}" references hidden module "${moduleId}"`)
      }
      if (loopOwner.has(moduleId)) {
        fail(`module "${moduleId}" is owned by multiple loop surfaces: ${loopOwner.get(moduleId)}, ${surface.id}`)
      }
      loopOwner.set(moduleId, surface.id)
    }
  }

  for (const id of visibleIds) {
    if (!loopOwner.has(id)) {
      fail(`visible module "${id}" is missing from platform-loop-registry.json`)
    }
  }
}

function assertActions({ actions }) {
  const gatedActionRe = /\b(?:action|permission)\s*=\s*['"]([^'"]+:[^'"]+)['"]|\b(?:action|permission):\s*['"]([^'"]+:[^'"]+)['"]/g
  const sourceFiles = []
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === '__test__') continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) sourceFiles.push(full)
    }
  }
  walk(SRC)
  for (const file of sourceFiles) {
    const code = stripComments(read(file))
    let m
    while ((m = gatedActionRe.exec(code))) {
      const action = m[1] ?? m[2]
      if (!actions.has(action)) {
        fail(`${path.relative(ROOT, file)} references gated action "${action}" not in backend roles`)
      }
    }
  }
}

const matrix = parseCapabilities()
const modules = parseModules()
assertKnownPages({ pages: matrix.pages, modules })
assertKnownFeatures({ features: matrix.features })
assertLoopCoverage({ modules })
assertActions({ actions: matrix.actions })

if (warnings.length > 0) {
  for (const w of warnings) console.warn(`saas-contract warning: ${w}`)
}

if (failures.length > 0) {
  console.error(`SaaS contract audit failed (${failures.length}):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}

console.log(
  `SaaS contract OK: ${matrix.pages.size} backend pages, ${matrix.features.size} features, ` +
  `${matrix.actions.size} actions, ${modules.filter((m) => m.visible).length} visible modules`,
)
