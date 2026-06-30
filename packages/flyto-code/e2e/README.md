# e2e

Playwright end-to-end coverage for local and staging smoke checks.

Keep tests focused on product loops that users actually navigate: navbar route
loading, page scroll boundaries, data-backed actions, and report/export flows.
Authentication-dependent tests must document the required environment and must
not store credentials in this repository.

## Product Verification full-stack smoke

Run `npm run smoke:product-verification` only when the local engine stack and
dedicated `flyto-verification` service are running. The spec creates a throwaway
org/repo verify-target scope, clicks Run in the real flyto-code cockpit, waits
for engine callback evidence, and writes
`e2e/__screenshots__/product-verification-evidence.png`.

Useful overrides:

- `FLYTO_ENGINE_URL` — engine URL, default `http://127.0.0.1:8080`.
- `FLYTO_PRODUCT_VERIFY_TARGET_URL` — browser replay target, default
  `http://host.docker.internal:5180` for Docker verification service.
- `FLYTO_PRODUCT_VERIFY_ORG_ID` / `FLYTO_PRODUCT_VERIFY_REPO_ID` — reuse an
  existing scoped fixture instead of creating a throwaway one.
- `FLYTO_PRODUCT_VERIFY_AUTH_BEARER` — use a freshly supplied real bearer token
  for staging; do not store account credentials in the repo.

The smoke preflights `FLYTO_PRODUCT_VERIFY_TARGET_URL` before dispatch. This
guards against false-positive screenshot evidence where the Docker runner only
captures Vite's blocked-host error page instead of the Flyto app.

During Playwright smoke, `VITE_ENGINE_URL=__same_origin__` is normalized to an
empty browser-side base URL so both host Playwright and the Docker verification
runner use Vite's `/api` proxy. `VITE_ENGINE_PROXY_TARGET` remains the actual
engine URL.
