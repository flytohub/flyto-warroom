# Flyto2 Warroom CE State

## Current State

- The repository is generated from private Flyto2 source by
  `flyto-engine/release` open-core tooling.
- CE includes frontend source, public contracts, CE-safe engine kernel source,
  local installer assets, Docker image coordinates, and boundary audits.
- `make verify` runs release audits, CE backend tests, frontend module-package
  boundary audit, and Docker image digest dry-run.
- `install/edition-overlays.json` declares community, enterprise on-prem,
  enterprise airgap, and SaaS build-time overlay profiles.
- The generated open-core overlay audit proves CE is the public upstream base,
  paid editions are build-time overlays, runtime source pulls are forbidden,
  and CE scores remain local/external rather than public rating authority.
- CE exposes a deterministic public product-loop contract at
  `/api/v1/ce/product-loop` in both the official engine runtime and the
  CE-safe source runtime. The loop covers code, container, cloud, runtime, and
  external surfaces with findings, attack paths, evidence, remediation,
  validation, SLA state, and merge contracts without provider execution or
  private Enterprise implementation.
- `make ce-smoke` checks a running Docker Compose stack end to end: engine
  health, frontend health, frontend API proxy, runner, verification,
  brand-vision, and the CE product-loop payload.

## Known Boundaries

- Commercial intelligence, hosted control plane, Enterprise SSO/SCIM/SAML,
  managed runner fleets, and live cloud/container/runtime remediation remain
  private overlays.
- Public rating authority, Firebase-backed authority services, and calibration
  remain private signed overlays. CE local scores must not claim
  cross-organization comparability.
- Generated CE files should be changed upstream first, then regenerated.
