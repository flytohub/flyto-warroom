/**
 * Sidebar accessibility smoke — locks in the a11y fixes from the ultracode
 * audit (icon-only rename/confirm/cancel/edit buttons got aria-labels; the
 * org-switcher, back-to-projects logo, and warroom grid items got
 * role/tabIndex/onKeyDown via clickableA11y). axe must report zero CRITICAL
 * violations inside the sidebar nav. Scoped to [data-testid="workspace-sidebar"]
 * so pre-existing violations elsewhere don't mask a sidebar regression.
 *
 * Mirrors e2e/a11y.spec.ts: critical blocks, serious/lesser are reported.
 */
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const ORG_ID = '637ec1309bc318305ef7e2d45534f489'

test.describe('Accessibility — workspace sidebar', () => {
  test('sidebar nav is a11y-clean (no critical violations)', async ({ page }) => {
    await page.goto(`/projects/${ORG_ID}`)
    const sidebar = page.getByTestId('workspace-sidebar')
    await expect(sidebar).toBeVisible()

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .include('[data-testid="workspace-sidebar"]')
      .analyze()

    const critical = results.violations.filter((v) => v.impact === 'critical')
    const serious = results.violations.filter((v) => v.impact === 'serious')

    console.log(`[a11y sidebar] critical: ${critical.length}, serious: ${serious.length}`)
    for (const v of [...critical, ...serious]) {

      console.log(`  ${v.impact === 'critical' ? '✗' : '·'} [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length})`)
    }
    expect(critical, 'critical a11y violations in sidebar').toHaveLength(0)
  })

  test('every icon-only sidebar button has an accessible name', async ({ page }) => {
    await page.goto(`/projects/${ORG_ID}`)
    const sidebar = page.getByTestId('workspace-sidebar')
    await expect(sidebar).toBeVisible()

    // Enter org-rename mode to surface the confirm/cancel icon buttons too.
    const editBtn = sidebar.getByRole('button', { name: /edit organization name/i })
    if (await editBtn.count()) await editBtn.first().click()

    const buttons = sidebar.getByRole('button')
    const n = await buttons.count()
    for (let i = 0; i < n; i++) {
      const b = buttons.nth(i)
      const name =
        (await b.getAttribute('aria-label')) ||
        (await b.getAttribute('title')) ||
        (await b.textContent())?.trim()
      expect(name, `sidebar button #${i} must have an accessible name`).toBeTruthy()
    }
  })
})
