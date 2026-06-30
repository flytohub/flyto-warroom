/**
 * Visual regression baseline.
 *
 * Playwright's toHaveScreenshot compares against a per-browser baseline
 * stored under e2e/visual_regression.spec.ts-snapshots/. First run creates
 * the baseline; subsequent runs diff against it. A CSS change that shifts
 * pixels anywhere the baseline covers fails the run.
 *
 * We scope snapshots to the drawer + recent-verifications panel — the
 * surfaces this session contributed. The full workspace pages shift with
 * every data change (issue count badges, etc.) which would make them
 * noisy baselines, so we keep those to the page-sweep screenshots.
 */
import { test, expect } from '@playwright/test'

const ORG_ID = '637ec1309bc318305ef7e2d45534f489'

test.describe('Visual regression', () => {
  test('issue drawer matches snapshot', async ({ page }) => {
    await page.goto(`/projects/${ORG_ID}`)
    await page.getByRole('button', { name: 'Issues' }).first().click()
    await page.getByPlaceholder(/search/i).first().fill('lodash')
    await page.getByText('Command injection in lodash').first().click()
    const drawer = page.getByRole('dialog')
    await expect(drawer).toBeVisible()
    await expect(
      drawer.locator('.issue-drawer-badges .issue-drawer-verdict-exploitable'),
    ).toBeVisible()
    // Hide the "1h ago" / "2h ago" timestamps — they shift as the DB ages.
    // Give them visibility:hidden so the layout doesn't reflow either.
    await page.addStyleTag({ content:
      '.issue-drawer-verify-time { visibility: hidden !important; }' })
    await expect(drawer).toHaveScreenshot('drawer-exploitable.png', {
      maxDiffPixelRatio: 0.01,
    })
  })

  test('recent-verifications panel matches snapshot', async ({ page }) => {
    await page.goto(`/projects/${ORG_ID}`)
    await page.getByRole('button', { name: 'Issues' }).first().click()
    await page.getByPlaceholder(/search/i).first().fill('lodash')
    await page.getByText('Command injection in lodash').first().click()
    const drawer = page.getByRole('dialog')
    await drawer.getByRole('button', { name: /flytohub\/flyto-engine/ }).click()
    const panel = page.locator('.rd-verify-panel')
    await expect(panel).toBeVisible({ timeout: 15_000 })
    // Hide per-run time strings.
    await page.addStyleTag({ content:
      '.rd-verify-time { visibility: hidden !important; }' })
    await expect(panel).toHaveScreenshot('recent-verifications.png', {
      maxDiffPixelRatio: 0.01,
    })
  })
})
