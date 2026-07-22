# Flyto2 Warroom CE Decisions

## Generated Open-Core Mirror

Decision: this repository is generated from private Flyto2 source and must not
become a hand-maintained fork.

Reason: CE patches should benefit Flyto2 itself while keeping Enterprise/SaaS
moat code out of the public tree.

## Build-Time Overlays Only

Decision: Enterprise and SaaS editions use a pinned CE commit plus private
build-time overlays. Runtime source pulls are forbidden.

Reason: deterministic packaging, airgap readiness, auditability, and code
protection require reproducible build inputs.

## CE Must Stay Useful

Decision: CE must remain locally runnable, inspectable, and patchable.

Reason: open-core adoption depends on real local value, not a library dump or
marketing-only mirror.

## Deterministic Product Loop

Decision: CE must ship a provider-free product-loop endpoint and smoke test so
new users can verify the open-source warroom loop without Flyto2 Cloud,
commercial connectors, Firebase rating authority, or Enterprise overlays.

Reason: a GitLab-style CE needs visible product value in the first install. The
loop is deterministic demo evidence, not a public rating authority or live
remediation claim.

## GitLab-Style CE Upstream Contract

Decision: CE is the public upstream base. Enterprise, SaaS, on-prem, and
airgap editions are build-time overlays on a pinned CE commit, never independent
forks or runtime source pulls.

Reason: public contributions must flow back into Flyto2 itself while moat code,
commercial datasets, public rating authority, and managed remediation remain
private signed overlays.

## Deterministic Release Provenance

Decision: every generated CE tree must pin all contributing source repositories
to full commits and bind every exported file to one deterministic tree digest.
The public manifest must never disclose a local workspace path or credentialed
Git remote URL.

Reason: a public mirror is auditable only when a stranger can connect the exact
source inputs to the exact release tree without access to a maintainer machine.

## Tag-Driven Image Releases

Decision: stable Git tag `vMAJOR.MINOR.PATCH` is the only automatic Docker Hub
release trigger. Each tag must match the version fields in
`OPEN_CORE_MANIFEST.json`, point to a `main` commit with successful CE CI, and
promote the manifest's exact image digests to per-service semantic-version tags.

Reason: the public mirror does not contain every private image build context.
Digest promotion keeps the CI/CD release reproducible without rebuilding hidden
source or letting a mutable floating tag silently define a historical release.
