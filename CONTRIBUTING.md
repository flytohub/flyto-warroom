# Contributing To Flyto2 Warroom CE

Flyto2 Warroom CE is a generated open-core mirror, not a permanent fork. The
source of truth remains the Flyto2 workspace; this public repository exists so
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

CI uploads the generated patch bundle as an `upstream-patch-preview` artifact.
Maintainers apply mapped patches only to `flyto-engine` and `flyto-code`,
review and test them there, and then re-export this repository.

## Contributor License Agreement (CLA)

Before a contribution can be accepted and ported upstream, you must agree to the
Contributor License Agreement in `CLA.md`. This lets maintainers keep your
contribution maintainable across both the PolyForm Noncommercial
source-available Community Edition and the commercial edition. Post this exact
PR comment:

```text
I have read the CLA Document and I hereby sign the CLA
```

The first-party policy workflow does not check out or execute PR code and uses
no PAT, deploy key, or private-repository credential. It sets `cla/verified`
only when the PR author posted the exact signature.

## Upstream Regeneration Gate

`flyto-warroom` PRs never write to another repository. After a maintainer has
applied the generated patches to `flyto-engine` / `flyto-code`, tested them,
and reproduced the public tree, the maintainer posts:

```text
upstream-regenerated: <exact-pr-head-sha>
```

Only a repository owner, member, or collaborator can satisfy
`upstream/regenerated`. The proof contains the exact PR head SHA, so any later
push invalidates the old approval. Both status contexts are required before a
public PR can merge.
