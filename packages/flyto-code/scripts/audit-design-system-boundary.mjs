#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MODULE_MAP_FILE = path.join(ROOT, 'src-next', 'modules', 'LEGACY_MODULE_MAP.json')
const REQUIRED_TOKEN_FILES = [
  'src-next/styles/designTokens.ts',
  'src-next/styles/visualSystem.ts',
  'src-next/components/atoms/PageShell.tsx',
  'src-next/components/atoms/FlytoSurface.tsx',
  'src-next/components/compounds/_shared/DataTable.tsx',
]
const REQUIRED_PRIMITIVES = new Set(['PageShell', 'FlytoSurface'])
const ALLOWED_DENSITIES = new Set(['dashboard', 'workflow', 'report', 'settings', 'graph', 'table'])

const violations = []

function fail(file, reason) {
  violations.push({ file, reason })
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    fail(path.relative(ROOT, file), `invalid JSON: ${error.message}`)
    return {}
  }
}

for (const relFile of REQUIRED_TOKEN_FILES) {
  if (!fs.existsSync(path.join(ROOT, relFile))) {
    fail(relFile, 'required design-system primitive is missing')
  }
}

const map = readJson(MODULE_MAP_FILE)
for (const [packageName, entry] of Object.entries(map.packages || {})) {
  const designSystem = entry.designSystem
  if (!designSystem || typeof designSystem !== 'object') {
    fail('src-next/modules/LEGACY_MODULE_MAP.json', `${packageName} missing designSystem contract`)
    continue
  }
  const primitives = Array.isArray(designSystem.primitives) ? new Set(designSystem.primitives) : new Set()
  for (const primitive of REQUIRED_PRIMITIVES) {
    if (!primitives.has(primitive)) {
      fail('src-next/modules/LEGACY_MODULE_MAP.json', `${packageName} designSystem missing ${primitive}`)
    }
  }
  if (designSystem.visualAudit !== 'audit:visual-system') {
    fail('src-next/modules/LEGACY_MODULE_MAP.json', `${packageName} must be covered by audit:visual-system`)
  }
  if (!ALLOWED_DENSITIES.has(entry.layoutDensity)) {
    fail('src-next/modules/LEGACY_MODULE_MAP.json', `${packageName} has invalid layoutDensity ${entry.layoutDensity}`)
  }
}

if (violations.length > 0) {
  console.error('design-system boundary audit: FAIL')
  for (const violation of violations) {
    console.error(`- ${violation.file}: ${violation.reason}`)
  }
  process.exit(1)
}

console.log('design-system boundary audit: PASS')
console.log(`packages: ${Object.keys(map.packages || {}).length}`)
