# CE Frontend Physical Source Boundary

Date: 2026-07-23

## Context

`flyto-warroom` is a generated CE mirror. The upstream `flyto-code/src-ce`
directory is the complete frontend source of the public workbench; the private
unified cockpit is never copied and then pruned.

## Change

- Exported only `src-ce`, its Vite/TypeScript configuration, nginx config,
  Dockerfile, and dedicated CE package manifest/lockfile.
- Added local account bootstrap, repository scans, findings, evidence,
  risk-chain hypotheses, remediation verification, reports, languages, and
  themes.
- Declared `src-next`, `e2e`, and `vendor` forbidden public roots.

## Verification

```text
npm ci --legacy-peer-deps
npm run test
npm run lint
npm run build
```

Run these from `packages/flyto-code`.

The generated package has no dependency on private sibling repositories or
hosted Flyto services.
