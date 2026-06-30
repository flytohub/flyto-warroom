# Docker Hub Repository Overview

````markdown
# Flyto2 Warroom CE Preview

Flyto2 Warroom CE is the self-hosted community edition of Flyto2 Warroom, an
open-core security operations platform for code, cloud, container, runtime,
external attack surface, evidence, and compliance workflows.

This is a CE Preview release for local labs, evaluators, security teams, and
open-source users who want to run the Warroom stack on their own Docker host.

## Links

- Website: https://flyto2.com
- GitHub: https://github.com/flytohub/flyto-warroom
- Install docs: https://github.com/flytohub/flyto-warroom/blob/main/docs/local-install.md
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

Versioned tags are also published for reproducible installs, for example:

- `engine-ce-20260630-84db98a`
- `code-ce-20260630-84db98a`

## Quick Start

Recommended install path is Docker Compose from the GitHub repository:

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

Community Edition includes the self-hosted open-core Warroom stack.

Enterprise features such as hosted SaaS control plane, enterprise
SSO/SAML/SCIM, commercial threat intelligence, advanced entitlement controls,
managed runner fleets, airgap packaging, and enterprise support are separate
commercial offerings.

## Architecture Note

This image set is currently published as linux/arm64 images from the local
release pipeline. Check GitHub release notes and image digests before production
use. linux/amd64 and multi-arch publishing should be enabled before a broader
public launch.

## Verify Image Digests

```sh
git clone https://github.com/flytohub/flyto-warroom.git
python3 flyto-warroom/install/scripts/verify-docker-images.py --manifest flyto-warroom/OPEN_CORE_MANIFEST.json
```

## License

See the GitHub repository for license, trademark, contribution, and security
details.
````
