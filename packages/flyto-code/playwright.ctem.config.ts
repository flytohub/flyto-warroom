/**
 * CTEM smoke config — no webServer (operator brings their own
 * dev server on 5180). Used by `playwright test ctem_smoke` for
 * the self-contained spec that mocks every engine endpoint.
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: /ctem_smoke\.spec\.ts$/,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5180',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // No webServer — assumes operator has vite running on :5180.
})
