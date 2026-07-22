# Flyto2 Warroom CE Governance

Flyto2 Warroom CE v0.2.0 and later is a public, source-available, noncommercial
community distribution. It is installable, inspectable, patchable, and useful;
enterprise implementations, hosted control plane code, customer data connectors,
commercial datasets, and premium remediation workflows remain private.

## Product Rule

CE should be strong enough for users to install, inspect, evaluate, and improve.
Enterprise should be the natural upgrade path for teams that need commercial
intelligence, managed execution, live remediation, identity governance, airgap
delivery, support, or compliance controls.

Do not describe v0.2.0-and-later CE as open source. The accurate model is a
PolyForm Noncommercial source-available CE plus separately licensed Enterprise
Cloud Bridge and private Enterprise editions. Commercial use requires a written
commercial license from Flyto2 / evtek. Historical v0.1.0 and v0.1.1 artifacts
remain under the Apache-2.0 terms published with those releases; this change
does not revoke rights already granted. Third-party components keep their own
licenses.

## Source Of Truth

This repository is a generated CE distribution. The private Flyto2 workspace is
the source of truth for implementation. Public PRs are reviewed here, converted
into upstream patch bundles, applied to the source workspace, tested there, and
then re-exported back into this repository.

Accepted community changes should improve Flyto2 itself, not only this mirror.
That keeps the public project and commercial product aligned.

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

Enterprise features may be surfaced in CE only through public capabilities,
public contracts, signed evidence, documented cloud bridge calls, or clearly
gated UI states. They must not import private implementation paths.
