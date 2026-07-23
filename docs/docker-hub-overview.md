# Docker Hub Repository Overview

````markdown
# Flyto2 Warroom CE

Flyto2 Warroom CE is the self-hosted, source-available, noncommercial edition of Flyto2 Warroom: a
local security operations cockpit for code security, external attack surface,
cloud/container/runtime posture, automated security testing, evidence, scoring,
and compliance workflows.

It is a self-hosted source-available security warroom and BYO offensive validation
platform. Bring your own tools: Flyto2 turns their findings into verified
attack paths, pentest evidence, and red-team scenarios.

Not a scanner-only image. Existing security tools are inputs; the local loop is:

```text
Findings -> Attack Paths -> Offensive Validation -> Evidence -> Remediation
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

This repository publishes the CE application services as separate tags:

- `engine-ce` - backend API and security workflow engine
- `worker-ce` - background worker
- `code-ce` - web UI
Stable semantic-version tags are published for reproducible installs. Git tag
`v0.3.0` maps to:

- `engine-ce-0.3.0`
- `worker-ce-0.3.0`
- `code-ce-0.3.0`

The tag-triggered GitHub Actions release builds all three from public source,
publishes both `linux/amd64` and `linux/arm64`, and records immutable digests.

## Quick Start

Recommended install path is Docker Compose from GitHub:

```sh
git clone https://github.com/flytohub/flyto-warroom.git
cd flyto-warroom

python3 install/scripts/setup-ce.py
make preflight
make source-build
make source-up
```

Open the UI:

```txt
http://localhost:8088
```

The setup script writes `install/.env` and generates infrastructure secrets.
Open the UI to create the first administrator through the one-time setup page.

## What CE Includes

- Local Warroom UI with local JWT auth, no Firebase requirement.
- CE engine, worker, runner, verification, brand-vision, PDF, and Postgres
  services.
- Public frontend source, i18n packages, local code intelligence, YAML runtime,
  public API/capability/evidence contracts, and installer scripts.
- Baseline workflows for code security, CTEM/external posture, automated
  security testing, evidence, reports, score views, and compliance surfaces.

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
- Postgres: `5432`
- Runner: `8090`
- Verification: `8344`
- Brand Vision: `8095`

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
