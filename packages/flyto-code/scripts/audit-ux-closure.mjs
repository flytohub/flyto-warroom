#!/usr/bin/env node
/**
 * Product UX closure guard.
 *
 * This is a deterministic product-quality gate for the enterprise cockpit:
 * typography must not rely on squeezed tracking, fixed-format workspace pages
 * must use the shared scroll shell, every product pillar must stay modelled as
 * a first-class surface, and live cloud/container/runtime loops must remain
 * backed by machine-checkable recipes.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src-next')
const WORKSPACE_PAGES = path.join(
  SRC,
  'app',
  '(control-panel)',
  'flyto',
  'workspace',
  'components',
  'pages',
)
const LOOP_REGISTRY = path.join(ROOT, 'docs', 'platform-loops', 'platform-loop-registry.json')
const MODULE_MATRIX = path.join(ROOT, 'docs', 'platform-loops', 'flyto2-module-matrix.json')
const SURFACES_FILE = path.join(SRC, 'lib', 'surfaces.ts')
const ASSET_MAP_FILE = path.join(SRC, 'components', 'compounds', 'asset-map', 'AssetMapView.tsx')
const PACKAGE_FILE = path.join(ROOT, 'package.json')
const BRANCH_GUARD_FILE = path.join(ROOT, 'scripts', 'ai-branch-guard.mjs')

const CORE_PILLARS = ['external', 'code', 'container', 'cloud', 'runtime']
const REQUIRED_RECIPES = [
  'footprint-full-loop.yaml',
  'containers-vuln-loop.yaml',
  'cloud-container-vm-live-loop.yaml',
  'runtime-mcp-policy-simulate.yaml',
  'ctem-finding-loop.yaml',
  'darkweb-sensor-brand-loop.yaml',
  'compliance-export.yaml',
]
const WARROOM_SECTION_WRAPPERS = new Set(['ArchitecturePage.tsx', 'CodeScansPage.tsx'])
const TEXT_EXTENSIONS = new Set(['.css', '.scss', '.ts', '.tsx'])

const violations = []

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join('/')
}

function read(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch (err) {
    violations.push({ file: rel(file), reason: `unreadable: ${err.message}` })
    return ''
  }
}

function readJson(file) {
  const text = read(file)
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch (err) {
    violations.push({ file: rel(file), reason: `invalid JSON: ${err.message}` })
    return null
  }
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'vendor' || entry.name === 'dist') continue
      walk(abs, out)
    } else if (TEXT_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(abs)
    }
  }
  return out
}

function lineNumber(text, index) {
  return text.slice(0, index).split(/\r?\n/).length
}

function scanTextQuality() {
  const patterns = [
    {
      name: 'negative letter spacing',
      re: /\bletter-spacing\s*:\s*-\d|\bletterSpacing\s*:\s*['"`]-\d/g,
      reason: 'letter spacing must be 0 or positive so dense enterprise UI does not squeeze text',
    },
    {
      name: 'viewport-scaled font size',
      re: /\bfont-size\s*:\s*[^;]*\b\d+(?:\.\d+)?vw\b|\bfontSize\s*:\s*['"`]?\d+(?:\.\d+)?vw\b/g,
      reason: 'font size must not scale with viewport width; use responsive fixed sizes or theme variants',
    },
  ]

  for (const file of walk(SRC)) {
    const text = read(file)
    for (const pattern of patterns) {
      pattern.re.lastIndex = 0
      for (const match of text.matchAll(pattern.re)) {
        violations.push({
          file: `${rel(file)}:${lineNumber(text, match.index ?? 0)}`,
          reason: `${pattern.name}: ${pattern.reason}`,
        })
      }
    }
  }
}

function scanWorkspacePages() {
  if (!fs.existsSync(WORKSPACE_PAGES)) {
    violations.push({ file: rel(WORKSPACE_PAGES), reason: 'workspace page directory is missing' })
    return
  }
  for (const name of fs.readdirSync(WORKSPACE_PAGES).sort()) {
    if (!name.endsWith('Page.tsx')) continue
    const file = path.join(WORKSPACE_PAGES, name)
    const text = read(file)
    const ok =
      text.includes('PageShell') ||
      (WARROOM_SECTION_WRAPPERS.has(name) && text.includes('<WarRoomSectionPage'))
    if (!ok) {
      violations.push({
        file: rel(file),
        reason: 'workspace page must render through PageShell or an approved PageShell-backed host wrapper',
      })
    }
  }
}

function scanSurfaces() {
  const surfacesText = read(SURFACES_FILE)
  for (const id of CORE_PILLARS) {
    if (!new RegExp(`${id}:\\s*\\{[^}]*pillar:\\s*true`, 's').test(surfacesText)) {
      violations.push({ file: rel(SURFACES_FILE), reason: `missing first-class pillar surface ${id}` })
    }
  }
  for (const token of ["'vm'", "'workload'", "'kubernetes_workload'", "'container_image'"]) {
    if (!read(ASSET_MAP_FILE).includes(token)) {
      violations.push({ file: rel(ASSET_MAP_FILE), reason: `asset map must color-key live runtime/container asset type ${token}` })
    }
  }
}

function scanLoopRecipes() {
  const registry = readJson(LOOP_REGISTRY)
  if (!registry?.surfaces) return
  const allRecipes = new Set(registry.surfaces.flatMap((surface) => surface.recipes ?? []))
  for (const recipe of REQUIRED_RECIPES) {
    if (!allRecipes.has(recipe)) {
      violations.push({ file: rel(LOOP_REGISTRY), reason: `platform loop registry must include ${recipe}` })
    }
    const recipeFile = path.join(ROOT, 'docs', 'platform-loops', 'recipes', recipe)
    if (!fs.existsSync(recipeFile)) {
      violations.push({ file: rel(recipeFile), reason: 'required platform loop recipe is missing' })
    }
  }

  const runtime = registry.surfaces.find((surface) => surface.id === 'runtime_cloud_identity')
  if (!runtime?.recipes?.includes('cloud-container-vm-live-loop.yaml')) {
    violations.push({
      file: rel(LOOP_REGISTRY),
      reason: 'runtime/cloud/identity surface must carry the cloud-container-vm live loop recipe',
    })
  }
}

function scanModuleMatrix() {
  const matrix = readJson(MODULE_MATRIX)
  const cloud = matrix?.domains?.find((domain) => domain.id === 'cloud_container_identity')
  if (!cloud) {
    violations.push({ file: rel(MODULE_MATRIX), reason: 'missing cloud_container_identity domain' })
    return
  }
  for (const feature of ['VM inventory', 'VM posture', 'live connector scan', 'project-scoped source separation']) {
    if (!cloud.userVisibleFeatures?.includes(feature)) {
      violations.push({ file: rel(MODULE_MATRIX), domain: cloud.id, reason: `missing UX-visible feature ${feature}` })
    }
  }
  if (!cloud.independentTests?.some((item) => String(item).includes('audit:ui-interactions'))) {
    violations.push({ file: rel(MODULE_MATRIX), domain: cloud.id, reason: 'cloud/container/identity must declare a UI interaction test' })
  }
}

function scanGuardWiring() {
  const pkg = readJson(PACKAGE_FILE)
  if (pkg?.scripts?.['audit:ux-closure'] !== 'node scripts/audit-ux-closure.mjs') {
    violations.push({ file: rel(PACKAGE_FILE), reason: 'missing audit:ux-closure package script' })
  }
  if (!read(BRANCH_GUARD_FILE).includes('audit:ux-closure')) {
    violations.push({ file: rel(BRANCH_GUARD_FILE), reason: 'branch guard must include audit:ux-closure' })
  }
}

scanTextQuality()
scanWorkspacePages()
scanSurfaces()
scanLoopRecipes()
scanModuleMatrix()
scanGuardWiring()

if (violations.length) {
  console.error(JSON.stringify({ schema: 'flyto-code.ux-closure-audit.v1', ok: false, violations }, null, 2))
  process.exit(1)
}

console.log('ux closure audit: PASS (typography, PageShell, surfaces, recipes, module-matrix UX, guard wiring)')
