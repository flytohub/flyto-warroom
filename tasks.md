# Flyto2 Warroom CE Tasks

- Keep `make verify` green after generated source changes.
- Run `python3 install/scripts/audit-release-tree.py .` after release asset
  edits.
- Route source-package fixes back to `flyto-code`, `flyto-engine`, or
  `flyto-contracts` before regenerating this repository.
- Keep CE/Enterprise boundaries explicit in docs, package manifests, and
  install overlays.
- Bump both `release.version` and `release.github_tag`, regenerate CE, pass CI,
  and only then push the matching stable Git tag for each image release.
