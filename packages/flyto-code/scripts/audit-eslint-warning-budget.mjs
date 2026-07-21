#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE_PATH = path.join(ROOT, 'scripts', 'eslint-warning-baseline.json')
const REPORT_PATH = path.join(ROOT, 'reports', 'eslint-warning-audit.json')
const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))

const run = spawnSync('npx', ['eslint', '.', '--format', 'json'], {
  cwd: ROOT,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  shell: process.platform === 'win32',
})

if (!run.stdout.trim()) {
  process.stderr.write(run.stderr)
  console.error('eslint warning audit failed: ESLint returned no JSON report')
  process.exit(run.status || 1)
}

let files
try {
  files = JSON.parse(run.stdout)
} catch (error) {
  process.stderr.write(run.stderr)
  console.error(`eslint warning audit failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

const messages = files.flatMap((file) => file.messages.map((message) => ({
  file: path.relative(ROOT, file.filePath).split(path.sep).join('/'),
  ...message,
})))
const errors = messages.filter((message) => message.severity === 2)
const warnings = messages.filter((message) => message.severity === 1)
const productWarnings = warnings.filter((message) => (
  !message.file.startsWith('src-next/@fuse/') &&
  !message.file.startsWith('src-next/components/tiptap/')
))
const byRule = Object.fromEntries(
  Object.entries(warnings.reduce((counts, warning) => {
    const rule = warning.ruleId || 'unknown'
    counts[rule] = (counts[rule] || 0) + 1
    return counts
  }, {})).sort(([left], [right]) => left.localeCompare(right)),
)

const violations = []
if (run.status !== 0 || errors.length > 0) {
  violations.push(`${errors.length} ESLint error(s) detected`)
}
if (warnings.length > baseline.warnings) {
  violations.push(`warning total ${warnings.length} exceeds baseline ${baseline.warnings}`)
}
if (productWarnings.length > baseline.product_warnings) {
  violations.push(`product warning total ${productWarnings.length} exceeds baseline ${baseline.product_warnings}`)
}
for (const [rule, count] of Object.entries(byRule)) {
  const allowed = baseline.by_rule[rule] ?? 0
  if (count > allowed) violations.push(`${rule} warnings ${count} exceed baseline ${allowed}`)
}

const report = {
  schema: 'flyto-code.eslint-warning-audit.v1',
  generated_at: new Date().toISOString(),
  ok: violations.length === 0,
  files: files.length,
  errors: errors.length,
  warnings: warnings.length,
  product_warnings: productWarnings.length,
  by_rule: byRule,
  violations,
}
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true })
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`)

if (violations.length > 0) {
  console.error(JSON.stringify(report, null, 2))
  process.exit(1)
}

console.log(`eslint warning budget: PASS (${errors.length} errors, ${warnings.length}/${baseline.warnings} warnings, ${productWarnings.length}/${baseline.product_warnings} product warnings)`)
