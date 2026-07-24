# Flyto2 Warroom CE State

## Current State

- The repository is generated from private Flyto2 source by
  `flyto-engine/release` open-core tooling.
- Flyto2-owned v0.2.0-and-later CE code uses PolyForm Noncommercial 1.0.0.
  Commercial production, hosted/SaaS or managed-service use, paid client
  delivery, resale, OEM distribution, and other use for monetary advantage
  require a separate written commercial license. Historical v0.1.0/v0.1.1
  releases retain their Apache-2.0 grants, and third-party licenses are
  unaffected.
- CE includes frontend source, public contracts, CE-safe engine kernel source,
  local installer assets, Docker image coordinates, and boundary audits.
- The independent CE frontend preserves the canonical Flyto2 product UI rather
  than introducing a second visual design. Its public source includes the
  lightning logo and Warroom wordmark, original authentication composition,
  purple navigation palette, locale selector, and light/dark/system themes;
  `packages/flyto-code/public/favicon.svg` is a required export asset.
- Fresh CE databases expose a one-time browser page for creating the first
  administrator. Account creation, owner workspace creation, and permanent
  registration closure are transaction-locked; the installer stores only
  infrastructure secrets and never asks for account credentials.
- `make verify` runs release audits, CE backend tests, dedicated frontend
  typechecking/build checks, and Docker image digest dry-run.
- `OPEN_CORE_MANIFEST.json` records credential-free source repository URLs,
  full source commits, a deterministic file inventory, and a SHA-256 digest of
  the complete generated CE tree. `scripts/audit-provenance.py` fails when the
  public tree or its source pins drift.
- `install/edition-overlays.json` declares community, enterprise on-prem,
  enterprise airgap, and SaaS build-time overlay profiles.
- The generated open-core overlay audit proves CE is the public upstream base,
  paid editions are build-time overlays, runtime source pulls are forbidden,
  and CE scores remain local/external rather than public rating authority.
- CE exposes a deterministic public source-security loop with repository scans,
  findings, evidence, explainable risk hypotheses, remediation re-verification,
  and portable HTML reports. It does not claim authoritative public scoring or
  private Enterprise execution.
- `make ce-smoke` checks the six-image CE application stack end to end:
  one-time admin bootstrap, local JWT identity, workspace, public repository
  connection, worker scan, analysis, evidence, HTML report, all five Go service
  health endpoints, and frontend proxy. It does not expect private or legacy
  sidecar services.
- Stable Git tags drive public-source Docker builds. The manifest declares
  version `0.5.2` / Git tag `v0.5.2`; the release workflow requires the tagged
  commit on `main` with successful CI, builds all five Go runtimes plus the
  frontend for both supported architectures, and attaches immutable digest
  evidence to the GitHub release.
- Public PR automation has read-only repository contents permission, never
  checks out code in the privileged policy workflow, and has no credential that
  can write `flyto-engine` or `flyto-code`. CI always uploads a patch manifest;
  merge protection requires the author CLA plus maintainer regeneration proof
  bound to the exact PR head SHA.

## Known Boundaries

- Commercial intelligence, hosted control plane, Enterprise SSO/SCIM/SAML,
  managed runner fleets, and live cloud/container/runtime remediation remain
  private overlays.
- Public rating authority, Firebase-backed authority services, and calibration
  remain private signed overlays. CE local scores must not claim
  cross-organization comparability.
- Generated CE files should be changed upstream first, then regenerated.
