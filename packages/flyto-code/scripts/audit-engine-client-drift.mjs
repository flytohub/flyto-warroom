#!/usr/bin/env node
/**
 * Guard against the "json: unknown field" class of FE/BE drift.
 *
 * The engine decodes request bodies with json.DisallowUnknownFields() (see
 * api/respond.go:readJSON). That means a frontend engine-client call which
 * sends a top-level body key the backend struct does NOT declare is a hard
 * 400 at runtime — the exact failure mode behind the createOrg `module_sources`
 * incident, where the FE wizard sent a field the BE struct had not yet grown.
 *
 * This is CROSS-REPO and intentionally CONSERVATIVE — it favours zero false
 * positives over completeness. It only flags a key when it can resolve, with
 * high confidence:
 *
 *   BE: api/*.go registers  "POST /api/v1/code/orgs" -> srv.handleCreateOrg,
 *       the handler calls    readJSON(w, r, &req),
 *       and `req` is a struct (named-in-package, or an inline anonymous struct)
 *       whose json tag keys are the *only* accepted top-level fields.
 *
 *   FE: src-next/lib/engine has  request('POST', '/api/v1/code/orgs', body)
 *       where `body` is an object literal, or is built with the createOrg
 *       `body.X = ...` assignment pattern, so its top-level keys are statically
 *       knowable.
 *
 * Anything it cannot resolve unambiguously (open map[string]any BE structs,
 * embedded BE structs, FE bodies that are a pass-through variable, ambiguous
 * route matches) is SKIPPED and counted, never guessed.
 *
 * Cross-repo skip rule: the engine checkout is resolved from FLYTO_ENGINE_DIR
 * or the sibling default. Local devs without it get a notice + exit 0 — only
 * CI checks out both repos (mirrors .github/workflows/sync-i18n.yml).
 *
 * Like audit-ai-code-quality.mjs's VIEW_TRANSPORT_BASELINE, the current (already
 * remediated) tree is baked in as DRIFT_BASELINE so the guard can only catch
 * NEW drift, never re-flag the historical state.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FE_ENGINE_DIR = path.join(ROOT, 'src-next/lib/engine')
const ENGINE_DIR =
  process.env.FLYTO_ENGINE_DIR ||
  path.resolve(ROOT, '..', 'flyto-engine')
const ENGINE_API_DIR = path.join(ENGINE_DIR, 'api')

const json = process.argv.includes('--json')

/* ---------------------------------------------------------------------------
 * Known, already-remediated drift baked in as the baseline.
 *
 * Each entry is `${METHOD} ${normalizedRoute} :: ${feKey}`. The current trees
 * are clean, so this is empty — its only purpose is to give a future
 * remediation the same escape hatch VIEW_TRANSPORT_BASELINE gives, without
 * weakening the guard against NEW drift.
 * ------------------------------------------------------------------------- */
const DRIFT_BASELINE = new Set([])

/* ---------------------------------------------------------------------------
 * Generic helpers (mirrors the other guards' walk/stripComments/lineOf).
 * ------------------------------------------------------------------------- */
function walk(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === '__test__') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, exts, out)
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full)
  }
  return out
}

function read(abs) {
  return fs.readFileSync(abs, 'utf8')
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length
}

// Blank out comments (block + line) while preserving offsets, so regex line
// numbers stay accurate and commented-out routes/calls are ignored. Works for
// both Go and TS // and /* */ comments.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/gm, (m, prefix) => `${prefix}${' '.repeat(m.length - prefix.length)}`)
}

// Normalize a route path so FE templates and BE patterns compare equal:
//   /api/v1/code/orgs/${orgId}/x   (FE template literal)
//   /api/v1/code/orgs/{id}/x       (BE Go 1.22 mux pattern)
//   /api/v1/code/orgs/:id/x        (legacy colon style)
// all collapse their dynamic segments to a single {} placeholder.
function normalizeRoute(p) {
  return p
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) return '{}'
      if (seg.startsWith('{') && seg.endsWith('}')) return '{}'
      if (seg.includes('${') || seg.includes('`')) return '{}'
      return seg
    })
    .join('/')
    .replace(/\/+$/, '')
}

/* ---------------------------------------------------------------------------
 * BE extraction.
 *
 * 1. Parse api/*.go registrations:  mux.HandleFunc("POST /path", ...handlerName...)
 * 2. For each handler, find its func body, locate readJSON(w, r, &VAR).
 * 3. Resolve VAR's declared type:
 *      - `var VAR struct { ... }`  -> inline anon struct (parse fields here)
 *      - `var VAR NamedType`       -> named struct defined in the api package
 *      - `VAR := NamedType{`       -> named struct
 *    Open maps (map[string]...) or embedded structs -> unresolved (skip).
 * 4. Json tag keys of the struct = the allowed top-level key set.
 * ------------------------------------------------------------------------- */

// Pull `name` out of a Go struct-tag json key. `json:"name,omitempty"` -> name,
// `json:"-"` -> null (ignored field, not wire-addressable).
function jsonKeyFromTag(tag) {
  const m = tag.match(/json:"([^"]*)"/)
  if (!m) return undefined
  const first = m[1].split(',')[0].trim()
  if (first === '' || first === '-') return null
  return first
}

// Parse the body of a Go struct (text between the outermost braces) into a set
// of json keys. Returns { keys, resolvable }. Embedded fields (a line whose
// identifier has no following type token AND no json tag) make the struct
// un-resolvable — we cannot know the embedded type's fields without following
// it, so we conservatively bail.
function parseStructBody(body) {
  const keys = new Set()
  let resolvable = true
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim()
    if (line === '' || line === '}') continue
    const tag = line.match(/`[^`]*`/)
    if (tag) {
      const key = jsonKeyFromTag(tag[0])
      if (key === undefined) continue // tag without json: -> field has no json key, default Go name; treat as unresolved-safe skip of this field
      if (key === null) continue // json:"-" -> not on the wire
      keys.add(key)
      continue
    }
    // No backtick tag on this line. It might be: a field with no tag
    // (Go uses the field name verbatim as the json key — we cannot safely
    // lowercase-match FE camelCase keys, so mark unresolvable), or an
    // embedded type (also unresolvable). Either way, be conservative.
    if (/^[A-Za-z_]\w*(\s+[\w*.\[\]]+)?\s*$/.test(line)) {
      resolvable = false
    }
  }
  return { keys, resolvable }
}

// Given the api package text (all files concatenated with markers stripped is
// not enough — we need per-file so we can find a named type anywhere), find a
// named struct type and return its parsed body. allText is the concatenation
// of every stripped .go file in api/.
function findNamedStruct(typeName, allText) {
  const re = new RegExp(`type\\s+${typeName}\\s+struct\\s*\\{`)
  const m = re.exec(allText)
  if (!m) return null
  const open = allText.indexOf('{', m.index)
  const body = sliceBraces(allText, open)
  if (body === null) return null
  return parseStructBody(body)
}

// Return the text inside the brace pair starting at openIdx (the '{'),
// excluding the braces themselves. Handles nested braces. Returns null if
// unbalanced.
function sliceBraces(text, openIdx) {
  let depth = 0
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(openIdx + 1, i)
    }
  }
  return null
}

// Extract a handler func body by name from a single file's text. Returns the
// body text (between the func's outer braces) or null.
function findFuncBody(text, handlerName) {
  // matches: func (s *Server) handleX( ... ) {     and bare func handleX(
  const re = new RegExp(`func\\s*(?:\\([^)]*\\)\\s*)?${handlerName}\\s*\\(`)
  const m = re.exec(text)
  if (!m) return null
  const open = text.indexOf('{', m.index)
  if (open === -1) return null
  return { body: sliceBraces(text, open), start: m.index }
}

function resolveBeStruct(handlerName, fileText, allText) {
  const fn = findFuncBody(fileText, handlerName)
  if (!fn || fn.body === null) return { status: 'no_handler' }
  const body = fn.body

  // Locate readJSON(w, r, &VAR). Only the &VAR form (decode into a struct).
  const rj = body.match(/readJSON\(\s*w\s*,\s*r\s*,\s*&\s*([A-Za-z_]\w*)\s*\)/)
  if (!rj) return { status: 'no_readjson' }
  const varName = rj[1]

  // Inline anonymous struct: var VAR struct { ... }
  const anonRe = new RegExp(`var\\s+${varName}\\s+struct\\s*\\{`)
  const anonM = anonRe.exec(body)
  if (anonM) {
    const open = body.indexOf('{', anonM.index)
    const sBody = sliceBraces(body, open)
    if (sBody === null) return { status: 'unparsed_anon' }
    const parsed = parseStructBody(sBody)
    if (!parsed.resolvable) return { status: 'embedded_or_untagged' }
    return { status: 'ok', keys: parsed.keys, struct: `${handlerName}:anon` }
  }

  // Open map -> no DisallowUnknownFields constraint (any key accepted).
  if (new RegExp(`var\\s+${varName}\\s+(\\*?map\\[|\\*?interface\\{\\})`).test(body)) {
    return { status: 'open_map' }
  }

  // Named type: `var VAR NamedType` or `VAR := NamedType{`
  let typeName = null
  const varDecl = body.match(new RegExp(`var\\s+${varName}\\s+\\*?([A-Za-z_]\\w*)\\b`))
  if (varDecl) typeName = varDecl[1]
  if (!typeName) {
    const shortDecl = body.match(new RegExp(`\\b${varName}\\s*:=\\s*\\*?&?([A-Za-z_]\\w*)\\s*\\{`))
    if (shortDecl) typeName = shortDecl[1]
  }
  if (!typeName) return { status: 'unresolved_var' }
  if (/^(map|interface)$/.test(typeName)) return { status: 'open_map' }

  const parsed = findNamedStruct(typeName, allText)
  if (!parsed) return { status: 'type_not_found', typeName }
  if (!parsed.resolvable) return { status: 'embedded_or_untagged', typeName }
  return { status: 'ok', keys: parsed.keys, struct: typeName }
}

function buildBeRoutes() {
  if (!fs.existsSync(ENGINE_API_DIR)) return { routes: new Map(), skipped: [], handlerFiles: new Map() }

  const goFiles = walk(ENGINE_API_DIR, ['.go']).filter((f) => !f.endsWith('_test.go'))
  const fileText = new Map(goFiles.map((f) => [f, stripComments(read(f))]))
  const allText = [...fileText.values()].join('\n\n')

  // handlerName -> fileText that defines it
  const handlerFile = new Map()
  for (const text of fileText.values()) {
    const re = /func\s*(?:\([^)]*\)\s*)?(\w*[Hh]andle\w*)\s*\(/g
    let m
    while ((m = re.exec(text))) {
      if (!handlerFile.has(m[1])) handlerFile.set(m[1], text)
    }
  }

  const routes = new Map() // `${METHOD} ${normRoute}` -> { keys, struct }
  const skipped = []

  const regRe = /mux\.HandleFunc\(\s*"(POST|PATCH|PUT)\s+([^"]+)"\s*,([^)]*\bsrv\.(\w+))/g
  for (const text of fileText.values()) {
    let m
    while ((m = regRe.exec(text))) {
      const method = m[1]
      const rawPath = m[2].trim()
      const handlerName = m[4]
      const norm = normalizeRoute(rawPath)
      const key = `${method} ${norm}`

      const fileForHandler = handlerFile.get(handlerName)
      if (!fileForHandler) {
        skipped.push({ route: key, handler: handlerName, reason: 'handler_not_found' })
        continue
      }
      const resolved = resolveBeStruct(handlerName, fileForHandler, allText)
      if (resolved.status !== 'ok') {
        skipped.push({ route: key, handler: handlerName, reason: resolved.status })
        continue
      }
      // If two registrations collide on the same normalized key with DIFFERENT
      // structs, the match is ambiguous — drop both to stay conservative.
      if (routes.has(key) && routes.get(key).struct !== resolved.struct) {
        routes.get(key)._ambiguous = true
        continue
      }
      routes.set(key, { keys: resolved.keys, struct: resolved.struct, handler: handlerName })
    }
  }

  for (const [key, v] of routes) {
    if (v._ambiguous) {
      routes.delete(key)
      skipped.push({ route: key, reason: 'ambiguous_multiple_structs' })
    }
  }

  return { routes, skipped }
}

/* ---------------------------------------------------------------------------
 * FE extraction.
 *
 * Find request('POST'|'PATCH'|'PUT', <path>, <body>) calls. Statically collect
 * the body's top-level keys when the body is:
 *   - an object literal:  { name, slug, project_type: x }
 *   - a `body.X = ...` builder where body started as an object literal
 *     (the createOrg pattern).
 * Otherwise (pass-through variable like `req`/`updates`, spread, call expr) the
 * call is SKIPPED.
 * ------------------------------------------------------------------------- */

// Resolve a path argument to a literal route string, or null if not statically
// resolvable. Accepts '...'/"..." and `...${x}...` template literals.
function resolvePathArg(arg) {
  const t = arg.trim()
  const q = t.match(/^'([^']*)'$/) || t.match(/^"([^"]*)"$/)
  if (q) return q[1]
  const tpl = t.match(/^`([^`]*)`$/)
  if (tpl) return tpl[1]
  return null
}

// Parse top-level keys from an object-literal source (the text inside the
// outermost { }). Handles shorthand `name`, `key: value`, `key: () => {}`,
// quoted keys, and nested objects/arrays (depth-tracked so nested keys are not
// counted). Returns null if a spread (...x) or computed key ([k]) is present —
// those make the key set unknowable, so we skip the whole call.
function parseObjectLiteralKeys(body) {
  const keys = []
  let depth = 0
  let i = 0
  let atKeyStart = true
  while (i < body.length) {
    const ch = body[i]
    if (ch === '{' || ch === '[' || ch === '(') {
      depth++
      i++
      continue
    }
    if (ch === '}' || ch === ']' || ch === ')') {
      depth--
      i++
      continue
    }
    if (depth > 0) {
      i++
      continue
    }
    if (ch === ',') {
      atKeyStart = true
      i++
      continue
    }
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (atKeyStart) {
      if (body.startsWith('...', i)) return null // spread -> unknowable
      if (ch === '[') return null // computed key -> unknowable
      // quoted key
      const qm = body.slice(i).match(/^(['"])([^'"]*)\1\s*:/)
      if (qm) {
        keys.push(qm[2])
        i += qm[0].length
        // skip the value until top-level comma
        i = skipValue(body, i)
        atKeyStart = false
        continue
      }
      const km = body.slice(i).match(/^([A-Za-z_$][\w$]*)\s*(:)?/)
      if (km) {
        keys.push(km[1])
        i += km[0].length
        if (km[2]) i = skipValue(body, i) // had a colon -> skip its value
        atKeyStart = false
        continue
      }
      // unrecognized token at key position -> bail conservatively
      return null
    }
    i++
  }
  return keys
}

// Advance past a value expression to the next top-level comma (or end).
function skipValue(body, i) {
  let depth = 0
  while (i < body.length) {
    const ch = body[i]
    if (ch === '{' || ch === '[' || ch === '(') depth++
    else if (ch === '}' || ch === ']' || ch === ')') depth--
    else if (ch === ',' && depth === 0) return i
    else if (depth === 0 && (ch === "'" || ch === '"' || ch === '`')) {
      i = skipString(body, i)
      continue
    }
    i++
  }
  return i
}

function skipString(body, i) {
  const quote = body[i]
  i++
  while (i < body.length) {
    if (body[i] === '\\') {
      i += 2
      continue
    }
    if (body[i] === quote) return i + 1
    i++
  }
  return i
}

// Find the matching close paren for an open paren at openIdx.
function matchParen(text, openIdx) {
  let depth = 0
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i]
    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipString(text, i) - 1
      continue
    }
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

// Split a comma-separated argument list (text between request's parens) at
// top-level commas only.
function splitArgs(argText) {
  const args = []
  let depth = 0
  let start = 0
  for (let i = 0; i < argText.length; i++) {
    const ch = argText[i]
    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipString(argText, i) - 1
      continue
    }
    if (ch === '{' || ch === '[' || ch === '(') depth++
    else if (ch === '}' || ch === ']' || ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      args.push(argText.slice(start, i))
      start = i + 1
    }
  }
  args.push(argText.slice(start))
  return args
}

// From a function body and the name a body variable was declared with, collect
// `body.X = ...` assignment keys (the createOrg builder pattern).
function collectAssignedKeys(funcText, varName) {
  const keys = []
  const re = new RegExp(`\\b${varName}\\.([A-Za-z_$][\\w$]*)\\s*=[^=]`, 'g')
  let m
  while ((m = re.exec(funcText))) keys.push(m[1])
  return keys
}

// Find the object-literal initializer for `const VAR = { ... }` (or let/var)
// within text. Returns the inner literal body or null.
function findVarObjectLiteral(text, varName) {
  const re = new RegExp(`\\b(?:const|let|var)\\s+${varName}\\b[^=]*=\\s*\\{`)
  const m = re.exec(text)
  if (!m) return null
  const open = text.indexOf('{', m.index)
  const inner = sliceBraces(text, open)
  return inner
}

// Enclosing function/arrow body text for a position — approximated as the text
// from the nearest preceding `export function`/`function`/`=> {` up to a
// balanced close. Conservative: we just take a window from the last function
// keyword before the call to the end of file; collectAssignedKeys/findVar only
// match the specific varName so over-capture is harmless.
function enclosingScope(text, pos) {
  const head = text.slice(0, pos)
  const fnIdx = Math.max(
    head.lastIndexOf('export function'),
    head.lastIndexOf('\nfunction'),
    head.lastIndexOf('export async function'),
    head.lastIndexOf('export const'),
  )
  const start = fnIdx === -1 ? 0 : fnIdx
  return text.slice(start, pos + 2000)
}

function buildFeCalls() {
  const tsFiles = walk(FE_ENGINE_DIR, ['.ts', '.tsx']).filter((f) => !f.endsWith('.d.ts'))
  const calls = []
  const skipped = []

  for (const file of tsFiles) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/')
    const text = stripComments(read(file))
    const callRe = /\brequest\s*(?:<[^>]*>)?\s*\(/g
    let m
    while ((m = callRe.exec(text))) {
      const openParen = text.indexOf('(', m.index)
      const close = matchParen(text, openParen)
      if (close === -1) continue
      const argText = text.slice(openParen + 1, close)
      const args = splitArgs(argText)
      if (args.length < 2) continue
      const method = (resolvePathArg(args[0]) || '').toUpperCase()
      if (!['POST', 'PATCH', 'PUT'].includes(method)) continue
      const rawPath = resolvePathArg(args[1])
      if (rawPath === null) {
        skipped.push({ file: rel, reason: 'unresolved_path' })
        continue
      }
      const norm = normalizeRoute(rawPath)
      const line = lineOf(text, m.index)

      if (args.length < 3 || args[2].trim() === '') {
        // No body -> nothing to check.
        continue
      }
      const bodyArg = args[2].trim()
      let keys = null
      let mode = null

      // Inline object literal: { ... }
      if (bodyArg.startsWith('{') && bodyArg.endsWith('}')) {
        keys = parseObjectLiteralKeys(bodyArg.slice(1, -1))
        mode = 'literal'
      } else if (/^[A-Za-z_$][\w$]*$/.test(bodyArg)) {
        // A bare variable. Only resolvable if it's a local object literal
        // built in this scope (createOrg `const body = {..}` + body.X = ..).
        const scope = enclosingScope(text, m.index)
        const inner = findVarObjectLiteral(scope, bodyArg)
        if (inner !== null) {
          const litKeys = parseObjectLiteralKeys(inner)
          if (litKeys !== null) {
            keys = [...litKeys, ...collectAssignedKeys(scope, bodyArg)]
            mode = 'builder'
          }
        }
      }

      if (keys === null) {
        skipped.push({ file: rel, line, route: `${method} ${norm}`, reason: 'unresolved_body' })
        continue
      }
      // De-dup keys.
      keys = [...new Set(keys)]
      calls.push({ file: rel, line, method, route: `${method} ${norm}`, keys, mode })
    }
  }
  return { calls, skipped }
}

/* ---------------------------------------------------------------------------
 * Main.
 * ------------------------------------------------------------------------- */
if (!fs.existsSync(ENGINE_API_DIR)) {
  const notice = `engine-client-drift: SKIP — engine checkout not found at ${ENGINE_API_DIR}\n` +
    `  (set FLYTO_ENGINE_DIR or check out flyto-engine as a sibling; CI checks out both, like sync-i18n.yml)`
  if (json) {
    process.stdout.write(`${JSON.stringify({ schema: 'flyto-code.engine-client-drift.v1', skipped_reason: 'engine_not_found', engine_api_dir: ENGINE_API_DIR }, null, 2)}\n`)
  } else {
    console.log(notice)
  }
  process.exit(0)
}

const be = buildBeRoutes()
const fe = buildFeCalls()

const findings = []
let checkedCalls = 0
const matchSkipped = []

for (const call of fe.calls) {
  const beRoute = be.routes.get(call.route)
  if (!beRoute) {
    matchSkipped.push({ file: call.file, line: call.line, route: call.route, reason: 'no_be_struct_for_route' })
    continue
  }
  checkedCalls++
  for (const key of call.keys) {
    if (beRoute.keys.has(key)) continue
    const baselineId = `${call.route} :: ${key}`
    if (DRIFT_BASELINE.has(baselineId)) continue
    findings.push({
      file: call.file,
      line: call.line,
      route: call.route,
      key,
      be_struct: beRoute.struct,
      allowed: [...beRoute.keys].sort(),
    })
  }
}

const report = {
  schema: 'flyto-code.engine-client-drift.v1',
  engine_api_dir: ENGINE_API_DIR,
  summary: {
    be_routes_mapped: be.routes.size,
    fe_calls_total: fe.calls.length,
    fe_calls_checked: checkedCalls,
    be_skipped: be.skipped.length,
    fe_skipped: fe.skipped.length,
    match_skipped: matchSkipped.length,
    baseline: DRIFT_BASELINE.size,
    findings: findings.length,
  },
  findings,
}

if (json) {
  process.stdout.write(`${JSON.stringify({ ...report, be_skipped: be.skipped, fe_skipped: fe.skipped, match_skipped: matchSkipped }, null, 2)}\n`)
} else {
  console.log(`engine client drift: ${findings.length === 0 ? 'PASS' : 'FAIL'}`)
  console.log(`engine api dir: ${ENGINE_API_DIR}`)
  console.log(`be (route,struct) pairs mapped: ${report.summary.be_routes_mapped} (skipped ${report.summary.be_skipped})`)
  console.log(`fe request() bodies resolved: ${report.summary.fe_calls_total} (skipped ${report.summary.fe_skipped})`)
  console.log(`fe calls matched to a be struct + checked: ${report.summary.fe_calls_checked} (unmatched skipped ${report.summary.match_skipped})`)
  console.log(`baseline entries: ${report.summary.baseline}`)
  if (findings.length) {
    console.log('drift (FE sends a key the BE struct rejects via DisallowUnknownFields):')
    for (const f of findings.slice(0, 50)) {
      console.log(`  ${f.file}:${f.line}  ${f.route}  key="${f.key}"  not in ${f.be_struct} {${f.allowed.join(', ')}}`)
    }
  }
}

if (findings.length > 0) process.exit(1)
process.exit(0)
