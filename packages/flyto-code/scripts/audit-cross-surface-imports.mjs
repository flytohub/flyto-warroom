#!/usr/bin/env node
/**
 * Guard against cross-surface coupling between product surfaces.
 *
 * Architecture rule this enforces:
 *
 *   Each top-level directory under src-next/components/compounds/<surface> is a
 *   product surface (dashboard, scanning, arch, warroom, ...). A surface MUST
 *   NOT reach into another surface's internals. All cross-surface code sharing
 *   has to go through the neutral layers:
 *
 *     - components/compounds/_shared   (the only neutral dir *inside* compounds)
 *     - src-next/lib
 *     - src-next/hooks
 *     - src-next/components/atoms
 *     - src-next/contexts
 *
 * A surface file importing from compounds/<OTHER-surface>/ — whether by relative
 * path (../OTHER/...), by the @compounds/OTHER alias, or by the long
 * @/components/compounds/OTHER / @components/compounds/OTHER form — is a
 * cross-surface edge.
 *
 * Aggregator surfaces (warroom, fusion, ...) are NOT special-cased. Instead the
 * guard snapshots every cross-surface edge that exists on the remediated tree as
 * a BASELINE set (keyed "fromSurface -> toSurface"), mirroring the
 * VIEW_TRANSPORT_BASELINE pattern in audit-ai-code-quality.mjs. The build fails
 * when:
 *
 *   - a NEW edge appears that is not in the baseline (the set must not grow), or
 *   - a baseline edge is now stale (the coupling is gone — delete it from the
 *     baseline so the snapshot only ever shrinks).
 *
 * It prints the surface coupling matrix plus any new/stale edges, and exits 1 on
 * growth or staleness, else 0. Pass --json for machine-readable output.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src-next')
const COMPOUNDS = path.join(SRC, 'components/compounds')
const json = process.argv.includes('--json')

// Neutral surface names *inside* compounds. The only compounds dir that any
// surface may import from. (lib/hooks/atoms/contexts live outside compounds and
// are never classified as a surface, so they never produce an edge.)
const NEUTRAL_SURFACES = new Set(['_shared'])

// Baseline of cross-surface edges on the remediated tree, keyed
// "fromSurface -> toSurface". This set may only SHRINK: a new edge fails the
// build, and a stale entry (edge no longer present) must be deleted here.
const CROSS_SURFACE_BASELINE = new Set([
  'arch -> scanning',
  'dashboard -> fusion',
  'domains -> unified-asset',
  'exposure -> scanning',
  'exposure -> security',
  'fix-queue -> security',
  'pentest -> red-team',
  'scoring -> domains',
  'settings -> integrations',
  'settings -> mcp',
  'warroom -> arch',
  'warroom -> asset-map',
  'warroom -> history',
  'warroom -> red-team',
  'warroom -> scanning',
  'warroom -> security',
])

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === '__test__') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
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

// The surface a compounds file lives in: the first path segment after
// components/compounds/. Files directly under compounds/ (e.g. index.ts) have no
// surface and never originate an edge.
function surfaceOfFile(abs) {
  const rel = path.relative(COMPOUNDS, abs).split(path.sep)
  if (rel.length < 2) return null
  return rel[0]
}

// Resolve an import specifier to the compounds surface it targets, or null if it
// is not a compounds import at all. Handles the relative and aliased forms.
function targetSurfaceOf(spec, fromFileAbs) {
  let compoundsRel = null

  if (spec.startsWith('@compounds/')) {
    compoundsRel = spec.slice('@compounds/'.length)
  } else if (spec === '@compounds') {
    compoundsRel = ''
  } else if (spec.startsWith('@/components/compounds/')) {
    compoundsRel = spec.slice('@/components/compounds/'.length)
  } else if (spec.startsWith('@components/compounds/')) {
    compoundsRel = spec.slice('@components/compounds/'.length)
  } else if (spec.startsWith('.')) {
    // Relative import — resolve against the importing file's directory and check
    // whether it lands inside components/compounds.
    const resolved = path.resolve(path.dirname(fromFileAbs), spec)
    const rel = path.relative(COMPOUNDS, resolved)
    if (rel.startsWith('..') || path.isAbsolute(rel)) return null
    compoundsRel = rel.split(path.sep).join('/')
  } else {
    return null
  }

  const seg = compoundsRel.split('/').filter(Boolean)[0]
  return seg ?? null
}

const importRe = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g

const files = walk(COMPOUNDS)

// edges: list of { from, to, file, line, spec }
const edges = []
for (const file of files) {
  const fromSurface = surfaceOfFile(file)
  if (!fromSurface) continue
  if (NEUTRAL_SURFACES.has(fromSurface)) {
    // _shared is the neutral hub; what it imports is not "cross-surface"
    // coupling between two products, so it never originates a tracked edge.
    continue
  }
  const code = stripCommentsPreserveLines(read(file))
  importRe.lastIndex = 0
  let m
  while ((m = importRe.exec(code))) {
    const spec = m[1]
    const toSurface = targetSurfaceOf(spec, file)
    if (!toSurface) continue
    if (toSurface === fromSurface) continue
    if (NEUTRAL_SURFACES.has(toSurface)) continue
    edges.push({
      from: fromSurface,
      to: toSurface,
      file: srcRel(file),
      line: lineOf(code, m.index),
      spec,
    })
  }
}

const edgeKey = (e) => `${e.from} -> ${e.to}`
const currentKeys = new Set(edges.map(edgeKey))

const newEdges = [...currentKeys].filter((k) => !CROSS_SURFACE_BASELINE.has(k)).sort()
const staleBaseline = [...CROSS_SURFACE_BASELINE]
  .filter((k) => !currentKeys.has(k))
  .sort()

// Build a from->to matrix with edge counts and example sites.
const matrix = new Map()
for (const e of edges) {
  const key = edgeKey(e)
  if (!matrix.has(key)) matrix.set(key, { from: e.from, to: e.to, count: 0, sites: [] })
  const cell = matrix.get(key)
  cell.count += 1
  cell.sites.push({ file: e.file, line: e.line, spec: e.spec })
}
const matrixRows = [...matrix.values()].sort((a, b) =>
  a.from === b.from ? a.to.localeCompare(b.to) : a.from.localeCompare(b.from),
)

const failed = newEdges.length > 0 || staleBaseline.length > 0

const report = {
  schema: 'flyto-code.cross-surface-imports-audit.v1',
  summary: {
    files: files.length,
    edges: edges.length,
    distinct_edges: currentKeys.size,
    baseline: CROSS_SURFACE_BASELINE.size,
    new_edges: newEdges.length,
    stale_baseline: staleBaseline.length,
  },
  matrix: matrixRows,
  new_edges: newEdges,
  stale_baseline: staleBaseline,
  edges: edges.sort((a, b) =>
    a.from === b.from ? (a.to === b.to ? a.file.localeCompare(b.file) : a.to.localeCompare(b.to)) : a.from.localeCompare(b.from),
  ),
}

if (json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} else {
  console.log(`cross-surface imports: ${failed ? 'FAIL' : 'PASS'}`)
  console.log(`files scanned: ${report.summary.files}`)
  console.log(`cross-surface edges: ${report.summary.edges} (${report.summary.distinct_edges} distinct from->to)`)
  console.log(`baseline: ${report.summary.baseline}`)
  console.log('matrix (fromSurface -> toSurface  xN):')
  for (const row of matrixRows) {
    const ex = row.sites[0]
    console.log(`  ${row.from} -> ${row.to}  x${row.count}  e.g. ${ex.file}:${ex.line}`)
  }
  if (newEdges.length) {
    console.log(`NEW cross-surface edges (not in baseline): ${newEdges.length}`)
    for (const key of newEdges) {
      for (const e of edges.filter((x) => edgeKey(x) === key).slice(0, 10)) {
        console.log(`  + ${key}  ${e.file}:${e.line}  (${e.spec})`)
      }
    }
  }
  if (staleBaseline.length) {
    console.log(`STALE baseline entries (edge gone — remove from baseline): ${staleBaseline.length}`)
    for (const key of staleBaseline) console.log(`  - ${key}`)
  }
}

if (failed) process.exitCode = 1
