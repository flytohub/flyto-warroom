# Contributing To Flyto2 Design Tokens

## Before A Change

Read `PROJECT.md`, `ARCHITECTURE.md`, `STATE.md`, and `docs/API.md`. Use
`flyto-index search` and `flyto-index impact` to inspect the token and likely
consumer surfaces. Open an issue before a breaking rename or removal.

## Compatibility Rules

- Existing export names, package subpaths, CSS properties, and keyframe names
  are public API.
- Value changes can be visually breaking even when JavaScript types are stable.
- Keep JavaScript exports and `src/index.d.ts` declarations in parity.
- Keep the package framework-neutral and ESM-only.
- Add consumer-specific aliases and component styles in the consumer repo.
- Preserve reduced-motion accessibility for nonessential animation.

## Verification

```bash
npm ci
npm run docs:generate
npm run verify
npm audit --audit-level=high
flyto-index verify . --full-scan --strict
```

Include affected Cloud, Cortex, site, or plugin surfaces in the pull request and
attach visual verification for any value that changes rendered output. Update
`CHANGELOG.md` and the relevant API/feature documentation in the same change.

Report vulnerabilities privately through GitHub or `security@flyto2.com`.
