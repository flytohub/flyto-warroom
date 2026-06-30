# Contributing To Flyto2 Warroom CE

Flyto2 Warroom CE is a generated open-core mirror, not a permanent fork. The
source of truth remains the Flyto workspace; this public repository exists so
users can install CE, inspect public contracts, and send patches.

## Single Source Rule

Do not maintain long-lived changes only in this public tree. Maintainers import
accepted public changes back into the source repositories, rerun
`flyto2-open-core-export`, and update this repo from the generated output.

## Path Ownership

- `packages/flyto-core/**` maps back to `flyto-core`.
- `packages/flyto-indexer/**` maps back to `flyto-indexer`.
- `packages/flyto-i18n/**` maps back to `flyto-i18n`.
- `packages/flyto-code/**` maps back to `flyto-code`.
- `packages/flyto-contracts/openapi/flyto-engine.openapi.yaml` maps back to
  `flyto-engine/api/openapi.yaml`.
- `packages/flyto-contracts/capabilities/capabilities.yaml` maps back to
  `flyto-engine/internal/permission/capabilities.yaml`.
- `install/**`, root docs, and generated workflow files map back to the
  `flyto-indexer` exporter implementation.

## PR Expectations

- Keep changes scoped to one product problem.
- Include tests or conformance evidence when changing code, contracts, or
  installer behavior.
- Do not commit credentials, customer data, private image coordinates, or
  enterprise-only implementation details.
- Run `python install/scripts/audit-release-tree.py .` before opening a PR.

Maintainers can run:

```sh
python scripts/export-upstream-patches.py --base origin/main --output upstream-patches
```

The generated patch bundle is then applied to the private source repositories,
reviewed there, and re-exported.
