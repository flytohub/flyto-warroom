# flyto2-warroom-ce

This tree was generated from the Flyto2 workspace by the deterministic open-core exporter.
Do not edit generated copies directly; change the source repo and rerun the exporter.

## Packages
- `flyto-core` from `flyto-core`: 1002 files
- `flyto-indexer` from `flyto-indexer`: 253 files
- `flyto-i18n` from `flyto-i18n`: 5000 files
- `flyto-code` from `flyto-code`: 1565 files
- `flyto-contracts` from `flyto-engine`: 21 files

## Local Install

- `install/docker-compose.ce.yml`: local CE stack.
- `install/docker-compose.ee-sim.yml`: enterprise simulation override.
- `install/scripts/audit-release-tree.py`: fail-closed release audit.
- `docs/local-install.md`: local startup and reset steps.
- `docs/enterprise-simulation.md`: enterprise JWT simulation steps.

## Kept Closed
- billing, entitlement mutation, commercial gates, and Stripe/offline-license adapters
- enterprise SSO/SAML/SCIM, legal hold, airgap installers, deployment edition internals
- darkweb, stealer-log, phishing-feed, commercial threat-intel, and proprietary correlation datasets
- cloud/container/runtime live remediation orchestration and customer connector credentials
- Flyto Cloud multi-tenant SaaS control plane, runner fleet control, and hosted telemetry
- AutoFix promotion, approval, rollback orchestration, and commercial AI proposal workflows
- hosted SaaS-only frontend configuration, private preview credentials, and enterprise image publishing metadata
