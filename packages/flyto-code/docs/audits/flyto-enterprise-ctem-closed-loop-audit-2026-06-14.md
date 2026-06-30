# Flyto Enterprise CTEM Closed-Loop Audit

Date: 2026-06-14 Asia/Taipei

Scope:

- Primary repair scope: `flyto-code`, `flyto-engine`
- Closed-loop verification scope: `flyto-core`, `flyto-indexer`, `flyto-admin`
- Product posture: enterprise CTEM, dark web intelligence, code security, ASM/EASM, red team, pentest, AI security, compliance SaaS

## Evidence

- Services verified on 2026-06-14:
  - `flyto-engine`: `http://127.0.0.1:18080/health` -> 200
  - `flyto-engine` isolated dev-auth harness: `http://127.0.0.1:18081/health` -> 200, temporary Postgres on port 55432
  - `flyto-code`: `http://127.0.0.1:5181` local Vite app serving workspace routes
  - `flyto-admin`: `http://127.0.0.1:4191` local Vite app
  - `flyto-admin` BFF: `http://127.0.0.1:8001/me` -> 200 in dev-auth mode
- UI page smoke: `reports/closed-loop-audit/ui-all-routes-dom-smoke.json`
  - 231 route/mode/viewport runs
  - desktop/tablet/mobile
  - 0 route errors, 0 API failures, 0 console errors
- UI all-route low-click matrix: `reports/closed-loop-audit/ui-all-routes-low-click-2026-06-14.json`
  - generated against the live local app and engine URLs above
  - 231 route/mode/viewport runs, 297 safe clicks
  - 0 failed runs, 0 API failures, 0 console errors
  - 69 warnings are click-depth/read-only limitations, not runtime failures
- UI core click matrix: `reports/closed-loop-audit/ui-core-clicks.json`
  - 22 runs, 72 clicks
  - dashboard, repos, asset_map, pentest, threat_actors, settings
  - 0 route errors, 0 API failures, 0 console errors
- UI tail click matrix: `reports/closed-loop-audit/ui-tail-clicks.json`
  - 36 runs, 181 clicks
  - reports, va_report, settings, verdict, risk_matrix, timeline
  - 0 route errors, 0 API failures, 0 console errors
- Reports deep click matrix: `reports/closed-loop-audit/ui-reports-deep-clicks.json`
  - reports manager/engineer, desktop/mobile, 3 passes, max 60 controls per run
  - 4 runs, 58 clicks
  - 0 route errors, 0 API failures, 0 console errors
- Darkweb click matrix: `reports/closed-loop-audit/ui-darkweb-clicks.json`
  - threat_actors, malware_families, ransomware_incidents, data_leaks, ioc_lookup, sensor_map, brand_protection, botshield
  - desktop/mobile engineer mode, 2 passes, max 40 controls per run
  - 16 runs, 32 clicks
  - 0 route errors, 0 API failures, 0 console errors
- flyto-core browser smoke:
  - `settings?mode=engineer`: correct final URL on local engine org, no error-boundary marker, no overflow, no bad text, 79 controls
  - `reports?mode=engineer`: correct final URL on local engine org, no error-boundary marker, no overflow, no bad text, 84 controls
  - `ioc-lookup?mode=engineer`: correct final URL on local engine org, no error-boundary marker, no bad text, 78 controls, no actual horizontal scroll; evidence in `reports/closed-loop-audit/flyto-core-darkweb-smoke.md`
  - `flyto-admin / -> /sign-in`: unauthenticated smoke only, no error-boundary marker, no bad text, 5 controls, no actual horizontal scroll; evidence in `reports/closed-loop-audit/flyto-admin-unauth-smoke.md`
  - follow-up `flyto-core` shell smoke against isolated dev-auth org: desktop/mobile `/projects` shell had no overflow/bad text; isolated-org deep links redirected to `/projects` and emitted capabilities 404 console entries, so no deep-route pass is claimed for that smoke
- flyto-indexer:
  - `flyto-code` full reindex: 1137 files, 3702 symbols, 38893 deps, 0 scan errors
  - `flyto-code` verify: pass 16, warn 0, fail 0
  - `flyto-engine` verify: pass 16, warn 0, fail 0
  - `flyto-code` secret scan: 0 findings
  - `flyto-engine` secret scan: 0 findings
  - `flyto-indexer` secret scan: 0 findings
  - `flyto-core` secret scan: 0 findings after replacing JWT-looking probes/doc fixtures with runtime placeholders
  - workspace verify across `flyto-code`, `flyto-engine`, `flyto-core`, `flyto-indexer`, `flyto-admin`: pass, 5 projects, 0 fail
  - cross-project contract: 471 frontend API calls matched to 535 backend routes, 0 unmatched
  - product loop closure: 8 active surfaces, `gap_count` 0
  - dynamic validation plan: browser/YAML route and recipe registries closed, `gap_count` 0
- flyto-indexer license scans across `flyto-code`, `flyto-engine`, `flyto-core`, `flyto-indexer`, `flyto-admin`: 0 copyleft warnings
  - residual metadata gap: `flyto-code` reports project license `UNLICENSED`; `flyto-admin` reports `UNKNOWN`; several Docker/base/dev dependencies do not expose license metadata to the local scanner
- `flyto-admin` secret scan: 0 findings after replacing mock JWT signing literal with a non-secret demo key expression
- `flyto-admin` local checks:
  - `npm run lint -- --quiet`: pass
  - `npm run build`: pass
  - `npm audit --omit=dev --json`: 0 production vulnerabilities
  - full dev audit still reports dev-toolchain vulnerabilities and was not force-fixed
  - existing stash was observed and left untouched: `stash@{0}: On security/claims-outrank-guard: audit-wip-1781058940`
  - unauthenticated sign-in browser smoke after fixes: desktop/mobile, no `Sign up` fake link, no console error, no page error, no 4xx/5xx, no overflow, 4 visible controls
  - dev-auth browser smoke after login-loop fix: `/` redirects to `/admin/cloud`, cloud admin navigation/content present, no sign-in form, no bad text, no horizontal overflow, 46 visible controls; screenshot `reports/closed-loop-audit/visual-engineer-screenshots/flyto-admin-dev-auth-cloud-desktop.png`
- Native guards:
  - `npm run guard:ai-code`: pass
  - `npm run audit:closure`: pass
  - `npm run audit:navbar-smoke`: pass, 48/48 registry routes
  - `npm run audit:loops`: pass, 8/8 platform loops
  - `npm run audit:sse-correspondence`: pass, 53 emitted events, 43 handled, 10 intentional no-op, 30 completion/change events including `threatintel.refresh`
  - `npm run audit:loop-runtime`: pass in plan-only mode, 15/15 recipes plannable, 27 runtime assertions mapped
  - `scripts/audit-loop-runtime.mjs --execute --json`: pass against local frontend + isolated dev-auth engine, 15/15 recipes planned, 27 runtime assertions mapped, 0 execution failures; evidence `reports/closed-loop-audit/loop-runtime-execute-2026-06-14.json`
  - `npm run check:routes`: pass, no missing backend route
  - `npm run audit:engine-drift`: pass
  - `npm run compliance:ci`: pass, 24 controls
  - `npm run security:audit`: pass, 0 production vulnerabilities
  - `npm run lint -- --quiet`: pass
  - `npm run build`: pass
  - targeted Vitest for BYO/Pulse/onboarding: 3 files, 14 tests pass
  - `make -C /Users/chester/flytohub/flyto-engine check`: pass
- Live isolated API evidence:
  - BYO/Fusion custom external source save/dry-run/poll/ingest guard: `reports/closed-loop-audit/byo-fusion-live-api-2026-06-14.json`; dynamic BitSight-class fields persisted as kernel claims (`external.grade`, `external.percentile`, `external.source_score`, `external.severity`, `external.title`), source health healthy, coverage debt 0%, single-provider independence 0%
  - GitHub no-credential import/proxy guard: `reports/closed-loop-audit/github-import-no-credential-2026-06-14.json`; token status disconnected, repo list empty, empty token rejected, GitHub proxy routes return 409 `github_not_connected` without leaking internal credential lookup text
  - Authorized `flyto2.com` safe exposure probe: `reports/closed-loop-audit/flyto2-safe-exposure-2026-06-14.json`; DNS/HTTP/TLS/passive CT only, HTTPS 200, HTTP 301, TLS 1.3 authorized, HSTS present, CSP absent, CT lookup failed/timed out
  - Pentest target guard before domain attribution: `reports/closed-loop-audit/pentest-product-flyto2-guard-2026-06-14.json`; create blocked with target-not-attributed 403
  - Pentest target guard after import attribution fix: `reports/closed-loop-audit/pentest-product-flyto2-attributed-guard-2026-06-14.json`; domain import `exists` path seeds ownership, active `/run` blocked by `active_dast` consent 403, passive `ssl_cert` scan-asset returns 200 with `scan_mode: passive`

## Fixes Applied

1. `scripts/audit-ui-interactions.mjs`
   - Loads Vite `.env*` files so crawler dev-auth identity matches the local frontend.
   - Records route redirects as errors instead of clicking the wrong `/projects` page.
   - Prevents false coverage when a guarded route redirects.

2. `src-next/lib/engine/client.ts`
   - Parses engine error bodies from text first, preserving useful message text for non-JSON errors.
   - Returns `null` for empty success bodies instead of `undefined`, preventing React Query data errors.

3. `src-next/hooks/useRepoDetails.ts`
   - Gates GitHub repo detail proxy calls on actual GitHub connection state.
   - Treats no-credential responses as empty detail data instead of page-level API failure.

4. `src-next/components/compounds/settings/MembersTab.tsx`
   - Gates GitHub org-member proxy calls on actual GitHub connection state.
   - Keeps no-credential responses from polluting settings with 502/409 noise.

5. `src-next/components/compounds/settings/SettingsView.tsx`
   - Makes settings layout responsive so the left rail does not intercept mobile save/delete controls.

6. `src-next/components/compounds/repos/RepoListView.tsx`
   - Removes duplicate native `title` from the cancel-scan icon button; MUI Tooltip remains the accessible tooltip.

7. `src-next/hooks/useOrgEvents.ts`, `src-next/lib/queryKeys.ts`
   - Routes `alert.created`, `alert.resolved`, `pipeline.complete` and `pipeline.failed` to real cache invalidation paths instead of no-op handling.
   - Refreshes alert-derived triage, Pulse, CTEM, score, unified-finding, blast-graph and verdict surfaces after alert lifecycle events.
   - Uses a shared platform pipeline invalidation closure for progress/complete/failed events so footprint, pentest, API-definition, architecture, Pulse and verdict views refresh consistently.
   - Extends SSE/loop audit scripts and unit tests so helper-based invalidation remains machine-checkable.

8. `src-next/components/compounds/reports/*`, `src-next/lib/engine/reports/report-sources.ts`
   - Adds per-data-source required page metadata and fail-closed frontend gates before report builder widgets fetch gated APIs such as CSPM.
   - Disables locked data sources in Data Studio, Join Designer, widgets and export fetches instead of producing 403 API noise.
   - Normalizes saved/custom report sections so legacy API/localStorage configs without `widgets` cannot crash Save, preview or export paths.
   - Adds unit tests for datasource entitlement gating and legacy report section normalization.

9. `src-next/lib/threatIntelLoop.ts`, `src-next/hooks/useOrgEvents.ts`, `ThreatIntelRefreshButton.tsx`
   - Shares one darkweb/threat-intel invalidation fan-out between admin manual refresh and SSE `threatintel.refresh`.
   - Refreshes threat actors, malware, ransomware, IoC lookup, sensor map, feed status, IoC feed status and manager summary cards after a catalog refresh.
   - Marks `threatintel.refresh` as a required state-change event in the SSE correspondence guard.
   - Adds a unit test that locks the full darkweb query loop, preventing future partial-catalog refresh regressions.

10. `flyto-core`
   - Replaced JWT-shaped pentest workflow probe literals with runtime placeholders.
   - Replaced webhook docstring secret literal with environment-based usage.
   - Removed a recipe-level `password:` placeholder and made the form-fill recipe use runtime credential data.
   - Restored Python 3.9 compatibility for touched AI/module stability type hints.
   - Added touched-file ruff cleanup for import order, unused imports and exception chaining.

11. `flyto-admin`
   - Replaced a mock JWT signing literal with a non-secret demo key expression.
   - Converted the BFF-unavailable auth diagnostic to the repo's lint-allowed console path.
   - Removed the unauthenticated `/sign-up` fake entry point from the public sign-in title and guest user menu; admin access now matches the invite/provisioning route policy.
   - Closed the dev login loop: local dev-auth now reaches `/admin/cloud` with BFF `/me` returning 200.

12. `src-next/components/compounds/integrations/*`
   - Added custom external-source fields for BYO/BOY vendors such as BitSight, SecurityScorecard, Cyble, Tenable or private JSON feeds.
   - Vendor-specific values now become namespaced kernel claims, for example `external.grade`, `external.percentile`, `external.score` or `external.rating_trend`; no vendor-specific database column is required.
   - Extended the mapping YAML generator and unit test so dynamic extra claims include `field`, `value.from`, `value_kind`, confidence and optional observed-at wiring.

13. `OnboardingView.tsx`, `PulseView.tsx`, workspace layout/header
   - Reworked the engineer dashboard empty state from GitHub-only onboarding to an evidence-intake workbench: code import, BYO vendor data, external attack surface and enterprise controls.
   - Replaced the ambiguous Pulse "all clear" empty state with evidence-aware messages, source CTAs and a coverage signal panel.
   - Hardened mobile layout wrappers so sidebar/header hitboxes do not intercept Pulse filters or settings actions.
   - Visual evidence: `dashboard-after-intake-desktop.png`, `dashboard-after-intake-mobile.png`, `pulse-after-empty-state-desktop.png`, `pulse-after-empty-state-mobile.png`, `settings-byo-dynamic-claims-desktop.png`.

14. `scripts/audit-loop-runtime.mjs`
   - Added authenticated runtime execution support via explicit bearer token or local dev-auth JWT generation.
   - Keeps the report token-free (`auth_mode`, `auth_ready` only) and captures shell output so `--json` remains parseable.
   - Added a Vitest guard proving dev-auth JWT payload generation does not serialize secrets.

15. `flyto-engine/api/handlers_github_proxy.go`
   - Normalized unconnected GitHub proxy failures to 409 `github_not_connected` across repo detail, workflow runs, PR files, org members, user orgs, user repos and repo pulls.
   - Added a Postgres-backed API regression test that asserts internal credential lookup text is not exposed.

16. `flyto-engine/api/handlers_domain_import.go`
   - Domain import now writes a primary `seed_input` footprint ownership anchor through the resource kernel for each imported root domain.
   - This closes the BOY/BYO -> ASM -> Pentest ownership loop without adding vendor-specific columns or trusting arbitrary discovered domains.
   - Added a route-level regression test for import -> owned roots -> pentest create -> active DAST consent gate.

## Product Module Map

| Module | User workflow | Frontend page | Backend API/store | Scanner/indexer/core dependency | RBAC | Enterprise requirement | Gap |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GitHub import + repo inventory | Connect GitHub/local token, list repos, inspect detail, start/cancel scans | repos, repo detail | `/api/v1/code/orgs/:org/repos`, GitHub proxy, token status, scan routes | engine scanner, flyto-indexer repo profile, SSE scan events | org membership/capabilities | BYO GitHub App/PAT, no token in browser logs/storage | GitHub-connected E2E not tested because no live credential was requested |
| Code security | Scan code, view issues, dependencies, containers, architecture, taint/dead-code | issues, code_scans, containers, architecture | code scan/result/finding/dependency routes | flyto-indexer scan/impact/taint, engine scanner | engineer actions, manager read path | CI guard, evidence export, severity triage | Need deeper backend scanner contract tests for every scanner category |
| ASM/EASM / CTEM footprint | Discover domains/assets, prioritize exposure, map attack surface | footprint, domains, asset_map, posture_overview | footprint, domains, external-posture, asset map APIs | flyto-core browser/YAML validation, engine discovery, SSE invalidation | engineer/manager | continuous discovery, asset ownership, evidence history | Need stronger reconciliation for domain count instability across long-running scans |
| Pentest / VA / red team | Create/inspect pentest targets, run VA/report, model attack paths | pentest, va_report, attack_paths, risk_matrix | pentest projects/scans/findings/report routes | flyto-core workflow recipes, engine pentest runners | gated actions | safe cancel/mock paths, audit trail | Dangerous run paths were not executed against real targets |
| Dark web / threat intelligence | Monitor actors, malware, ransomware, leaks, IOC lookup, brand abuse | threat_actors, malware_families, ransomware_incidents, data_leaks, ioc_lookup, brand_protection, botshield | threat intel, brand, IOC, leak routes | threat intel feeds, enrichment jobs | read vs analyst actions | source coverage, takedown workflow, analyst verification | SSE/feed-status/manager refresh loop fixed; dedicated keyword/watchlist CRUD workflow not found and remains a product gap |
| AI security | Govern MCP/tool usage, shadow AI, DLP, evidence, attack lab | ai_security_center, ai_governance, mcp, agent_firewall_activity, agent_firewall_attack_lab, shadow_ai, ai_dlp, ai_evidence_reports | MCP policy/events/evidence routes | engine event store, AI policy simulators | engineer/admin policy gates | session timeline, policy evidence, DLP auditability | Need deeper policy mutation and approval-path tests |
| Alert triage / noise reduction | Deduplicate, prioritize, remediate, verify evidence | findings, ctem_actions, mitigations, scoring, score_trends | finding/facet/history/mitigation/score routes | engine scoring, event/SSE invalidation | triage actions gated | explainability, audit log, SLA | Alert lifecycle SSE closure now covered; deeper analyst workflow tests still needed |
| Reports / compliance / evidence | Build/export reports, view audit timeline, compliance and verdicts | reports, va_report, audit_timeline, compliance, verdict, timeline | report templates/components, audit, compliance, history APIs | report builder, evidence binder, flyto-core smoke | manager/engineer modes | audit-ready exports, immutable evidence | Reports datasource entitlement and legacy section guards fixed; export/download fidelity still needs live PDF artifact QA |
| Operations / admin surface | Settings, members, API keys, scan credentials, integration health | settings, operations, identity | org members, invitations, API keys, budgets, audit, integration health | engine authz/store/cache | org roles/capabilities | tenant isolation, API-key lifecycle, audit log | flyto-code settings/report loops fixed; flyto-admin unauth sign-in and dev-auth cloud smoke verified; production-auth smoke still requires real Firebase credentials |
| BOY/BYO integrations | Bring vendor/customer telemetry, map sample JSON to Flyto kernel claims, poll or push evidence | settings -> Data sources -> Add external source | `org_integrations`, `org_import_mappings`, `integration_poll_config`, `kernel_claims`, fusion/source-health routes | engine import maps, certified YAML mappings, flyto-indexer impact, flyto-core browser smoke | source create/update credentials gated by org capability | no browser-stored tokens, certified/custom mappings, schema drift tolerance, per-source health, tenant isolation | UI now supports arbitrary vendor fields; remaining backend debt is hardening every legacy vendor-specific ingest path behind the generic import-map/fusion model |

## Page/API/Permission/Guard Closure

| Surface | Page -> API closure | Store/cache/SSE | Permissions | Guard coverage | Residual |
| --- | --- | --- | --- | --- | --- |
| Repos/GitHub | Pages call engine client wrappers; no route drift found | scan events handled; repo detail query gated by GitHub connection | org capability + membership | route drift, closure, UI clicks, engine health | no live GitHub credential E2E |
| Settings/Admin-like | members/API keys/scanning/budget/audit routes reachable in local dev | query invalidation covered by closure guard | org RBAC/capability hooks | settings low-click matrix; flyto-admin unauth and dev-auth cloud smoke | real Firebase/admin production login was not used |
| BOY/BYO data sources | custom source wizard maps JSON fields into import-map YAML and kernel claims | source health and future poll/import refresh route through fusion data | source mutation requires org-scoped permission | unit test, flyto-indexer impact, flyto-core wizard smoke | live save/poll with a real BitSight API credential was not executed |
| Pentest/VA | pentest/VA pages and APIs reachable; `flyto2.com` import now seeds ownership before passive checks | empty body now safe as `null`; active run still blocked without `active_dast` consent | action-gated engineer path | pentest clicks, VA clicks, build/tests, live guard report | destructive scans not executed; import-triggered discovery still needs clearer passive/active packaging |
| Reports/Evidence | report templates/components and export controls load | report queries via qk | manager -> engineer deep link | reports 58 deep clicks, audit timeline full route smoke, flyto-core smoke | PDF artifact visual QA not repeated in this pass |
| CTEM/ASM | footprint/domains/asset map/posture pages load | discovery/SSE paths covered by audit guard | manager/engineer modes | all-route smoke + asset map clicks | domain-count long-run stability still needs job-level assertion |
| Darkweb/TI | pages load and IOC lookup/cross-page controls are clickable | threat-intel refresh SSE now shares the same query fan-out as manual refresh | mostly read/analyst | all-route smoke, 16-run darkweb click matrix, SSE correspondence, unit test, flyto-core IoC smoke | dedicated keyword/watchlist write workflow not found in current routes |
| AI security | MCP/agent firewall/shadow AI/DLP pages load | policy/events/evidence routes smoke | engineer policy gates | all-route smoke | policy mutation workflow needs targeted test |
| Alert/Pipeline SSE | alert and pipeline events route through `useOrgEvents` helpers | alert-derived and platform-pipeline qk fan-out | org event stream | SSE correspondence + platform-loop audit + unit tests | analyst action flow still smoke-level |

## UI Test Matrix Summary

Page-level matrix:

- Evidence file: `reports/closed-loop-audit/ui-all-routes-dom-smoke.json`
- Scope: 48 registry routes, declared modes, desktop/tablet/mobile
- Result: 231 runs, 0 route failures, 0 local API failures, 0 console errors
- Evidence file: `reports/closed-loop-audit/ui-all-routes-low-click-2026-06-14.json`
- Scope: 48 registry routes, declared modes, desktop/tablet/mobile, max 3 safe clicks per route
- Result: 231 runs, 297 clicks, 0 failed runs, 0 API failures, 0 console errors

Button/click matrix:

- Evidence file: `reports/closed-loop-audit/ui-core-clicks.json`
  - repos: 10 clicks, 0 failures
  - asset_map: 12 clicks, 0 failures
  - pentest: 4 clicks, 0 failures
  - settings: 46 clicks, 0 failures
- Evidence file: `reports/closed-loop-audit/ui-tail-clicks.json`
  - reports: 37 clicks, 0 failures
  - va_report: 21 clicks, 0 failures
  - settings: 69 clicks, 0 failures
  - timeline: 54 clicks, 0 failures
- Evidence file: `reports/closed-loop-audit/ui-reports-deep-clicks.json`
  - reports engineer desktop: 28 clicks, 0 failures
  - reports engineer mobile: 28 clicks, 0 failures
  - reports manager desktop: 1 click, 0 failures
  - reports manager mobile: 1 click, 0 failures
- Evidence file: `reports/closed-loop-audit/ui-darkweb-clicks.json`
  - threat_actors, malware_families, ransomware_incidents, data_leaks: 0 clickable controls in current rendered feed state, 0 failures
  - ioc_lookup desktop/mobile: 11 clicks per viewport, 0 failures
  - sensor_map desktop/mobile: 1 click per viewport, 0 failures
  - botshield desktop/mobile: 4 clicks per viewport, 0 failures
  - brand_protection desktop/mobile: 0 clickable controls in current rendered feed state, 0 failures
- Full default click crawler progressed through routes 1-42 and originally found one reports deep-pass instability. The targeted reports deep matrix above now passes after datasource and section-shape guards. Do not treat this as exhaustive all-button coverage.

## Benchmark Gap

Sources reviewed:

- [Cyble Vision](https://cyble.com/products/cyble-vision/): official product page positions Cyble as sales/demo-led threat intelligence; no universal public SaaS list price was found.
- [Cyble Dark Web Monitoring](https://cyble.com/solutions/dark-web-monitoring/): official page describes continuous TOR/I2P/ZeroNet/paste/hidden-forum monitoring for leaked credentials, exposed data, domain/brand mentions and threat-actor chatter.
- [Cyble Attack Surface Management](https://cyble.com/solutions/attack-surface-management/): official page positions ASM around continuous visibility of exposed web/mobile apps, cloud systems, domains, email servers, IoT devices and public code repositories.
- [Cyble CTEM](https://cyble.com/solutions/continuous-threat-exposure-management-ctem-with-cyble/): official page frames CTEM as continuous visibility, prioritization and action across the exposure lifecycle.
- Cyble packaging/pricing: official pages are demo/sales led; pricing is marked not publicly disclosed.
- [Recorded Future Attack Surface Intelligence](https://www.recordedfuture.com/products/attack-surface-intelligence): asset discovery, historical DNS/WHOIS/SSL context, exposure prioritization, remediation guidance and integrations.
- [Recorded Future package options](https://www.recordedfuture.com/license-options): public packaging includes Essentials/Foundation and standalone modules, with "talk to us about pricing" rather than public list price.
- [Mandiant Attack Surface Management](https://cloud.google.com/security/products/attack-surface-management): adversary-view external asset discovery and continuous analysis of vulnerabilities, misconfigurations and exposures; pricing is employee/base-fee based with tailored enterprise pricing.
- [Microsoft Defender EASM](https://learn.microsoft.com/en-us/azure/external-attack-surface-management/): continuous discovery/mapping of external attack surface to identify unknowns, prioritize risk and extend exposure control beyond the firewall.
- [Microsoft Defender EASM billable assets](https://learn.microsoft.com/en-us/azure/external-attack-surface-management/understanding-billable-assets): billing is based on approved host:IP combinations, approved domains and approved IP addresses after a trial.
- [Palo Alto Cortex Xpanse](https://www.paloaltonetworks.com/cortex/cortex-xpanse): active discovery, learning and response for unknown risks in connected systems and exposed services.
- [CrowdStrike Falcon Exposure Management](https://www.crowdstrike.com/en-us/platform/exposure-management/): exposure management with AI-powered prioritization and remediation guidance; no official public list price found in the product page.
- [Rapid7 Exposure Command](https://www.rapid7.com/products/command/exposure-management/): exposure management across attack surface context, cloud and application risk, native/third-party context and remediation workflows.
- [Rapid7 Command pricing](https://www.rapid7.com/products/command/pricing/): public package names and capability matrix are shown; list price is not public and quote-based by billable assets.

Flyto gap against this benchmark:

- Stronger than a single-point code scanner: Flyto already has pages for code, CTEM, ASM, pentest, AI security, reports and settings.
- Main product gaps are depth and operational packaging:
  - dark web keyword/watchlist CRUD, alert verification, source confidence, takedown workflow
  - CTEM mobilization from exposure -> validation -> remediation -> retest -> evidence
  - enterprise connectors health across GitHub/cloud/SIEM/SOAR/ticketing
  - packaging/entitlement model for modules and tenant-level admin
  - analyst workflow for dedup/noise reduction and SLA ownership
  - BOY/BYO connector certification workflow: schema versioning, sample replay, credential vault health and field-level provenance for vendor feeds
  - flyto-admin RBAC/tenant admin parity with flyto-code settings in production-auth mode

## P0/P1/P2

P0 fixed:

- Crawler dev-auth mismatch caused false redirects and fake coverage. Fixed in `audit-ui-interactions.mjs`.
- Empty success API bodies caused React Query `undefined` data errors on pentest footprint latest-run. Fixed in `request<T>()`.
- Unconnected GitHub state triggered repo detail/members proxy failures. Fixed by gating on `useGitHubConnection()`.

P1 fixed:

- Settings mobile rail intercepted save/delete paths. Fixed responsive layout.
- Repos cancel-scan Tooltip emitted console errors. Removed duplicate native title.
- Engine container/runtime drift was corrected by rebuilding/recreating local engine before verification.
- `alert.resolved` and `pipeline.failed` were no-op-uncaught in SSE correspondence. Fixed by routing alert lifecycle and platform pipeline terminal events to real invalidation closures and expanding loop/SSE guards to verify helper fan-out.
- Reports builder fetched locked data sources and crashed on legacy section configs without `widgets`. Fixed with datasource capability gates, locked-source UI states, export filtering and section normalization.
- Threat-intel `threatintel.refresh` only invalidated partial catalog pages. Fixed by sharing darkweb query invalidation between SSE and the admin refresh button, and by adding guard/test coverage for feed status, IoC, sensor map and manager cards.
- BYO/BOY wizard could not express BitSight-class extra fields unless they mapped to existing primary fields. Fixed with dynamic namespaced kernel claims and tests.
- Engineer dashboard and Pulse empty states looked like decorative/security-theater cards instead of an evidence intake workflow. Fixed copy, CTA structure, coverage signal and mobile layout.
- flyto-admin dev login loop previously blocked `/admin/cloud`. Fixed in `flyto-admin` and verified by dev-auth browser smoke.
- GitHub no-credential proxy errors exposed inconsistent 502/409 semantics and internal credential wording. Fixed to 409 `github_not_connected` across proxy routes with backend guard coverage.
- Runtime loop guard was only plan-level. Fixed the audit script so local dev-auth API assertions can execute end to end without storing credentials.
- Domain import created an ASM/Pentest project but did not seed the ownership kernel, so later active-target attribution could still fail. Fixed import to write a primary `seed_input` ownership anchor and added route-level guard coverage.

P1 remaining:

- Dedicated dark web keyword/watchlist monitoring CRUD/API/SSE workflow was not found in current flyto-code/flyto-engine routes; it remains a product gap rather than an implemented loop with test coverage.
- Production-auth flyto-admin smoke with real Firebase credentials remains untested by rule; dev-auth smoke passed.
- Real BitSight/Cyble/Recorded Future/Rapid7 connector save-and-poll was not executed because no vendor credential was provided or used.
- `domains/import` still immediately queues broad discovery for imported roots. Product copy calls these passive discovery scanners, but the battery includes live HTTP/TLS/DNS and port fingerprinting; enterprise packaging should split "claim ownership/import" from "start external probing" or require an explicit discovery consent.

P2 remaining:

- Several routes are page-smoke only with 0 click controls in current registry.
- flyto-core and flyto-admin repo-local verify still warn on documentation/CI/agent hygiene and generated-index ignore settings; workspace-level verify has 0 fail.
- flyto-admin Vite dev server still warns that `@mui/styles` is present in `optimizeDeps.include` but cannot be resolved.
- License metadata needs enterprise cleanup: `flyto-code` is marked `UNLICENSED`, `flyto-admin` has no detected project license, and multiple Docker/base/dev dependencies lack scanner-visible license metadata.
- Build still warns about large chunks (`WorldHeatGlobe`, `index-next`, Three/MUI/Apex); not a functional break but needs release packaging work.

## Untested / Not Claimed

- No real Firebase login was used.
- No live GitHub credential/PAT import was tested; user should revoke/rotate the previously pasted GitHub token.
- No live BitSight/Cyble/Recorded Future/Rapid7 vendor credential was used.
- No destructive pentest/red-team action was executed against real targets.
- Authorized `flyto2.com` safe probes were limited to DNS/HTTP/TLS/passive CT and product guard checks. The existing domain-import discovery queue did run Flyto's passive discovery battery, including port fingerprinting; no exploit payload or active DAST `/run` was executed.
- No production billing/packaging/tenant-admin flow was tested.
- No production-auth flyto-admin browser smoke was run because credentials must be requested in the current conversation; dev-auth `/admin/cloud` smoke was run.
- `audit:loop-runtime --execute` was run against local dev-auth APIs; production-auth runtime execution was not run.
- No claim of all-button coverage: full page smoke covers 231 route/mode/viewport rows; click coverage is targeted and evidence-backed by the JSON reports above.
