#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST_DIR = path.join(ROOT, 'src-next', 'types', 'module-manifests')
const INDEX_FILE = path.join(MANIFEST_DIR, 'index.ts')
const SPECIAL_FILES = new Set(['boundary.ts', 'index.ts', 'packageManifest.ts'])
const EXPECTED_PRIVATE_PACKAGES = new Set(['enterprise', 'future'])

const violations = []

function read(file) {
  return fs.readFileSync(file, 'utf8')
}

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join('/')
}

function fail(file, reason) {
  violations.push({ file: rel(file), reason })
}

function scalar(source, key) {
  const match = source.match(new RegExp(`${key}:\\s*(['\"])(.*?)\\1`))
  return match?.[2]
}

function boolScalar(source, key) {
  const match = source.match(new RegExp(`${key}:\\s*(true|false)`))
  if (!match) return undefined
  return match[1] === 'true'
}

function parsePackageFile(file) {
  const source = read(file)
  const fileBase = path.basename(file, '.ts')
  const defineMatch = source.match(/defineModulePackage\(\s*(['"])(.*?)\1\s*,/)
  if (!defineMatch) {
    fail(file, 'missing defineModulePackage(package, defaults, modules) call')
    return null
  }

  const packageName = defineMatch[2]
  if (packageName !== fileBase) {
    fail(file, `package name ${packageName} does not match file ${fileBase}`)
  }

  const defaults = {
    edition: scalar(source, 'edition'),
    exportable: boolScalar(source, 'exportable'),
    mergeSurface: scalar(source, 'mergeSurface'),
    moat: scalar(source, 'moat'),
    licenseTier: scalar(source, 'licenseTier'),
  }

  for (const key of Object.keys(defaults)) {
    if (defaults[key] === undefined) {
      fail(file, `missing boundary default: ${key}`)
    }
  }
  if (defaults.mergeSurface && packageName !== 'future' && defaults.mergeSurface !== packageName) {
    fail(file, `mergeSurface ${defaults.mergeSurface} does not match package ${packageName}`)
  }

  const ids = [...source.matchAll(/\bid:\s*(['"])(.*?)\1/g)].map((match) => match[2])
  if (ids.length === 0) {
    fail(file, 'module package must declare at least one module id')
  }
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index)
  for (const id of new Set(duplicateIds)) {
    fail(file, `duplicate module id in package: ${id}`)
  }

  const exportable = defaults.exportable === true
  if (exportable) {
    if (defaults.edition !== 'ce') fail(file, `CE-exportable package has edition ${defaults.edition}`)
    if (defaults.moat !== 'none') fail(file, `CE-exportable package has moat ${defaults.moat}`)
    if (defaults.licenseTier !== 'community') fail(file, `CE-exportable package has licenseTier ${defaults.licenseTier}`)
    if (EXPECTED_PRIVATE_PACKAGES.has(packageName)) fail(file, `${packageName} cannot be CE-exportable`)
    if (/EnterpriseControlPlane|enterprise-control-plane/.test(source)) {
      fail(file, 'CE-exportable package references enterprise control plane')
    }
  } else if (!EXPECTED_PRIVATE_PACKAGES.has(packageName)) {
    fail(file, `non-exportable package ${packageName} is not an expected private package`)
  }

  return { file, packageName, ids, defaults }
}

const packageFiles = fs
  .readdirSync(MANIFEST_DIR)
  .filter((name) => name.endsWith('.ts') && !SPECIAL_FILES.has(name))
  .sort()
  .map((name) => path.join(MANIFEST_DIR, name))

const packages = packageFiles.map(parsePackageFile).filter(Boolean)
const presentPackageNames = new Set(packages.map((pkg) => pkg.packageName))
const privatePackagesExpected = [...EXPECTED_PRIVATE_PACKAGES].some((name) => presentPackageNames.has(name))
const indexSource = read(INDEX_FILE)

const orderMatch = indexSource.match(/MODULE_PACKAGE_ORDER\s*=\s*\[([\s\S]*?)\]\s+as const/)
const packageOrder = orderMatch
  ? [...orderMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1])
  : []

if (packageOrder.length === 0) {
  fail(INDEX_FILE, 'missing MODULE_PACKAGE_ORDER entries')
}

const packageNames = packages.map((pkg) => pkg.packageName)
for (const name of packageNames) {
  if (!packageOrder.includes(name)) {
    fail(INDEX_FILE, `MODULE_PACKAGE_ORDER missing package ${name}`)
  }
  const importRe = new RegExp(`from ['"]\\./${name}['"]`)
  if (!importRe.test(indexSource)) {
    fail(INDEX_FILE, `index.ts missing import for package ${name}`)
  }
}

for (const name of packageOrder) {
  if (!packageNames.includes(name)) {
    fail(INDEX_FILE, `MODULE_PACKAGE_ORDER references missing package ${name}`)
  }
}

const cePackages = packages.filter((pkg) => pkg.defaults.exportable === true)
const privatePackages = packages.filter((pkg) => pkg.defaults.exportable === false)
const allIds = packages.flatMap((pkg) => pkg.ids.map((id) => ({ id, packageName: pkg.packageName })))
const globalDuplicateIds = allIds.filter((entry, index) => allIds.findIndex((candidate) => candidate.id === entry.id) !== index)

for (const entry of new Set(globalDuplicateIds.map((item) => item.id))) {
  fail(INDEX_FILE, `duplicate module id across packages: ${entry}`)
}

if (cePackages.length < 10) {
  fail(INDEX_FILE, `CE package count too low: ${cePackages.length}`)
}
if (privatePackagesExpected) {
  for (const name of EXPECTED_PRIVATE_PACKAGES) {
    if (!presentPackageNames.has(name)) {
      fail(INDEX_FILE, `private source package missing: ${name}`)
    }
  }
  if (privatePackages.length !== EXPECTED_PRIVATE_PACKAGES.size) {
    fail(INDEX_FILE, `private package count mismatch: ${privatePackages.map((pkg) => pkg.packageName).join(', ')}`)
  }
} else if (privatePackages.length > 0) {
  fail(INDEX_FILE, `CE-pruned tree contains unexpected private packages: ${privatePackages.map((pkg) => pkg.packageName).join(', ')}`)
}

if (violations.length > 0) {
  console.error('module package boundary audit: FAIL')
  for (const violation of violations) {
    console.error(`- ${violation.file}: ${violation.reason}`)
  }
  process.exit(1)
}

console.log('module package boundary audit: PASS')
console.log(`packages: ${packages.length}`)
console.log(`ce_packages: ${cePackages.length}`)
console.log(`private_packages: ${privatePackages.map((pkg) => pkg.packageName).join(', ') || 'none'}`)
console.log(`modules: ${allIds.length}`)
