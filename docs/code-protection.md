# Flyto2 Warroom Code Protection

The source-available CE release protects private code by construction:

- Release content is generated from an allowlist.
- Private `cmd/**`, Go `internal/**`, private handlers, billing, tenant store,
  connector credentials, hosted control plane, commercial threat intel, and live
  remediation orchestration are not copied.
- `flyto-contracts` exposes OpenAPI, capabilities, schemas, examples, and SDK
  stubs instead of raw engine source.
- Enterprise Cloud Bridge integration must use public API contracts, capability
  snapshots, signed job requests, and signed evidence return paths.
- CE compose only references public image coordinates or maintainer-overridden
  local CE image names.
- EE simulation is an override file. It can enable enterprise gates locally, but
  it does not include enterprise implementation source.

## Upgrade Boundary

It is acceptable for CE to show premium actions, disabled states, and clear
upgrade reasons. It is not acceptable for CE to include private datasets,
private connector credentials, proprietary remediation workers, enterprise
billing logic, or private control-plane source.

Premium actions must fail closed. If the user has no entitlement, the connector
is invalid, the cloud bridge is unavailable, or the returned evidence signature
does not verify, CE should record a clear denial/error instead of pretending the
operation succeeded.

Run this before publishing:

```sh
python3 install/scripts/audit-release-tree.py .
python3 scripts/audit-ce-boundary.py .
```

The audit fails if private engine paths escape, CE compose references EE image
coordinates, generated files contain secret-like values, CE runtime config ships
default analytics/phone-home keys, or the public docs lose their official CE and
edition-boundary markers.

This is technical containment, not a substitute for license, trademark, image
signing, SBOM, and release provenance. Public CI emits source SBOM/license
evidence, and a production release should publish signed images and retain the
generated `OPEN_CORE_MANIFEST.json` as provenance evidence.
