# Flyto2 Code Testing And Release Gates

## Test Layers

| Layer | Command | Contract |
|---|---|---|
| TypeScript | `npx tsc -b --noEmit` | Strict compile and alias/type closure |
| Unit/component | `npx vitest run` | Hooks, clients, components, state models, guards |
| Lint regression | `npm run audit:eslint-warnings` | Zero errors and no increase in tracked warnings |
| Production build | `npm run build` | Typecheck plus Vite `dist-next` bundle |
| Static smoke | `npm run release:static-smoke` | Entry assets, chunks, preview/build path consistency |
| Bundle budget | `npm run release:bundle-budget` | Compressed release size and chunk budget |
| Browser evidence | Playwright commands under `e2e/` | Route, interaction, accessibility, and full-stack evidence |
| Index graph | `flyto-index verify . --strict --json` | Dependency, secret, taint, docs, CI, and policy closure |

## Product And Architecture Audits

`npm run guard:branch` is the broad local product guard. It composes focused
audits for:

- frontend request/mutation/query closure;
- frontend-to-backend route drift;
- nine platform loops and module matrix;
- SaaS capability and authorization contracts;
- navigation and page guards;
- i18n and wording drift;
- data readiness and defensive UX;
- cross-surface imports;
- SSE event correspondence;
- Product Verification;
- decision chain and platform depth;
- module package, physical, design-system, edition, air-gap, and CE export
  boundaries;
- visual-system and interaction regressions.

These scripts are code. Their named methods are indexed in the generated
[Source API Reference](./reference/source-api.md), and their ownership is
described in `scripts/README.md`.

## Documentation And Identity Gates

| Command | Failure condition |
|---|---|
| `npm run docs:generate` | Rebuild source API, route/module, endpoint, and env indexes |
| `npm run docs:check` | Generated output is stale, a source/config file has no doc owner, or a local Markdown link is broken |
| `npm run brand:check` | Legacy one-word product naming, legacy domains, non-`@flyto2.com` literals, or unregistered public contacts |

The documentation gate reads `docs/documentation-manifest.json`. Generated
reference documents must not be edited manually.

## Release Gate

`npm run release:gate` is the required local release command. It runs:

1. generated documentation and identity checks;
2. ESLint warning budget;
3. TypeScript build without emit;
4. the full Vitest suite;
5. the product/architecture branch guard;
6. production dependency audit;
7. production build;
8. bundle and static smoke checks;
9. deployment and GitHub Actions startup policy;
10. release evidence generation.

Any failure stops the sequence. Do not update a debt baseline merely to
restore green CI; remove the regression or document a reviewed policy change.

## End-To-End Tests

Playwright configuration lives at `playwright.config.ts` and
`playwright.ctem.config.ts`; test scenarios and prerequisites are documented in
[`e2e/README.md`](../e2e/README.md). Full-stack Product Verification and
scheduler tests require explicit environment opt-in and real service targets.

Browser artifacts stay ignored because traces, screenshots, and request data
can contain sensitive material. Publish only redacted release evidence intended
for the repository.

## Change-Based Test Selection

- Client/query changes: client tests, query-key tests, route drift, engine drift,
  full Vitest.
- Component changes: focused component tests, data-readiness/defensive UX,
  visual system, full Vitest.
- Route/module changes: module boundary tests, navbar smoke, page guards,
  product loops, CE export.
- Auth/config changes: auth tests, build in affected edition modes, deploy
  policy, security audit.
- CI/script changes: focused script execution, Actions startup audit, complete
  release gate.
- Documentation-only changes: generation check, ownership/link check, brand
  check, Indexer strict verify.

## Current Verification Record

Durable current counts and known blockers belong in `STATE.md`,
not in this guide. Handoff-specific command output belongs under `handoffs/` or
the generated release evidence path.
