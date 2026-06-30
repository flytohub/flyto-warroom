/**
 * Multi-page screenshot sweep.
 *
 * Chester's critique was "backend has data, frontend doesn't show it".
 * The drawer spec proves the detail view renders verdict. This spec walks
 * the other surfaces a user hits day-to-day — ProjectsPage, Dashboard,
 * Issues feed, Repo Detail (which has its own RecentVerifications
 * panel), and Pentest — screenshotting each so anything missing shows up
 * on visual inspection rather than months later as a bug report.
 */
import { test, expect } from '@playwright/test'
import { readdirSync } from 'node:fs'

const ORG_ID = '637ec1309bc318305ef7e2d45534f489'
const REPO_ID = '754e3aaae7e8a0b5e8c8a10f2d1f83cf'

async function capture(page: import('@playwright/test').Page, name: string) {
  await page.screenshot({
    path: `e2e/__screenshots__/page-${name}.png`,
    fullPage: true,
  })
}

test.describe('Full-page UI sweep', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', (m) => {
      // Surface react errors so silent fetch/render bugs don't hide.
      if (m.type() === 'error') {
         
        console.log(`[browser error] ${m.text()}`)
      }
    })
  })

  test('projects landing page', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('body')).not.toContainText('Sign in', { timeout: 10_000 })
    // Dev user is already an org member; the Flyto2 card should list.
    await expect(page.getByText('Flyto2').first()).toBeVisible({ timeout: 15_000 })
    await capture(page, 'projects-landing')
  })

  test('workspace dashboard (default section)', async ({ page }) => {
    await page.goto(`/projects/${ORG_ID}`)
    const expandBtn = page.locator('.section-collapsed .collapse-icon-btn')
    if (await expandBtn.isVisible().catch(() => false)) {
      await expandBtn.click(); await page.locator(".section-sidebar").waitFor({ state: "visible", timeout: 5000 })
    }
    await expect(page.getByRole('button', { name: 'Dashboard' }).first())
      .toBeVisible({ timeout: 15_000 })
    await capture(page, 'workspace-dashboard')
  })

  test('issues feed — with verified CVE visible', async ({ page }) => {
    await page.goto(`/projects/${ORG_ID}`)
    // Mobile: expand the collapsed sidebar first.
    const expandBtn = page.locator('.section-collapsed .collapse-icon-btn')
    if (await expandBtn.isVisible().catch(() => false)) {
      await expandBtn.click(); await page.locator(".section-sidebar").waitFor({ state: "visible", timeout: 5000 })
    }
    await page.getByRole('button', { name: 'Issues' }).first().click()
    await page.getByPlaceholder(/search/i).first().fill('lodash')
    await expect(page.getByText('Command injection in lodash').first())
      .toBeVisible({ timeout: 15_000 })
    await capture(page, 'issues-feed')
  })

  test('issue drawer with verdict history', async ({ page }) => {
    await page.goto(`/projects/${ORG_ID}`)
    const expandBtn = page.locator('.section-collapsed .collapse-icon-btn')
    if (await expandBtn.isVisible().catch(() => false)) {
      await expandBtn.click(); await page.locator(".section-sidebar").waitFor({ state: "visible", timeout: 5000 })
    }
    await page.getByRole('button', { name: 'Issues' }).first().click()
    await page.getByPlaceholder(/search/i).first().fill('lodash')
    await page.getByText('Command injection in lodash').first().click()
    const drawer = page.getByRole('dialog')
    await expect(drawer).toBeVisible()
    // Wait for query to settle and the exploitable chip to render.
    await expect(
      drawer.locator('.issue-drawer-badges .issue-drawer-verdict-exploitable'),
    ).toBeVisible({ timeout: 10_000 })
    await capture(page, 'issue-drawer-exploitable')
  })

  test('repo detail — RecentVerifications panel', async ({ page }) => {
    // Jump into the war room, open the seeded issue's drawer, then use the
    // drawer's "Go to repo" link — that's the same nav path a real user
    // follows and doesn't depend on the repo list rendering.
    await page.goto(`/projects/${ORG_ID}`)
    const expandBtn = page.locator('.section-collapsed .collapse-icon-btn')
    if (await expandBtn.isVisible().catch(() => false)) {
      await expandBtn.click(); await page.locator(".section-sidebar").waitFor({ state: "visible", timeout: 5000 })
    }
    await page.getByRole('button', { name: 'Issues' }).first().click()
    await page.getByPlaceholder(/search/i).first().fill('lodash')
    await page.getByText('Command injection in lodash').first().click()
    const drawer = page.getByRole('dialog')
    await expect(drawer).toBeVisible()
    // The repo link in the meta grid triggers onNavigateRepo.
    await drawer.getByRole('button', { name: /flytohub\/flyto-engine/ }).click()

    // Wait for the repo detail layout. RecentVerifications only renders when
    // the query returns rows — our seed has 2, so the panel title should show.
    const panel = page.locator('.rd-verify-panel')
    await expect(panel).toBeVisible({ timeout: 15_000 })
    // At least one exploitable status row should appear (newest seeded run).
    await expect(page.locator('.rd-verify-row').first()).toBeVisible()
    // Scroll the panel into the viewport so the capture shows it.
    await panel.scrollIntoViewIfNeeded()
    await capture(page, 'repo-detail-with-verifications')
    // Also capture just the verifications panel tight-cropped for clarity.
    await panel.screenshot({ path: 'e2e/__screenshots__/page-repo-recent-verifications-panel.png' })
  })

  test('pentest view', async ({ page }) => {
    await page.goto(`/projects/${ORG_ID}`)
    const expandBtn = page.locator('.section-collapsed .collapse-icon-btn')
    if (await expandBtn.isVisible().catch(() => false)) {
      await expandBtn.click(); await page.locator(".section-sidebar").waitFor({ state: "visible", timeout: 5000 })
    }
    await page.getByRole('button', { name: 'Pentest' }).first().click()
    // Pentest view just needs to render without crashing.
    await page.waitForTimeout(1000)
    await capture(page, 'pentest')
  })

  test.afterAll(async () => {
    // Print the list of captured screenshots so CI logs show what was saved.
    const files = readdirSync('e2e/__screenshots__').filter(f => f.startsWith('page-'))
     
    console.log('Saved pages:', files.sort().join(', '))
  })
})
