#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WORKSPACE = path.resolve(ROOT, '..')
const REGISTRY_FILE = path.join(ROOT, 'docs', 'platform-loops', 'workspace-closure-registry.json')
const PLATFORM_REGISTRY_FILE = path.join(ROOT, 'docs', 'platform-loops', 'platform-loop-registry.json')
const RECIPE_DIR = path.join(ROOT, 'docs', 'platform-loops', 'recipes')
const PACKAGE_FILE = path.join(ROOT, 'package.json')
const BRANCH_GUARD_FILE = path.join(ROOT, 'scripts', 'ai-branch-guard.mjs')

const violations = []

function rel(file) {
  return path.relative(WORKSPACE, file).split(path.sep).join('/')
}

function readFile(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch (error) {
    violations.push({ file: rel(file), reason: `missing or unreadable file: ${error.message}` })
    return ''
  }
}

function readJson(file) {
  const text = readFile(file)
  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch (error) {
    violations.push({ file: rel(file), reason: `invalid JSON: ${error.message}` })
    return {}
  }
}

function expectFile(file, reason) {
  if (!fs.existsSync(file)) {
    violations.push({ file: rel(file), reason })
  }
}

function expectIncludes(file, marker, reason) {
  const text = readFile(file)
  if (!text.includes(marker)) {
    violations.push({ file: rel(file), reason: `${reason}: missing ${JSON.stringify(marker)}` })
  }
}

function expectPackageScript(packageFile, scriptName, expectedCommand) {
  const pkg = readJson(packageFile)
  const command = pkg.scripts?.[scriptName]
  if (!command) {
    violations.push({ file: rel(packageFile), reason: `missing npm script ${scriptName}` })
    return
  }
  if (expectedCommand && command !== expectedCommand) {
    violations.push({
      file: rel(packageFile),
      reason: `script ${scriptName} must be ${JSON.stringify(expectedCommand)}, got ${JSON.stringify(command)}`,
    })
  }
}

function asSortedUnique(values) {
  return [...new Set(values)].sort()
}

function sameSet(left, right) {
  const a = asSortedUnique(left)
  const b = asSortedUnique(right)
  return a.length === b.length && a.every((value, index) => value === b[index])
}

const registry = readJson(REGISTRY_FILE)
const platform = readJson(PLATFORM_REGISTRY_FILE)

if (registry.schema !== 'flyto-code.workspace-closure-registry.v1') {
  violations.push({ file: rel(REGISTRY_FILE), reason: 'unexpected workspace closure registry schema' })
}

if (platform.schema !== 'flyto-code.platform-loop-registry.v1') {
  violations.push({ file: rel(PLATFORM_REGISTRY_FILE), reason: 'unexpected platform loop registry schema' })
}

const requiredSurfaces = Array.isArray(registry.requiredSurfaces) ? registry.requiredSurfaces : []
const platformSurfaces = Array.isArray(platform.surfaces) ? platform.surfaces : []
const actualSurfaceIds = platformSurfaces.map((surface) => surface.id).filter(Boolean)

if (requiredSurfaces.length !== 9) {
  violations.push({ file: rel(REGISTRY_FILE), reason: `expected exactly 9 required surfaces, got ${requiredSurfaces.length}` })
}

if (!sameSet(requiredSurfaces, actualSurfaceIds)) {
  violations.push({
    file: rel(PLATFORM_REGISTRY_FILE),
    reason: `platform surfaces must match workspace closure registry; expected ${asSortedUnique(requiredSurfaces).join(', ')}, got ${asSortedUnique(actualSurfaceIds).join(', ')}`,
  })
}

const duplicateSurfaceIds = actualSurfaceIds.filter((id, index) => actualSurfaceIds.indexOf(id) !== index)
if (duplicateSurfaceIds.length) {
  violations.push({
    file: rel(PLATFORM_REGISTRY_FILE),
    reason: `duplicate platform surface ids: ${asSortedUnique(duplicateSurfaceIds).join(', ')}`,
  })
}

for (const surface of platformSurfaces) {
  for (const field of ['modules', 'api', 'qk', 'events', 'recipes']) {
    if (!Array.isArray(surface[field]) || surface[field].length === 0) {
      violations.push({
        file: rel(PLATFORM_REGISTRY_FILE),
        reason: `surface ${surface.id ?? '<missing-id>'} must declare non-empty ${field}`,
      })
    }
  }

  for (const recipe of surface.recipes ?? []) {
    expectFile(path.join(RECIPE_DIR, recipe), `surface ${surface.id} references missing recipe ${recipe}`)
  }
}

const repos = Array.isArray(registry.repos) ? registry.repos : []
const repoIds = repos.map((repo) => repo.id).filter(Boolean)
const requiredRepos = ['flyto-engine', 'flyto-code', 'flyto-cloud', 'flyto-indexer', 'flyto-core', 'flyto-admin']
if (!sameSet(requiredRepos, repoIds)) {
  violations.push({
    file: rel(REGISTRY_FILE),
    reason: `workspace closure must cover ${requiredRepos.join(', ')}; got ${asSortedUnique(repoIds).join(', ')}`,
  })
}

for (const repo of repos) {
  if (!repo.id || !repo.path) {
    violations.push({ file: rel(REGISTRY_FILE), reason: 'each repo entry must declare id and path' })
    continue
  }

  const repoRoot = path.join(WORKSPACE, repo.path)
  expectFile(repoRoot, `missing repo root for ${repo.id}`)

  for (const requiredFile of repo.requiredFiles ?? []) {
    expectFile(path.join(repoRoot, requiredFile), `${repo.id} missing required closure file ${requiredFile}`)
  }

  for (const marker of repo.requiredText ?? []) {
    if (!marker.file || !marker.text) {
      violations.push({ file: rel(REGISTRY_FILE), reason: `${repo.id} requiredText entries must declare file and text` })
      continue
    }
    expectIncludes(
      path.join(repoRoot, marker.file),
      marker.text,
      `${repo.id} closure marker ${marker.file}`,
    )
  }

  for (const script of repo.requiredScripts ?? []) {
    if (!script.packageFile || !script.name) {
      violations.push({ file: rel(REGISTRY_FILE), reason: `${repo.id} requiredScripts entries must declare packageFile and name` })
      continue
    }
    expectPackageScript(path.join(repoRoot, script.packageFile), script.name)
  }
}

for (const guard of registry.requiredGuards ?? []) {
  if (guard.script) {
    expectPackageScript(path.join(WORKSPACE, guard.packageFile), guard.script, guard.command)
  }
  if (guard.file && guard.text) {
    expectIncludes(path.join(WORKSPACE, guard.file), guard.text, 'branch guard must include workspace closure audit')
  }
}

expectPackageScript(PACKAGE_FILE, 'audit:workspace-closure', 'node scripts/audit-workspace-closure.mjs')
expectIncludes(BRANCH_GUARD_FILE, 'audit:workspace-closure', 'branch guard must include workspace closure audit')

if (violations.length) {
  console.error(JSON.stringify({ schema: 'flyto-code.workspace-closure-audit.v1', violations }, null, 2))
  process.exit(1)
}

console.log(`workspace closure audit: PASS (${repos.length} repos, ${platformSurfaces.length} surfaces, ${platformSurfaces.flatMap((surface) => surface.recipes ?? []).length} recipes)`)
