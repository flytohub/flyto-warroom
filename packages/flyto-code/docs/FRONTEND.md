# Flyto2 Code Frontend Guide

## Runtime Stack

- React 19 and strict TypeScript
- Vite 8 with source root `src-next/` and output `dist-next/`
- React Router 7 through the Fuse route adapter
- TanStack React Query for server state
- MUI/Mantine-compatible shared visual primitives plus Tailwind where retained
- `lucide-react` for product icons
- Firebase Auth for SaaS and provider-neutral JWT adapters for self-hosted modes
- Shared Flyto2 design tokens and i18n runtime

## Application Shell

`src-next/app/App.tsx` composes theme, route, auth, error, and query providers.
Public route groups cover authentication, legal pages, community/explore, and
errors. Control-panel groups cover repository callbacks, projects, capabilities,
and the organization workspace.

Workspace route pages should remain thin. Their job is to lazy-load a domain
view and supply shell behavior. Product data and actions belong in domain
components/hooks, not in page wrappers.

## Navigation And Modules

Physical manifests under `src-next/types/module-manifests/` are the source for
workspace paths, navigation entries, capabilities, package ownership, and lazy
page imports. `src-next/types/modules.ts` is a compatibility re-export, not an
independent registry.

When a module is added, update the physical manifest, capability mapping,
smoke registry, and relevant product-loop evidence together. The generated
[Routes And Module Surfaces](./reference/routes-and-modules.md) catches static
route drift.

## Components

Product components live under `components/compounds/<domain>/`. Reusable
visual and interaction primitives live under `components/atoms/` or
`components/compounds/_shared/`. New product features do not belong in
`@fuse/`; wrap or replace a Fuse primitive from the product layer instead.

Expected UI states for data-backed views:

1. initial loading or skeleton;
2. loaded empty with an appropriate next action;
3. loaded partial/stale with honest status;
4. permission or capability denied;
5. recoverable error and retry;
6. populated success;
7. mutation in progress and terminal result.

The data-readiness and defensive-UX audits enforce representative state
boundaries. Avoid treating `[]`, `undefined`, denied, and failed as the same
empty state.

## Data Access

Views do not call `fetch` directly. Add transport functions under
`src-next/lib/engine/<domain>/` or `src-next/lib/cloud/`, then compose them in a
hook with shared query keys. Mutation success must invalidate every affected
query family. See [API Client Contracts](./API_CLIENTS.md).

The frontend renders backend aggregation and scoring fields. It must not create
a second authority by summing findings, converting billing values, assigning
grades, or deciding entitlement in the browser.

## Authentication

The SaaS path uses Firebase authentication and repository OAuth integrations.
Local/community deployments use Engine-issued JWTs. Fresh CE instances can
expose one-time administrator registration; the registration-status response
decides whether sign-up renders the bootstrap form or redirects to sign-in.

`VITE_DEV_AUTH_BYPASS` is guarded by `import.meta.env.DEV`. It must never be
used as a production authentication mode.

## Theme And Visual System

Appearance supports `light`, `dark`, and `system`. Preferences are read before
authentication and reused by the authenticated toolbar. New UI should use
semantic palette values and shared visual primitives instead of dark-only
backgrounds, local hex values, decorative gradients, nested cards, oversized
radii, or text below the repository's font floor.

The visual-system baseline is intentionally downward-only. Fix the source that
introduces a regression; do not raise the baseline to make CI green.

## Internationalization

Product copy uses the shared Flyto2 translation runtime. The locale picker is
available on public auth pages and inside the application. The hardcoded-copy
audit tracks existing migration debt and rejects new unapproved drift.

When adding copy:

1. add a stable translation key in the shared i18n source;
2. use `t()` at the component boundary;
3. keep fallback language precise and free of unsupported marketing claims;
4. run the i18n audit and tests.

## Accessibility And Responsive Behavior

- Use semantic controls and labels; icon-only actions require accessible names
  and tooltips when their meaning is not universal.
- Preserve keyboard focus and visible focus state across dialogs, tabs, and
  route transitions.
- Keep touch targets stable and prevent text from overflowing controls.
- Use bounded grid/flex tracks so loading and translated text do not resize the
  whole workspace.
- Test desktop and mobile viewports for complex surfaces.

## Public Assets And Template Code

`public/` contains runtime-served assets and provider-neutral bootstrap data.
`@mock-utils/` belongs to the imported Fuse template and is documented as mock
surface, not a production API. Generated HTTP reference rows label template
mock endpoints separately from product-client endpoints.

## Source Reference

Every named component, hook, function, method, class, and TypeScript contract
is indexed in [Source API Reference](./reference/source-api.md). Run
`npm run docs:generate` after source changes and never edit generated reference
files by hand.
