# Release Scripts

These scripts protect the public CE mirror:

- `audit-ce-boundary.py` blocks private code, implicit telemetry, enterprise
  image references, and missing moat documentation.
- `audit-github-protection.py` checks public repository governance files.
- `export-upstream-patches.py` exports public PR changes as upstream patch
  bundles so accepted community work can flow back into Flyto2.

Run `make audit` before changing release-sensitive files.
