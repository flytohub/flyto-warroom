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
cp /tmp/flyto2-warroom-ce/install/.env.ce.example /tmp/flyto2-warroom-ce/install/.env
python3 /tmp/flyto2-warroom-ce/install/scripts/hash-local-password.py
openssl rand -base64 48
openssl rand -base64 48
openssl rand -base64 48
openssl rand -base64 48
```

Paste the generated values into `install/.env`:

- first `openssl` output -> `FLYTO_LOCAL_AUTH_JWT_SECRET`
- second `openssl` output -> `FLYTO_RUNNER_SECRET`
- third `openssl` output -> `FLYTO_VERIFICATION_SECRET`
- fourth `openssl` output -> `FLYTO_MASTER_KEY`
- password hash output -> `FLYTO_LOCAL_AUTH_PASSWORD_SHA256`

Then start the stack:

```sh
make -C /tmp/flyto2-warroom-ce ce-up
```

Open:

- Frontend: `http://localhost:8088`
- Engine health: `http://localhost:8080/health`

Sign in with the `FLYTO_LOCAL_AUTH_EMAIL` value and the password used by
`hash-local-password.py`. CE uses engine-issued local JWTs; it does not require
Firebase and it does not use dev auth.

## Reset The Database

```sh
make -C /tmp/flyto2-warroom-ce ce-reset-db
```

This removes only the generated compose stack's `pgdata` volume.

## Audit The Release Tree

```sh
make -C /tmp/flyto2-warroom-ce audit
```
