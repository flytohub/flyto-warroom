# Public Packages

This directory contains the allowlisted public packages exported into Flyto2
Warroom CE:

- `flyto-code`: Warroom cockpit frontend.
- `flyto-contracts`: public OpenAPI, capability, evidence, scanner, and
  product-verification contracts.

The CE source build does not copy or require any sibling Flyto2 repository.
Third-party Go and npm packages are installed from public registries and are
recorded in the generated dependency manifests.

Private engine internals, commercial datasets, live remediation workers,
billing mutation, and Enterprise deployment code are not exported here.
