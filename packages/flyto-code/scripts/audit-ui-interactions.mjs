#!/usr/bin/env node
/**
 * Destructive local UI interaction audit.
 *
 * This is intentionally broader than a smoke test:
 * - creates a guarded throwaway org (ui-audit-*) through the local engine
 * - opens every navbar-registry route in every declared mode
 * - runs desktop/tablet/mobile scroll checks
 * - clicks visible controls and records frontend, layout, and API failures
 * - writes reports/ui-interaction-audit.json and .md
 *
 * The script refuses to use a non ui-audit-* org unless explicitly forced.
 */

import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REGISTRY_PATH = path.join(ROOT, 'docs/platform-loops/navbar-smoke-registry.json')
const REPORT_DIR = path.join(ROOT, 'reports')
const REPORT_JSON = path.join(REPORT_DIR, 'ui-interaction-audit.json')
const REPORT_MD = path.join(REPORT_DIR, 'ui-interaction-audit.md')
const VITE_ENV = await loadViteEnv()

const CONTROL_SELECTOR = [
  'button',
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="switch"]',
  '[role="checkbox"]',
  'a[href]',
  'input[type="button"]',
  'input[type="submit"]',
].join(',')

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 1024, height: 768 },
  mobile: { width: 390, height: 844, isMobile: true },
}

const BENIGN_STATUS_PATHS = [
  /\/api\/v1\/code\/orgs\/[^/]+\/github\//,
  /\/api\/v1\/code\/orgs\/[^/]+\/token\/status/,
]

const BENIGN_CONSOLE_WARNING_PATTERNS = [
  /^THREE\.Clock: This module has been deprecated\./,
  /GL Driver Message .*ReadPixels/i,
  /GPU stall due to ReadPixels/i,
]
const I18N_MISSING_KEY_WARNING_PATTERN = /^\[i18n\] missing key:/

const ROUTE_CLICK_BUDGETS = {
  reports: 32,
  va_report: 24,
}

const args = parseArgs(process.argv.slice(2))
const soft = args.has('soft') || process.env.FLYTO_UI_AUDIT_SOFT === '1'
const headed = args.has('headed') || process.env.FLYTO_UI_AUDIT_HEADED === '1'
const seedFixtures = !args.has('no-seed') && process.env.FLYTO_UI_AUDIT_SEED !== '0'
const seedDomainFixture = seedFixtures && (args.has('seed-domains') || process.env.FLYTO_UI_AUDIT_SEED_DOMAINS === '1')
const seedRepoFixture = args.has('seed-repo') || process.env.FLYTO_UI_AUDIT_SEED_REPO === '1'
const keepOrg = args.has('keep-org') || process.env.FLYTO_UI_AUDIT_KEEP_ORG === '1'
const failOnWarnings = args.has('fail-on-warnings') || process.env.FLYTO_UI_AUDIT_FAIL_ON_WARNINGS === '1'
const maxRoutes = numberArg('max-routes', 'FLYTO_UI_AUDIT_MAX_ROUTES', Infinity)
const maxClicksPerRoute = numberArg('max-clicks-per-route', 'FLYTO_UI_AUDIT_MAX_CLICKS_PER_ROUTE', 160)
const clickPasses = numberArg('click-passes', 'FLYTO_UI_AUDIT_CLICK_PASSES', 3)
const perRouteTimeoutMs = numberArg('route-timeout-ms', 'FLYTO_UI_AUDIT_ROUTE_TIMEOUT_MS', 120000)
const perClickTimeoutMs = numberArg('click-timeout-ms', 'FLYTO_UI_AUDIT_CLICK_TIMEOUT_MS', 8000)
const perClickSettleMs = numberArg('settle-ms', 'FLYTO_UI_AUDIT_SETTLE_MS', 450)
const clickScope = argValue('click-scope') || process.env.FLYTO_UI_AUDIT_CLICK_SCOPE || 'page'
const routeFilter = parseCsv(argValue('routes') ?? process.env.FLYTO_UI_AUDIT_ROUTES)
const viewportFilter = parseCsv(argValue('viewports') ?? process.env.FLYTO_UI_AUDIT_VIEWPORTS)
const modeFilter = parseCsv(argValue('modes') ?? process.env.FLYTO_UI_AUDIT_MODES)

function parseArgs(raw) {
  const out = new Map()
  for (const item of raw) {
    if (!item.startsWith('--')) continue
    const body = item.slice(2)
    const eq = body.indexOf('=')
    if (eq === -1) out.set(body, 'true')
    else out.set(body.slice(0, eq), body.slice(eq + 1))
  }
  return out
}

function timeoutError(message) {
  const error = new Error(message)
  error.name = 'TimeoutError'
  return error
}

function isBenignConsoleWarning(text) {
  return BENIGN_CONSOLE_WARNING_PATTERNS.some((pattern) => pattern.test(text))
}

function parseI18nMissingKeyWarning(text) {
  if (!I18N_MISSING_KEY_WARNING_PATTERN.test(text)) return null
  const match = text.match(/^\[i18n\] missing key:\s*([^(]+?)(?:\s*\(locale=([^)]+)\))?$/)
  return {
    text,
    key: match?.[1]?.trim() || null,
    locale: match?.[2]?.trim() || null,
  }
}

async function withTimeout(label, timeoutMs, task) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return task()
  let timer = null
  try {
    return await Promise.race([
      task(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(timeoutError(`${label} exceeded ${timeoutMs}ms`)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function argValue(name) {
  return args.get(name)
}

function numberArg(argName, envName, fallback) {
  const raw = argValue(argName) ?? envValue(envName)
  if (raw === undefined || raw === '') return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

async function loadViteEnv() {
  const mode = process.env.VITE_MODE || process.env.MODE || 'development'
  const files = [
    '.env',
    '.env.local',
    `.env.${mode}`,
    `.env.${mode}.local`,
  ]
  const out = {}
  for (const file of files) {
    let raw = ''
    try {
      raw = await fs.readFile(path.join(ROOT, file), 'utf8')
    } catch {
      continue
    }
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
      if (!match) continue
      let value = match[2].trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      out[match[1]] = value
    }
  }
  return out
}

function envValue(name) {
  return process.env[name] ?? VITE_ENV[name]
}

function parseCsv(raw) {
  if (!raw) return null
  const values = raw.split(',').map((v) => v.trim()).filter(Boolean)
  return values.length ? new Set(values) : null
}

function routeModes(route) {
  const declared = route.mode === 'both' ? ['engineer', 'manager'] : [route.mode || 'engineer']
  return modeFilter ? declared.filter((mode) => modeFilter.has(mode)) : declared
}

function base64url(value) {
  return Buffer.from(JSON.stringify(value))
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function devAuthIdentity() {
  const uid = envValue('FLYTO_UI_AUDIT_UID') || envValue('VITE_DEV_AUTH_UID') || 'test-uid-1'
  const email = envValue('FLYTO_UI_AUDIT_EMAIL') || envValue('VITE_DEV_AUTH_EMAIL') || 'test@flyto.dev'
  const token = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ sub: uid, email })}.`
  return { uid, email, token }
}

function normalizeBase(url) {
  return String(url).replace(/\/+$/g, '')
}

async function canFetchHtml(baseUrl) {
  try {
    const res = await fetch(baseUrl, { headers: { Accept: 'text/html' } })
    if (!res.ok) return false
    const ct = res.headers.get('content-type') || ''
    return ct.includes('text/html') || (await res.text()).includes('<html')
  } catch {
    return false
  }
}

async function resolveAppUrl() {
  const requested = envValue('FLYTO_UI_AUDIT_APP_URL') || envValue('VITE_DEV_SERVER_URL')
  const candidates = [
    requested,
    'http://127.0.0.1:5181',
    'http://127.0.0.1:5180',
    'http://127.0.0.1:5173',
  ].filter(Boolean).map(normalizeBase)
  for (const candidate of candidates) {
    if (await canFetchHtml(candidate)) return candidate
  }
  throw new Error(`frontend is not reachable; tried ${candidates.join(', ')}`)
}

async function resolveEngineUrl(headers) {
  const requested = envValue('FLYTO_UI_AUDIT_ENGINE_URL') || envValue('VITE_ENGINE_URL')
  const candidates = [
    requested,
    'http://127.0.0.1:8080',
    'http://localhost:8080',
  ].filter(Boolean).map(normalizeBase)
  for (const candidate of candidates) {
    try {
      const res = await fetch(`${candidate}/api/v1/code/orgs`, { headers })
      if (res.status === 200) return candidate
    } catch {
      // try next candidate
    }
  }
  throw new Error(`engine is not reachable/authenticated; tried ${candidates.join(', ')}`)
}

async function engineJson(engineUrl, headers, method, apiPath, body = undefined) {
  const idem = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  const res = await fetch(`${engineUrl}${apiPath}`, {
    method,
    headers: {
      ...headers,
      ...(method === 'POST' || method === 'PUT' ? { 'Idempotency-Key': idem } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }
  if (!res.ok) {
    const detail = typeof data?.error === 'string' ? data.error : text
    throw new Error(`${method} ${apiPath} -> HTTP ${res.status}${detail ? `: ${detail}` : ''}`)
  }
  return data
}

function assertAuditOrg(org, { allowExisting = false } = {}) {
  const id = String(org?.id || '')
  const slug = String(org?.slug || '')
  const name = String(org?.name || '')
  const isAudit = slug.startsWith('ui-audit-') || name.startsWith('UI Audit ') || id.startsWith('ui-audit-')
  if (!isAudit && !allowExisting) {
    throw new Error(`refusing to mutate non-audit org id=${id || '<missing>'} slug=${slug || '<missing>'}`)
  }
}

async function createOrLoadAuditOrg(engineUrl, headers) {
  const existingId = process.env.FLYTO_UI_AUDIT_ORG_ID
  if (existingId) {
    const org = await engineJson(engineUrl, headers, 'GET', `/api/v1/code/orgs/${encodeURIComponent(existingId)}`)
    assertAuditOrg(org, { allowExisting: process.env.FLYTO_UI_AUDIT_ALLOW_EXISTING_ORG === '1' })
    return { org, created: false }
  }
  const suffix = Date.now().toString(36)
  const org = await engineJson(engineUrl, headers, 'POST', '/api/v1/code/orgs', {
    name: `UI Audit ${suffix}`,
    slug: `ui-audit-${suffix}`,
    project_type: 'all',
  })
  assertAuditOrg(org)
  return { org, created: true }
}

async function verifyAuditOrgAccess(engineUrl, headers, org, authIdentity) {
  const orgID = encodeURIComponent(org.id)
  let persistedOrg
  try {
    persistedOrg = await engineJson(engineUrl, headers, 'GET', `/api/v1/code/orgs/${orgID}`)
  } catch (error) {
    throw new Error(`created audit org is not readable by uid=${authIdentity.uid}: ${error.message}`)
  }
  if (persistedOrg?.id !== org.id) {
    throw new Error(`created audit org id mismatch: expected ${org.id}, got ${persistedOrg?.id || '<missing>'}`)
  }

  let caps
  try {
    caps = await engineJson(engineUrl, headers, 'GET', `/api/v1/me/capabilities?org_id=${orgID}`)
  } catch (error) {
    throw new Error(`audit auth cannot read capabilities for org=${org.id} uid=${authIdentity.uid}: ${error.message}`)
  }
  if (!Array.isArray(caps?.visible_pages)) {
    throw new Error(`capabilities response for org=${org.id} did not include visible_pages[]`)
  }
  return {
    role: caps.role || null,
    tier: caps.tier || null,
    plan: caps.plan || null,
    projectType: caps.project_type || null,
    visiblePageCount: caps.visible_pages.length,
  }
}

async function seedAuditData(engineUrl, headers, orgId) {
  const warnings = []
  const calls = [
    ...(seedDomainFixture ? [{
      label: 'domains',
      method: 'POST',
      path: `/api/v1/code/orgs/${orgId}/domains/import`,
      body: {
        domains: [
          `ui-audit-${Date.now().toString(36)}.example.test`,
          `api-ui-audit-${Date.now().toString(36)}.example.test`,
        ],
        environment: 'staging',
        role: 'primary',
      },
    }] : []),
    ...(seedRepoFixture ? [{
      label: 'repo',
      method: 'POST',
      path: `/api/v1/code/orgs/${orgId}/repos`,
      body: {
        provider: 'github',
        providerId: `ui-audit-${Date.now()}`,
        ownerName: 'flytohub',
        repoName: 'ui-audit-fixture',
        fullName: 'flytohub/ui-audit-fixture',
        defaultBranch: 'main',
        language: 'TypeScript',
        isPrivate: false,
        htmlUrl: 'https://github.com/flytohub/ui-audit-fixture',
        homepage: 'https://ui-audit.example.test',
      },
    }] : []),
    {
      label: 'api-key',
      method: 'POST',
      path: `/api/v1/code/orgs/${orgId}/api-keys`,
      body: { name: 'UI audit key', scopes: 'read' },
    },
    {
      label: 'report-template',
      method: 'POST',
      path: `/api/v1/code/orgs/${orgId}/report-templates`,
      body: {
        name: 'UI audit report',
        category: 'custom',
        config: { sections: [{ type: 'summary', title: 'Audit summary' }] },
      },
    },
    {
      label: 'report-component',
      method: 'POST',
      path: `/api/v1/code/orgs/${orgId}/report-components`,
      body: {
        name: 'UI audit chart',
        data_source_id: 'findings',
        chart_type: 'bar',
        label_field: 'severity',
        value_field: 'count',
        default_cols: 6,
      },
    },
    {
      label: 'webhook',
      method: 'POST',
      path: `/api/v1/code/orgs/${orgId}/webhooks`,
      body: { url: 'https://example.com/flyto-ui-audit-webhook', events: 'critical_issue' },
    },
  ]
  for (const call of calls) {
    try {
      await engineJson(engineUrl, headers, call.method, call.path, call.body)
    } catch (error) {
      warnings.push({ kind: 'seed_failed', fixture: call.label, detail: error.message })
    }
  }
  return warnings
}

function loadRegistry(raw) {
  const parsed = JSON.parse(raw)
  const routes = Array.isArray(parsed) ? parsed : parsed.routes
  if (!Array.isArray(routes)) throw new Error('navbar smoke registry must contain routes[]')
  return routes
}

function routeHref(appUrl, route, mode, orgId) {
  const template = route.pathTemplate || `/projects/{orgId}/${route.id}`
  const replaced = template.replaceAll('{orgId}', encodeURIComponent(orgId))
  const url = new URL(replaced, appUrl)
  url.searchParams.set('mode', mode)
  return url.toString()
}

function isLocalEngineUrl(url) {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return /^(127\.0\.0\.1|localhost)$/.test(parsed.hostname) && parsed.pathname.startsWith('/api/')
  } catch {
    return false
  }
}

function isBenignResponse(url, status) {
  if (status < 400) return true
  try {
    const parsed = new URL(url)
    return BENIGN_STATUS_PATHS.some((pattern) => pattern.test(parsed.pathname)) && (status === 401 || status === 403 || status === 404)
  } catch {
    return false
  }
}

async function dismissTransientUi(page) {
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(60).catch(() => {})
  }
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }).catch(() => {})
  const closeButtons = page.locator('button[aria-label*="Close" i], button[title*="Close" i], [role="button"][aria-label*="Close" i]')
  const count = Math.min(await closeButtons.count().catch(() => 0), 3)
  for (let i = 0; i < count; i += 1) {
    const btn = closeButtons.nth(i)
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout: 800 }).catch(() => {})
      await page.waitForTimeout(80).catch(() => {})
    }
  }
}

async function confirmIfOpened(page) {
  const confirmPattern = /^(confirm|delete|remove|revoke|yes|save|apply|run|start|continue|send|approve|deny|reset|cancel all|disconnect)$/i
  const dialogs = page.locator('[role="dialog"], [aria-modal="true"]')
  const dialogCount = await dialogs.count().catch(() => 0)
  if (dialogCount === 0) return []
  const clicked = []
  for (let d = 0; d < Math.min(dialogCount, 3); d += 1) {
    const dialog = dialogs.nth(d)
    if (!(await dialog.isVisible().catch(() => false))) continue
    const buttons = dialog.locator('button, [role="button"], input[type="submit"]')
    const count = Math.min(await buttons.count().catch(() => 0), 20)
    for (let i = 0; i < count; i += 1) {
      const btn = buttons.nth(i)
      if (!(await btn.isVisible().catch(() => false))) continue
      const label = await controlLabel(btn)
      if (!confirmPattern.test(label)) continue
      try {
        await btn.click({ timeout: 1200 })
        clicked.push(label)
        await page.waitForTimeout(250)
      } catch {
        // continue to cleanup below
      }
      break
    }
  }
  return clicked
}

async function controlLabel(locator) {
  try {
    return await locator.evaluate((el) => {
      const element = /** @type {HTMLElement} */ (el)
      const aria = element.getAttribute('aria-label') || element.getAttribute('title') || element.getAttribute('name')
      const text = (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim()
      const value = element instanceof HTMLInputElement ? element.value : ''
      const href = element instanceof HTMLAnchorElement ? element.href : ''
      return (aria || text || value || href || element.tagName).slice(0, 180)
    })
  } catch {
    return '<detached>'
  }
}

async function controlMeta(locator) {
  try {
    return await locator.evaluate((el) => {
      const element = /** @type {HTMLElement} */ (el)
      const style = window.getComputedStyle(element)
      const text = (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim()
      const label = element.getAttribute('aria-label') || element.getAttribute('title') || element.getAttribute('name') || text
      const href = element instanceof HTMLAnchorElement ? element.href : element.getAttribute('href')
      const rect = element.getBoundingClientRect()
      const cssVisible =
        typeof element.checkVisibility === 'function'
          ? element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
          : style.visibility !== 'hidden' && style.display !== 'none'
      return {
        label: (label || element.tagName).slice(0, 180),
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute('role') || '',
        href: href || '',
        disabled: Boolean(element.disabled) || element.getAttribute('aria-disabled') === 'true',
        visible: cssVisible && !element.closest('[aria-hidden="true"]') && rect.width > 0 && rect.height > 0,
      }
    })
  } catch {
    return { label: '<detached>', tag: '', role: '', href: '', disabled: true, visible: false }
  }
}

async function collectDomAudit(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const style = window.getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0
    }
    const controls = Array.from(document.querySelectorAll(
      'button,[role="button"],[role="tab"],[role="menuitem"],[role="switch"],[role="checkbox"],a[href],input[type="button"],input[type="submit"]',
    )).filter(visible)
    const namelessControls = controls
      .filter((el) => {
        const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim()
        return !text && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') && !el.getAttribute('title') && !el.getAttribute('name')
      })
      .slice(0, 30)
      .map((el) => {
        const rect = el.getBoundingClientRect()
        return {
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role') || '',
          className: String(el.getAttribute('class') || '').slice(0, 160),
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
        }
      })
    const badTextRe = /\b(?:NaN|Invalid Date|null|undefined|\[object Object\])\b/
    const textNodes = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    while (textNodes.length < 40) {
      const node = walker.nextNode()
      if (!node) break
      const value = (node.textContent || '').replace(/\s+/g, ' ').trim()
      if (!value || !badTextRe.test(value)) continue
      const parent = node.parentElement
      if (!parent || !visible(parent)) continue
      textNodes.push(value.slice(0, 220))
    }
    const doc = document.documentElement
    const body = document.body
    const pageOverflowX = Math.max(doc.scrollWidth, body.scrollWidth) > Math.max(doc.clientWidth, window.innerWidth) + 4
    const overflowElements = Array.from(document.querySelectorAll('body *'))
      .filter((el) => {
        if (!(el instanceof HTMLElement) || !visible(el)) return false
        const rect = el.getBoundingClientRect()
        return rect.right > window.innerWidth + 6 || rect.left < -6
      })
      .slice(0, 30)
      .map((el) => {
        const rect = el.getBoundingClientRect()
        return {
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role') || '',
          text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120),
          className: String(el.getAttribute('class') || '').slice(0, 160),
          rect: { x: Math.round(rect.x), width: Math.round(rect.width), right: Math.round(rect.right) },
        }
      })
    const loadingText = Array.from(document.querySelectorAll('body *'))
      .filter((el) => el instanceof HTMLElement && visible(el))
      .map((el) => (el.innerText || '').replace(/\s+/g, ' ').trim())
      .filter((text) => /^(loading|loading\.{1,3}|載入中|讀取中)$/i.test(text))
      .slice(0, 20)
    const spinners = Array.from(document.querySelectorAll('[role="progressbar"], .MuiCircularProgress-root, [class*="spinner" i]'))
      .filter((el) => {
        if (!(el instanceof HTMLElement) || !visible(el)) return false
        // Determinate progress bars are KPI visuals, not a stuck loading
        // state. MUI's LinearProgress renders role=progressbar with an
        // aria-valuenow; count only indeterminate progress/circular loaders.
        if (el.getAttribute('role') === 'progressbar' && el.getAttribute('aria-valuenow') != null) return false
        if (String(el.getAttribute('class') || '').includes('MuiLinearProgress-root')) return false
        return true
      }).length
    const title = document.title
    const h1 = Array.from(document.querySelectorAll('h1')).map((el) => el.textContent?.trim()).filter(Boolean)
    return {
      title,
      h1,
      controlCount: controls.length,
      namelessControls,
      badText: textNodes,
      pageOverflowX,
      overflowElements,
      loadingText,
      spinners,
      scroll: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        scrollWidth: Math.max(doc.scrollWidth, body.scrollWidth),
        scrollHeight: Math.max(doc.scrollHeight, body.scrollHeight),
      },
    }
  })
}

async function scrollAudit(page) {
  const nested = await page.evaluate(() => {
    const out = []
    const visible = (el) => {
      const rect = el.getBoundingClientRect()
      const style = window.getComputedStyle(el)
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 20 && rect.height > 20
    }
    for (const el of Array.from(document.querySelectorAll('main, [role="main"], section, [class*="scroll" i], [class*="content" i], [class*="panel" i]'))) {
      if (!(el instanceof HTMLElement) || !visible(el)) continue
      if (el.scrollHeight <= el.clientHeight + 12) continue
      out.push({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role') || '',
        className: String(el.getAttribute('class') || '').slice(0, 140),
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      })
      if (out.length >= 20) break
    }
    return out
  })
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {})
  await page.waitForTimeout(60)
  await page.evaluate(() => window.scrollTo(0, Math.floor(document.documentElement.scrollHeight / 2))).catch(() => {})
  await page.waitForTimeout(60)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)).catch(() => {})
  await page.waitForTimeout(80)
  await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll('main, [role="main"], section, [class*="scroll" i], [class*="content" i], [class*="panel" i]'))) {
      if (el instanceof HTMLElement && el.scrollHeight > el.clientHeight + 12) el.scrollTop = el.scrollHeight
    }
  }).catch(() => {})
  await page.waitForTimeout(80)
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {})
  return { nestedScrollableCount: nested.length, nestedSamples: nested.slice(0, 8) }
}

function routeClickPasses(route) {
  // Dense editor surfaces expose transient dialogs, selects, and large
  // control catalogs. One stable pass still clicks the page actions/tabs
  // without turning the audit into a long-running editor fuzz test. Deeper
  // drills can be enabled explicitly with FLYTO_UI_AUDIT_CLICK_PASSES.
  if ((route.id === 'autofix' || route.id === 'reports' || route.id === 'va_report') && !process.env.FLYTO_UI_AUDIT_CLICK_PASSES && !argValue('click-passes')) return 1
  return clickPasses
}

function routeClickLimit(route) {
  const routeBudget = ROUTE_CLICK_BUDGETS[route.id]
  if (routeBudget && process.env.FLYTO_UI_AUDIT_DISABLE_ROUTE_CLICK_BUDGETS !== '1') return Math.min(maxClicksPerRoute, routeBudget)
  return maxClicksPerRoute
}

async function clickAudit(page, routeUrl, record, route) {
  const clickResults = []
  const uniqueSeen = new Set()
  let clicked = 0
  const maxPasses = routeClickPasses(route)
  const maxClicks = routeClickLimit(route)

  for (let pass = 0; pass < maxPasses && clicked < maxClicks; pass += 1) {
    const initialControls = await controlLocator(page)
    const count = await initialControls.count().catch(() => 0)
    if (count === 0) break
    const limit = Math.min(count, maxClicks - clicked)
    let passClicked = 0
    for (let i = 0; i < limit && clicked < maxClicks; i += 1) {
      await dismissTransientUi(page)
      const controls = await controlLocator(page)
      if (i >= await controls.count().catch(() => 0)) break
      const locator = controls.nth(i)
      const meta = await withTimeout(`control metadata ${pass}:${i}`, 2500, () => controlMeta(locator))
      if (!meta.visible || meta.disabled) continue
      if (!(await locator.isVisible().catch(() => false))) continue
      if (!(await locator.isEnabled().catch(() => false))) continue
      const uniqueKey = `${meta.tag}|${meta.role}|${meta.label}|${meta.href}`
      if (uniqueSeen.has(uniqueKey)) continue
      uniqueSeen.add(uniqueKey)

      const beforeUrl = page.url()
      const beforeErrors = record.errors.length
      const beforeApiFailures = record.apiFailures.length
      const result = {
        pass,
        index: i,
        label: meta.label || '<unnamed>',
        tag: meta.tag,
        role: meta.role,
        href: meta.href,
        status: 'clicked',
        urlBefore: beforeUrl,
        urlAfter: beforeUrl,
        confirmations: [],
        errorsAdded: 0,
        apiFailuresAdded: 0,
      }
      try {
        await withTimeout(`click ${result.label}`, perClickTimeoutMs, async () => {
          await locator.scrollIntoViewIfNeeded({ timeout: 1200 }).catch(() => {})
          const popupPromise = page.waitForEvent('popup', { timeout: 800 }).catch(() => null)
          await locator.click({ timeout: 1800, force: false })
          clicked += 1
          passClicked += 1
          await page.waitForTimeout(perClickSettleMs)
          const popup = await popupPromise
          if (popup) {
            result.popupUrl = popup.url()
            await popup.close().catch(() => {})
          }
          result.confirmations = await confirmIfOpened(page)
          await page.waitForTimeout(120)
          result.urlAfter = page.url()
          if (new URL(result.urlAfter).origin === new URL(routeUrl).origin && result.urlAfter !== routeUrl) {
            await page.goto(routeUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {})
            await page.waitForTimeout(350)
          }
        })
      } catch (error) {
        result.status = 'error'
        result.error = error.message
        const kind = error.name === 'TimeoutError' ? 'click_timeout' : 'click_error'
        record.errors.push({ kind, label: result.label, detail: error.message })
      } finally {
        result.errorsAdded = record.errors.length - beforeErrors
        result.apiFailuresAdded = record.apiFailures.length - beforeApiFailures
        await dismissTransientUi(page)
        clickResults.push(result)
      }
    }
    if (passClicked === 0) break
  }

  if (maxClicks > 0 && clicked >= maxClicks && maxClicks === maxClicksPerRoute) {
    record.warnings.push({
      kind: 'click_cap_reached',
      detail: `route hit max-clicks-per-route=${maxClicks}; raise FLYTO_UI_AUDIT_MAX_CLICKS_PER_ROUTE for a deeper pass`,
    })
  }
  return { clicked, clickResults }
}

async function controlLocator(page) {
  if (clickScope === 'all') return page.locator(CONTROL_SELECTOR)
  for (const selector of ['[data-testid="workspace-main-content"]', '[data-testid="workspace-main-scroll"]', 'main']) {
    const root = page.locator(selector).first()
    if ((await root.count().catch(() => 0)) > 0) return root.locator(CONTROL_SELECTOR)
  }
  return page.locator(CONTROL_SELECTOR)
}

async function auditRoute(browser, appUrl, route, mode, viewportName, viewport, orgId) {
  const url = routeHref(appUrl, route, mode, orgId)
  const expected = new URL(url)
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: Boolean(viewport.isMobile),
  })
  const page = await context.newPage()
  const record = {
    route: route.id,
    label: route.label,
    mode,
    viewport: viewportName,
    url,
    errors: [],
    warnings: [],
    apiFailures: [],
    consoleErrors: [],
    consoleWarnings: [],
    i18nMissingKeys: [],
    benignConsoleWarnings: [],
    pageErrors: [],
    dom: null,
    scroll: null,
    clicks: { clicked: 0, clickResults: [] },
  }

  page.on('console', (message) => {
    if (message.type() === 'error') {
      record.consoleErrors.push({ text: message.text().slice(0, 500) })
    } else if (message.type() === 'warning') {
      const text = message.text().slice(0, 500)
      const i18nMissingKey = parseI18nMissingKeyWarning(text)
      if (i18nMissingKey) {
        record.i18nMissingKeys.push(i18nMissingKey)
        record.consoleWarnings.push({ text })
      } else if (isBenignConsoleWarning(text)) {
        record.benignConsoleWarnings.push({ text })
      } else {
        record.consoleWarnings.push({ text })
      }
    }
  })
  page.on('pageerror', (error) => {
    record.pageErrors.push({ message: error.message, stack: String(error.stack || '').slice(0, 1000) })
  })
  page.on('response', (response) => {
    const status = response.status()
    const responseUrl = response.url()
    if (!isLocalEngineUrl(responseUrl) || isBenignResponse(responseUrl, status)) return
    record.apiFailures.push({
      status,
      method: response.request().method(),
      url: responseUrl,
    })
  })

  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    if (!response || !response.ok()) {
      record.errors.push({ kind: 'navigation', detail: `HTTP ${response?.status() ?? 'no response'}` })
    }
    await page.waitForLoadState('networkidle', { timeout: 3500 }).catch(() => {})
    await page.waitForTimeout(450)
    const landed = new URL(page.url())
    if (landed.origin !== expected.origin || landed.pathname !== expected.pathname) {
      record.errors.push({
        kind: 'route_redirect',
        detail: `expected ${expected.pathname} but landed on ${landed.pathname}`,
      })
      record.dom = await collectDomAudit(page)
      record.scroll = await scrollAudit(page)
      return record
    }
    const expectedMode = expected.searchParams.get('mode')
    const landedMode = landed.searchParams.get('mode')
    if (expectedMode && landedMode !== expectedMode) {
      record.errors.push({
        kind: 'route_redirect',
        detail: `expected mode=${expectedMode || '<none>'} but landed on mode=${landedMode || '<none>'}`,
      })
      record.dom = await collectDomAudit(page)
      record.scroll = await scrollAudit(page)
      return record
    }
    record.dom = await collectDomAudit(page)
    record.scroll = await scrollAudit(page)
    const afterScrollDom = await collectDomAudit(page)
    record.dom.badText = [...new Set([...(record.dom.badText || []), ...(afterScrollDom.badText || [])])]
    record.dom.overflowElements = [...(record.dom.overflowElements || []), ...(afterScrollDom.overflowElements || [])].slice(0, 40)
    const clickData = await clickAudit(page, url, record, route)
    record.clicks = clickData
    const afterClicksDom = await collectDomAudit(page)
    record.afterClicksDom = afterClicksDom
  } catch (error) {
    record.errors.push({ kind: 'route_audit', detail: error.message })
  } finally {
    await context.close().catch(() => {})
  }

  const dom = record.dom || {}
  if ((dom.namelessControls || []).length) {
    record.errors.push({ kind: 'nameless_controls', detail: `${dom.namelessControls.length} visible controls lack an accessible name` })
  }
  if ((dom.badText || []).length) {
    record.errors.push({ kind: 'bad_text', detail: `bad placeholder values: ${dom.badText.slice(0, 3).join(' | ')}` })
  }
  if (dom.pageOverflowX) {
    record.errors.push({ kind: 'horizontal_overflow', detail: `${(dom.overflowElements || []).length} overflowing element samples` })
  }
  if (record.pageErrors.length) {
    record.errors.push({ kind: 'page_error', detail: `${record.pageErrors.length} page runtime error(s)` })
  }
  if (record.consoleErrors.length) {
    record.errors.push({ kind: 'console_error', detail: `${record.consoleErrors.length} console error(s)` })
  }
  if (record.consoleWarnings.length) {
    record.warnings.push({ kind: 'console_warning', detail: `${record.consoleWarnings.length} console warning(s)` })
  }
  if (record.i18nMissingKeys.length) {
    const sample = record.i18nMissingKeys
      .map((item) => item.key || item.text)
      .filter(Boolean)
      .slice(0, 8)
      .join(', ')
    record.errors.push({
      kind: 'i18n_missing_key',
      detail: `${record.i18nMissingKeys.length} runtime missing i18n key warning(s)${sample ? `: ${sample}` : ''}`,
    })
  }
  if (record.apiFailures.length) {
    record.errors.push({ kind: 'api_failure', detail: `${record.apiFailures.length} local API failure response(s)` })
  }

  return record
}

function timeoutRouteRecord(appUrl, route, mode, viewportName, orgId, detail) {
  return {
    route: route.id,
    label: route.label,
    mode,
    viewport: viewportName,
    url: routeHref(appUrl, route, mode, orgId),
    errors: [{ kind: 'route_timeout', detail }],
    warnings: [],
    apiFailures: [],
    consoleErrors: [],
    consoleWarnings: [],
    i18nMissingKeys: [],
    benignConsoleWarnings: [],
    pageErrors: [],
    dom: null,
    scroll: null,
    clicks: { clicked: 0, clickResults: [] },
  }
}

async function auditRouteBounded(browser, appUrl, route, mode, viewportName, viewport, orgId) {
  if (!Number.isFinite(perRouteTimeoutMs) || perRouteTimeoutMs <= 0) {
    const record = await auditRoute(browser, appUrl, route, mode, viewportName, viewport, orgId)
    return { record, timedOut: false }
  }
  let timer = null
  const auditPromise = auditRoute(browser, appUrl, route, mode, viewportName, viewport, orgId)
    .then((record) => ({ record, timedOut: false }))
    .catch((error) => ({
      record: timeoutRouteRecord(appUrl, route, mode, viewportName, orgId, `route audit crashed: ${error.message}`),
      timedOut: false,
    }))
  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => {
      resolve({
        record: timeoutRouteRecord(appUrl, route, mode, viewportName, orgId, `route exceeded ${perRouteTimeoutMs}ms`),
        timedOut: true,
      })
    }, perRouteTimeoutMs)
  })
  const result = await Promise.race([auditPromise, timeoutPromise])
  if (timer) clearTimeout(timer)
  return result
}

async function launchAuditBrowser() {
  const opts = { headless: !headed }
  try {
    return await chromium.launch(opts)
  } catch (error) {
    const hint = [
      error.message,
      '',
      'Playwright browser executable is missing. Run:',
      '  npx playwright install chromium',
    ].join('\n')
    const wrapped = new Error(hint)
    wrapped.cause = error
    throw wrapped
  }
}

function summarize(records, warnings) {
  const failed = records.filter((record) => record.errors.length > 0)
  const warned = records.filter((record) => record.warnings.length > 0)
  const clicked = records.reduce((sum, record) => sum + (record.clicks?.clicked || 0), 0)
  return {
    totalRuns: records.length,
    failedRuns: failed.length,
    warnedRuns: warned.length,
    totalClicks: clicked,
    totalErrors: records.reduce((sum, record) => sum + record.errors.length, 0),
    totalApiFailures: records.reduce((sum, record) => sum + record.apiFailures.length, 0),
    totalConsoleErrors: records.reduce((sum, record) => sum + record.consoleErrors.length, 0),
    totalConsoleWarnings: records.reduce((sum, record) => sum + (record.consoleWarnings?.length || 0), 0),
    totalI18nMissingKeys: records.reduce((sum, record) => sum + (record.i18nMissingKeys?.length || 0), 0),
    totalBenignConsoleWarnings: records.reduce((sum, record) => sum + (record.benignConsoleWarnings?.length || 0), 0),
    setupWarnings: warnings.length,
  }
}

function markdownReport(report) {
  const lines = []
  lines.push('# UI Interaction Audit')
  lines.push('')
  lines.push(`- Generated: ${report.generatedAt}`)
  lines.push(`- App URL: ${report.appUrl}`)
  lines.push(`- Engine URL: ${report.engineUrl}`)
  lines.push(`- Org: ${report.org.id} (${report.org.slug || report.org.name})`)
  if (report.auth?.uid) lines.push(`- Auth UID: ${report.auth.uid} (${report.auth.email || 'no email'})`)
  if (report.capabilitySummary) {
    lines.push(`- Capabilities: ${report.capabilitySummary.role || 'unknown'} / ${report.capabilitySummary.tier || 'unknown'} / ${report.capabilitySummary.visiblePageCount} pages`)
  }
  lines.push(`- Runs: ${report.summary.totalRuns}`)
  lines.push(`- Clicks: ${report.summary.totalClicks}`)
  lines.push(`- Failed runs: ${report.summary.failedRuns}`)
  lines.push(`- API failures: ${report.summary.totalApiFailures}`)
  lines.push(`- Console errors: ${report.summary.totalConsoleErrors}`)
  lines.push(`- Console warnings: ${report.summary.totalConsoleWarnings}`)
  lines.push(`- Runtime missing i18n keys: ${report.summary.totalI18nMissingKeys}`)
  lines.push(`- Ignored benign console warnings: ${report.summary.totalBenignConsoleWarnings || 0}`)
  if (report.setupWarnings.length) {
    lines.push('')
    lines.push('## Setup Warnings')
    for (const warning of report.setupWarnings) lines.push(`- ${warning.kind}: ${warning.fixture || ''} ${warning.detail}`)
  }
  const failures = report.records.filter((record) => record.errors.length)
  if (failures.length) {
    lines.push('')
    lines.push('## Failures')
    for (const record of failures.slice(0, 120)) {
      lines.push(`- ${record.route} / ${record.mode} / ${record.viewport}: ${record.errors.map((e) => `${e.kind}: ${e.detail}`).join('; ')}`)
    }
  }
  const clickCaps = report.records.filter((record) => record.warnings.some((warning) => warning.kind === 'click_cap_reached'))
  const i18nMissingKeys = report.records.filter((record) => record.i18nMissingKeys?.length)
  const consoleWarnings = report.records.filter((record) => record.consoleWarnings?.length)
  if (clickCaps.length) {
    lines.push('')
    lines.push('## Click Caps')
    for (const record of clickCaps.slice(0, 80)) {
      lines.push(`- ${record.route} / ${record.mode} / ${record.viewport}: ${record.warnings.map((w) => w.detail).join('; ')}`)
    }
  }
  if (i18nMissingKeys.length) {
    lines.push('')
    lines.push('## Runtime Missing I18n Keys')
    for (const record of i18nMissingKeys.slice(0, 80)) {
      const sample = record.i18nMissingKeys
        .map((item) => `${item.key || item.text}${item.locale ? ` (${item.locale})` : ''}`)
        .join(' | ')
        .slice(0, 500)
      lines.push(`- ${record.route} / ${record.mode} / ${record.viewport}: ${sample}`)
    }
  }
  if (consoleWarnings.length) {
    lines.push('')
    lines.push('## Console Warnings')
    for (const record of consoleWarnings.slice(0, 80)) {
      const sample = record.consoleWarnings.map((w) => w.text).join(' | ').slice(0, 500)
      lines.push(`- ${record.route} / ${record.mode} / ${record.viewport}: ${sample}`)
    }
  }
  if (!failures.length && !clickCaps.length && !consoleWarnings.length) {
    lines.push('')
    lines.push('No route-level failures were detected.')
  }
  lines.push('')
  return `${lines.join('\n')}\n`
}

async function main() {
  const authIdentity = devAuthIdentity()
  const headers = {
    Authorization: `Bearer ${authIdentity.token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  const [registryRaw, appUrl, engineUrl] = await Promise.all([
    fs.readFile(REGISTRY_PATH, 'utf8'),
    resolveAppUrl(),
    resolveEngineUrl(headers),
  ])
  let routes = loadRegistry(registryRaw)
  if (routeFilter) routes = routes.filter((route) => routeFilter.has(route.id))
  routes = routes.slice(0, Number.isFinite(maxRoutes) ? maxRoutes : routes.length)
  if (!routes.length) throw new Error('no routes selected for audit')
  const viewportEntries = Object.entries(VIEWPORTS).filter(([name]) => !viewportFilter || viewportFilter.has(name))
  if (!viewportEntries.length) throw new Error('no viewports selected for audit')

  const { org, created } = await createOrLoadAuditOrg(engineUrl, headers)
  assertAuditOrg(org, { allowExisting: process.env.FLYTO_UI_AUDIT_ALLOW_EXISTING_ORG === '1' })
  const capabilitySummary = await verifyAuditOrgAccess(engineUrl, headers, org, authIdentity)
  const setupWarnings = seedFixtures ? await seedAuditData(engineUrl, headers, org.id) : []

  const records = []
  let browser = null
  try {
    browser = await launchAuditBrowser()
    for (const route of routes) {
      for (const mode of routeModes(route)) {
        for (const [viewportName, viewport] of viewportEntries) {
          console.log(`start ${route.id} ${mode} ${viewportName} (timeout ${perRouteTimeoutMs}ms)`)
          const result = await auditRouteBounded(browser, appUrl, route, mode, viewportName, viewport, org.id)
          const record = result.record
          records.push(record)
          if (result.timedOut && browser) {
            await browser.close().catch(() => {})
            browser = await launchAuditBrowser()
          }
          const status = record.errors.length ? 'FAIL' : 'ok'
          console.log(`${status} ${route.id} ${mode} ${viewportName}: ${record.clicks.clicked} click(s), ${record.errors.length} error(s)`)
        }
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => {})
    if (created && !keepOrg) {
      try {
        assertAuditOrg(org)
        await engineJson(engineUrl, headers, 'DELETE', `/api/v1/code/orgs/${encodeURIComponent(org.id)}`)
      } catch (error) {
        setupWarnings.push({ kind: 'cleanup_failed', detail: error.message })
      }
    }
  }

  const report = {
    schema: 'flyto-code.ui-interaction-audit.v1',
    generatedAt: new Date().toISOString(),
    appUrl,
    engineUrl,
    org: { id: org.id, slug: org.slug, name: org.name, created, kept: keepOrg },
    auth: { uid: authIdentity.uid, email: authIdentity.email },
    capabilitySummary,
    options: {
      seedFixtures,
      seedDomainFixture,
      seedRepoFixture,
      maxRoutes,
      maxClicksPerRoute,
      perRouteTimeoutMs,
      clickScope,
      viewportFilter: viewportFilter ? [...viewportFilter] : null,
      routeFilter: routeFilter ? [...routeFilter] : null,
      modeFilter: modeFilter ? [...modeFilter] : null,
    },
    setupWarnings,
    summary: summarize(records, setupWarnings),
    records,
  }
  await fs.mkdir(REPORT_DIR, { recursive: true })
  await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`)
  await fs.writeFile(REPORT_MD, markdownReport(report))
  console.log(`report: ${path.relative(ROOT, REPORT_JSON)}`)
  console.log(`report: ${path.relative(ROOT, REPORT_MD)}`)

  const hardFailures = report.summary.failedRuns > 0
  const warningFailures = failOnWarnings && (report.summary.warnedRuns > 0 || setupWarnings.length > 0)
  if ((hardFailures || warningFailures) && !soft) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
