# Flyto2 Warroom

[![Docker Pulls](https://img.shields.io/docker/pulls/chesterhsu/flyto-warroom)](https://hub.docker.com/r/chesterhsu/flyto-warroom)
[![GitHub](https://img.shields.io/badge/GitHub-flytohub%2Fflyto--warroom-181717?logo=github)](https://github.com/flytohub/flyto-warroom)
[![Website](https://img.shields.io/badge/Website-flyto2.com-2563eb)](https://flyto2.com)
[![Docs](https://img.shields.io/badge/Docs-docs.flyto2.com-0891b2)](https://docs.flyto2.com/warroom/self-hosted-ce)
[![License](https://img.shields.io/badge/License-PolyForm%20Noncommercial-16a34a)](LICENSES.md)

Self-hosted Community Edition for the Flyto2 security operations platform.

Flyto2 Warroom CE is a self-hosted source-available security warroom and
BYO offensive validation platform. Bring your own tools: Flyto2
turns their findings into verified attack paths, pentest evidence,
and red-team scenarios.

It is not a scanner-only dashboard. Existing security tools are
inputs; the product loop is:

```text
Findings -> Attack Paths -> Offensive Validation -> Evidence -> Remediation
```

CE is useful without Flyto2 Cloud. Enterprise Cloud Bridge adds
commercial intelligence, managed remediation, identity, support,
fleet execution, and signed premium evidence when teams need it.

Flyto2 Warroom CE is the self-hosted source-available security operations
platform for code, CTEM, external attack surface, cloud, container,
runtime, automated security testing, evidence, scoring, and compliance
workflows.

It is built for teams that want a local Warroom they can install, inspect,
patch, verify, and connect back to Flyto2 Enterprise services when they
need commercial intelligence, managed remediation, or enterprise controls.

Enterprise and SaaS editions are assembled as build-time overlays on a
pinned Flyto2 Warroom CE commit. The running system never pulls source
code dynamically; license tier, overlays, image digests, and verification
evidence are recorded during packaging.

This is a generated source-available layout: CE is the public noncommercial base,
and paid editions are overlays built from a pinned CE commit. Public
changes are imported back into the private source workspace, tested,
and re-exported so the CE tree does not become a disconnected fork.

## Official Channels

| Channel | Link | Purpose |
| --- | --- | --- |
| Product page | https://flyto2.com | CE positioning and edition model |
| Docs | https://docs.flyto2.com/warroom/self-hosted-ce | Install, local auth, Docker tags, and Enterprise bridge boundaries |
| GitHub | https://github.com/flytohub/flyto-warroom | Public source mirror, contracts, governance, and contribution loop |
| Docker Hub | https://hub.docker.com/r/chesterhsu/flyto-warroom | Published CE service images |

## What Is Flyto2 Warroom?

Flyto2 Warroom brings security signals into one cockpit instead of leaving
them as disconnected scanner output. A finding should map to an asset, a
score, evidence, ownership, remediation, verification, and an audit trail.

The CE distribution is intentionally usable, but it is not a full source
release of the private Flyto2 backend. Enterprise-only datasets, live
remediation orchestration, hosted control planes, and commercial approval
workflows stay behind explicit capability gates.

## Core Capabilities

| Area | What CE is meant to show | Enterprise path |
| --- | --- | --- |
| Code security | SAST, SCA, secrets, IaC, reachability, code score, evidence | AI proposals, promotion, approval, rollback |
| CTEM and external exposure | Footprint, asset map, posture, issue lifecycle, scoring | Commercial enrichment and continuous monitoring |
| Automated security testing | Authorized DAST/runner workflows, replay, evidence | Managed runner fleet and scale-out execution |
| Cloud, container, runtime, VM | Posture views, connector contracts, local evidence | Live remediation and managed connector execution |
| Threat intelligence | Public/feed-backed lookups where configured | Darkweb, stealer, leak, phishing, actor, malware datasets |
| Evidence and compliance | Audit timeline, reports, evidence packs, verification | Legal hold, offline license, airgap, enterprise support |
| Identity and governance | Local roles, capabilities, gated actions | SSO/SAML/SCIM, advanced entitlement, commercial billing |
| AI governance | Deterministic fallback, audit events, provider visibility | Quota, routing, commercial AI proposal workflows |

The machine-generated edition matrix lives in `docs/feature-matrix.md`
and is derived from the engine module catalog instead of hand-written
marketing copy.

## Installation

```sh
git clone https://github.com/flytohub/flyto-warroom.git
cd flyto-warroom
python3 install/scripts/setup-ce.py
make preflight
make verify-images
make ce-up
```

Open `http://localhost:8088` and create the first administrator in the
one-time browser setup. Later visits use the normal sign-in page.

Default local ports:

| Service | Port |
| --- | --- |
| Warroom UI | `8088` |
| Engine API | `8080` |
| Postgres | `5432` |
| Runner | `8090` |
| Verification | `8344` |
| Brand Vision | `8095` |

## Usage

Use `make ce-up`, `make ce-ps`, and `make ce-logs` for the normal local
operator loop. The browser cockpit at `http://localhost:8088` owns project
setup, findings, attack paths, evidence, remediation, and verification.
See `docs/README.md` for task-oriented guides and `docs/reference/README.md`
for exact source-level functions, methods, and classes.

## API Reference

The authoritative public HTTP contract is
`packages/flyto-contracts/openapi/flyto-engine.openapi.yaml`. Generated SDK
stubs and conformance fixtures live beside it in `packages/flyto-contracts/`.
Implementation links are generated under `docs/reference/`.

## Configuration

Run `python3 install/scripts/setup-ce.py` to create `install/.env`. Start
from `install/.env.ce.example`; every variable includes its purpose and
safe local default. Enterprise simulation uses
`install/.env.ee-sim.example`. Never commit generated `.env` files.

### Build The Public Source Profile

The source profile builds the complete PolyForm Noncommercial 1.0.0 CE
PostgreSQL engine, scan worker, and the same React frontend directly
from this repository. It does not pull
Flyto2 service images or require credentials:

```sh
make setup-ce
make source-build
make source-up
make source-smoke
```

Open `http://127.0.0.1:18088/sign-in`; a fresh database redirects to the
one-time local administrator form.
This source profile owns authenticated projects, durable public-repository
scans, findings, health summaries, and local report delivery. See
`docs/source-build.md`.

## Architecture

```mermaid
flowchart LR
  UI["flyto-code<br/>Warroom cockpit"] --> API["CE engine<br/>public source"]
  API --> KERNEL["services/flyto-engine-ce<br/>complete CE runtime"]
  API --> DB[("Postgres")]
  API --> Worker["CE scan worker<br/>public source"]
  Worker --> Repo["credential-free public repo clone"]
  Worker --> DB
  API -. premium signed jobs .-> Cloud["Flyto2 Enterprise Cloud Bridge"]
  Cloud -. signed evidence .-> API
```

The public repository is generated from allowlisted packages and contracts.
The complete local CE product path under `services/flyto-engine-ce` is
source-published: local auth, PostgreSQL projects, durable scans, native
findings, and reports. Commercial datasets, billing, customer connector
credentials, SaaS/Enterprise adapters, and live remediation remain private.

## Components

| Package | Source | Files | Role |
| --- | --- | ---: | --- |
| `flyto-code` | `flyto-code` | 1616 | React/Vite Warroom cockpit, i18n runtime, and capability-gated UI. |
| `flyto-contracts` | `flyto-engine` | 28 | Public OpenAPI, capabilities, schemas, examples, and SDK stubs. |
| `flyto-engine-ce` | `flyto-engine` | 104 | Reproducible CE engine/worker source runtimes and public kernel primitives. |

## Docker Images

Published repository: `docker.io/chesterhsu/flyto-warroom`

| Service | Tag |
| --- | --- |
| Engine API | `engine-ce` |
| Worker | `worker-ce` |
| Warroom UI | `code-ce` |

Stable release `v0.3.2` builds per-service `*-0.3.2`
Docker images directly from that tagged public source after its `main`
commit passes CI. See `docs/official-builds.md` for the release contract.

## CE And Enterprise

CE is designed to be useful without calling Flyto2 Cloud. Higher-value
Enterprise capabilities can be attached through the Enterprise Cloud
Bridge: CE keeps the local database, UI, evidence timeline, and audit trail;
Flyto2 Cloud provides entitled premium services such as commercial threat
intelligence, managed runner fleets, live remediation orchestration,
enterprise identity, and commercial AI proposal workflows.

Premium actions must fail closed when a license, entitlement, permission,
connector, signature, or cloud service check fails. See
`docs/enterprise-cloud-bridge.md`.

CE scores are local and externally observed. They are useful for self-hosted
verification, but they are not public, cross-organization rating authority
scores. Public rating authority, Firebase-backed authority services, and
calibration remain private signed overlays.

| Edition | Best for | Notes |
| --- | --- | --- |
| CE | Personal research, education, public-interest organizations, and noncommercial self-hosting | Source-available packages, public contracts, local install, runnable CE images |
| Enterprise Cloud Bridge | Teams that need premium intelligence or managed execution | Entitled cloud jobs return signed evidence to the local Warroom |
| Enterprise Airgap | Regulated deployments that cannot call Flyto2 Cloud | Private images, signed offline licenses, support, and controlled update bundles |

## Local Operations

| Task | Command |
| --- | --- |
| Start CE | `make ce-up` |
| Stop CE | `make ce-down` |
| Follow logs | `make ce-logs` |
| Reset local database | `make ce-reset-db` |
| Build public source profile | `make source-build` |
| Start public source profile | `make source-up` |
| Smoke public source profile | `make source-smoke` |
| Stop public source profile | `make source-down` |
| Verify release tree | `make verify` |
| Verify image digests | `make verify-images` |

See `docs/local-install.md` for setup and reset details. See
`docs/enterprise-simulation.md` for local enterprise-gate simulation.

## What Stays Private

The following areas are intentionally not published as CE source:
- billing, entitlement mutation, commercial gates, and Stripe/offline-license adapters
- enterprise SSO/SAML/SCIM, legal hold, airgap installers, deployment edition internals
- darkweb, stealer-log, phishing-feed, commercial threat-intel, and proprietary correlation datasets
- cloud/container/runtime live remediation orchestration and customer connector credentials
- Flyto2 Cloud Enterprise Bridge services, entitlement signer, managed job execution plane, and hosted SaaS control plane
- AutoFix promotion, approval, rollback orchestration, and commercial AI proposal workflows
- hosted SaaS-only frontend configuration, private preview credentials, and enterprise image publishing metadata

## Contributing

This repository is a generated CE mirror, not a permanent fork. Public PRs
are reviewed here, converted into upstream patch bundles, applied to the
source repos, tested, and re-exported. Accepted CE changes should improve
Flyto2 itself, not only this mirror.

Run before opening release-sensitive PRs:

```sh
python3 install/scripts/audit-release-tree.py .
python3 scripts/audit-ce-boundary.py .
python3 scripts/audit-provenance.py .
python3 scripts/audit-open-core-overlay.py .
```

## Verification

The generated tree includes fail-closed release checks:

- `make verify` runs release audits and Docker image digest dry-run.
- `make audit` runs release, CE boundary, provenance, open-core overlay, and GitHub protection audits.
- `make verify-images` checks the public Docker image coordinates and
  expected digests in `OPEN_CORE_MANIFEST.json`.
- GitHub Actions run governance, release, frontend build, contract, and
  Docker image audit jobs.
- `OPEN_CORE_MANIFEST.json` records credential-free source commits, the
  deterministic file inventory/tree hash, packages, image digests, release
  files, closed-source boundaries, and merge contracts.

## Testing

Run `make test` for the CE Go source, frontend boundaries, and public
contract fixtures. Run `make verify` for the complete release gate. After
installing `flyto-indexer`, `make docs` refreshes the source reference and
`make docs-check` detects documentation drift.

## Security

Report vulnerabilities privately. Do not submit credentials, customer
data, private image coordinates, production tokens, private keys, or
enterprise-only implementation details. See `SECURITY.md` and
`docs/code-protection.md`.

## License

Flyto2-owned CE source, installer, workflow, and generated documentation
in this release use PolyForm Noncommercial 1.0.0. Commercial production,
paid hosting/SaaS, resale/OEM, and paid client delivery require a separate
written commercial license. Third-party packages keep their own licenses.
Historical `v0.1.0` and `v0.1.1` releases remain Apache-2.0; those already
granted rights are not revoked. See `LICENSES.md` for the full FAQ and
package boundaries.
