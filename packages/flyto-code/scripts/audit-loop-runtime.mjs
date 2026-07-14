/**
 * Platform-loop recipe RUNTIME runner (prototype).
 *
 * audit-platform-loops.mjs proves a recipe is structurally well-formed and that
 * its static (event/qk/api) assertions match the real source. It does NOT prove
 * the recipe can actually be executed. This runner is the executable counterpart:
 * it loads every docs/platform-loops/recipes/*.yaml, validates that each step
 * uses a safe, whitelisted module, and proves every *runtime* assertion
 * (route_renders_without_error / dom_contains / http_status / command_succeeds)
 * maps to a concrete executable step of the right module.
 *
 * Safety model:
 *   - Module whitelist. Only browser.* navigation/read/interaction, api.request,
 *     and shell.run are allowed. A recipe that smuggles in database.*, file
 *     writes, or any other module fails the plan.
 *   - shell.run is the sharpest edge, so it is double-gated: the command must be
 *     an exact match in SHELL_ALLOWLIST (repo-safe npm guards only). Arbitrary
 *     shell is rejected, never executed.
 *   - api.request is restricted to explicit GET/POST requests against trusted
 *     baseUrl/engineUrl templates. External absolute URLs are rejected during
 *     planning, before execution can ever happen.
 *   - Default is dry-run / plan-only. Nothing is executed, no dev server, no
 *     credentials, no network. This is what CI runs.
 *   - Real execution is opt-in (--execute) AND requires FLYTO_LOOP_BASE_URL,
 *     FLYTO_LOOP_ENGINE_URL, and FLYTO_LOOP_ORG_ID. Authenticated API execution
 *     is opt-in too: pass FLYTO_LOOP_AUTH_TOKEN for a real Firebase token, or
 *     FLYTO_LOOP_DEV_AUTH=1 for the local engine's dev-auth middleware. Tokens
 *     are never written into the report.
 *   - Even then this prototype only executes shell.run (allowlisted) and
 *     api.request (method/URL allowlisted); browser.* steps are deferred to the
 *     flyto-core browser smoke runtime and reported as such.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseYaml } from './lib/recipe-yaml.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RECIPES_DIR = 'docs/platform-loops/recipes'

// Explicit, auditable module whitelist. Anything not here fails the plan.
export const SAFE_MODULES = new Set([
  'browser.goto',
  'browser.extract',
  'browser.wait',
  'browser.evaluate',
  'browser.click',
  'browser.type',
  'api.request',
  'shell.run',
])

// shell.run may only run these exact repo-safe commands. No arbitrary shell.
export const SHELL_ALLOWLIST = new Set([
  'npm run guard:branch',
  'npm run compliance:ci',
])

export const SAFE_API_METHODS = new Set(['GET', 'POST'])

// Modules this prototype actually executes when --execute + env are present.
// browser.* is deferred to the flyto-core browser smoke runtime.
const EXECUTABLE_MODULES = new Set(['shell.run', 'api.request'])

// Runtime assertion kinds mapped to the step module predicate they require.
export const RUNTIME_ASSERTIONS = {
  route_renders_without_error: (m) => m.startsWith('browser.'),
  dom_contains: (m) => m.startsWith('browser.'),
  http_status: (m) => m === 'api.request',
  command_succeeds: (m) => m === 'shell.run',
}

function stepModule(steps, oneBasedIndex) {
  const i = Number(oneBasedIndex)
  if (!Number.isInteger(i) || i < 1 || i > steps.length) return null
  const step = steps[i - 1]
  return step && typeof step === 'object' ? String(step.module ?? '') : null
}

function trustedTemplateUrl(value, allowedPrefixes) {
  const url = String(value ?? '').trim()
  return allowedPrefixes.some((prefix) => url.startsWith(prefix))
}

function requiredString(step, key) {
  return typeof step?.[key] === 'string' && step[key].trim() !== ''
}

/**
 * Pure planner: validate a parsed recipe document and resolve every runtime
 * assertion to its executable step. Returns a plan with an `errors` array; an
 * empty array means the recipe is runnable.
 */
export function planRecipe(doc, file = '<inline>') {
  const errors = []
  const steps = Array.isArray(doc?.steps) ? doc.steps : []
  if (steps.length === 0) errors.push('no steps')

  const plannedSteps = steps.map((step, i) => {
    const mod = step && typeof step === 'object' ? String(step.module ?? '') : ''
    const entry = { index: i + 1, module: mod, executable: EXECUTABLE_MODULES.has(mod) }
    if (!SAFE_MODULES.has(mod)) {
      errors.push(`step ${i + 1}: module "${mod || '<missing>'}" is not in the safe whitelist`)
    } else if (mod === 'shell.run') {
      const command = String(step.command ?? '').trim()
      entry.command = command
      if (!SHELL_ALLOWLIST.has(command)) {
        errors.push(`step ${i + 1}: shell.run command "${command || '<missing>'}" is not in the repo-safe allowlist`)
      }
    } else if (mod === 'api.request') {
      const method = String(step.method ?? '').trim().toUpperCase()
      const url = String(step.url ?? step.path ?? '').trim()
      entry.method = method
      entry.url = url
      if (!SAFE_API_METHODS.has(method)) {
        errors.push(`step ${i + 1}: api.request method "${method || '<missing>'}" is not in the safe method allowlist`)
      }
      if (!trustedTemplateUrl(url, ['{{engineUrl}}/api/', '{{baseUrl}}/api/'])) {
        errors.push(`step ${i + 1}: api.request url "${url || '<missing>'}" must start with {{engineUrl}}/api/ or {{baseUrl}}/api/`)
      }
      if (method === 'POST') {
        const body = String(step.body ?? '').trim()
        entry.body = body
        if (!body) errors.push(`step ${i + 1}: POST api.request requires an explicit body`)
      }
    } else if (mod.startsWith('browser.')) {
      entry.url = step.url ? String(step.url) : undefined
      entry.deferred = true // executed by flyto-core browser smoke, not this runner
      if (mod === 'browser.goto' && !trustedTemplateUrl(step.url, ['{{baseUrl}}/'])) {
        errors.push(`step ${i + 1}: browser.goto url "${String(step.url ?? '<missing>')}" must start with {{baseUrl}}/`)
      }
      if (['browser.extract', 'browser.click', 'browser.type'].includes(mod) && !requiredString(step, 'selector')) {
        errors.push(`step ${i + 1}: ${mod} requires a non-empty selector`)
      }
      if (mod === 'browser.type' && !requiredString(step, 'text')) {
        errors.push(`step ${i + 1}: browser.type requires non-empty text`)
      }
      if (mod === 'browser.wait' && !requiredString(step, 'condition')) {
        errors.push(`step ${i + 1}: browser.wait requires a non-empty condition`)
      }
      if (mod === 'browser.evaluate' && !requiredString(step, 'expression')) {
        errors.push(`step ${i + 1}: browser.evaluate requires a non-empty expression`)
      }
    }
    return entry
  })

  const assertions = Array.isArray(doc?.assertions) ? doc.assertions : []
  const runtimeMappings = []
  for (let i = 0; i < assertions.length; i += 1) {
    const a = assertions[i]
    const kind = a && typeof a === 'object' ? a.assert : undefined
    const predicate = kind ? RUNTIME_ASSERTIONS[kind] : undefined
    if (!predicate) continue // static assertions are the static guard's job
    const mod = stepModule(steps, a.step)
    if (mod === null) {
      errors.push(`assertion #${i + 1} (${kind}): step ${a.step} is out of range - no executable step mapping`)
      continue
    }
    if (!predicate(mod)) {
      errors.push(`assertion #${i + 1} (${kind}): step ${a.step} module "${mod}" cannot satisfy this runtime assertion`)
      continue
    }
    runtimeMappings.push({ assert: kind, step: Number(a.step), module: mod })
  }

  return { file, id: doc?.id ?? null, surface: doc?.surface ?? null, steps: plannedSteps, runtimeMappings, errors }
}

function loadRecipes() {
  const dir = path.join(ROOT, RECIPES_DIR)
  const out = []
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith('.yaml') && !name.endsWith('.yml')) continue
    const rel = `${RECIPES_DIR}/${name}`
    let doc
    try {
      doc = parseYaml(fs.readFileSync(path.join(ROOT, rel), 'utf8'))
    } catch (err) {
      out.push({ file: name, parseError: err.message })
      continue
    }
    out.push({ file: name, doc })
  }
  return out
}

function resolveTemplate(value, env) {
  return String(value).replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (whole, key) => {
    switch (key) {
      case 'baseUrl': return env.baseUrl ?? whole
      case 'engineUrl': return env.engineUrl ?? whole
      case 'orgId': return env.orgId ?? whole
      default: return whole
    }
  })
}

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value))
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

export function buildLoopDevAuthToken(uid = 'test-uid-1', email = 'dev@flyto2.com') {
  return `${base64urlJson({ alg: 'none', typ: 'JWT' })}.${base64urlJson({ sub: uid, email })}.`
}

function readAuthEnv() {
  const explicitToken = process.env.FLYTO_LOOP_AUTH_TOKEN
  if (explicitToken) {
    return { authHeader: `Bearer ${explicitToken}`, authMode: 'explicit-token' }
  }
  if (process.env.FLYTO_LOOP_DEV_AUTH === '1') {
    const uid = process.env.FLYTO_LOOP_UID || process.env.VITE_DEV_AUTH_UID || 'test-uid-1'
    const email = process.env.FLYTO_LOOP_EMAIL || process.env.VITE_DEV_AUTH_EMAIL || 'dev@flyto2.com'
    return { authHeader: `Bearer ${buildLoopDevAuthToken(uid, email)}`, authMode: 'dev-auth' }
  }
  return { authHeader: '', authMode: 'none' }
}

function readEnv() {
  const baseUrl = process.env.FLYTO_LOOP_BASE_URL
  const engineUrl = process.env.FLYTO_LOOP_ENGINE_URL
  const orgId = process.env.FLYTO_LOOP_ORG_ID
  const auth = readAuthEnv()
  return { baseUrl, engineUrl, orgId, ...auth, ready: Boolean(baseUrl && engineUrl && orgId) }
}

function resolvedUrlAllowed(url, env) {
  try {
    const parsed = new URL(url)
    const allowed = [env.baseUrl, env.engineUrl]
      .filter(Boolean)
      .map((value) => new URL(value).origin)
    return allowed.includes(parsed.origin)
  } catch {
    return false
  }
}

async function executePlan(plan, env, options = {}) {
  const results = []
  for (const step of plan.steps) {
    if (step.module === 'shell.run') {
      const [cmd, ...args] = step.command.split(' ')
      const r = spawnSync(cmd, args, {
        cwd: ROOT,
        stdio: options.captureShell ? 'pipe' : 'inherit',
        encoding: options.captureShell ? 'utf8' : undefined,
        shell: process.platform === 'win32',
      })
      results.push({ index: step.index, module: step.module, status: r.status === 0 ? 'ok' : 'fail', code: r.status })
    } else if (step.module === 'api.request') {
      const url = resolveTemplate(step.url, env)
      if (!resolvedUrlAllowed(url, env)) {
        results.push({ index: step.index, module: step.module, status: 'error', error: `resolved URL is outside trusted loop origins: ${url}` })
        continue
      }
      try {
        const headers = {}
        if (env.authHeader) headers.Authorization = env.authHeader
        const options = { method: step.method, headers }
        if (step.method === 'POST') {
          options.headers['Content-Type'] = 'application/json'
          options.body = step.body
        }
        const resp = await fetch(url, options)
        results.push({ index: step.index, module: step.module, status: resp.ok ? 'ok' : 'fail', http: resp.status })
      } catch (err) {
        results.push({ index: step.index, module: step.module, status: 'error', error: err.message })
      }
    } else {
      results.push({ index: step.index, module: step.module, status: 'deferred', note: 'flyto-core browser smoke runtime' })
    }
  }
  return results
}

async function main() {
  const json = process.argv.includes('--json')
  const wantExecute = process.argv.includes('--execute')
  const env = readEnv()
  const executing = wantExecute && env.ready

  const loaded = loadRecipes()
  const plans = []
  for (const entry of loaded) {
    if (entry.parseError) {
      plans.push({ file: entry.file, errors: [`unparseable: ${entry.parseError}`], steps: [], runtimeMappings: [] })
      continue
    }
    const plan = planRecipe(entry.doc, entry.file)
    if (executing && plan.errors.length === 0) {
      plan.execution = await executePlan(plan, env, { captureShell: json })
    }
    plans.push(plan)
  }

  const failed = plans.filter((p) => p.errors.length > 0)
  const totalRuntimeMappings = plans.reduce((n, p) => n + p.runtimeMappings.length, 0)
  const execFailures = plans.flatMap((p) => (p.execution ?? []).filter((r) => r.status === 'fail' || r.status === 'error'))

  const report = {
    schema: 'flyto-code.platform-loop-runtime.v1',
    mode: executing ? 'execute' : 'plan-only',
    env_ready: env.ready,
    auth_mode: env.authMode,
    auth_ready: Boolean(env.authHeader),
    summary: {
      recipes: plans.length,
      plan_ok: plans.length - failed.length,
      plan_failed: failed.length,
      runtime_assertions_mapped: totalRuntimeMappings,
      execution_failures: execFailures.length,
    },
    recipes: plans,
  }

  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } else {
    console.log(`platform loop runtime: ${report.mode}` + (wantExecute && !env.ready ? ' (--execute ignored: FLYTO_LOOP_BASE_URL, FLYTO_LOOP_ENGINE_URL, and FLYTO_LOOP_ORG_ID are required)' : ''))
    if (executing) console.log(`api auth: ${report.auth_mode}`)
    console.log(`recipes: ${report.summary.plan_ok}/${plans.length} plannable, ${totalRuntimeMappings} runtime assertions mapped to executable steps`)
    for (const plan of plans) {
      const tag = plan.errors.length === 0 ? 'PLAN-OK' : 'PLAN-FAIL'
      console.log(`${tag} ${plan.file}${plan.id ? ` (${plan.id})` : ''}`)
      for (const err of plan.errors) console.log(`  - ${err}`)
      for (const r of plan.execution ?? []) {
        console.log(`  step ${r.index} ${r.module}: ${r.status}${r.http ? ` (${r.http})` : ''}${r.note ? ` - ${r.note}` : ''}${r.error ? ` - ${r.error}` : ''}`)
      }
    }
    if (!executing) {
      console.log('\nDry-run only. Set FLYTO_LOOP_BASE_URL (+ FLYTO_LOOP_ENGINE_URL, FLYTO_LOOP_ORG_ID) and pass --execute to run shell/api steps. Add FLYTO_LOOP_AUTH_TOKEN or FLYTO_LOOP_DEV_AUTH=1 for authenticated API steps.')
    }
  }

  if (failed.length > 0 || execFailures.length > 0) process.exitCode = 1
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href
if (isMain) main()
