# Flyto2 Warroom Local Install

This generated tree is the self-hosted Flyto2 Warroom CE delivery shape. It is
safe to publish because it contains whitelisted packages, public contracts, and
installer files only.

## Build Local Images From The Private Workspace

Maintainers with the private workspace can build the local images:

```sh
python -m src.cli flyto2-open-core-export /Users/chester/flytohub --output /tmp/flyto2-warroom-ce
sh /tmp/flyto2-warroom-ce/install/scripts/build-local-images.sh /Users/chester/flytohub
```

The script builds engine, worker, runner, verification, brand-vision, pdf, and
frontend images with the same per-service tags used by Docker Hub
(`engine-ce`, `worker-ce`, `code-ce`, and so on). Public users can pull those
tags directly from the published image repository, while maintainers can rebuild
the same tags locally from the private workspace before starting compose.

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
```

Open:

- Frontend: `http://localhost:8088`
- Engine health: `http://localhost:8080/health`

Sign in with the initial admin email and password provided to `setup-ce.py`.
CE uses engine-issued local JWTs; it does not require
Firebase and it does not use dev auth.

## Seed The Demo Workspace

After the stack is healthy, load the CE demo workspace:

```sh
python3 /tmp/flyto2-warroom-ce/install/scripts/seed-demo-workspace.py --email admin@example.com
```

The script logs in through local JWT auth, creates `Flyto2 Warroom CE Demo`,
and writes an evidence pack that connects code, container, cloud, external
attack surface, evidence, and AutoFix into one local closed loop.

Run the offline validator at any time:

```sh
make -C /tmp/flyto2-warroom-ce demo-seed-dry-run
```

CE local JWT auth is password-based. Do not claim or advertise local TOTP/2FA
unless the backend login flow actually enforces it. For production deployments
that require 2FA, place Flyto2 behind an identity provider or use an edition
that supports enterprise SSO/MFA enforcement.

## Use Higher-Tier Capabilities

CE can run without a Flyto Cloud account. If an Enterprise license or cloud
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
