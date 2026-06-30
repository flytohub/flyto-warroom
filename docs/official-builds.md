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

## Release Evidence

An official release should include:

- git commit SHA;
- generated `OPEN_CORE_MANIFEST.json`;
- passing `python install/scripts/audit-release-tree.py .`;
- Docker image digests for every service tag;
- SBOM/provenance/signature evidence when the release pipeline supports it.

## Forks

Forks may rebuild CE under their own names. Forks may not use Flyto2 trademarks,
official tags, or official release channels for modified images.
