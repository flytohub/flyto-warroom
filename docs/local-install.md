# Flyto2 Warroom Local Install

This generated tree is the self-hosted Flyto2 Warroom CE delivery shape. It is
safe to publish because it contains whitelisted packages, public contracts, and
installer files only.

## Build The Complete CE Stack From Public Source

Clone this public repository and build all CE application images locally:

```sh
git clone https://github.com/flytohub/flyto-warroom.git
cd flyto-warroom
python3 install/scripts/setup-ce.py
make source-build
```

The source profile builds the engine API, scan worker, and frontend from the
checked-out public tree. PostgreSQL comes from its upstream official image. No
private Flyto2 repository, private service image, source token, or Flyto Cloud
connection is required.

For reproducible installs, pin all service tags to one GitHub release version.
Git tag `v0.3.2` publishes Docker tags `engine-ce-0.3.2`,
`worker-ce-0.3.2`, and `code-ce-0.3.2`. GitHub Actions builds those images from
the tagged public source after the tagged `main` commit passes CI and records
the resulting immutable digests as release evidence.

## Start CE Locally

```sh
python3 install/scripts/setup-ce.py
make preflight
```

`setup-ce.py` runs without asking for account credentials. It generates only
local Postgres/JWT secrets and writes `install/.env` with
owner-only permissions. Account credentials are submitted directly to the
Engine from the browser during one-time setup and the password is stored only
as a bcrypt hash in Postgres.

`preflight` verifies that local secrets are not blank/placeholders and that
Compose can resolve the official CE image set. The generated environment pins
the immutable image tags for this release; it does not silently follow mutable
latest aliases.

To run the official release images, start a fresh stack:

```sh
make ce-up
```

Open:

- Frontend: `http://localhost:8088`
- Engine health: `http://localhost:8080/health`
- CE product loop: `http://localhost:8080/api/v1/ce/product-loop`

Release maintainers can run `make ce-smoke` against a disposable fresh database.
That command intentionally consumes the one-time bootstrap by creating a
temporary administrator, connects a credential-free public repository, waits
for the public worker to finish scanning, and verifies findings, score, report,
engine health, worker health, and frontend proxying. Run `make ce-reset-db`
afterward before using the instance normally.

To build and test the exact same three application services from the checked-out
public source instead, run `make source-up && make source-smoke` against a fresh
source-profile database.

On the first visit, create the administrator account in the browser. The setup
route permanently closes after the first successful account creation; later
visits show the normal sign-in page.
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
docker compose --env-file install/.env -f install/docker-compose.ce.yml down --volumes
```

This removes only the generated compose stack's `pgdata` volume.

## Audit The Release Tree

```sh
make audit
```
