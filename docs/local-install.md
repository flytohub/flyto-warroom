# Flyto2 Warroom Local Install

This generated tree is the self-hosted Flyto2 Warroom CE delivery shape. It is
safe to publish because it contains whitelisted packages, public contracts, and
installer files only.

## Build Local Images From The Private Workspace

Maintainers with the private workspace can build the local images:

```sh
python -m release.cli flyto2-open-core-export /Users/chester/flytohub --output /tmp/flyto2-warroom-ce
sh /tmp/flyto2-warroom-ce/install/scripts/build-local-images.sh /Users/chester/flytohub
```

The script builds engine, worker, runner, verification, brand-vision, pdf, and
frontend images with the same per-service tags used by Docker Hub
(`engine-ce`, `worker-ce`, `code-ce`, and so on). Public users can pull those
tags directly from the published image repository, while maintainers can rebuild
the same tags locally from the private workspace before starting compose.

For reproducible installs, pin all service tags to one GitHub release version.
Git tag `v0.1.0` publishes Docker tags `engine-ce-0.1.0`,
`worker-ce-0.1.0`, `code-ce-0.1.0`, `runner-ce-0.1.0`,
`verification-ce-0.1.0`, `brand-vision-ce-0.1.0`, and `pdf-ce-0.1.0`.
Those aliases are promoted from the exact multi-architecture digests recorded
in `OPEN_CORE_MANIFEST.json` only after the tagged `main` commit passes CI.

## Start CE Locally

```sh
python3 /tmp/flyto2-warroom-ce/install/scripts/setup-ce.py
make -C /tmp/flyto2-warroom-ce verify-images
make -C /tmp/flyto2-warroom-ce preflight
```

`setup-ce.py` prompts for the initial admin email and password, writes only the
password SHA-256 hash, generates local-only Postgres/JWT/runner/verification
secrets, and writes `install/.env` with owner-only permissions.

`verify-images` checks that every public Docker Hub service tag in
`OPEN_CORE_MANIFEST.json` has a valid manifest and matches the published digest.
`preflight` verifies that local secrets are not blank/placeholders and that
compose can resolve the final image set.

Then start the stack:

```sh
make -C /tmp/flyto2-warroom-ce ce-up
make -C /tmp/flyto2-warroom-ce ce-smoke
```

Open:

- Frontend: `http://localhost:8088`
- Engine health: `http://localhost:8080/health`
- CE product loop: `http://localhost:8080/api/v1/ce/product-loop`

`ce-smoke` checks engine health, the deterministic CE product-loop contract,
the frontend API proxy for that contract, runner health, verification health,
and brand-vision health. It prints the service name, URL, status code, and
validation error when a setting is wrong.

Sign in with the initial admin email and password provided to `setup-ce.py`.
CE uses engine-issued local JWTs; it does not require
Firebase and it does not use dev auth.

CE local JWT auth is password-based. Do not claim or advertise local TOTP/2FA
unless the backend login flow actually enforces it. For production deployments
that require 2FA, place Flyto2 behind an identity provider or use an edition
that supports enterprise SSO/MFA enforcement.

## Use Higher-Tier Capabilities

CE can run without a Flyto2 Cloud account. If an Enterprise license or cloud
entitlement is configured later, premium features should appear through the same
local UI and evidence timeline. The local engine should check capability,
license, role, connector, and evidence-signature gates before accepting premium
results.

See `docs/enterprise-cloud-bridge.md` for the intended bridge model.

## Reset The Database

```sh
make -C /tmp/flyto2-warroom-ce ce-reset-db
```

This removes only the generated compose stack's `pgdata` volume.

## Audit The Release Tree

```sh
make -C /tmp/flyto2-warroom-ce audit
```
