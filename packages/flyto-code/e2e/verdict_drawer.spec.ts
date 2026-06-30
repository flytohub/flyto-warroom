/**
 * E2E: verdict rendering in IssueDetailDrawer.
 *
 * Pre-conditions (set up outside this spec):
 *   - flyto-engine running on :8080 with FLYTO_DEV_AUTH=1
 *   - Postgres seeded with:
 *       org 637ec1309bc318305ef7e2d45534f489
 *       repo 754e3aaae7e8a0b5e8c8a10f2d1f83cf
 *       user test-uid-1 as owner of that org
 *       ≥1 code_scan_results row with a lodash CVE-2021-23337 vulnerability
 *       2 workflow_executions rows (exploitable + sanitized) whose
 *         finding_fp matches the CVE's issue fingerprint
 *
 * Dev server runs with VITE_DEV_AUTH_BYPASS=1 so the app skips Firebase
 * login and signs engine calls with an unsigned dev JWT.
 */
import { test, expect } from '@playwright/test'

const ORG_ID = '637ec1309bc318305ef7e2d45534f489'

test.describe('IssueDetailDrawer verdict visibility', () => {
  test('renders latest verdict chip + history timeline for a verified issue', async ({ page }) => {
    // Jump straight to the workspace for our seeded org. The dev-auth bypass
    // satisfies <RequireAuth> so we don't need to go through /login.
    await page.goto(`/projects/${ORG_ID}`)

    // Sanity: past the login screen.
    await expect(page.locator('body')).not.toContainText('Sign in', { timeout: 15_000 })

    // On phone viewports the sidebar starts collapsed — expand it first so
    // the Issues button is reachable. Desktop viewports skip this.
    const expandBtn = page.locator('.section-collapsed .collapse-icon-btn')
    if (await expandBtn.isVisible().catch(() => false)) {
      await expandBtn.click()
      // Wait for the full sidebar to render (overlay on mobile).
      await page.locator('.section-sidebar').waitFor({ state: 'visible', timeout: 5000 })
    }

    // Left nav "Issues" entry — SectionNav renders a NavItem with the label
    // coming from t('nav.issues') = "Issues".
    const issuesNavItem = page.getByRole('button', { name: 'Issues' }).first()
    await expect(issuesNavItem).toBeVisible({ timeout: 15_000 })
    await issuesNavItem.click()

    // Narrow the list with the search box — our seeded CVE can land on any
    // page depending on other scan results, but "lodash" always floats it
    // to the top.
    await page.getByPlaceholder(/search/i).first().fill('lodash')

    const row = page.getByText('Command injection in lodash').first()
    await expect(row).toBeVisible({ timeout: 15_000 })
    await row.click()

    // Drawer opens → assert latest-verdict chip ("EXPLOITABLE" wins since the
    // newer of the two workflow_executions is exploitable).
    const drawer = page.getByRole('dialog')
    await expect(drawer).toBeVisible()

    // Header chip lives inside `.issue-drawer-badges` — scoped selector
    // avoids colliding with the per-row chip inside the history timeline.
    const headerChip = drawer
      .locator('.issue-drawer-badges .issue-drawer-verdict-exploitable')
    await expect(headerChip).toBeVisible()
    await expect(headerChip).toContainText('EXPLOITABLE')

    // History timeline shows both runs in order: the most recent is
    // exploitable, the older one is sanitized.
    const history = drawer.locator('.issue-drawer-verify-history')
    await expect(history).toBeVisible()
    const historyRows = history.locator('.issue-drawer-verify-row')
    // Drawer caps at 5 rows + "+N earlier" footer. Other specs may seed/
    // clear transient load-test rows, so assert the shape (1-5) rather than
    // a fixed count.
    const rowCount = await historyRows.count()
    expect(rowCount).toBeGreaterThanOrEqual(2)
    expect(rowCount).toBeLessThanOrEqual(5)
    // Both verdict types render somewhere in the history.
    await expect(history.locator('.issue-drawer-verdict-exploitable').first()).toBeVisible()
    await expect(history.locator('.issue-drawer-verdict-sanitized').first()).toBeVisible()

    // Evidence link from the newer exploitable run.
    await expect(
      history.locator('a.issue-drawer-verify-evidence'),
    ).toHaveAttribute('href', /evidence/)

    // Screenshot for visual confirmation.
    await drawer.screenshot({ path: 'e2e/__screenshots__/drawer-exploitable.png' })
  })
})
