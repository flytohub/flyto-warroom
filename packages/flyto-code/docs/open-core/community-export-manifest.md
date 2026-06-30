# Community Export Manifest

Default license: Apache 2.0 for the Community export. The main private monorepo can remain private while this manifest defines what may be copied into a public Community package.

## Include

- Basic scanner and basic CTEM asset discovery.
- Basic findings, evidence, and report primitives.
- Connector SDK interfaces, sample connectors, and sample data fixtures.
- Policy and rule format examples.
- CLI helpers, demo docker compose, and SBOM generation examples.
- Community README, architecture overview, SECURITY.md, and contribution guidance.
- Basic web UI surfaces that only call Community-capable APIs.

## Exclude

- Enterprise airgap bundle, Helm chart, enterprise compose package, and customer deployment automation.
- Offline license generation, offline license verification internals, commercial entitlement signing, and license server code.
- SAML, OIDC, LDAP, RBAC group mapping, break-glass admin, mTLS, service-token, backup/restore, Prometheus, Grafana, and Loki integrations.
- Advanced correlation, attack path ranking, AI governance workflow, redteam validation workflow, darkweb and premium threat-intel connectors.
- Enterprise report templates, commercial report branding, customer connectors, customer fixtures, and any private support playbooks.
- Stripe price/SKU configuration, Firebase production configuration, SaaS telemetry, analytics keys, and deployment secrets.

## Deferred

- Public API type packages can be exported after the engine capability snapshot is stable.
- Community report templates can be exported after they are separated from enterprise report content.
- Additional connectors can be exported only after credential handling, egress behavior, and license ownership are reviewed.

## Checks Before Export

- Run `npm run audit:edition-boundary` from `flyto-code`.
- Run `npm run audit:community-export` before creating the release artifact.
- Verify Community code does not import enterprise modules.
- Verify exported code has no SaaS-only provider imports such as Firebase, Stripe, Google Cloud, Sentry, external CDN, or Flyto production domains.
- Generate SBOM and scan the export package before publishing.
- Verify signed offline bundles, SBOM, secret scan, and license scan evidence before any public release.
