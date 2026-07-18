# Flyto2 Warroom CE Architecture

Flyto2 Warroom CE is a generated open-core distribution with four physical
surfaces:

```text
packages/flyto-code        React/Vite Warroom cockpit
packages/flyto-contracts   Public API, evidence, runner, scanner, and capability contracts
services/flyto-engine-ce   CE-safe backend kernel and source runtimes
install/ + scripts/        Local install, audit, image, and contribution tooling
```

Runtime code connects only through public contracts, capability snapshots,
resource/evidence records, and edition gates. CE source must not import private
`flyto-engine` API handlers, store internals, billing, SaaS adapters,
Enterprise adapters, proprietary intelligence, or live remediation workers.

Enterprise Cloud Bridge and airgap builds attach premium services through signed
evidence and build-time overlays. Runtime source pulls are forbidden.

`OPEN_CORE_MANIFEST.json` and `install/edition-overlays.json` both carry the
GitLab-style upstream contract: CE is the pinned public base, and Enterprise,
SaaS, on-prem, and airgap editions are private build-time overlays, not forks.
`scripts/audit-open-core-overlay.py` compares those manifests with the engine
source boundary, frontend CE boundary, Makefile, and contribution docs so
runtime source pulls, private overlay material, and public rating-authority
claims fail closed.
