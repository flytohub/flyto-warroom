#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST_DIR = path.join(ROOT, 'src-next', 'types', 'module-manifests')
const MODULE_MAP_FILE = path.join(ROOT, 'src-next', 'modules', 'LEGACY_MODULE_MAP.json')
const SPECIAL_FILES = new Set(['boundary.ts', 'index.ts', 'packageManifest.ts'])
const PRIVATE_PACKAGES = new Set(['enterprise', 'future'])
const ALLOWED_STATUSES = new Set(['legacy-bridged', 'module-rooted', 'private-overlay', 'future-reserved'])

const violations = []

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join('/')
}

function fail(file, reason) {
  violations.push({ file: rel(file), reason })
}

function read(file) {
  return fs.readFileSync(file, 'utf8')
}

function parseBool(source, key) {
  const match = source.match(new RegExp(`${key}:\\s*(true|false)`))
  return match ? match[1] === 'true' : undefined
}

function parsePackageFile(file) {
  const source = read(file)
  const defineMatch = source.match(/defineModulePackage\(\s*(['"])(.*?)\1\s*,/)
  if (!defineMatch) {
    fail(file, 'missing defineModulePackage call')
    return null
  }
  return {
    file,
    name: defineMatch[2],
    exportable: parseBool(source, 'exportable'),
  }
}

function loadJson(file) {
  try {
    return JSON.parse(read(file))
  } catch (error) {
    fail(file, `invalid JSON: ${error.message}`)
    return {}
  }
}

const manifestPackages = fs
  .readdirSync(MANIFEST_DIR)
  .filter((name) => name.endsWith('.ts') && !SPECIAL_FILES.has(name))
  .sort()
  .map((name) => parsePackageFile(path.join(MANIFEST_DIR, name)))
  .filter(Boolean)

const map = loadJson(MODULE_MAP_FILE)
if (map.schema !== 'flyto2.frontend-physical-module-map.v1') {
  fail(MODULE_MAP_FILE, 'schema must be flyto2.frontend-physical-module-map.v1')
}
if (!Array.isArray(map.mergeThrough) || !map.mergeThrough.includes('unified-cockpit')) {
  fail(MODULE_MAP_FILE, 'mergeThrough must include unified-cockpit')
}
if (!map.packages || typeof map.packages !== 'object' || Array.isArray(map.packages)) {
  fail(MODULE_MAP_FILE, 'packages must be an object keyed by module package')
}

const mappedPackages = new Set(Object.keys(map.packages || {}))
for (const pkg of manifestPackages) {
  const entry = map.packages?.[pkg.name]
  if (!entry) {
    fail(MODULE_MAP_FILE, `missing physical module map entry for ${pkg.name}`)
    continue
  }
  if (entry.ceExportable !== pkg.exportable) {
    fail(MODULE_MAP_FILE, `${pkg.name} ceExportable=${entry.ceExportable} does not match manifest exportable=${pkg.exportable}`)
  }
  if (PRIVATE_PACKAGES.has(pkg.name) && entry.ceExportable !== false) {
    fail(MODULE_MAP_FILE, `${pkg.name} must remain non-exportable`)
  }
  if (!entry.owner || typeof entry.owner !== 'string') {
    fail(MODULE_MAP_FILE, `${pkg.name} missing owner`)
  }
  if (!ALLOWED_STATUSES.has(entry.migrationStatus)) {
    fail(MODULE_MAP_FILE, `${pkg.name} has invalid migrationStatus ${entry.migrationStatus}`)
  }
  if (!Array.isArray(entry.legacyPaths) || entry.legacyPaths.length === 0) {
    fail(MODULE_MAP_FILE, `${pkg.name} must declare at least one legacyPath or module root`)
  } else {
    for (const legacyPath of entry.legacyPaths) {
      const abs = path.join(ROOT, legacyPath)
      if (!fs.existsSync(abs)) {
        fail(MODULE_MAP_FILE, `${pkg.name} legacyPath does not exist: ${legacyPath}`)
      }
    }
  }
}

for (const name of mappedPackages) {
  if (!manifestPackages.some((pkg) => pkg.name === name)) {
    const entry = map.packages?.[name]
    if (PRIVATE_PACKAGES.has(name) && entry?.ceExportable === false) {
      continue
    }
    fail(MODULE_MAP_FILE, `map contains unknown module package ${name}`)
  }
}

if (violations.length > 0) {
  console.error('module physical boundary audit: FAIL')
  for (const violation of violations) {
    console.error(`- ${violation.file}: ${violation.reason}`)
  }
  process.exit(1)
}

console.log('module physical boundary audit: PASS')
console.log(`packages: ${manifestPackages.length}`)
console.log(`private_packages: ${[...PRIVATE_PACKAGES].join(', ')}`)
