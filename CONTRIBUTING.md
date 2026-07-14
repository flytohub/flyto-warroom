# Contributing To Flyto2 Warroom CE

Flyto2 Warroom CE is a generated open-core mirror, not a permanent fork. The
source of truth remains the Flyto workspace; this public repository exists so
users can install CE, inspect public contracts, and send patches.

## Single Source Rule

Do not maintain long-lived changes only in this public tree. Maintainers import
accepted public changes back into the source repositories, rerun
`flyto2-open-core-export`, and update this repo from the generated output.

## Path Ownership

- `packages/flyto-code/**` maps back to `flyto-code`.
- `flyto-core`, `flyto-indexer`, and `flyto-i18n` are external open-source
  dependencies (PyPI / npm), not vendored here — contribute to their own public
  repos directly. See `DEPENDENCIES.md`.
- `packages/flyto-contracts/openapi/flyto-engine.openapi.yaml` maps back to
  `flyto-engine/api/openapi.yaml`.
- `packages/flyto-contracts/capabilities/capabilities.yaml` maps back to
  `flyto-engine/internal/permission/capabilities.yaml`.
- `services/flyto-engine-ce/**` maps back to the same CE-safe
  `flyto-engine/internal/...` kernel packages listed in
  `services/flyto-engine-ce/SOURCE_BOUNDARY.json`.
- `install/**`, root docs, and generated workflow files map back to the
  private Flyto2 open-core exporter maintained by the Flyto2 team.

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

## Contributor License Agreement (CLA)

Before a contribution can be accepted and ported upstream, you must agree to the
Contributor License Agreement in `CLA.md`. This lets maintainers keep your
contribution maintainable across both the Apache-2.0 community edition and the
commercial edition. The CLA-assistant workflow comments a one-time signing link
on your first PR; the check must be green before the change is merged/ported.
