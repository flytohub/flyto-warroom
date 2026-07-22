# Deterministic CE Release Provenance

Date: 2026-07-22

## Summary

`OPEN_CORE_MANIFEST.json` now pins every contributing source repository to a
full Git commit, publishes credential-free repository URLs, and binds every
exported CE file to a deterministic SHA-256 tree digest. Local workspace paths
and source-machine manifest paths are no longer exported.

Public CI independently audits that provenance, runs source and release gates,
generates CycloneDX SBOM and license evidence, performs the complete frontend
dependency audit, and validates the official multi-architecture image tags.

## Boundary

- The manifest records public-safe provenance, never credentials or local
  absolute paths.
- The whole-tree inventory excludes only generated caches, build outputs, Git
  metadata, and the self-referential manifest file.
- Any source or generated-tree mutation requires regeneration from a clean,
  committed upstream workspace.

## Verification

```text
python3 scripts/audit-provenance.py .
python3 install/scripts/audit-release-tree.py .
python3 install/scripts/verify-docker-images.py
make verify
```
