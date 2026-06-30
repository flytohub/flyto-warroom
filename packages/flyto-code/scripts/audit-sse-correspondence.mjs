#!/usr/bin/env node
/**
 * Audit SSE event → frontend cache-invalidation correspondence.
 *
 * The closed-loop refresh story only works if every backend SSE event that
 * represents a COMPLETION or a state CHANGE has frontend wiring that busts the
 * matching React Query cache. The cross-stack audit found the failure mode:
 * the engine starts emitting `foo.complete`, the union in eventTypes.gen.ts
 * grows a new literal, but useOrgEvents never invalidates anything — so the UI
 * shows stale counts until staleTime fires (or forever).
 *
 * This guard makes that drift fail CI. It is intentionally structural; it does
 * not check that the *right* query keys are busted (audit-platform-loops does
 * the per-surface loop check). It only proves the correspondence:
 *
 *   ENGINE_EVENT_TYPES (the generated union, the things the backend emits)
 *        ⇄
 *   useOrgEvents handled cases  ∪  INTENTIONAL_NOOP allowlist
 *
 * Two ways to fail:
 *
 *   1. emitted-but-unwired — an event in the union that the heuristic flags as
 *      a completion/change (or is in CHANGE_EVENTS) is neither handled with a
 *      real invalidation in useOrgEvents nor listed in INTENTIONAL_NOOP. This
 *      is the "feature ships, frontend silent" bug class.
 *   2. stale-frontend-case — an event handled in useOrgEvents that is not in
 *      the union at all. The engine renamed/removed the event; the dead case
 *      is now misleading and the exhaustiveness type-check can't catch a string
 *      literal that no longer exists in the union.
 *
 * INTENTIONAL_NOOP is the explicit baseline of events the frontend genuinely
 * does not need to react to (flyto-code does not render Cortex resources /
 * projects / folders / generic pipeline completion / audit log rows). It is
 * baked to the current remediated tree exactly like VIEW_TRANSPORT_BASELINE in
 * audit-ai-code-quality.mjs: the guard can only catch NEW drift, and an entry
 * that stops being a real no-op (it grew an invalidation) is itself reported so
 * the allowlist can't rot.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src-next')
const EVENT_TYPES_FILE = path.join(SRC, 'lib/cloud/eventTypes.gen.ts')
const ORG_EVENTS_FILE = path.join(SRC, 'hooks/useOrgEvents.ts')

const json = process.argv.includes('--json')

// A completion / change event MUST close a loop (be handled) or be explicitly
// declared a no-op. Lifecycle starts (queued/running/started/dispatched) and
// failures (failed) are not required to invalidate by this heuristic, but they
// are still reported in the table as "handled" when useOrgEvents wires them.
const COMPLETION_RE = /\.(complete|completed|finalized|changes|updated|ingested|expired|created|deleted|progress)$/

// Extra events that represent a state CHANGE the heuristic regex does not catch
// by suffix but that still MUST be wired or allowlisted. Add here rather than
// loosening the regex when the engine introduces a change event with a
// non-standard verb.
const CHANGE_EVENTS = new Set([
  'capabilities.changed',
  'score.changed',
  'threatintel.refresh',
])

// Events flyto-code deliberately ignores. Baked to the current tree: every
// entry here is a real no-op case in useOrgEvents today (verified by the
// stale-allowlist check below). Shrink this set as events become meaningful;
// new emitted-but-unwired completion events must NOT be parked here without a
// real reason — that defeats the guard.
const INTENTIONAL_NOOP = new Set([
  // Cortex knowledge workspace — flyto-code does not render resources.
  'resource.created',
  'resource.updated',
  'resource.deleted',
  // Cortex projects — not surfaced in flyto-code.
  'project.created',
  'project.updated',
  'project.deleted',
  // Cortex folders — not surfaced in flyto-code.
  'folder.created',
  'folder.updated',
  'folder.deleted',
  // Audit/activity log row — documented no-op in useOrgEvents (nothing in
  // flyto-code subscribes to the raw activity stream).
  'activity.logged',
])

function read(abs) {
  return fs.readFileSync(abs, 'utf8')
}

// Match the other guards: blank out comments while preserving line offsets so
// a `case 'x'` that only appears inside a comment is never counted as handled.
function stripCommentsPreserveLines(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/gm, (match, prefix) => `${prefix}${' '.repeat(match.length - prefix.length)}`)
}

// Walk is included to match the shared guard shape and to assert the input
// files actually live under src-next (skipping node_modules/__tests__), even
// though this guard reads two known files directly.
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

/* ---------------------------------------------------------------------------
 * Parse the generated union of emitted event strings.
 * ------------------------------------------------------------------------- */
function parseEmittedEvents(code) {
  const start = code.indexOf('ENGINE_EVENT_TYPES')
  if (start === -1) throw new Error('eventTypes.gen.ts: ENGINE_EVENT_TYPES not found')
  const open = code.indexOf('[', start)
  const close = code.indexOf('] as const', open)
  const body = close === -1 ? code.slice(open) : code.slice(open, close)
  const events = new Set()
  for (const m of body.matchAll(/'([^']+)'|"([^"]+)"/g)) {
    events.add(m[1] ?? m[2])
  }
  if (events.size === 0) throw new Error('eventTypes.gen.ts: parsed zero event literals')
  return events
}

/* ---------------------------------------------------------------------------
 * Parse useOrgEvents: which event strings appear as `case` labels, and which
 * of those land in a block with a real invalidation vs. a bare-`return` no-op.
 *
 * The switch groups fall-through cases and ends each block at the next
 * `return`. An event is "handled" if its block contains an actual cache action
 * (invalidateQueries / invalidateFootprint* / emitPipelineEvent / markDiscovery
 * / setQueryData). A block whose only statement is `return` is a no-op case.
 * ------------------------------------------------------------------------- */
const ACTION_RE = /invalidateQueries|invalidate[A-Z]\w*|emitPipelineEvent|setQueryData|markDiscovery\w*/

function parseRouter(code) {
  const switchIdx = code.indexOf('switch (t)')
  const region = switchIdx === -1 ? code : code.slice(switchIdx)

  const caseRe = /case\s+'([^']+)'\s*:|case\s+"([^"]+)"\s*:/g
  const labels = []
  let m
  while ((m = caseRe.exec(region))) {
    labels.push({ event: m[1] ?? m[2], index: m.index })
  }

  // For each case label, the block runs from the label to the next `return`
  // that follows it (fall-through siblings share the trailing block).
  const handled = new Set()
  const noop = new Set()
  for (const { event, index } of labels) {
    const after = region.slice(index)
    const retIdx = after.search(/\breturn\b/)
    const block = retIdx === -1 ? after.slice(0, 4000) : after.slice(0, retIdx)
    if (ACTION_RE.test(block)) handled.add(event)
    else noop.add(event)
  }
  // A fall-through no-op label that also opens a block containing an action
  // (shouldn't happen, but be safe) is treated as handled.
  for (const e of handled) noop.delete(e)
  return { handled, noop, allCases: new Set(labels.map((l) => l.event)) }
}

/* ---------------------------------------------------------------------------
 * Run.
 * ------------------------------------------------------------------------- */
const srcFiles = walk(SRC)
for (const required of [EVENT_TYPES_FILE, ORG_EVENTS_FILE]) {
  if (!srcFiles.includes(required)) {
    console.error(`sse correspondence: required input missing under src-next: ${path.relative(ROOT, required)}`)
    process.exit(1)
  }
}

const emitted = parseEmittedEvents(stripCommentsPreserveLines(read(EVENT_TYPES_FILE)))
const { handled, noop, allCases } = parseRouter(stripCommentsPreserveLines(read(ORG_EVENTS_FILE)))

function isCompletionOrChange(event) {
  return COMPLETION_RE.test(event) || CHANGE_EVENTS.has(event)
}

// FAIL 1 — emitted completion/change events that are neither handled nor
// allowlisted as an intentional no-op.
const emittedUnwired = [...emitted]
  .filter(isCompletionOrChange)
  .filter((e) => !handled.has(e) && !INTENTIONAL_NOOP.has(e))
  .sort()

// FAIL 2 — events routed in useOrgEvents that no longer exist in the union.
const staleFrontendCases = [...allCases]
  .filter((e) => !emitted.has(e))
  .sort()

// Allowlist hygiene (bake-to-current-tree, mirrors stale_view_transport):
//  - an INTENTIONAL_NOOP entry not in the union is dead and should be removed.
//  - an INTENTIONAL_NOOP entry that is actually handled (grew an invalidation)
//    no longer belongs in the no-op allowlist.
const staleNoopAllowlist = [...INTENTIONAL_NOOP]
  .filter((e) => !emitted.has(e) || handled.has(e))
  .sort()

const failures = {
  emitted_unwired: emittedUnwired,
  stale_frontend_cases: staleFrontendCases,
  stale_noop_allowlist: staleNoopAllowlist,
}
const failedCount = Object.values(failures).reduce((sum, items) => sum + items.length, 0)

// Correspondence table rows for the full union.
const rows = [...emitted].sort().map((event) => {
  const completion = isCompletionOrChange(event)
  let status
  if (handled.has(event)) status = 'handled'
  else if (INTENTIONAL_NOOP.has(event)) status = 'noop-allowed'
  else if (noop.has(event)) status = completion ? 'GAP' : 'noop-uncaught'
  else status = completion ? 'GAP' : 'unrouted'
  return { event, completion, status }
})

const report = {
  schema: 'flyto-code.sse-correspondence-audit.v1',
  summary: {
    emitted: emitted.size,
    handled: handled.size,
    intentional_noop: INTENTIONAL_NOOP.size,
    completion_events: rows.filter((r) => r.completion).length,
    fail: failedCount,
  },
  failures,
  table: rows,
}

if (json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} else {
  console.log(`sse correspondence: ${failedCount === 0 ? 'PASS' : 'FAIL'}`)
  console.log(`emitted events: ${report.summary.emitted}  handled: ${report.summary.handled}  noop-allowed: ${report.summary.intentional_noop}  completion/change: ${report.summary.completion_events}`)
  console.log('')
  console.log('  EVENT                            CHG  STATUS')
  console.log('  -------------------------------- ---  ------')
  for (const r of report.table) {
    const flag = r.status === 'GAP' ? '!' : ' '
    console.log(`${flag} ${r.event.padEnd(32)} ${r.completion ? 'yes' : ' no'}  ${r.status}`)
  }
  console.log('')
  for (const [key, items] of Object.entries(failures)) {
    if (items.length === 0) continue
    console.log(`${key}: ${items.length}`)
    for (const item of items) console.log(`  ${item}`)
  }
}

if (failedCount > 0) process.exitCode = 1
