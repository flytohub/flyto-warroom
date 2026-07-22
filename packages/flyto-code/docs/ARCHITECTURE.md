# Flyto2 Code Architecture

## System Role

`flyto-code` is the React frontend in the Flyto2 platform. It renders
organization, project, scan, exposure, verification, evidence, policy, and
operational state obtained from Flyto2 Engine and, for delegated automation,
Flyto2 Cloud. The browser is never the authorization or billing authority.

```text
Browser
  -> route shell and auth adapter
  -> capability-aware module manifest
  -> product component and domain hook
  -> typed engine/cloud client
  -> Flyto2 Engine or Flyto2 Cloud
  <- response contract and SSE evidence events
  -> React Query cache invalidation
  -> deterministic UI state
```

## Source Roots

The active source root is `src-next/`. Historical documentation that points to
`src/` is incorrect.

| Path | Ownership |
|---|---|
| `src-next/app/` | Route groups, route pages, authenticated/public shells |
| `src-next/components/` | Product components, atoms, compounds, layouts |
| `src-next/hooks/` | Query composition, event subscriptions, UI state hooks |
| `src-next/contexts/` | Shared runtime providers and application context |
| `src-next/lib/engine/` | Flyto2 Engine transport and domain clients |
| `src-next/lib/cloud/` | Flyto2 Cloud automation contracts and playbooks |
| `src-next/types/module-manifests/` | Route, capability, edition, and package surface source of truth |
| `src-next/configs/` | Route assembly, navigation, theme, and app settings |
| `src-next/styles/` | Current semantic design system and application styles |
| `src-next/styles-legacy/` | Tracked migration debt, not the target for new UI |
| `src-next/@auth/` | Authentication adapters integrated with the shell |
| `src-next/@fuse/` | Fuse template shell treated as an internal dependency |
| `src-next/@i18n/` | Fuse-to-Flyto2 i18n adapter |
| `src-next/@mock-utils/` | Template fixtures; not production backend authority |
| `scripts/` | Deterministic architecture, product, security, and release guards |

The complete named-symbol inventory is generated in
[Source API Reference](./reference/source-api.md).

## Layer Rules

`.flyto-rules.yaml` encodes the import direction. In summary:

1. Routes may compose product components, hooks, providers, and clients.
2. Components may consume hooks and low-level contracts but may not import
   route modules.
3. Hooks own state and subscriptions, not rendered views.
4. `lib/` owns transport and reusable logic and must not depend on components.
5. `types/` and `utils/` stay portable and low-level.
6. Fuse internals may not become a home for Flyto2 product features.

Cross-folder imports use aliases from `tsconfig.app.json`; same-folder imports
may remain relative. `flyto-index verify` checks graph integrity and the
repository rules enforce high-confidence layer violations.

## Route And Module Assembly

Root routes are composed by `src-next/configs/routesConfig.tsx`. Route groups
under `src-next/app/` contribute public, callback, project, capability, and
workspace routes. Workspace pages are generated from the physical module
manifests rather than maintained as a second hand-written route list.

Each module entry can define:

- stable module id and route path;
- lazy page import;
- capability and edition metadata;
- navigation group, label, and icon;
- layout behavior;
- CE package/export ownership.

The generated [route inventory](./reference/routes-and-modules.md) links every
static path to its declaration. `audit:navbar-smoke`, `audit:module-packages`,
`audit:module-physical-boundaries`, and `audit:page-guards` protect different
parts of this contract.

## Data And State

Flyto2 Code uses `@tanstack/react-query` for server state. Domain clients return
backend response contracts; hooks select the request and cache lifecycle; views
render the resulting state. Shared query-key factories prevent one screen from
creating an incompatible cache namespace.

Mutations must invalidate every affected read model. Organization SSE is a
freshness signal, not a second database: events invalidate shared queries and
the next response remains authoritative. The SSE correspondence audit verifies
that completion/change events have handlers or explicit no-op policy.

## Identity And Authorization

Build-time authentication mode selects Firebase SaaS, local/community JWT, or
Enterprise-compatible adapters. The shared token resolver supplies transport
identity. Dev authentication bypass exists only when Vite's `DEV` flag is true.

UI capability checks improve usability but do not secure an action. Every
protected mutation must be enforced by Flyto2 Engine. Missing or stale
capability state fails closed for protected actions.

## Presentation Architecture

The UI supports light, dark, and system-following preferences. Shared visual
primitives (`PageShell`, `FlytoSurface`, `FlytoPageHeader`, `TabBar`, data-table
and metric primitives) consume centralized semantic tokens. The visual-system
audit uses a downward-only legacy budget so new work cannot increase raw
styles, hardcoded palettes, gradients, large radii, tiny text, or direct MUI
surface debt.

Responsive layouts use constrained grids/flex layouts and route-level lazy
loading. Heavy chart and 3D libraries are split into independent vendor chunks
and are not required by the initial shell.

## Edition And Packaging Boundaries

- SaaS may use Firebase and hosted Flyto2 endpoints.
- Community/self-hosted builds use provider-neutral auth and same-origin engine
  proxying.
- Enterprise air-gap builds must not make enabled workflows depend on external
  CDN, hosted auth, Stripe, hosted AI, or SaaS callbacks.
- The CE package manifest is derived from the same physical module manifests
  as runtime navigation.
- The vendored design-token package lets a standalone clone build without a
  private sibling checkout.

## Documentation Architecture

`docs/documentation-manifest.json` assigns every production source/config file
to durable documentation. `scripts/generate-documentation-reference.mjs`
generates symbol, route, endpoint, and environment indexes from source.
`scripts/check_documentation.py` blocks missing owners, stale generated files,
and broken local links through the release gate.
