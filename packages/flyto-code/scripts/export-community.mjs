#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WORKSPACE = path.resolve(ROOT, '..')
const MANIFEST_PATH = path.join(ROOT, 'docs', 'open-core', 'community-export.manifest.json')

const args = new Set(process.argv.slice(2))
const checkOnly = args.has('--check')
const distArg = valueAfter('--dist-dir') || 'dist/community'
const distRoot = path.resolve(ROOT, distArg)

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
const violations = []

validateManifest()

if (violations.length) {
  console.error(JSON.stringify({ schema: 'flyto-community-export.audit.v1', violations }, null, 2))
  process.exit(1)
}

if (!checkOnly) {
  await buildExport()
}

console.log(JSON.stringify({
  ok: true,
  mode: checkOnly ? 'check' : 'export',
  includePaths: manifest.includePaths.length,
  dist: checkOnly ? null : distRoot,
}, null, 2))

function validateManifest() {
  if (manifest.schema !== 'flyto-community-export/v1') {
    violations.push({ file: rel(MANIFEST_PATH), reason: 'manifest schema must be flyto-community-export/v1' })
  }
  if (manifest.license !== 'Apache-2.0') {
    violations.push({ file: rel(MANIFEST_PATH), reason: 'Community export license must be Apache-2.0' })
  }
  for (const includePath of manifest.includePaths || []) {
    const abs = path.join(WORKSPACE, includePath)
    if (!fs.existsSync(abs)) {
      violations.push({ file: includePath, reason: 'included path does not exist' })
      continue
    }
    assertAllowedPath(includePath)
    if (fs.statSync(abs).isDirectory()) {
      for (const file of walk(abs)) {
        assertAllowedPath(rel(file))
      }
    }
  }
  for (const required of manifest.requiredDocs || []) {
    if (!required || /[\\/]/.test(required)) {
      violations.push({ file: rel(MANIFEST_PATH), reason: `required doc must be a root filename: ${required}` })
    }
  }
}

function assertAllowedPath(repoRelativePath) {
  const normal = repoRelativePath.split(path.sep).join('/')
  for (const fragment of manifest.excludePathFragments || []) {
    if (normal.includes(fragment)) {
      violations.push({ file: normal, reason: `Community export path matches excluded fragment ${fragment}` })
    }
  }
}

async function buildExport() {
  await safeClean(distRoot)
  for (const includePath of manifest.includePaths) {
    const src = path.join(WORKSPACE, includePath)
    const dest = path.join(distRoot, includePath)
    await mkdir(path.dirname(dest), { recursive: true })
    await cp(src, dest, { recursive: true })
  }
  await writeFile(path.join(distRoot, 'COMMUNITY_EXPORT.json'), JSON.stringify({
    schema: manifest.schema,
    license: manifest.license,
    generatedAt: new Date().toISOString(),
    sourceWorkspace: WORKSPACE,
    includePaths: manifest.includePaths,
    excludedFragments: manifest.excludePathFragments,
  }, null, 2))
  await writeFile(path.join(distRoot, 'SBOM.placeholder.json'), JSON.stringify({
    schema: 'flyto-community-sbom-placeholder/v1',
    note: 'Generate the release SBOM in CI before publishing the Community artifact.',
  }, null, 2))
  await writeFile(path.join(distRoot, 'SECURITY.md'), [
    '# Security Policy',
    '',
    'Report vulnerabilities privately to the Flyto maintainers. Do not publish exploit details before coordinated disclosure.',
    '',
  ].join('\n'))
}

async function safeClean(targetPath) {
  const fullTarget = path.resolve(targetPath)
  const relToRoot = path.relative(ROOT, fullTarget)
  if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot) || relToRoot === '') {
    throw new Error(`refusing to clean outside flyto-code root: ${fullTarget}`)
  }
  await rm(fullTarget, { recursive: true, force: true })
  await mkdir(fullTarget, { recursive: true })
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'out') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

function valueAfter(flag) {
  const idx = process.argv.indexOf(flag)
  if (idx < 0) return ''
  return process.argv[idx + 1] || ''
}

function rel(file) {
  return path.relative(WORKSPACE, file).split(path.sep).join('/')
}
