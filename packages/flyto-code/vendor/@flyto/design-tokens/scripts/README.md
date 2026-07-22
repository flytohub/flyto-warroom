# Maintainer Scripts

- `check-tokens.mjs` verifies every runtime export has a TypeScript declaration,
  required CSS properties exist, and every exported keyframe is implemented.
- `generate-reference.mjs` emits the complete package/export/CSS/keyframe
  inventory and supports a non-mutating `--check` mode for CI.

Generated documentation is checked in so users can inspect the package contract
without running repository tooling.
