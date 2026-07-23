# Flyto2 Warroom CE

[![Docker Pulls](https://img.shields.io/docker/pulls/flyto2/warroom)](https://hub.docker.com/r/flyto2/warroom)
[![GitHub](https://img.shields.io/badge/source-flytohub%2Fflyto--warroom-181717?logo=github)](https://github.com/flytohub/flyto-warroom)
[![Platforms](https://img.shields.io/badge/platforms-amd64%20%7C%20arm64-2496ed?logo=docker)](https://hub.docker.com/r/flyto2/warroom/tags)
[![License](https://img.shields.io/badge/license-PolyForm%20Noncommercial-16a34a)](https://github.com/flytohub/flyto-warroom/blob/main/LICENSES.md)

**Self-hosted code security scanning, findings, evidence, and reports.**

Flyto2 Warroom CE lets you create a local administrator, connect a
credential-free public Git repository, run native repository security checks,
review durable findings, and export local reports without a Flyto2 Cloud
account or a private source repository.

Flyto2 Warroom is a self-hosted source-available security warroom and BYO
offensive validation platform. Bring your own tools: Flyto2 turns their
findings into verified attack paths, pentest evidence, and red-team scenarios.
Not a scanner-only image, the product model connects the security loop:

```text
Findings -> Attack Paths -> Offensive Validation -> Evidence -> Remediation
```

The source-published `0.4.1` runtime owns the local repository-scanning,
findings, evidence, and report path described below. Managed execution,
commercial intelligence, and Enterprise-only orchestration are outside this CE
image set.

> **This is a multi-container stack.** Install Engine, Worker, Frontend, and
> PostgreSQL together with Docker Compose. Do not run a single service tag as
> the complete product.

Recommended install path is Docker Compose. Flyto2 Warroom CE does not enable product telemetry by default.
The published manifests support `linux/amd64` and `linux/arm64`.

## What You Can Do

- Run local secrets, IaC, static-analysis, and dependency checks.
- Keep projects, scan jobs, findings, scores, evidence, and reports in local
  PostgreSQL.
- Create the first administrator in a one-time browser setup and use
  engine-issued local sessions afterward.
- Build the same Engine, Worker, and Frontend images from the published source.
- Run on Linux `amd64` and `arm64` hosts with versioned, reproducible tags.

## Quick Start

```sh
git clone https://github.com/flytohub/flyto-warroom.git
cd flyto-warroom
python3 install/scripts/setup-ce.py
make preflight
make verify-images
make ce-up
```

Open:

- Warroom UI: `http://localhost:8088`
- Engine health: `http://localhost:8080/health`

On the first visit, create the local administrator account in the browser.
The one-time setup route closes after the first successful account creation.

See the
[complete local installation guide](https://github.com/flytohub/flyto-warroom/blob/main/docs/local-install.md)
for reset, smoke-test, and source-build instructions.

## Official Service Tags

All services are published in this repository under separate tags:

| Service | Mutable tag | Versioned tag |
| --- | --- | --- |
| Engine API | `flyto2/warroom:engine-ce` | `flyto2/warroom:engine-ce-0.4.1` |
| Scan worker | `flyto2/warroom:worker-ce` | `flyto2/warroom:worker-ce-0.4.1` |
| Web UI | `flyto2/warroom:code-ce` | `flyto2/warroom:code-ce-0.4.1` |

For reproducible installs, use all three tags from the same release. The
generated Compose environment pins versioned tags instead of silently
following mutable aliases.

## Architecture

```text
Browser
   |
   v
Frontend (code-ce) ---> Engine API (engine-ce) ---> PostgreSQL
                              ^
                              |
                        Worker (worker-ce)
                              |
                              v
                  Credential-free public Git repo
```

The Engine owns local authentication, projects, scan state, findings,
summaries, and reports. The Worker claims durable scan jobs and executes the
published repository-scanning path. The Frontend proxies the browser workflow
to the local Engine.

## Build From Published Source

```sh
git clone https://github.com/flytohub/flyto-warroom.git
cd flyto-warroom
python3 install/scripts/setup-ce.py
make source-build
make source-up
make source-smoke
```

The source profile builds all three Flyto2 application images locally.
PostgreSQL is pulled from its upstream official image. No private Flyto2
repository, source token, private service image, Firebase account, or Flyto2
Cloud connection is required.

## Product Views

### Security Discovery

![Flyto2 Warroom security discovery](https://raw.githubusercontent.com/flytohub/flyto-warroom/main/docs/images/warroom-automated-security-discovery.png)

### Evidence Review

![Flyto2 Warroom evidence review](https://raw.githubusercontent.com/flytohub/flyto-warroom/main/docs/images/warroom-evidence-pack.png)

## Release And Supply-Chain Evidence

- Multi-platform images are built from the tagged public source with GitHub
  Actions.
- Every release publishes immutable service tags and records image digests in
  `release-images.json`.
- Release builds publish BuildKit provenance and SBOM attestations.
- The public source tree includes local build, smoke-test, release-audit, and
  security-policy instructions.

Read the
[official build contract](https://github.com/flytohub/flyto-warroom/blob/main/docs/official-builds.md)
or inspect the
[GitHub Actions history](https://github.com/flytohub/flyto-warroom/actions).

## Enterprise Path

CE does not require Flyto2 Cloud. Commercial datasets, managed runner fleets,
enterprise identity, customer connector credentials, hosted control-plane
services, and commercial remediation orchestration remain separate Enterprise
capabilities. They are not included in the three CE service images listed
above.

## Community And Security

- [Source code](https://github.com/flytohub/flyto-warroom)
- [Documentation](https://docs.flyto2.com/warroom/self-hosted-ce)
- [Security policy](https://github.com/flytohub/flyto-warroom/blob/main/SECURITY.md)
- [Contributing](https://github.com/flytohub/flyto-warroom/blob/main/CONTRIBUTING.md)
- [Website](https://flyto2.com)

Flyto2 Warroom CE is published under the PolyForm Noncommercial License
1.0.0. Review the
[license and additional terms](https://github.com/flytohub/flyto-warroom/blob/main/LICENSES.md)
before redistribution or deployment.

Commercial datasets, managed execution, enterprise identity, customer
connector credentials, hosted control-plane services, and commercial
remediation orchestration are not included in this CE image set.
