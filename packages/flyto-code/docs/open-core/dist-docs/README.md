# Flyto2 Warroom — Community Edition (CE)

Open-core distribution of the Flyto2 code-scanning surface: the deterministic
scanner and analysis layer (SCA/CVE, secrets, IaC, taint/SAST, policy checks).

Licensed under **Apache-2.0** (see `LICENSE`).

## What this is — and isn't

This CE bundle is a **generated, one-way export** of a curated subset of the
Flyto2 platform. It ships the commodity **scanner / detection layer** only. The
platform's differentiators — cross-dimensional correlation, closed-loop
verification, exploitability triage, scoring engine, multi-tenant/RBAC/SSO — are
**not** part of the open-core edition and live in the commercial product.

- Source of truth is upstream (private). This repository is downstream.
- **Do not hand-edit this repository** — changes are overwritten on the next
  export. To contribute, see `CONTRIBUTING.md` (contributions are ported
  upstream and flow back into future CE exports).

## Contributing

Contributions are welcome under the terms in `CONTRIBUTING.md`. All contributors
must agree to the Contributor License Agreement (`CLA.md`) so accepted changes
can be maintained across both the community and commercial editions.

## Security

Report vulnerabilities privately per `SECURITY.md`. Do not file public issues
for undisclosed vulnerabilities.
