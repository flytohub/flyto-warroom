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
frontend images with the `ce-local` tag. Public users would pull the same image
names from Docker Hub after the release pipeline publishes them.

## Start CE Locally

```sh
cp /tmp/flyto2-warroom-ce/install/.env.ce.example /tmp/flyto2-warroom-ce/install/.env
make -C /tmp/flyto2-warroom-ce ce-up
```

Open:

- Frontend: `http://localhost:8088`
- Engine health: `http://localhost:8080/health`

CE local mode sets `FLYTO_DEV_AUTH=1` because production `local_jwt` auth is not
implemented in the engine server yet. That is acceptable for a laptop smoke
stack and blocked by documentation/audit from being described as production
community auth.

## Reset The Database

```sh
make -C /tmp/flyto2-warroom-ce ce-reset-db
```

This removes only the generated compose stack's `pgdata` volume.

## Audit The Release Tree

```sh
make -C /tmp/flyto2-warroom-ce audit
```
