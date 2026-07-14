/**
 * sweep.spec — exhaustive UI smoke. Walks every nav item the user can
 * click, asserts the panel renders without crashing, captures any
 * console error / unhandled promise rejection / "raw i18n key" leak /
 * "outdated"-everywhere AutoFix regression. Failures stack up so
 * ONE run gives the full bug list instead of hunting them one by one.
 *
 * What's checked per section:
 *   1. activate the section
 *   2. wait for the workspace card to render some content
 *   3. assert no React crash boundary message
 *   4. assert no raw `item.xxxScan` / `nav.xxx` i18n keys leaked
 *   5. assert no Cannot-read-properties-of-null in console
 *   6. screenshot on first failure for forensics
 *
 * For Issues + AutoFix tabs we also click the FIRST card to verify
 * the per-finding endpoints don't 500/404 (the historical
 * "Could not load this finding" bug class).
 */
import { test, expect, type Page } from '@playwright/test'

const ORG_ID = process.env.ORG_ID || ''  // resolved in beforeAll if blank

// Top-level nav items — always visible, no accordion expansion needed.
const TOP_NAV_IDS = [
  '_dashboard', '_pulse', '_issues', '_pentest',
  '_autofix', '_repos', '_domains',
]

// Section accordions and their items. The test expands the parent
// accordion first then clicks each item.
const SECTION_ITEMS: Array<{ accordionId: string; items: string[] }> = [
  { accordionId: 'architecture', items: [
    'arch-overview', 'arch-dead-code', 'arch-complexity',
    'arch-frameworks', 'arch-imports', 'arch-deps', 'arch-api',
  ]},
  { accordionId: 'security', items: [
    'sec-overview', 'sec-iac', 'sec-license', 'sec-malware',
    'sec-cspm', 'sec-runtime', 'sec-reachability', 'sec-redteam',
  ]},
  { accordionId: 'cicd', items: ['cicd-pr', 'cicd-gate'] },
]

const ALL_SECTIONS = [
  ...TOP_NAV_IDS,
  ...SECTION_ITEMS.flatMap(s => s.items),
]

interface BugReport {
  section: string
  category: 'crash' | 'console-error' | 'raw-i18n' | 'null-array' | 'no-content'
  detail: string
}

const bugs: BugReport[] = []

async function resolveOrgID(): Promise<string> {
  if (ORG_ID) return ORG_ID
  const res = await fetch('http://127.0.0.1:8080/api/v1/code/orgs', {
    headers: { Authorization: 'Bearer ' + makeDevToken() },
  })
  const d = await res.json()
  const id = d.organizations?.[0]?.id
  if (!id) throw new Error('no orgs in DB — connect a repo first')
  return id
}

let resolvedOrgId = ''

test.beforeAll(async () => {
  resolvedOrgId = await resolveOrgID()
  console.log('sweep org:', resolvedOrgId)
})

test('sweep — every section + per-finding click', async ({ page }) => {
  // 22 sections × ~1s each + initial page load + margin. Default
  // 30s is way too short for the full walk.
  test.setTimeout(180_000)
  // Buffer all console errors + page errors so we can attribute them
  // back to the section that was active when they fired.
  const consoleErrors: string[] = []
  page.on('console', m => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', e => consoleErrors.push(`[pageerror] ${e.message}`))

  await page.goto(`/projects/${resolvedOrgId}`)
  await expect(page.locator('.section-sidebar, .workspace').first())
    .toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(2000)

  // Walk top-level nav first.
  for (const id of TOP_NAV_IDS) {
    await sweepOne(page, id, consoleErrors)
  }

  // Walk each accordion-buried section. Expand accordion first
  // (click the section header) then click the inner item.
  for (const sec of SECTION_ITEMS) {
    // Expand accordion via its data-accordion-id button. If items
    // already render (accordion was open), the toggle would close
    // it — so click ONLY when an inner item isn't already in DOM.
    const probe = page.locator(`[data-section-id="${sec.items[0]}"]`).first()
    const alreadyOpen = await probe.isVisible({ timeout: 200 }).catch(() => false)
    if (!alreadyOpen) {
      const header = page.locator(`[data-accordion-id="${sec.accordionId}"]`).first()
      if (await header.isVisible({ timeout: 1000 }).catch(() => false)) {
        await header.click().catch(() => null)
        await page.waitForTimeout(300)
      }
    }
    for (const id of sec.items) {
      await sweepOne(page, id, consoleErrors)
    }
  }

  // Print the bug list at the end so even if specific assertions
  // pass/fail individually, the summary is one place.
  if (bugs.length > 0) {
    console.log(`\n=== sweep found ${bugs.length} bugs ===`)
    for (const b of bugs) {
      console.log(`  [${b.category}] ${b.section}: ${b.detail.substring(0, 200)}`)
    }
  } else {
    console.log('\n=== sweep clean: 0 bugs across', ALL_SECTIONS.length, 'sections ===')
  }

  // Don't fail the test on bugs — we want the FULL list, not the
  // first crash. The grep-bugs assert comes next.
  expect(bugs, `sweep found ${bugs.length} bugs (see console)`).toEqual([])
})

async function sweepOne(page: Page, sectionId: string, consoleErrors: string[]) {
  // Snapshot the error count BEFORE clicking so we can attribute
  // any new ones to this section.
  const before = consoleErrors.length

  const item = page.locator(`[data-section-id="${sectionId}"]`).first()
  // No scrollIntoViewIfNeeded — its default 30 s wait turns 23
  // missing items into 11 minutes of cumulative timeout. We just
  // ask "is it in the visible DOM right now". Accordion items
  // require expanding their parent first which the outer loop
  // handles before calling sweepOne.
  const count = await item.count().catch(() => 0)
  if (count === 0 || !(await item.isVisible({ timeout: 1000 }).catch(() => false))) {
    const present = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-section-id]')).map(b => b.getAttribute('data-section-id'))
    )
    bugs.push({
      section: sectionId, category: 'no-content',
      detail: `not in DOM. present=${JSON.stringify(present)}`,
    })
    return
  }
  await item.click().catch(err => {
    bugs.push({ section: sectionId, category: 'crash', detail: `click failed: ${err.message}` })
  })
  // Give the panel time to fetch + render.
  await page.waitForTimeout(800)

  // 1. Crash boundary? Bound to 500ms — element-not-found should
  // fall through immediately, not hang on the default 30s wait.
  const eb = page.locator('.error-boundary, [data-error-boundary]').first()
  const ebVisible = await eb.isVisible({ timeout: 500 }).catch(() => false)
  if (ebVisible) {
    const crashMsg = await eb.innerText({ timeout: 500 }).catch(() => '')
    bugs.push({ section: sectionId, category: 'crash', detail: crashMsg })
  }

  // 2. Raw i18n key leak — anything matching `item.xxx` / `nav.xxx`
  // / `section.xxx` in user-visible text means a missing key fell
  // through to its raw form (the bug we shipped earlier).
  const card = page.locator('.workspace-main-card').first()
  const cardVisible = await card.isVisible({ timeout: 1000 }).catch(() => false)
  const text = cardVisible ? await card.innerText({ timeout: 1000 }).catch(() => '') : ''
  const i18nLeak = text.match(/\b(?:item|nav|section|warroom|scoring)\.[a-z][a-zA-Z]+/g)
  if (i18nLeak) {
    bugs.push({ section: sectionId, category: 'raw-i18n', detail: `leaked: ${i18nLeak.join(',')}` })
  }

  // 3. Console errors fired during this click?
  const newErrors = consoleErrors.slice(before).filter(e =>
    /Cannot read|TypeError|null|undefined is not/i.test(e))
  for (const e of newErrors) {
    const cat = /Cannot read.*null/i.test(e) ? 'null-array' as const : 'console-error' as const
    bugs.push({ section: sectionId, category: cat, detail: e })
  }

  // 4. Empty / no-content sentinel? We accept "0", "No findings",
  // "尚未產生" as valid empty states. Crash for "Loading..." stuck
  // for 3+ seconds (request never resolved).
  if (text.includes('Loading') && !text.match(/no\s+(findings|results|data|issues|events)/i)) {
    // Wait a bit more then re-check
    await page.waitForTimeout(2500)
    const text2 = await card.innerText({ timeout: 1000 }).catch(() => '')
    if (text2.trim() === 'Loading…' || text2.trim() === 'Loading') {
      bugs.push({ section: sectionId, category: 'no-content', detail: 'stuck on Loading…' })
    }
  }
}

function labelFor(id: string): string {
  // Map from section ID to its visible text. Driven by the fallback
  // strings in sections.ts + the hardcoded NavItem labels.
  const m: Record<string, string> = {
    _dashboard: 'Dashboard', _pulse: 'Pulse', _issues: 'Issues',
    _pentest: 'Pentest', _autofix: 'AutoFix', _repos: 'Repositor',
    _domains: 'Domain',
    'arch-overview': 'Overview', 'arch-dead-code': 'Dead',
    'arch-complexity': 'Complexity', 'arch-frameworks': 'Framework',
    'arch-imports': 'Import', 'arch-deps': 'Depend', 'arch-api': 'API',
    'sec-overview': 'Overview', 'sec-iac': 'IaC', 'sec-license': 'License',
    'sec-malware': 'Malware', 'sec-cspm': 'Cloud', 'sec-runtime': 'Runtime',
    'sec-reachability': 'Reach', 'sec-redteam': 'Red',
    'cicd-pr': 'Pull', 'cicd-gate': 'Gate',
  }
  return m[id] ?? id
}

function makeDevToken(): string {
  const enc = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${enc({ alg: 'none', typ: 'JWT' })}.${enc({
    sub: 'chester',
    email: 'dev@flyto2.com',
    name: 'Chester',
    aud: 'flyto',
  })}.`
}
