# Flyto Edition Boundary

Flyto uses one core product with edition-specific providers, deployment profiles, and capability gates. Do not split SaaS, Community, and Enterprise into separate products or duplicate code paths.

## Editions

Community is the open-core entry point. Its default export license is Apache 2.0 and it may include basic scanning, basic CTEM asset discovery, basic reports, connector SDKs, policy examples, demo compose, CLI helpers, and SBOM examples.

SaaS is the hosted commercial product. It may use Firebase auth, Stripe billing, managed storage, online AI providers, and online threat-intel feeds.

Self-hosted online is commercial private deployment with customer infrastructure and controlled egress. It should use enterprise auth, offline license entitlements, MinIO/S3-compatible storage, and online provider integrations only when explicitly configured.

Enterprise airgap is commercial closed-source deployment for disconnected environments. It must use enterprise/local auth, offline license, MinIO/S3-compatible storage, local or OpenAI-compatible AI endpoints, and offline threat-intel bundles.

## Frontend / Backend Matrix

Use this matrix when deciding whether a capability belongs in Community/SaaS
or an enterprise edition. "General" means Community CE plus hosted SaaS
surfaces that do not require enterprise control-plane guarantees. "Enterprise"
means `enterprise_cloud`, `self_hosted_online`, or `enterprise_airgap`.

| Boundary | General frontend | General backend | Enterprise frontend | Enterprise backend |
| --- | --- | --- | --- | --- |
| Product truth | Render from `/me/capabilities`, project capabilities, and runtime config. Do not infer plan from local constants. | Resolve entitlement, role permission, module state, provider profile, and action access. | Render the same capability snapshot plus enterprise profile/audit state. Do not duplicate enterprise policy in React. | Own edition profile, license class, provider selection, authz route registry, audit ledger, evidence export, and fail-closed enterprise checks. |
| Navigation | Show CE/SaaS pages only when visible or previewable. Hidden means hidden after capability resolution, not while loading. | Return `visible_pages`, `page_states`, `surfaces`, `actions`, `unsupported_actions`, meters, and paywalls. | Enterprise pages may be visible only when the capability snapshot permits the page; enterprise-only actions still require action gates. | Enterprise-only routes must check membership, system permission, edition, org scope, and action permission before reading or mutating state. |
| Runtime providers | Consume provider names as display data. Do not import Firebase/Stripe assumptions into generic pages. | Community may use local providers; SaaS may use Firebase/Stripe/managed storage. | Display enterprise providers as configured facts: auth, billing/license, storage, AI, threat intel. | `enterprise_cloud` uses enterprise auth/contract billing boundaries; airgap must not require SaaS providers or network egress. |
| Evidence and audit | Normal report/evidence surfaces can be CE/SaaS when their module is enabled. | Store evidence through shared evidence contracts and module-specific stores. | Enterprise audit ledger shows immutable chain verification, outcome filtering, export state, and denied/export errors. | Append-only enterprise audit events, hash-chain verification, redaction, and export evidence are enterprise-only. SaaS/Community must fail closed for those APIs. |
| Remediation / AutoFix | Code/IaC/container-definition remediation may exist when the module and action are enabled. | Backend action gates decide create PR, accept proposal, rollback, and evidence transitions. | Enterprise deployment may add approval, legal hold, offline evidence, and change-control export views. | Enterprise backend owns approval evidence, immutable audit, offline license, data residency, and deployment edition checks. |
| i18n / branding | All UI strings still go through `flyto-i18n`; CE must not leak enterprise-only copy into uncontrolled fallback strings. | Backend errors should use stable machine codes plus safe messages. | Enterprise pages use the same i18n namespaces and no hardcoded English UI. | Enterprise APIs return structured errors and do not depend on frontend-only wording for enforcement. |

## Implementation Rules

- General and enterprise must look like the same Flyto product, not two
  unrelated forks. Share route primitives, API clients, i18n namespaces, page
  shells, and design tokens.
- Separate by capability, provider, edition, and export manifest; do not
  separate by copy-pasting whole pages or handlers.
- Frontend gating is presentation. Backend gating is authority.
- Community exports may include SDKs, contracts, scanner primitives, demo data,
  and basic closed loops. They must not include enterprise-only license,
  audit, airgap, watermarking, or private provider internals.
- Enterprise pages should degrade deliberately in SaaS/Community: show a clear
  disabled or unavailable state when the page is reachable, and never fake
  enterprise success.

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
