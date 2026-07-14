# Flyto2 Warroom CE Engine Runtime

This package is the source-published Flyto2 Warroom CE backend runtime slice.
It is intentionally smaller than the private production server and exposes only
CE-safe kernel contracts:

- health and readiness
- open-core boundary metadata
- module catalog and CE/Enterprise value boundaries
- capability snapshot checks
- deterministic product-loop seed for code, container, cloud, runtime,
  external, evidence, remediation, verification, SLA, and merge-contract demos
- RBAC/access self-tests

It does not include private API handlers, store implementations, billing
providers, SaaS control plane code, enterprise SSO/license internals,
proprietary intelligence, or live remediation adapters.

The product loop endpoint is intentionally deterministic:

```text
GET /api/v1/ce/product-loop
```

It returns demo-seed assets and evidence contracts. It does not claim live
provider success and it does not run destructive scans.

Run locally:

```sh
go run ./ce/engine-ce
```

Test:

```sh
go test ./ce/engine-ce
```
