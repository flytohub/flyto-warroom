#!/usr/bin/env node
/**
 * Flyto visual-system guard.
 *
 * This is not a screenshot/aesthetic oracle. It is a deterministic drift
 * budget for the concrete causes of Flyto Code's inconsistent look: direct
 * MUI Paper/Card surfaces in product views, local hex palettes, ad-hoc
 * gradients, oversized radii, and raw sx sprawl. The budgets are intentionally
 * based on the current legacy surface area and should only move downward.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src-next')
const REPORT_DIR = path.join(ROOT, 'reports')
const BASELINE_PATH = path.join(ROOT, 'scripts', 'visual-system-baseline.json')
const requireZero = process.argv.includes('--zero')
const TARGET_DIRS = [
  path.join(SRC, 'app', '(control-panel)', 'flyto', 'workspace', 'components', 'pages'),
  path.join(SRC, 'components', 'compounds'),
]

const TINY_FONT_TARGET_DIRS = [
  path.join(SRC, 'app'),
  path.join(SRC, 'components'),
]

const REQUIRED_PRIMITIVES = [
  'src-next/components/atoms/FlytoSurface.tsx',
  'src-next/components/atoms/FlytoPageHeader.tsx',
  'src-next/components/atoms/PageShell.tsx',
  'src-next/components/atoms/TabBar.tsx',
  'src-next/components/compounds/_shared/KpiCard.tsx',
  'src-next/components/compounds/_shared/DataTable.tsx',
  'src-next/styles/designTokens.ts',
  'src-next/styles/visualSystem.ts',
  'src-next/components/atoms/FlytoMetric.tsx',
  'src-next/components/atoms/FlytoCodeBlock.tsx',
]

const REQUIRED_VISUAL_SYSTEM_CONSUMERS = [
  'src-next/components/atoms/FlytoSurface.tsx',
  'src-next/components/atoms/FlytoMetric.tsx',
  'src-next/components/atoms/FlytoPageHeader.tsx',
  'src-next/components/atoms/PageShell.tsx',
  'src-next/components/atoms/TabBar.tsx',
  'src-next/components/compounds/_shared/KpiCard.tsx',
  'src-next/components/compounds/_shared/DataTable.tsx',
  'src-next/components/atoms/FlytoCodeBlock.tsx',
]

const TOTAL_BUDGETS = {
  rawSx: 6717,
  inlineHex: 2261,
  gradient: 85,
  muiPaper: 372,
  muiCard: 4,
  tailwindClass: 900,
  largeRadius: 153,
  rawFontSize: 1839,
  rawFontWeight: 1320,
  rawFontFamily: 286,
  rawLineHeight: 284,
  rawSpacingPx: 32,
  rawRadius: 945,
  tinyFontSize: 0,
}

const FILE_BUDGETS = {
  rawSx: 200,
  inlineHex: 90,
  gradient: 10,
  muiPaper: 45,
  muiCard: 4,
  tailwindClass: 60,
  largeRadius: 40,
  rawFontSize: 90,
  rawFontWeight: 45,
  rawFontFamily: 50,
  rawLineHeight: 25,
  rawSpacingPx: 10,
  rawRadius: 65,
}

const PAGE_WRAPPER_ALLOWLIST = new Set([
  'ArchitecturePage.tsx',
  'CodeScansPage.tsx',
])

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join('/')
}

function read(file) {
  return fs.readFileSync(file, 'utf8')
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules' || entry.name === 'dist') continue
      walk(abs, out)
    } else if (/\.(tsx|ts)$/.test(entry.name) && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.test.tsx')) {
      out.push(abs)
    }
  }
  return out
}

function walkUi(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (
        entry.name === '__tests__' ||
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === 'tiptap'
      ) continue
      walkUi(abs, out)
    } else if (/\.(tsx|ts)$/.test(entry.name) && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.test.tsx')) {
      out.push(abs)
    }
  }
  return out
}

const TINY_FONT_RE =
  /\b(?:fontSize\s*(?::\s*(?:(?:9|10(?:\.5)?|11(?:\.5)?)(?!\d)|['"]0\.(?:[0-6]\d*|7[0-4]\d*)rem['"])|=\{(?:9|10(?:\.5)?|11(?:\.5)?)\}|=\s*['"](?:(?:9|10(?:\.5)?|11(?:\.5)?)|0\.(?:[0-6]\d*|7[0-4]\d*)rem)['"])|font-size:\s*(?:(?:9|10(?:\.5)?|11(?:\.5)?)px|0\.(?:[0-6]\d*|7[0-4]\d*)rem))/g

function count(re, text) {
  return [...text.matchAll(re)].length
}

function fileMetrics(file) {
  const text = read(file)
  return {
    file: rel(file),
    lines: text.split(/\r?\n/).length,
    pageShell: count(/\bPageShell\b/g, text),
    flytoHeader: count(/\bFlytoPageHeader\b/g, text),
    flytoSurface: count(/\bFlytoSurface\b/g, text),
    managerDashboard: count(/\bManagerDashboard\b/g, text),
    modeView: count(/\bModeView\b/g, text),
    rawSx: count(/\bsx\s*=\s*\{/g, text),
    inlineHex: count(/#[0-9a-fA-F]{3,8}\b/g, text),
    gradient: count(/\blinear-gradient\s*\(/g, text),
    muiPaper: count(/<\s*Paper\b/g, text),
    muiCard: count(/<\s*Card\b/g, text),
    tailwindClass: count(/\bclassName\s*=/g, text),
    largeRadius: count(/\bborderRadius\s*:\s*(?:2\.[1-9]|[3-9]|\d{2,})/g, text),
    rawFontSize: count(/\bfontSize\s*:/g, text),
    rawFontWeight: count(/\bfontWeight\s*:/g, text),
    rawFontFamily: count(/\bfontFamily\s*:/g, text),
    rawLineHeight: count(/\blineHeight\s*:/g, text),
    rawSpacingPx: count(/\b(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap)\s*:\s*['"]?\d+(?:\.\d+)?px\b/g, text),
    rawRadius: count(/\bborderRadius\s*:/g, text),
  }
}

function addTotals(totals, metrics) {
  for (const [key, value] of Object.entries(metrics)) {
    if (typeof value === 'number') totals[key] = (totals[key] ?? 0) + value
  }
}

function top(files, key, limit = 12) {
  return files
    .filter((item) => item[key] > 0)
    .sort((a, b) => b[key] - a[key] || a.file.localeCompare(b.file))
    .slice(0, limit)
    .map((item) => ({ file: item.file, count: item[key] }))
}

function markdown(report) {
  const lines = [
    '# Visual System Audit',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Files scanned: ${report.totals.files}`,
    `- Status: ${report.ok ? 'PASS' : 'FAIL'}`,
    '',
    '## Totals',
    '',
    '| Metric | Count | Budget |',
    '|---|---:|---:|',
  ]
  for (const [metric, budget] of Object.entries(TOTAL_BUDGETS)) {
    lines.push(`| ${metric} | ${report.totals[metric] ?? 0} | ${budget} |`)
  }
  lines.push('', '## Top Offenders')
  for (const [metric, rows] of Object.entries(report.topOffenders)) {
    lines.push('', `### ${metric}`, '')
    for (const row of rows) lines.push(`- ${row.count} ${row.file}`)
  }
  if (report.violations.length) {
    lines.push('', '## Violations', '')
    for (const violation of report.violations) lines.push(`- ${violation.file}: ${violation.reason}`)
  }
  lines.push('')
  return lines.join('\n')
}

const files = TARGET_DIRS.flatMap((dir) => walk(dir)).sort()
const metrics = files.map(fileMetrics)
const totals = { files: metrics.length }
for (const item of metrics) addTotals(totals, item)

const violations = []
const tinyFontFindings = []

for (const file of TINY_FONT_TARGET_DIRS.flatMap((dir) => walkUi(dir))) {
  const text = read(file)
  for (const match of text.matchAll(TINY_FONT_RE)) {
    const line = text.slice(0, match.index).split(/\r?\n/).length
    tinyFontFindings.push({
      file: `${rel(file)}:${line}`,
      reason: 'fontSize below 12px floor; use 12px minimum for chip, metadata, code, and caption text',
    })
  }
}

totals.tinyFontSize = tinyFontFindings.length

for (const primitive of REQUIRED_PRIMITIVES) {
  if (!fs.existsSync(path.join(ROOT, primitive))) {
    violations.push({ file: primitive, reason: 'required visual primitive is missing' })
  }
}

for (const consumer of REQUIRED_VISUAL_SYSTEM_CONSUMERS) {
  const abs = path.join(ROOT, consumer)
  if (!fs.existsSync(abs)) continue
  if (!read(abs).includes('@/styles/visualSystem')) {
    violations.push({ file: consumer, reason: 'core visual primitive must consume centralized visualSystem tokens' })
  }
}

for (const [metric, budget] of Object.entries(TOTAL_BUDGETS)) {
  if ((totals[metric] ?? 0) > budget) {
    violations.push({
      file: 'visual-system',
      reason: `${metric} total ${totals[metric]} exceeds budget ${budget}`,
    })
  }
}

for (const item of metrics) {
  for (const [metric, budget] of Object.entries(FILE_BUDGETS)) {
    if ((item[metric] ?? 0) > budget) {
      violations.push({
        file: item.file,
        reason: `${metric} count ${item[metric]} exceeds per-file budget ${budget}`,
      })
    }
  }
}

for (const item of metrics.filter((entry) => entry.file.includes('/workspace/components/pages/'))) {
  const name = path.basename(item.file)
  if (!name.endsWith('Page.tsx')) continue
  const hasWrapper = item.pageShell > 0 || PAGE_WRAPPER_ALLOWLIST.has(name)
  if (!hasWrapper) {
    violations.push({
      file: item.file,
      reason: 'workspace page must use PageShell or an approved PageShell-backed war-room wrapper',
    })
  }
}

violations.push(...tinyFontFindings)

const report = {
  schema: 'flyto-code.visual-system-audit.v1',
  generatedAt: new Date().toISOString(),
  ok: violations.length === 0,
  zeroOk: violations.length === 0,
  totals,
  budgets: {
    totals: TOTAL_BUDGETS,
    perFile: FILE_BUDGETS,
  },
  topOffenders: {
    rawSx: top(metrics, 'rawSx'),
    inlineHex: top(metrics, 'inlineHex'),
    gradient: top(metrics, 'gradient'),
    muiPaper: top(metrics, 'muiPaper'),
    tailwindClass: top(metrics, 'tailwindClass'),
    largeRadius: top(metrics, 'largeRadius'),
    rawFontSize: top(metrics, 'rawFontSize'),
    rawFontWeight: top(metrics, 'rawFontWeight'),
    rawFontFamily: top(metrics, 'rawFontFamily'),
    rawLineHeight: top(metrics, 'rawLineHeight'),
    rawSpacingPx: top(metrics, 'rawSpacingPx'),
    rawRadius: top(metrics, 'rawRadius'),
  },
  violations,
}

const baseline = requireZero ? null : readBaseline()
const baselineRegressions = baseline
  ? visualBaselineRegressions(baseline, metrics, totals, tinyFontFindings, violations)
  : []
if (baseline) {
  report.baseline = {
    path: rel(BASELINE_PATH),
    ok: baselineRegressions.length === 0,
    regressions: baselineRegressions,
  }
  report.ok = report.zeroOk || baselineRegressions.length === 0
}

fs.mkdirSync(REPORT_DIR, { recursive: true })
fs.writeFileSync(path.join(REPORT_DIR, 'visual-system-audit.json'), `${JSON.stringify(report, null, 2)}\n`)
fs.writeFileSync(path.join(REPORT_DIR, 'visual-system-audit.md'), markdown(report))

if (!report.ok) {
  console.error(JSON.stringify(report, null, 2))
  process.exit(1)
}

if (report.zeroOk) {
  console.log('visual system audit: PASS')
} else {
  console.log(`visual system audit: PASS with legacy baseline (${baselineRegressions.length} regression(s), ${violations.length} zero-mode violation(s) tracked)`)
}

function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null
  const baseline = JSON.parse(read(BASELINE_PATH))
  if (baseline.schema !== 'flyto-code.visual-system-baseline.v1') {
    throw new Error(`invalid visual-system baseline schema in ${rel(BASELINE_PATH)}`)
  }
  return baseline
}

function isLegacyBudgetViolation(violation) {
  return (
    violation.file === 'visual-system' ||
    /count \d+ exceeds per-file budget/.test(violation.reason) ||
    /fontSize below 12px floor/.test(violation.reason)
  )
}

function countTinyFontsByFile(findings) {
  const counts = {}
  for (const finding of findings) {
    const file = String(finding.file).replace(/:\d+$/, '')
    counts[file] = (counts[file] ?? 0) + 1
  }
  return counts
}

function visualBaselineRegressions(baseline, currentMetrics, currentTotals, currentTinyFonts, currentViolations) {
  const regressions = []
  const baselineTotals = baseline.totals ?? {}
  const baselineFiles = baseline.files ?? {}
  const baselineTiny = baseline.tinyFontByFile ?? {}
  const currentTiny = countTinyFontsByFile(currentTinyFonts)

  for (const violation of currentViolations) {
    if (!isLegacyBudgetViolation(violation)) regressions.push(violation)
  }

  for (const metric of Object.keys(TOTAL_BUDGETS)) {
    const allowed = Number(baselineTotals[metric] ?? TOTAL_BUDGETS[metric] ?? 0)
    const actual = Number(currentTotals[metric] ?? 0)
    if (actual > allowed) {
      regressions.push({ file: 'visual-system', reason: `${metric} total ${actual} exceeds legacy baseline ${allowed}` })
    }
  }

  for (const item of currentMetrics) {
    const previous = baselineFiles[item.file]
    for (const metric of Object.keys(FILE_BUDGETS)) {
      const actual = Number(item[metric] ?? 0)
      const allowed = previous ? Number(previous[metric] ?? 0) : Number(FILE_BUDGETS[metric] ?? 0)
      if (actual > allowed) {
        regressions.push({ file: item.file, reason: `${metric} count ${actual} exceeds legacy baseline ${allowed}` })
      }
    }
  }

  for (const [file, actual] of Object.entries(currentTiny)) {
    const allowed = Number(baselineTiny[file] ?? 0)
    if (actual > allowed) {
      regressions.push({ file, reason: `tiny font count ${actual} exceeds legacy baseline ${allowed}` })
    }
  }

  return regressions
}
