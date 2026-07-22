# Flyto2 Code Automation

This directory owns deterministic local and CI guards. Scripts should be
runnable without browser login unless their command explicitly declares a live
runtime target.

## Release Orchestration

- `release-gate.mjs`: runs documentation, identity, lint, type, test, product,
  dependency, build, bundle, static-smoke, deploy, Actions, and evidence gates.
- `write-release-evidence.mjs`: writes machine-readable release evidence.
- `check-release-bundle-budget.mjs`: checks compressed chunk budgets.
- `release-static-smoke.mjs`: validates built entry and preview artifacts.
- `check-release-deploy-policy.mjs`: validates deployment-mode invariants.
- `audit-github-actions-startup.mjs`: validates workflow startup contracts.

## Documentation And Identity

- `generate-documentation-reference.mjs`: uses the TypeScript compiler AST and
  source scans to generate callable, route/module, endpoint, and environment
  reference files.
- `check_documentation.py`: checks the documentation ownership manifest and
  every local Markdown link.
- `check_brand_identity.py`: enforces Flyto2 naming, `@flyto2.com` literals, and
  the registered public contact list.
- `lint-project-memory.sh`: checks required durable project-memory documents.

## Frontend And Contract Closure

- `check-route-drift.py`, `sync-backend-routes.mjs`, and
  `sync-backend-capabilities.mjs`: compare frontend clients/registries with
  Flyto2 Engine snapshots.
- `audit-frontend-closure.mjs`: checks transport, query key, mutation, and page
  closure.
- `audit-engine-client-drift.mjs`: compares frontend request/response use with
  Engine contracts.
- `audit-sse-correspondence.mjs`: maps Engine events to cache invalidation or
  explicit no-op policy.
- `audit-data-readiness-boundaries.mjs` and `audit-defensive-ux.mjs`: protect
  loading, empty, stale, denied, partial, error, and retry states.

## Product And Edition Closure

- `audit-platform-loops.mjs` and `audit-loop-runtime.mjs`: validate product-loop
  registry and executable recipe plans.
- `audit-flyto2-module-matrix.mjs`: validates nine independently operable and
  mergeable product domains.
- `audit-saas-contract.mjs`, `audit-authz-gates.mjs`, and
  `audit-page-guards.mjs`: protect capability, authorization, and route state.
- `audit-product-surface-closure.mjs`, `audit-product-verification-cockpit.mjs`,
  `audit-decision-chain.mjs`, and `audit-platform-depth.mjs`: validate
  decision/evidence workflows.
- `audit-module-package-boundaries.mjs`,
  `audit-module-physical-boundaries.mjs`, and
  `audit-design-system-boundary.mjs`: protect package ownership and CE split.
- `audit-edition-boundary.mjs`, `audit-enterprise-airgap.mjs`,
  `audit-self-hosted-nginx.mjs`, and `export-community.mjs`: protect hosted,
  Community, self-hosted, and Enterprise deployment boundaries.

## UI Quality

- `audit-ai-code-quality.mjs`: blocks direct transport, ad hoc query keys,
  page-shell drift, and false capability success in new code.
- `audit-cross-surface-imports.mjs`: protects domain import boundaries.
- `audit-navbar-smoke-registry.mjs`: keeps visible modules and smoke coverage
  aligned.
- `audit-ui-interactions.mjs`: runs configured interaction probes.
- `audit-ux-closure.mjs`: checks product UX contracts.
- `audit-visual-system.mjs`: enforces downward-only visual debt and font-floor
  baselines.
- `audit-eslint-warning-budget.mjs`: requires zero errors and prevents warning
  growth.
- `audit-i18n-hardcoded.mjs` and `audit-boy-wording.mjs`: protect translation
  and product wording.

## Primary Commands

```bash
npm run docs:generate
npm run docs:check
npm run brand:check
npm run guard:branch
npm run release:gate
```

The generated [Source API Reference](../docs/reference/source-api.md) links
every named automation function to its implementation.
