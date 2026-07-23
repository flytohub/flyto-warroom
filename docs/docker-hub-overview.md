# Docker Hub Repository Overview

````markdown
# Flyto2 Warroom CE

Flyto2 Warroom CE is the self-hosted, source-available, noncommercial edition of
Flyto2 Warroom: a local source-security workbench for public repositories,
findings, evidence, transparent risk hypotheses, remediation verification, and
portable reports.

Not a scanner-only image. Existing security tools are inputs; the local loop is:

```text
Repository -> Scan -> Findings -> Evidence -> Risk Hypotheses -> Verify -> Report
```

This Community Edition is for noncommercial local labs, evaluators, researchers,
and security teams that want to run Warroom on their own Docker host. Commercial
production, SaaS/hosting, managed services, paid client delivery, resale, OEM,
or other monetary-advantage use requires a separate written commercial license.

## Links

- Website: https://flyto2.com
- GitHub: https://github.com/flytohub/flyto-warroom
- Install docs: https://github.com/flytohub/flyto-warroom/blob/main/docs/local-install.md
- Enterprise bridge: https://github.com/flytohub/flyto-warroom/blob/main/docs/enterprise-cloud-bridge.md
- Security policy: https://github.com/flytohub/flyto-warroom/blob/main/SECURITY.md

## Images

Docker Hub repository: `flyto2/warroom`

This repository publishes the CE application services as separate tags:

- `engine-ce` - backend API and security workflow engine
- `worker-ce` - repository scan worker
- `scheduler-ce` - recurring-scan scheduler
- `analysis-ce` - evidence and risk-hypothesis analysis
- `report-ce` - portable HTML report renderer
- `code-ce` - web UI
Stable semantic-version tags are published for reproducible installs. Git tag
`v0.5.0` maps to:

- `engine-ce-0.5.0`
- `worker-ce-0.5.0`
- `scheduler-ce-0.5.0`
- `analysis-ce-0.5.0`
- `report-ce-0.5.0`
- `code-ce-0.5.0`

The tag-triggered GitHub Actions release builds all six from public source,
publishes both `linux/amd64` and `linux/arm64`, and records immutable digests.

## Quick Start

Recommended install path is Docker Compose from GitHub:

```sh
git clone https://github.com/flytohub/flyto-warroom.git
cd flyto-warroom

python3 install/scripts/setup-ce.py
make preflight
make ce-up
```

Open the UI:

```txt
http://localhost:8088
```

The setup script writes `install/.env` and generates infrastructure secrets.
Open the UI to create the first administrator through the one-time setup page.

## What CE Includes

- Local Warroom UI with local JWT auth, no Firebase requirement.
- CE engine, scan worker, scheduler, analysis, report, frontend, and PostgreSQL
  services. Application images are built entirely from this public repository;
  PostgreSQL uses its official upstream image.
- Physically independent frontend source with built-in locale strings, public
  API/capability/evidence contracts, and installer scripts.
- Credential-free public repository checks, evidence, transparent risk
  hypotheses, remediation re-verification, and portable HTML reports.

## Product Views

All captures below use the English CE interface from the immutable
`v0.5.0` public source.

### Create The First Local Administrator

![Flyto2 Warroom CE first administrator setup](https://raw.githubusercontent.com/flytohub/flyto-warroom/v0.5.0/docs/images/warroom-ce-first-admin.png)

### Sign In To The Local Warroom

![Flyto2 Warroom CE local sign in](https://raw.githubusercontent.com/flytohub/flyto-warroom/v0.5.0/docs/images/warroom-ce-sign-in.png)

### Light Appearance

![Flyto2 Warroom CE first administrator setup in light appearance](https://raw.githubusercontent.com/flytohub/flyto-warroom/v0.5.0/docs/images/warroom-ce-first-admin-light.png)

## Enterprise Path

CE is not a full Enterprise source release. Premium capabilities can be attached
through Flyto2 Enterprise Cloud Bridge:

- commercial darkweb/threat-intel datasets and correlation;
- managed DAST/browser runner fleet and red team execution;
- cloud/container/runtime/VM live remediation orchestration;
- commercial AI proposal workflows, approval, promotion, and rollback bundles;
- SSO/SAML/SCIM, offline license, airgap packaging, legal hold, and support
  controls.

Premium actions should fail closed when entitlement, permission, connector,
signature, or cloud validation fails.

## Default Ports

- UI: `8088`
- Engine API: `8080`
- Worker health/self-test: `8081` (loopback only)
- Scheduler health: `8082` (loopback only)
- Analysis health: `8083` (loopback only)
- Report health: `8084` (loopback only)
- Postgres: `5432`

Ports can be changed in `install/.env`.

## Privacy

Flyto2 Warroom CE does not enable product telemetry by default.

The CE Docker install does not ship a default Sentry, PostHog, Segment,
Amplitude, GA, or GTM key. Runtime telemetry endpoints are for your own
self-hosted security/runtime data and are stored in your own Flyto2 Warroom
instance.

## Edition Model

Community Edition includes the self-hosted source-available, noncommercial Warroom stack. Enterprise
features are separate commercial offerings and are exposed through documented
capabilities, contracts, signed evidence, private images, or Flyto2 Cloud
services.

## Architecture Note

The official tags publish a manifest list for `linux/amd64` and `linux/arm64`.
Every release records and verifies the registry descriptor digest in
`OPEN_CORE_MANIFEST.json`; check GitHub release evidence and those digests
before production use.

## Verify Image Digests

```sh
git clone https://github.com/flytohub/flyto-warroom.git
python3 flyto-warroom/install/scripts/verify-docker-images.py --manifest flyto-warroom/OPEN_CORE_MANIFEST.json
```

## License

See the GitHub repository for license, trademark, contribution, and security
details.
````
