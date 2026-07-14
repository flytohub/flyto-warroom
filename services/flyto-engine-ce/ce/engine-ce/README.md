# Flyto2 Warroom CE Engine Runtime

This package is the source-published Flyto2 Warroom CE backend runtime slice.
It is intentionally smaller than the private production server and exposes only
CE-safe kernel contracts:

- health and readiness
- open-core boundary metadata
- module catalog and CE/Enterprise value boundaries
- capability snapshot checks
- RBAC/access self-tests

It does not include private API handlers, store implementations, billing
providers, SaaS control plane code, enterprise SSO/license internals,
proprietary intelligence, or live remediation adapters.

Run locally:

```sh
go run ./ce/engine-ce
```

Test:

```sh
go test ./ce/engine-ce
```
