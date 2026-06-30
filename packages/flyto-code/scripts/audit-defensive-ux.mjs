#!/usr/bin/env node
/**
 * Flyto defensive UX guard.
 *
 * This checks the surfaces that were manually audited for async-state drift:
 * settings/admin tabs, scanning views, MCP admin widgets, Agent Firewall,
 * product verification, pentest, exposure, reports, repo detail, and
 * threat-intel surfaces. Query failures should flow through QueryError,
 * blocking loads through LoadingState, empty states through EmptyStateGuide,
 * and mutation/form failures through InlineErrorNotice.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src-next')
const REPORT_DIR = path.join(ROOT, 'reports')

const TARGET_DIRS = [
  path.join(SRC, 'components', 'compounds', 'settings'),
  path.join(SRC, 'components', 'compounds', 'scanning'),
  path.join(SRC, 'components', 'compounds', 'mcp'),
  path.join(SRC, 'components', 'compounds', 'surface', 'mcp'),
  path.join(SRC, 'components', 'compounds', 'product-verification'),
  path.join(SRC, 'components', 'compounds', 'pentest'),
  path.join(SRC, 'components', 'compounds', 'exposure'),
  path.join(SRC, 'components', 'compounds', 'reports'),
  path.join(SRC, 'components', 'compounds', 'repos'),
  path.join(SRC, 'components', 'compounds', 'threat-intel'),
]

const REQUIRED_PRIMITIVES = [
  'src-next/components/atoms/QueryError.tsx',
  'src-next/components/atoms/LoadingState.tsx',
  'src-next/components/atoms/EmptyStateGuide.tsx',
  'src-next/components/atoms/InlineErrorNotice.tsx',
  'src-next/components/atoms/DataBoundary.tsx',
  'src-next/components/atoms/WorkspaceRouteFallback.tsx',
]

const REQUIRED_CONSUMER_RE = {
  QueryError: /\bQueryError\b/g,
  LoadingState: /\bLoadingState\b/g,
  EmptyStateGuide: /\bEmptyStateGuide\b/g,
  InlineErrorNotice: /\bInlineErrorNotice\b/g,
}

const PATTERNS = {
  errorAlert: /<Alert\b[^>]*severity=(?:"error"|'error'|\{['"]error['"]\})/g,
  loadingTypography: /(?:common\.loading|Loading\u2026|Loading\.\.\.).{0,120}<\/Typography>/gs,
  centeredCircularProgress: /<Box\b(?:(?!<\/Box>)[\s\S])*(?:justifyContent:\s*['"]center['"]|placeItems:\s*['"]center['"])(?:(?!<\/Box>)[\s\S])*<CircularProgress\b(?:(?!<\/Box>)[\s\S])*<\/Box>/g,
  rawStringErrorAlert: /<Alert\b[^>]*>[\s\S]{0,120}String\([^)]*error[^)]*\)/g,
  errorTypography: /<Typography\b[^>]*color=(?:"error"|'error'|\{['"]error['"]\})/g,
  conditionalErrorTypography: /<Typography\b[^>]*color=\{[^}]*['"]error['"][^}]*\}/g,
}

const ALLOW = [
  {
    file: 'src-next/components/compounds/surface/mcp/McpPolicyView.tsx',
    pattern: /<CircularProgress\b/g,
    reason: 'button-level pending indicator; blocking loads use LoadingState',
  },
  {
    file: 'src-next/components/compounds/scanning/PostureHeader.tsx',
    pattern: /<CircularProgress\b/g,
    reason: 'small inline posture refresh indicator',
  },
]

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

function lineFor(text, index) {
  return text.slice(0, index).split(/\r?\n/).length
}

function isAllowed(file, text, index) {
  const fileRel = rel(file)
  return ALLOW.some((allow) => {
    if (allow.file !== fileRel) return false
    const prefix = text.slice(0, index)
    const lineStart = prefix.lastIndexOf('\n') + 1
    const snippet = text.slice(lineStart, Math.min(text.length, index + 220))
    return allow.pattern.test(snippet)
  })
}

function scanPattern(file, text, kind, re) {
  const findings = []
  for (const match of text.matchAll(re)) {
    if (isAllowed(file, text, match.index ?? 0)) continue
    findings.push({
      kind,
      file: rel(file),
      line: lineFor(text, match.index ?? 0),
      snippet: match[0].replace(/\s+/g, ' ').slice(0, 180),
    })
  }
  return findings
}

function markdown(report) {
  const lines = [
    '# Defensive UX Audit',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Files scanned: ${report.totals.files}`,
    `- Status: ${report.ok ? 'PASS' : 'FAIL'}`,
    '',
    '## Primitive Usage',
    '',
    '| Primitive | References |',
    '|---|---:|',
  ]
  for (const [name, count] of Object.entries(report.primitiveReferences)) {
    lines.push(`| ${name} | ${count} |`)
  }
  lines.push('', '## Findings', '')
  if (report.findings.length === 0) {
    lines.push('- None')
  } else {
    for (const finding of report.findings) {
      lines.push(`- ${finding.file}:${finding.line} ${finding.kind} - ${finding.snippet}`)
    }
  }
  lines.push('')
  return lines.join('\n')
}

const files = TARGET_DIRS.flatMap((dir) => walk(dir)).sort()
const findings = []
const primitiveReferences = Object.fromEntries(Object.keys(REQUIRED_CONSUMER_RE).map((key) => [key, 0]))

for (const required of REQUIRED_PRIMITIVES) {
  if (!fs.existsSync(path.join(ROOT, required))) {
    findings.push({ kind: 'missingPrimitive', file: required, line: 1, snippet: `${required} does not exist` })
  }
}

for (const file of files) {
  const text = read(file)
  for (const [name, re] of Object.entries(REQUIRED_CONSUMER_RE)) {
    primitiveReferences[name] += [...text.matchAll(re)].length
  }
  for (const [kind, re] of Object.entries(PATTERNS)) {
    findings.push(...scanPattern(file, text, kind, re))
  }
}

for (const [name, count] of Object.entries(primitiveReferences)) {
  if (count === 0) {
    findings.push({ kind: 'missingConsumer', file: 'src-next/components/compounds', line: 1, snippet: `${name} is not used in audited surfaces` })
  }
}

const report = {
  ok: findings.length === 0,
  generatedAt: new Date().toISOString(),
  targetDirs: TARGET_DIRS.map((dir) => rel(dir)),
  totals: { files: files.length },
  primitiveReferences,
  findings,
}

fs.mkdirSync(REPORT_DIR, { recursive: true })
fs.writeFileSync(path.join(REPORT_DIR, 'defensive-ux-audit.json'), `${JSON.stringify(report, null, 2)}\n`)
fs.writeFileSync(path.join(REPORT_DIR, 'defensive-ux-audit.md'), markdown(report))

if (!report.ok) {
  console.error(`Defensive UX audit failed with ${findings.length} finding(s). See reports/defensive-ux-audit.md`)
  for (const finding of findings.slice(0, 20)) {
    console.error(`- ${finding.file}:${finding.line} ${finding.kind} ${finding.snippet}`)
  }
  process.exit(1)
}

console.log(`Defensive UX audit PASS: ${files.length} files scanned; shared error/loading/empty primitives are enforced.`)
