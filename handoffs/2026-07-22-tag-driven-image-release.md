# Tag-Driven CE Image Release

Date: 2026-07-22

## Summary

Flyto2 Warroom CE uses stable Git tags as the public Docker release boundary.
The first release is manifest version `0.1.0` with Git tag `v0.1.0`.

`.github/workflows/release-images.yml` requires the tag commit to be on `main`
with successful CE CI. It verifies all seven Docker Hub indexes and their
declared digests, promotes those exact indexes to `engine-ce-0.1.0`,
`worker-ce-0.1.0`, `code-ce-0.1.0`, and matching auxiliary tags, verifies both
`linux/amd64` and `linux/arm64`, and attaches `release-images.json` to the
GitHub release.

## Boundary

The public repository does not rebuild private image-only services. Release
CI promotes exact, previously built and verified digests from
`OPEN_CORE_MANIFEST.json`. This prevents a floating Docker tag from silently
changing a historical Git release and prevents hidden source from being copied
into the public workflow.

## Verification

```text
make verify
python install/scripts/verify-docker-images.py
python install/scripts/promote-release-images.py --tag v0.1.0
```
