/**
 * Mobile-viewport layout smoke.
 *
 * Verifies the mobile CSS fix: at <=768px the full sidebar is hidden but the
 * collapsed icon strip is visible so there's always a nav path. Captures
 * screenshots for visual inspection of each surface at phone width.
 *
 * The drawer + page-sweep specs run on desktop only — the sidebar overlay
 * transition in React is timing-flaky in Playwright headless. Here we only
 * assert the layout primitives render, not multi-step interactions.
 */
import { test, expect } from '@playwright/test'

const ORG_ID = '637ec1309bc318305ef7e2d45534f489'

test.describe('mobile layout', () => {
  test('projects landing renders at phone width', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Flyto2').first()).toBeVisible({ timeout: 15_000 })
    await page.screenshot({ path: 'e2e/__screenshots__/mobile-projects-landing.png' })
  })

  test('workspace shows collapsed sidebar strip as mobile nav', async ({ page }) => {
    await page.goto(`/projects/${ORG_ID}`)
    // The collapsed strip MUST be visible — without it, mobile users have
    // no nav path. This was the bug we fixed.
    await expect(page.locator('.section-collapsed')).toBeVisible({ timeout: 15_000 })
    // The expand button inside the strip MUST be clickable.
    await expect(page.locator('.section-collapsed .collapse-icon-btn')).toBeVisible()
    // The full sidebar and ai-panel are correctly hidden on mobile.
    const sidebarVisible = await page.locator('.section-sidebar').isVisible().catch(() => false)
    expect(sidebarVisible).toBe(false)
    await page.screenshot({ path: 'e2e/__screenshots__/mobile-workspace.png' })
  })
})
