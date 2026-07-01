# Official Builds And Supply Chain

Flyto2 Warroom CE treats source, images, and release evidence as one chain.

## Official Sources

- Source mirror: `github.com/flytohub/flyto-warroom`
- Source of truth: private Flyto2 workspace, exported by
  `flyto2-open-core-export`
- Export evidence: `OPEN_CORE_MANIFEST.json`

## Official Images

The official CE image repository and per-service tags are declared in
`OPEN_CORE_MANIFEST.json`. A modified distribution must use different image
names and must not imply that it is an official Flyto2 build.

Official CE images are runnable distribution artifacts. They do not mean the
private `flyto-engine` implementation, Enterprise datasets, Enterprise
remediation workers, or Flyto Cloud control plane source have been published.

Official service tags are Docker manifest lists for `linux/amd64` and
`linux/arm64`. The per-architecture input tags use the service tag plus
`-amd64` or `-arm64`; the unsuffixed service tag is the public install tag.

## Release Evidence

An official release should include:

- git commit SHA;
- generated `OPEN_CORE_MANIFEST.json`;
- passing `python install/scripts/audit-release-tree.py .`;
- Docker image digests for every service tag;
- manifest-list digest and required platform coverage for every service tag;
- SBOM/provenance/signature evidence when the release pipeline supports it.

Before publishing or announcing a release, run:

```sh
python install/scripts/verify-docker-images.py
```

This verifies every service tag, expected manifest-list digest, and required
`linux/amd64` plus `linux/arm64` platforms declared in
`OPEN_CORE_MANIFEST.json` against Docker Hub. Use `--pull` for a stricter pull
test.

Maintainers can publish official multi-arch images from the source workspace:

```sh
sh install/scripts/publish-multiarch-images.sh --push /Users/chester/flytohub
python install/scripts/verify-docker-images.py --write-digests
```

The publish script runs the Docker build boundary audit before building so a
release cannot silently switch an official image back to a broad source copy.

## Forks

Forks may rebuild CE under their own names. Forks may not use Flyto2 trademarks,
official tags, or official release channels for modified images.

Enterprise Cloud Bridge compatibility must be described as compatibility, not as
official entitlement. Only Flyto-issued entitlements can unlock Flyto Cloud
premium services.
