# Flyto2 Warroom CE Decisions

## Generated Open-Core Mirror

Decision: this repository is generated from private Flyto2 source and must not
become a hand-maintained fork.

Reason: CE patches should benefit Flyto2 itself while keeping Enterprise/SaaS
moat code out of the public tree.

## Noncommercial Source License From v0.2.0

Decision: Flyto2-owned CE code released as v0.2.0 or later uses PolyForm
Noncommercial 1.0.0. Commercial production, SaaS/hosting, managed service,
paid client delivery, resale, OEM, or other monetary-advantage use requires a
separate written commercial license.

Reason: publishing auditable source should not authorize third parties to
commercialize the project. Historical v0.1.0/v0.1.1 Apache-2.0 grants are not
revoked, and third-party dependencies remain governed by their own licenses.

## Build-Time Overlays Only

Decision: Enterprise and SaaS editions use a pinned CE commit plus private
build-time overlays. Runtime source pulls are forbidden.

Reason: deterministic packaging, airgap readiness, auditability, and code
protection require reproducible build inputs.

## CE Must Stay Useful

Decision: CE must remain locally runnable, inspectable, and patchable.

Reason: source-available CE adoption depends on real local value, not a library
dump or marketing-only mirror.

## One-Time First Administrator

Decision: a fresh CE database creates its first administrator through a
browser flow controlled by the Engine. The installer generates infrastructure
secrets only; account creation and permanent registration closure commit in one
transaction under a singleton row lock.

Reason: GitLab-style local setup avoids placing account credentials in shell
arguments or env files, and database locking prevents concurrent browsers or
replicas from creating multiple first owners.

## Deterministic Product Loop

Decision: CE must ship a provider-free product-loop endpoint and smoke test so
new users can verify the source-available warroom loop without Flyto2 Cloud,
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

## Unprivileged Public Contribution Gate

Decision: public PR CI may build and audit the submitted CE tree and upload
patch-review artifacts, but it must never receive a PAT, deploy key, or
cross-repository write path. A first-party no-checkout policy publishes
`cla/verified` and `upstream/regenerated`; the latter succeeds only after a
maintainer imports the change into `flyto-engine` / `flyto-code`, regenerates
the mirror, and posts a proof containing the exact PR head SHA.

Reason: contributors need a normal fork-and-PR workflow without giving
untrusted code or public automation authority over the source repositories.
Binding maintainer proof to the head SHA automatically invalidates approval
when the contributor pushes another commit.

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
build the engine, worker, scheduler, analysis, report, and frontend images from
the two public source contexts for both supported architectures before
recording immutable registry digests.

Reason: building only the public contexts makes the source/image relationship
independently reproducible and prevents private build inputs or a mutable
floating tag from silently defining a historical release.
