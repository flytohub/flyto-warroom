/**
 * Load-path: heavy data test.
 *
 * Postgres is seeded with 100 workflow_executions for one fingerprint. We
 * measure how long IssuesView's drawer takes to render the timeline and
 * assert a render-budget (<5s total from navigation to drawer visible).
 *
 * If this starts failing, the likely culprits are:
 *   - A useQuery without staleTime / with refetchOnWindowFocus
 *   - Rendering all 100 rows instead of paginating to 5 + "+N earlier"
 *   - N+1 query from a child component
 */
import { test, expect } from '@playwright/test'
import { execSync } from 'node:child_process'

const ORG_ID = '637ec1309bc318305ef7e2d45534f489'
const FP = 'fe6996a8434d73003cd8344510d096f3ff5c0cf480be24dd0a5ef34fff58f640'

function pg(sql: string) {
  execSync(
    `docker exec flyto-engine-postgres-1 psql -U flyto -d flyto -c "${sql.replace(/"/g, '\\"')}"`,
    { stdio: 'pipe' },
  )
}

test.beforeAll(() => {
  pg(`INSERT INTO workflow_executions (id, org_id, repo_id, finding_fp, execution_id, status, verdict, yaml, created_at, updated_at)
      SELECT 'we-load-' || gs, '${ORG_ID}', '754e3aaae7e8a0b5e8c8a10f2d1f83cf',
        '${FP}', 'cloud-load-' || gs, 'passed',
        CASE WHEN gs % 2 = 0 THEN 'sanitized' ELSE 'exploitable' END,
        'name: test', NOW() - (gs || ' minutes')::interval,
        NOW() - (gs || ' minutes')::interval
      FROM generate_series(1, 98) gs
      ON CONFLICT (execution_id) DO NOTHING`)
})

test.afterAll(() => {
  // Clean up so other specs (visual regression baselines) see the canonical
  // 2-row state.
  pg(`DELETE FROM workflow_executions WHERE id LIKE 'we-load-%'`)
})

test('drawer renders in under 5s with 100 workflow_executions', async ({ page }) => {
  await page.goto(`/projects/${ORG_ID}`)
  await page.getByRole('button', { name: 'Issues' }).first().click()
  await page.getByPlaceholder(/search/i).first().fill('lodash')
  await page.getByText('Command injection in lodash').first().click()

  const drawer = page.getByRole('dialog')
  const start = Date.now()
  await expect(drawer).toBeVisible()
  await expect(drawer.locator('.issue-drawer-verify-history')).toBeVisible({ timeout: 5000 })
  await expect(
    drawer.locator('.issue-drawer-badges .issue-drawer-verdict-exploitable'),
  ).toBeVisible({ timeout: 5000 })
  const elapsed = Date.now() - start

   
  console.log(`[load] drawer render time: ${elapsed}ms`)
  expect(elapsed).toBeLessThan(5000)

  // History shows max 5 rows + "+N earlier runs" footer — proves we're
  // paginating in-component instead of dumping all 100 DOM nodes.
  const rows = drawer.locator('.issue-drawer-verify-row')
  const rowCount = await rows.count()
  expect(rowCount).toBeLessThanOrEqual(5)
  await expect(drawer.getByText(/\+\d+/)).toBeVisible() // "+N earlier runs"
})
