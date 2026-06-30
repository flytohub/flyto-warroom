# Flyto2 Warroom CE

Flyto2 Warroom CE is the self-hosted open-core distribution of Flyto2
Warroom. It gives teams a local security operations cockpit for code,
external attack surface, cloud/container/runtime posture, automated
security testing, evidence, scoring, and compliance workflows.

CE is not a source dump of the private Flyto2 backend. It is a generated
community distribution with public frontend/source packages, public
contracts, local installers, and runnable CE service images.

## Architecture

Warroom CE is split into visible product surfaces and replaceable service
contracts:

- `flyto-code` provides the React/Vite cockpit and capability-gated UI.
- `flyto-contracts` provides public OpenAPI, capability, scanner, runner,
  evidence, audit, and product-verification contracts.
- `flyto-core` provides YAML workflows, browser automation, deterministic
  verification, and module/runtime SDKs.
- `flyto-indexer` provides local code intelligence, dependency, taint,
  SBOM, impact, and release-evidence analysis.
- Docker Compose wires CE images and Postgres into a local self-hosted
  stack.

## What You Can Run

- A local Warroom UI with local JWT auth.
- Engine, worker, runner, verification, brand-vision, PDF, and Postgres
  services through Docker Compose.
- Local code intelligence through `flyto-indexer`.
- YAML workflows and deterministic verification through `flyto-core`.
- Capability-gated product surfaces for CTEM, code security, automated
  testing, red team workflows, cloud/container/runtime posture, evidence,
  reports, scoring, and compliance.

## Install

```sh
git clone https://github.com/flytohub/flyto-warroom.git
cd flyto-warroom
python3 install/scripts/setup-ce.py --email admin@example.com
make preflight
make verify-images
make ce-up
```

Open `http://localhost:8088` and sign in with the local admin account
created by `setup-ce.py`.

## CE And Enterprise

CE is designed to be useful without calling Flyto Cloud. Higher-value
Enterprise capabilities can be attached through the Enterprise Cloud
Bridge: CE keeps the local database, UI, evidence timeline, and audit trail;
Flyto Cloud provides entitled premium services such as commercial threat
intelligence, managed runner fleets, live remediation orchestration,
enterprise identity, and commercial AI proposal workflows.

Premium actions must fail closed when a license, entitlement, permission,
connector, signature, or cloud service check fails. See
`docs/enterprise-cloud-bridge.md`.

## Packages
- `flyto-core` from `flyto-core`: 1002 files
- `flyto-indexer` from `flyto-indexer`: 253 files
- `flyto-i18n` from `flyto-i18n`: 5000 files
- `flyto-code` from `flyto-code`: 1565 files
- `flyto-contracts` from `flyto-engine`: 21 files

## Local Install

- `install/docker-compose.ce.yml`: local CE stack.
- `install/docker-compose.ee-sim.yml`: enterprise simulation override.
- `install/scripts/audit-release-tree.py`: fail-closed release audit.
- `docs/local-install.md`: local startup and reset steps.
- `docs/enterprise-simulation.md`: enterprise JWT simulation steps.
- `docs/enterprise-cloud-bridge.md`: premium cloud bridge model.

## Kept Closed

The following areas are intentionally not published as CE source:
- billing, entitlement mutation, commercial gates, and Stripe/offline-license adapters
- enterprise SSO/SAML/SCIM, legal hold, airgap installers, deployment edition internals
- darkweb, stealer-log, phishing-feed, commercial threat-intel, and proprietary correlation datasets
- cloud/container/runtime live remediation orchestration and customer connector credentials
- Flyto Cloud Enterprise Bridge services, entitlement signer, managed job execution plane, and hosted SaaS control plane
- AutoFix promotion, approval, rollback orchestration, and commercial AI proposal workflows
- hosted SaaS-only frontend configuration, private preview credentials, and enterprise image publishing metadata

## Contributing Back

This repository is generated from the Flyto2 source workspace. Public PRs
are reviewed here, converted into upstream patch bundles, applied to the
source repos, tested, and re-exported. This keeps CE and the commercial
product aligned instead of creating two unrelated projects.

Run before opening release-sensitive PRs:

```sh
python3 install/scripts/audit-release-tree.py .
python3 scripts/audit-ce-boundary.py .
```

## Testing And Verification

The generated tree includes fail-closed release checks:

- `make verify` runs release audits and Docker image digest dry-run.
- `make audit` runs release, CE boundary, and GitHub protection audits.
- `make verify-images` checks the public Docker image coordinates and
  expected digests in `OPEN_CORE_MANIFEST.json`.
- GitHub Actions run governance, release, frontend build, contract, and
  Docker image audit jobs.

## Security

Report vulnerabilities privately. Do not submit credentials, customer
data, private image coordinates, production tokens, private keys, or
enterprise-only implementation details. See `SECURITY.md` and
`docs/code-protection.md`.

## License

Each package keeps its own license. Root installer, workflow, and generated
documentation files are Apache-2.0. See `LICENSES.md`.
