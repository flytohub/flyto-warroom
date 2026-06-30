import { defineConfig, devices } from '@playwright/test'

/**
 * E2E config — drives the dev server with VITE_DEV_AUTH_BYPASS=1 so tests
 * can hit real engine behind a fake user. Reuses the existing engine running
 * in docker (:8080).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // Shared postgres state + CSS-snapshot baselines mean specs can't run
  // in parallel — load.spec seeds/cleans workflow_executions that other
  // specs assert against.
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5180',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec\.ts/ },
    // a11y + visual regression run only on chromium — axe and screenshot
    // baselines are browser-agnostic; running on 3 engines triples CI time
    // and duplicates snapshot noise.
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testIgnore: /(mobile|a11y|visual_regression)\.spec\.ts/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: /(mobile|a11y|visual_regression)\.spec\.ts/ },
    // Mobile coverage — the CSS makes the sidebar a floating overlay on
    // phones (verified visually via page-sweep screenshots). The React
    // collapse→expand state transition is timing-flaky inside Playwright
    // headless, so the drawer-click spec is scoped to desktop while the
    // page-sweep test separately captures mobile screenshots without
    // relying on the overlay click path.
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
      // Mobile runs only the dedicated mobile spec. The drawer + full
      // page-sweep depend on sidebar clicks that race with the overlay
      // transition in headless; the mobile spec verifies responsive
      // layout via direct URLs.
      testMatch: /mobile\.spec\.ts/,
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  webServer: {
    // Call vite directly (not `npm run dev`) so we can drop the
    // --open flag that hangs the headless CI run on Windows. Env
    // vars passed via env: block so the command stays
    // cross-platform — Windows cmd can't parse the bash-style
    // `FOO=bar baz` prefix that posix shells use.
    command: 'npx vite --config vite.config.next.ts --port 5180 --strictPort --host 127.0.0.1',
    env: {
      VITE_DEV_AUTH_BYPASS: '1',
      VITE_DEV_AUTH_UID: 'chester',
      VITE_DEV_AUTH_EMAIL: 'local-admin@example.invalid',
      // Browser-side engine calls must work from both host Playwright and the
      // Dockerized flyto-verification runner. Same-origin `/api` calls let Vite
      // proxy to the real engine while avoiding container-local 127.0.0.1.
      VITE_ENGINE_URL: process.env.VITE_ENGINE_URL || '__same_origin__',
      VITE_ENGINE_PROXY_TARGET: process.env.FLYTO_ENGINE_URL || process.env.VITE_ENGINE_PROXY_TARGET || 'http://127.0.0.1:8080',
    },
    url: 'http://127.0.0.1:5180/index-next.html',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
