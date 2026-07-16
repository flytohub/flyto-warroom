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
