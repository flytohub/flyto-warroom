# Flyto2 Warroom Code Protection

The open-core release protects private code by construction:

- Release content is generated from an allowlist.
- Private `cmd/**`, Go `internal/**`, private handlers, billing, tenant store,
  connector credentials, hosted control plane, commercial threat intel, and live
  remediation orchestration are not copied.
- `flyto-contracts` exposes OpenAPI, capabilities, schemas, examples, and SDK
  stubs instead of raw engine source.
- CE compose only references public image coordinates or maintainer-overridden
  local CE image names.
- EE simulation is an override file. It can enable enterprise gates locally, but
  it does not include enterprise implementation source.

Run this before publishing:

```sh
python3 install/scripts/audit-release-tree.py .
```

The audit fails if private engine paths escape, CE compose references EE image
coordinates, or generated files contain secret-like values.

This is technical containment, not a substitute for license, trademark, image
signing, SBOM, and release provenance. A production release should publish signed
images and attach the generated `OPEN_CORE_MANIFEST.json` as evidence.
