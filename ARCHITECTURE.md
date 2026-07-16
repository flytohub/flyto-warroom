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
