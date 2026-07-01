# Docker Hub Repository Overview

````markdown
# Flyto2 Warroom CE Preview

Flyto2 Warroom CE is the self-hosted open-core edition of Flyto2 Warroom: a
local security operations cockpit for code security, external attack surface,
cloud/container/runtime posture, automated security testing, evidence, scoring,
and compliance workflows.

This is a CE Preview for local labs, evaluators, security teams, and
open-source users who want to run Warroom on their own Docker host.

## Links

- Website: https://flyto2.com
- GitHub: https://github.com/flytohub/flyto-warroom
- Install docs: https://github.com/flytohub/flyto-warroom/blob/main/docs/local-install.md
- Enterprise bridge: https://github.com/flytohub/flyto-warroom/blob/main/docs/enterprise-cloud-bridge.md
- Security policy: https://github.com/flytohub/flyto-warroom/blob/main/SECURITY.md

## Images

This repository publishes Flyto2 Warroom CE services as separate tags:

- `engine-ce` - backend API and security workflow engine
- `worker-ce` - background worker
- `code-ce` - web UI
- `runner-ce` - automation and browser runner service
- `verification-ce` - product verification service
- `brand-vision-ce` - brand/image analysis helper
- `pdf-ce` - report PDF service

Official service tags are Docker manifest lists for:

- `linux/amd64`
- `linux/arm64`

Per-architecture inputs are published as suffix tags such as
`engine-ce-amd64`, `engine-ce-arm64`, `code-ce-amd64`, and `code-ce-arm64`.
Most users should pull the unsuffixed service tag and let Docker choose the
right platform.

Versioned tags are also published for reproducible installs, for example:

- `engine-ce-20260630-84db98a`
- `code-ce-20260630-84db98a`

## Quick Start

Recommended install path is Docker Compose from GitHub:

```sh
git clone https://github.com/flytohub/flyto-warroom.git
cd flyto-warroom

python3 install/scripts/setup-ce.py --email admin@example.com
make preflight
make verify-images
make ce-up
```

Open the UI:

```txt
http://localhost:8088
```

The setup script writes `install/.env`, generates local secrets, and stores only
a password hash for the initial admin account.

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

Community Edition includes the self-hosted open-core Warroom stack. Enterprise
features are separate commercial offerings and are exposed through documented
capabilities, contracts, signed evidence, private images, or Flyto Cloud
services.

## Architecture Note

Official service tags are multi-arch manifest lists, not ARM64-only images.
Check GitHub release notes, platform coverage, and image digests before
production use.

## Verify Image Digests

```sh
git clone https://github.com/flytohub/flyto-warroom.git
python3 flyto-warroom/install/scripts/verify-docker-images.py --manifest flyto-warroom/OPEN_CORE_MANIFEST.json
```

The verifier checks tag reachability, manifest-list digest, and required
`linux/amd64` plus `linux/arm64` platform coverage.

## License

See the GitHub repository for license, trademark, contribution, and security
details.
````
