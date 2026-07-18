#!/usr/bin/env node
/**
 * Guard against common AI-generated frontend regressions.
 *
 * This is intentionally structural. It does not judge visual taste or endpoint
 * correctness; it blocks the patterns that keep turning a unified product into
 * isolated pages:
 *
 *   - view components touching transport directly
 *   - bare fetch outside approved transport modules
 *   - inline React Query keys bypassing qk
 *   - workspace pages skipping PageShell
 *   - manager views skipping the shared ManagerDashboard layout
 *
 * It also closes the obvious ways an AI patch slips transport past the simple
 * patterns above: dynamic import()/require() of the engine client, namespaced
 * fetch (window/globalThis/self), aliasing fetch into a local, XMLHttpRequest,
 * and PageShell that is imported but never actually rendered.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src-next')
const json = process.argv.includes('--json')
const selfTest = process.argv.includes('--self-test')

const VIEW_ROOTS = ['components', 'app']

// Existing legacy transport leaks. Shrink this list as files migrate into
// lib/engine fetchers + hooks. New entries should fail CI.
const VIEW_TRANSPORT_BASELINE = new Set([
  'components/compounds/_shared/BrowserLiveView.tsx',
  'components/compounds/settings/SystemEventsTab.tsx',
  'components/compounds/domains/DomainImportModal.tsx',
  'components/compounds/layout/IntegrationHealthBanner.tsx',
  'components/compounds/_shared/ScanUploadDropzone.tsx',
  'components/compounds/settings/ScanningTab.tsx',
  'components/compounds/threat-intel/ThreatIntelRefreshButton.tsx',
])

const DIRECT_FETCH_ALLOWED = new Set([
  'hooks/useOrgEvents.ts',
  'hooks/useRunnerStatus.ts',
  'lib/gitlab.ts',
  'lib/i18n.ts',
  'lib/oauth.ts',
])

const PAGE_SHELL_DELEGATES = new Set([
  'app/(control-panel)/flyto/workspace/components/pages/ArchitecturePage.tsx',
  'app/(control-panel)/flyto/workspace/components/pages/CodeScansPage.tsx',
])

const MANAGER_LAYOUT_DELEGATES = new Set([
  // Fixed workbench pages own local height and nested scroll regions; forcing
  // them into the dashboard waterfall creates double-scroll and mobile overflow.
  // Delegates must still render a height:100% + overflow:hidden shell.
  'components/compounds/asset-map/AssetMapManagerView.tsx',
  'components/compounds/attack-paths/AttackPathsManagerView.tsx',
  'components/compounds/autofix/AutofixManagerView.tsx',
  'components/compounds/domains/DomainsManagerView.tsx',
  'components/compounds/exposure/CTEMManagerView.tsx',
  'components/compounds/exposure/IssuesManagerView.tsx',
  'components/compounds/footprint/FootprintManagerView.tsx',
  'components/compounds/pentest/PentestManagerView.tsx',
  'components/compounds/repos/RepoDetailManagerView.tsx',
  'components/compounds/repos/RepoListManagerView.tsx',
  'components/compounds/scoring/PostureManagerView.tsx',
])

const TRANSPORT_PATTERNS = [
  /from\s+['"]@lib\/engine\/client['"]/,
  /\bimport\s*\(\s*['"]@lib\/engine\/client['"]\s*\)/,
  /\brequire\s*\(\s*['"]@lib\/engine\/client['"]\s*\)/,
  /\bnew\s+EventSource\s*\(/,
  /\bnew\s+WebSocket\s*\(/,
  /(^|[^.\w])fetch\s*\(/,
  /\b(?:window|globalThis|self)\.fetch\s*\(/,
  /\bnew\s+XMLHttpRequest\s*\(/,
  /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:window\.|globalThis\.|self\.)?fetch\b/,
]

const DIRECT_FETCH_PATTERNS = [
  { kind: 'bare_fetch', re: /(^|[^.\w])fetch\s*\(/g },
  { kind: 'namespaced_fetch', re: /\b(?:window|globalThis|self)\.fetch\s*\(/g },
  { kind: 'fetch_alias', re: /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:window\.|globalThis\.|self\.)?fetch\b/g },
  { kind: 'xml_http_request', re: /\bnew\s+XMLHttpRequest\s*\(/g },
]

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === '__test__') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full)
  }
  return out
}

function walkIncludingTests(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkIncludingTests(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full)
  }
  return out
}

function read(abs) {
  return fs.readFileSync(abs, 'utf8')
}

function srcRel(abs) {
  return path.relative(SRC, abs).split(path.sep).join('/')
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length
}

function stripCommentsPreserveLines(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/gm, (match, prefix) => `${prefix}${' '.repeat(match.length - prefix.length)}`)
}

function findMatches(text, re) {
  const out = []
  let m
  re.lastIndex = 0
  while ((m = re.exec(text))) out.push({ index: m.index, match: m[0] })
  return out
}

function rendersComponent(code, name) {
  return (
    new RegExp(`<${name}\\b`).test(code) ||
    new RegExp(`\\b(?:React\\.)?createElement\\(\\s*${name}\\b`).test(code)
  )
}

function rendersFixedManagerWorkbench(code) {
  return (
    /height\s*:\s*['"]100%['"]/.test(code) &&
    /overflow\s*:\s*['"]hidden['"]/.test(code)
  )
}

function selfTestFailures() {
  const cases = [
    ['dynamic import', "await import('@lib/engine/client')", true],
    ['require import', "const c = require('@lib/engine/client')", true],
    ['window fetch', 'window.fetch("/api/v1/x")', true],
    ['fetch alias', 'const f = fetch\nf("/api/v1/x")', true],
    ['xhr', 'new XMLHttpRequest()', true],
    ['rendered PageShell', 'export function P(){ return <PageShell title=\"x\" /> }', true],
    ['import-only PageShell', "import PageShell from './PageShell'\nexport function P(){ return <div /> }", false],
    ['fixed workbench', "return <Box sx={{ height: '100%', overflow: 'hidden' }} />", true],
    ['non-fixed workbench', "return <Box sx={{ minHeight: 0, overflow: 'auto' }} />", false],
  ]
  const failures = []
  for (const [name, code, expected] of cases) {
    const cleaned = stripCommentsPreserveLines(code)
    let actual
    if (name.includes('PageShell')) actual = rendersComponent(cleaned, 'PageShell')
    else if (name.includes('workbench')) actual = rendersFixedManagerWorkbench(cleaned)
    else actual = TRANSPORT_PATTERNS.some((re) => re.test(cleaned))
    if (actual !== expected) failures.push({ name, expected, actual })
  }
  return failures
}

function runSelfTest() {
  const failures = selfTestFailures()
  if (failures.length > 0) {
    console.error(JSON.stringify({ schema: 'flyto-code.ai-code-quality-self-test.v1', failures }, null, 2))
    process.exitCode = 1
    return
  }
  console.log('ai code quality self-test: PASS')
}

if (selfTest) {
  runSelfTest()
  process.exit()
}

function isDirectFetchAllowed(rel) {
  return (
    rel.startsWith('lib/engine/') ||
    rel.startsWith('lib/cloud/') ||
    DIRECT_FETCH_ALLOWED.has(rel) ||
    VIEW_TRANSPORT_BASELINE.has(rel)
  )
}

const files = walk(SRC)
const codeByFile = new Map(files.map((file) => [file, stripCommentsPreserveLines(read(file))]))

const viewTransportOffenders = new Set()
for (const root of VIEW_ROOTS) {
  const viewDir = path.join(SRC, root)
  if (!fs.existsSync(viewDir)) continue
  for (const file of files.filter((f) => f.startsWith(viewDir))) {
    const code = codeByFile.get(file)
    if (TRANSPORT_PATTERNS.some((re) => re.test(code))) {
      viewTransportOffenders.add(srcRel(file))
    }
  }
}

const newViewTransport = [...viewTransportOffenders]
  .filter((rel) => !VIEW_TRANSPORT_BASELINE.has(rel))
  .sort()
const staleViewTransportBaseline = [...VIEW_TRANSPORT_BASELINE]
  .filter((rel) => !viewTransportOffenders.has(rel))
  .sort()

const directFetchViolations = []
for (const file of files) {
  const rel = srcRel(file)
  if (isDirectFetchAllowed(rel)) continue
  const code = codeByFile.get(file)
  for (const { kind, re } of DIRECT_FETCH_PATTERNS) {
    for (const m of findMatches(code, re)) {
      directFetchViolations.push({ file: rel, line: lineOf(code, m.index), kind })
    }
  }
}

const inlineQueryKeyViolations = []
const inlineQueryKeyRe = /queryKey\s*:\s*\[/g
for (const file of files) {
  const rel = srcRel(file)
  const code = codeByFile.get(file)
  for (const m of findMatches(code, inlineQueryKeyRe)) {
    inlineQueryKeyViolations.push({ file: rel, line: lineOf(code, m.index) })
  }
}

const pageShellViolations = []
const pagesRoot = path.join(SRC, 'app/(control-panel)/flyto/workspace/components/pages')
if (fs.existsSync(pagesRoot)) {
  for (const file of walk(pagesRoot)) {
    if (!file.endsWith('Page.tsx')) continue
    const rel = srcRel(file)
    const code = codeByFile.get(file) ?? stripCommentsPreserveLines(read(file))
    if (!rendersComponent(code, 'PageShell') && !PAGE_SHELL_DELEGATES.has(rel)) {
      pageShellViolations.push({ file: rel })
    }
  }
}

const managerLayoutViolations = []
const managerViewFiles = new Set()
const compoundsRoot = path.join(SRC, 'components/compounds')
if (fs.existsSync(compoundsRoot)) {
  for (const file of walk(compoundsRoot)) {
    if (!file.endsWith('ManagerView.tsx')) continue
    const rel = srcRel(file)
    managerViewFiles.add(rel)
    const code = codeByFile.get(file) ?? stripCommentsPreserveLines(read(file))
    if (rendersComponent(code, 'ManagerDashboard')) continue
    if (MANAGER_LAYOUT_DELEGATES.has(rel) && rendersFixedManagerWorkbench(code)) continue
    managerLayoutViolations.push({
      file: rel,
      kind: MANAGER_LAYOUT_DELEGATES.has(rel)
        ? 'workbench delegate missing fixed shell'
        : 'missing ManagerDashboard or workbench delegate',
    })
  }
}
for (const rel of MANAGER_LAYOUT_DELEGATES) {
  const abs = path.join(SRC, rel)
  if (!managerViewFiles.has(rel)) {
    managerLayoutViolations.push({ file: rel, kind: 'stale workbench delegate' })
    continue
  }
  const code = codeByFile.get(abs) ?? stripCommentsPreserveLines(read(abs))
  if (!rendersFixedManagerWorkbench(code)) {
    managerLayoutViolations.push({ file: rel, kind: 'workbench delegate missing fixed shell' })
  }
}

const capabilityMockViolations = []
const capabilityMockPatterns = [
  /\b(canSeePage|canDoAction|hasFeature)\s*:\s*\([^)]*\)\s*=>\s*true\b/g,
  /\b(canSeePage|canDoAction|hasFeature)\s*:\s*vi\.fn\s*\(\s*\([^)]*\)\s*=>\s*true\b/g,
]
for (const file of walkIncludingTests(SRC)) {
  const rel = srcRel(file)
  if (!rel.includes('/__tests__/') && !/(\.test|\.spec)\.(ts|tsx)$/.test(rel)) continue
  const code = stripCommentsPreserveLines(read(file))
  for (const re of capabilityMockPatterns) {
    for (const m of findMatches(code, re)) {
      capabilityMockViolations.push({ file: rel, line: lineOf(code, m.index), kind: m.match.split(':')[0].trim() })
    }
  }
}

const frontendFailOpenWording = []
const failOpenWordingRe = /fail(?:-|[ .])?open(?:s|ed|ing)?/gi
for (const file of walkIncludingTests(SRC)) {
  const rel = srcRel(file)
  const raw = read(file)
  for (const m of findMatches(raw, failOpenWordingRe)) {
    frontendFailOpenWording.push({ file: rel, line: lineOf(raw, m.index), kind: 'fail-open wording' })
  }
}

const failures = {
  self_test: selfTestFailures(),
  new_view_transport: newViewTransport,
  stale_view_transport_baseline: staleViewTransportBaseline,
  direct_fetch: directFetchViolations,
  inline_query_keys: inlineQueryKeyViolations,
  page_shell: pageShellViolations,
  manager_layout: managerLayoutViolations,
  capability_mock: capabilityMockViolations,
  frontend_fail_open_wording: frontendFailOpenWording,
}

const failedCount = Object.values(failures).reduce((sum, items) => sum + items.length, 0)
const report = {
  schema: 'flyto-code.ai-code-quality-audit.v1',
  summary: {
    files: files.length,
    view_transport_baseline: VIEW_TRANSPORT_BASELINE.size,
    fail: failedCount,
  },
  failures,
}

if (json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} else {
  console.log(`ai code quality: ${failedCount === 0 ? 'PASS' : 'FAIL'}`)
  console.log(`files scanned: ${report.summary.files}`)
  console.log(`view transport baseline: ${report.summary.view_transport_baseline}`)
  for (const [key, items] of Object.entries(failures)) {
    console.log(`${key}: ${items.length}`)
    for (const item of items.slice(0, 25)) {
      if (typeof item === 'string') console.log(`  ${item}`)
      else console.log(`  ${item.file}${item.line ? `:${item.line}` : ''}${item.kind ? ` (${item.kind})` : ''}`)
    }
  }
}

if (failedCount > 0) {
  process.exitCode = 1
}
