/**
 * Sentry — frontend error monitoring.
 *
 * Gated on VITE_SENTRY_DSN. Missing env var = silent no-op so
 * dev / preview builds without the secret stay green.
 *
 * What gets captured:
 *   - window.onerror + unhandledrejection (built-in)
 *   - React error boundaries (via `withErrorBoundary` HOC)
 *   - TanStack Query errors (via QueryCache.onError → captureException)
 *   - Manual Sentry.captureException() / addBreadcrumb() calls
 *
 * What does NOT get captured (privacy):
 *   - Session replay video — replaysSessionSampleRate = 0 (only
 *     errors record, replaysOnErrorSampleRate = 1.0). Operator
 *     can change to 0.1 / 0.05 if they want sample-rate replay
 *     of normal sessions later.
 *   - PII — Sentry SDK's default scrubbing handles IP / email /
 *     credit cards; we add no extra scrubbers right now.
 *
 * Build-time source map upload: see vite.config.next.ts
 * sentryVitePlugin() — requires SENTRY_AUTH_TOKEN in CI env.
 *
 * Operator workflow:
 *   1. Register at https://sentry.io
 *   2. Create project "flyto-code" (or matching frontend repo)
 *   3. Copy DSN string
 *   4. Set VITE_SENTRY_DSN in Cloud Run env / .env.production
 *   5. (optional) Create auth token + set SENTRY_AUTH_TOKEN in
 *      GitHub Actions secrets — enables source map upload so
 *      stack traces deminify back to .tsx line numbers
 */

import * as Sentry from '@sentry/react'

let initialized = false

export function initSentry(): void {
  if (initialized) return

  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) {
    // No DSN = no-op. console.info instead of warn since unset
    // is the expected state in dev.
    if (import.meta.env.DEV) {
       
      console.info('[sentry] VITE_SENTRY_DSN not set — error monitoring disabled')
    }
    return
  }

  Sentry.init({
    dsn,
    // Tag every event with the build environment so prod errors
    // aren't drowned in dev/preview noise.
    environment: import.meta.env.PROD ? 'production' : 'development',
    // Build commit SHA threaded in at CI time via VITE_RELEASE.
    release: import.meta.env.VITE_RELEASE || undefined,
    // 10% perf trace sample — enough to spot slow pages without
    // burning the free tier's quota. Bump to 0.3-0.5 when paid.
    tracesSampleRate: 0.1,
    // Session replay — only record when an error fires. Operator
    // can sample-record normal sessions later by raising the
    // session-sample rate.
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // Mask all text + media by default so PII / asset names /
        // CVE details don't ship to Sentry's CDN. Operator can
        // unmask specific elements with `data-sentry-unmask` if
        // a replay needs visible text for triage.
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    // Drop the common "ResizeObserver loop limit exceeded" warning —
    // browsers fire this routinely, it's not actionable.
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      // Network errors during navigation — page already changed,
      // the in-flight fetch gets aborted, not a real bug.
      'NetworkError when attempting to fetch resource',
      'Failed to fetch',
    ],
    // Don't ship browser extensions' noise.
    denyUrls: [
      /^chrome-extension:\/\//,
      /^moz-extension:\/\//,
      /^safari-web-extension:\/\//,
    ],
  })

  initialized = true
}

/** Manual capture helper — use when a catch block has additional
 *  context the global handler wouldn't see. Falls through to a
 *  console.error when Sentry isn't initialized (dev). */
export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!initialized) {
     
    console.error('[sentry-noop]', err, context)
    return
  }
  Sentry.captureException(err, context ? { extra: context } : undefined)
}

/** Re-export the React error-boundary HOC so callers can wrap
 *  high-risk subtrees: `export default withErrorBoundary(MyView)`. */
export const withErrorBoundary = Sentry.withErrorBoundary
