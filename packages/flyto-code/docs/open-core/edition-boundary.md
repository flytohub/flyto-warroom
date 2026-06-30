# Flyto Edition Boundary

Flyto uses one core product with edition-specific providers, deployment profiles, and capability gates. Do not split SaaS, Community, and Enterprise into separate products or duplicate code paths.

## Editions

Community is the open-core entry point. Its default export license is Apache 2.0 and it may include basic scanning, basic CTEM asset discovery, basic reports, connector SDKs, policy examples, demo compose, CLI helpers, and SBOM examples.

SaaS is the hosted commercial product. It may use Firebase auth, Stripe billing, managed storage, online AI providers, and online threat-intel feeds.

Self-hosted online is commercial private deployment with customer infrastructure and controlled egress. It should use enterprise auth, offline license entitlements, MinIO/S3-compatible storage, and online provider integrations only when explicitly configured.

Enterprise airgap is commercial closed-source deployment for disconnected environments. It must use enterprise/local auth, offline license, MinIO/S3-compatible storage, local or OpenAI-compatible AI endpoints, and offline threat-intel bundles.

## Enterprise-Only Capabilities

Keep these out of Community exports unless explicitly relicensed:

- Airgap deployment package, Helm chart, and enterprise compose.
- Offline license generation and verification.
- SAML, OIDC, LDAP, RBAC group mapping, and break-glass admin flows.
- Audit log export, immutable audit, evidence export, and compliance-ready operations.
- mTLS, service tokens, backup/restore, Prometheus, Grafana, and Loki integration.
- Advanced correlation, attack path ranking, AI governance workflows, redteam validation, darkweb/threat-intel connectors, and enterprise report templates.
- Signed offline update bundles, offline license verification internals, and enterprise customer watermarking.

## Code Boundaries

Core cannot import enterprise modules. Community code can depend on core schemas, scanner primitives, connector SDKs, policy formats, report primitives, and shared UI kit only.

Enterprise modules may import core and provider interfaces. Enterprise airgap modules must not import Firebase, Stripe, Google Cloud, external CDN, SaaS telemetry, or online marketplace modules.

SaaS modules may use hosted providers, but SaaS boot must not require closed enterprise modules.

Frontend UI must gate routes and actions from the engine capability snapshot and runtime-config contract. Do not add direct `isEnterprise`, `isCommunity`, or hardcoded plan checks in page components when the server can return `visibility`, `surfaces`, `actions`, `edition`, `providers`, and `unsupportedActions`.

## Runtime Contract

Engine `/me/capabilities` owns product entitlement. The snapshot includes `edition`, `deploy_mode`, `providers`, `license_class`, `hidden_surfaces`, `unsupported_actions`, `surfaces`, `page_states`, `actions`, `meters`, and `paywalls`.

Cloud `/runtime-config` owns unauthenticated bootstrap shape. It includes `deploymentMode`, `edition`, `licenseClass`, `providers`, `network`, `visibility.hiddenSurfaces`, and `unsupportedActions`.

Stripe price IDs, Firebase state, and offline license files should map to SKUs or entitlements first. UI pages must not map price IDs directly to visibility.

Airgap updates use signed offline bundles. The engine must verify the bundle signature, checksums, downgrade policy, path safety, and migration dry-run requirement before applying updates. Private signing keys must not be committed to any repository or CI plaintext secret.
