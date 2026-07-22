# Flyto2 Code Configuration

## Configuration Model

Vite browser configuration uses `VITE_*` variables. These values are public to
the built application and must never contain private keys, client secrets,
service-account JSON, passwords, or bearer tokens. Node-only build/audit
variables are read through `process.env` and are not automatically exposed to
the browser.

The complete source-derived variable list is in
[HTTP And Environment Reference](./reference/http-and-environment.md). Values
are deliberately omitted.

## Runtime Endpoints

| Variable | Purpose | Local behavior |
|---|---|---|
| `VITE_ENGINE_URL` | Flyto2 Engine base URL; `__same_origin__` selects same origin. | Defaults to `http://localhost:8080` only in dev |
| `VITE_AUTOMATION_URL` | Flyto2 Cloud automation base URL. | Dev uses Vite `/cloud-api` proxy |
| `VITE_CORTEX_URL` | Flyto2 Cortex base URL. | Uses configured Flyto2 endpoint fallback in dev |

Required production endpoints fail at module initialization when missing. This
prevents a production bundle from silently sending requests to localhost.

## Authentication And Repository Providers

| Variable | Purpose |
|---|---|
| `VITE_AUTH_MODE` | Selects Firebase, community/local JWT, or supported Enterprise build mode |
| `VITE_FIREBASE_API_KEY` | Firebase browser API identifier for SaaS auth; not a server secret |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase browser auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase browser project identifier |
| `VITE_GITHUB_CLIENT_ID` | Public GitHub OAuth application client id |
| `VITE_GITLAB_CLIENT_ID` | Public GitLab OAuth application client id |
| `VITE_GITLAB_BASE_URL` | GitLab host, including self-managed installations |

OAuth client secrets never belong in this repository or browser environment.

## Development Authentication

`VITE_DEV_AUTH_BYPASS=1` works only when `import.meta.env.DEV` is true. The
matching Engine must explicitly enable its development-auth mode. Use
`VITE_DEV_AUTH_UID` and `VITE_DEV_AUTH_EMAIL=dev@flyto2.com` only for local
fixtures; production builds cannot activate this branch.

## Build And Audit Variables

Build scripts use additional non-browser variables for bundle statistics,
edition packaging, live smoke targets, CI evidence, Sentry upload activation,
and product-loop execution. Their exact references are generated in the
environment inventory. Variables that enable live tests require explicit base
URLs and credentials from CI secrets rather than committed files.

## Local Setup

1. Start from `.env.example` and provide only the browser-safe identifiers and
   endpoints needed by the selected auth mode.
2. Run `npm ci --legacy-peer-deps`.
3. Run `npm run dev`; Vite listens on port `5181`.
4. Keep `.env` and `*.local` files untracked.

## Deployment Modes

- **Hosted SaaS:** production Flyto2 endpoints plus Firebase browser config.
- **Self-hosted online:** customer Engine URL, optional online connectors, and
  provider-neutral auth.
- **Community:** same-origin Engine proxy and CE package manifest.
- **Enterprise air-gap:** locally available identity, assets, APIs, and i18n;
  enabled flows may not require SaaS endpoints.

Nginx self-hosted configuration proxies `/api/` to the local Engine and keeps
its CSP allowlist restricted to local origins. Deployment policy scripts reject
configuration that bypasses these boundaries.

## Identity Policy

The product name is **Flyto2**. Public and fixture email literals use
`@flyto2.com`; public project contacts must be one of the registered aliases
enforced by `scripts/check_brand_identity.py`. Infrastructure-owned service
accounts remain provider identities and are not public support addresses.
