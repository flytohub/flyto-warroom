# Flyto2 Warroom CE Governance

Flyto2 Warroom CE follows an open-core model similar to mature enterprise
projects: the community edition is public, installable, and patchable; enterprise
implementations, hosted control plane code, customer data connectors, and
commercial remediation workflows remain private.

## Source Of Truth

This repository is a generated CE distribution. The private Flyto2 workspace is
the source of truth for implementation. Public PRs are reviewed here, converted
into upstream patch bundles, applied to the source workspace, tested there, and
then re-exported back into this repository.

## Required Checks

Every PR must keep these checks green:

- release boundary audit;
- GitHub protection audit;
- public contract conformance;
- frontend install/build smoke;
- upstream patch preview for public PRs.

## Contributor Certificate

By contributing, you certify that you have the right to submit the work under
the applicable package license and that the contribution may be imported back
into the private Flyto2 source workspace for CE and commercial releases.

Use a Signed-off-by line in commits when practical:

```text
Signed-off-by: Your Name <you@example.com>
```

## Maintainer Rule

Generated files should not become a permanent fork. If a change belongs to a
source package or contract, apply it upstream and regenerate this repo.
