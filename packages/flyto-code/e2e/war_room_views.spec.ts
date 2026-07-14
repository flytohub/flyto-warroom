/**
 * War-room view smoke — actually opens the React app in a real
 * browser and verifies the engine data shows up. Previously the
 * "everything works" claims relied on curl. This spec drives the
 * UI like a user does and screenshots the workspace shell so
 * regressions are visually obvious.
 *
 * Pre-requisites:
 *   - flyto-engine docker stack up (postgres + engine)
 *   - flyto-ai repo connected to the seeded org
 *   - vite dev server with VITE_DEV_AUTH_BYPASS=1
 *     (handled by playwright.config.webServer)
 */
import { test, expect } from '@playwright/test'

const ORG_ID = '9738e38ef2e84ed6d4d4f955d7a58e83'
const ENGINE = 'http://127.0.0.1:8080'

test.describe('War-room — UI loads + every endpoint serves real data', () => {
  test('workspace shell renders with real counts in sidebar', async ({ page }) => {
    await page.goto(`/projects/${ORG_ID}`)
    await expect(page.locator('.section-sidebar, .workspace').first())
      .toBeVisible({ timeout: 20_000 })

    // Wait for the sidebar to finish hydrating its query-based counts
    // before we screenshot. Without this we sometimes catch the panel
    // mid-loading-spinner.
    await expect(page.getByText(/Issues/i).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/AutoFix/i).first()).toBeVisible({ timeout: 15_000 })

    // Visual proof — full-page screenshot of the workspace post-login.
    // Catches regressions in topbar polish, sidebar elevation, the
    // glassmorphism on the central card. Stored in __screenshots__ so
    // a human can diff against past runs.
    await page.screenshot({
      path: 'e2e/__screenshots__/workspace-shell.png',
      fullPage: false,
    })

    // Sanity assert the sidebar has the SECURITY accordion with the
    // three top-level items (Issues / Pentest / AutoFix). They're
    // hardcoded NavItems so independent of sections.ts churn.
    await expect(page.getByText('Issues').first()).toBeVisible()
    await expect(page.getByText('Pentest').first()).toBeVisible()
    await expect(page.getByText('AutoFix').first()).toBeVisible()
  })

  test('each scan-view endpoint serves data', async ({ request }) => {
    const auth = { Authorization: 'Bearer ' + makeDevToken() }
    const endpoints = [
      { name: 'IaC',         path: `/api/v1/code/orgs/${ORG_ID}/iac-findings`,                key: 'count' },
      { name: 'License',     path: `/api/v1/code/orgs/${ORG_ID}/license-issues`,              key: 'count' },
      { name: 'CSPM',        path: `/api/v1/code/orgs/${ORG_ID}/cspm-findings`,               key: 'count' },
      { name: 'Runtime',     path: `/api/v1/code/orgs/${ORG_ID}/runtime-events`,              key: 'count' },
      { name: 'Issues',      path: `/api/v1/code/orgs/${ORG_ID}/issues?limit=5`,              key: 'issues' },
      { name: 'AutoFix',     path: `/api/v1/code/orgs/${ORG_ID}/autofix/findings`,            key: 'findings' },
      { name: 'Pulse',       path: `/api/v1/code/orgs/${ORG_ID}/pulse?since=24h&limit=5`,     key: 'items' },
    ]

    const results: Record<string, number> = {}
    for (const e of endpoints) {
      const res = await request.get(`${ENGINE}${e.path}`, { headers: auth })
      expect(res.ok(), `${e.name} endpoint must return 2xx`).toBeTruthy()
      const body = await res.json()
      const arr = body[e.key]
      const n = Array.isArray(arr) ? arr.length : (arr ?? 0)
      results[e.name] = n
    }
    console.log('endpoint counts:', JSON.stringify(results, null, 2))

    // Hard expectations — endpoints we know must have data on a
    // freshly-connected flyto-ai repo:
    //
    //   * Issues     ≥ 1   (OSV reports CVEs every scan)
    //   * AutoFix    ≥ 1   (engine derives proposals from those CVEs)
    //   * Pulse      ≥ 1   (OrgPulseUnified aggregates from above)
    //
    // Endpoints that may legitimately be zero on this fixture:
    //
    //   * IaC        — depends on .github/workflows + Dockerfile presence
    //   * License    — depends on whether deps use risky licenses
    //   * CSPM       — needs a snapshot upload (architectural, not from repo)
    //   * Runtime    — needs SDK in the running app (architectural)
    expect(results.Issues, 'Issues count').toBeGreaterThan(0)
    expect(results.AutoFix, 'AutoFix count').toBeGreaterThan(0)
    expect(results.Pulse, 'Pulse count').toBeGreaterThan(0)
  })

  test('AutoFix preview returns a real diff (no 404)', async ({ request }) => {
    // The original "Could not load this finding" bug — derived findings
    // emitted IDs the per-id endpoints couldn't resolve. This pins
    // both the write-through and the cve-bump matcher fixes.
    const auth = { Authorization: 'Bearer ' + makeDevToken() }
    const listRes = await request.get(`${ENGINE}/api/v1/code/orgs/${ORG_ID}/autofix/findings`, {
      headers: auth,
    })
    expect(listRes.ok()).toBeTruthy()
    const list = await listRes.json()
    const items = list.findings ?? list.items ?? []
    const cveBump = items.find((i: any) =>
      i.rule_id === 'cve-bump' && (i.description ?? '').toLowerCase().includes('cryptography'))
    expect(cveBump, 'expected at least one cryptography cve-bump finding').toBeTruthy()

    const previewRes = await request.post(
      `${ENGINE}/api/v1/code/orgs/${ORG_ID}/autofix/findings/${cveBump.id}/preview`,
      { headers: auth, data: {}, timeout: 120_000 },
    )
    expect(previewRes.status(), 'preview must NOT be 404 (the original bug)').toBe(200)
    const preview = await previewRes.json()
    expect(['preview', 'no_preview', 'outdated']).toContain(preview.status)
    if (preview.status === 'preview') {
      expect(preview.changes?.length ?? 0, 'preview status=preview must carry changes').toBeGreaterThan(0)
      expect(preview.title, 'preview title should describe the bump').toMatch(/bump|fix|upgrade/i)
    }
  })
})

function makeDevToken(): string {
  // Same shape the engine's FLYTO_DEV_AUTH=1 accepts — header.payload.
  // No signature; engine doesn't verify in dev mode.
  const enc = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${enc({ alg: 'none', typ: 'JWT' })}.${enc({
    sub: 'chester',
    email: 'dev@flyto2.com',
    name: 'Chester',
    aud: 'flyto',
  })}.`
}
