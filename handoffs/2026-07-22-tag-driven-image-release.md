# Tag-Driven CE Image Release

Date: 2026-07-22

## Summary

Flyto2 Warroom CE uses stable Git tags as the public Docker release boundary.
The current complete public-source runtime release is manifest version `0.3.1`
with Git tag `v0.3.1`.

`.github/workflows/release-images.yml` requires the tag commit to be on `main`
with successful CE CI. It audits the tagged tree, then builds the CE engine,
worker, and frontend from the public source for both `linux/amd64` and
`linux/arm64`. It publishes versioned and rolling tags, records the resulting
manifest metadata, and attaches `release-images.json` to the GitHub release.

## Boundary

The public repository does not build private image-only services. Release CI
builds only the three public Docker contexts present in the tagged commit. This
keeps historical Git releases reproducible and prevents hidden source from
being copied into the public workflow.

## Verification

```text
make verify
docker compose --env-file install/.env -f install/docker-compose.source.yml config --quiet
docker buildx build --platform linux/amd64,linux/arm64 services/flyto-engine-ce
```
