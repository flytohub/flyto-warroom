# CE Frontend Package Manifest API

Date: 2026-07-16

## Context

`flyto-warroom` is a generated CE mirror. Upstream `flyto-code` added a public
CE module package-manifest API so community builds, audits, and Warroom syncs
consume the same split/merge contract.

## Change

- Synced `packages/flyto-code/src-next/types/module-manifests/packageManifest.ts`.
- Synced `packages/flyto-code/src-next/types/module-manifests/index.ts`.
- Synced `packages/flyto-code/src-next/types/module-manifests/__tests__/moduleBoundaryContract.test.ts`.
- Synced `packages/flyto-code/scripts/audit-edition-boundary.mjs`.
- Synced `packages/flyto-code/scripts/audit-platform-loops.mjs`.

## Verification

```text
npm run audit:edition-boundary
npm run audit:closure
npm run audit:loops
```

Run these from `packages/flyto-code`.

The upstream `flyto-code` source commit owns and verifies the TypeScript test,
lint, build, and community-export checks. This generated package intentionally
does not include the private sibling `flyto-engine` workspace required by the
upstream community exporter, and its local node_modules may not include vitest.
