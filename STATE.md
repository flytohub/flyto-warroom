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

## Known Boundaries

- Commercial intelligence, hosted control plane, Enterprise SSO/SCIM/SAML,
  managed runner fleets, and live cloud/container/runtime remediation remain
  private overlays.
- Generated CE files should be changed upstream first, then regenerated.
