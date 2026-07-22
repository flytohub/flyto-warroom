# Flyto2 Code Feature Guide

Flyto2 Code is the browser workspace for code intelligence, exposure
management, verification, runtime governance, reporting, and operational
evidence. The frontend renders engine-owned state; it does not grant
permissions, decide billing, or claim a backend capability exists merely
because a route component exists.

## Availability Model

Every product surface resolves through the module manifests and engine
capability snapshot:

| State | User experience | Authority |
|---|---|---|
| `enabled` | Route and permitted actions are usable. | Engine capability and action policy |
| `locked_preview` | Context may render, but protected actions remain disabled with an engine-provided reason. | Engine entitlement policy |
| `hidden` | Navigation and route affordances are removed. | Engine edition policy |
| future module | A deliberate coming-soon surface; no operational success is implied. | `module-manifests/future.ts` |

The generated [route and module reference](./reference/routes-and-modules.md)
is the exact static inventory. It separates routability from runtime
availability and links every declaration back to source.

## Product Domains

The release guard verifies nine joined product loops. Each domain can expose
multiple routes while sharing the same capability, query, event, and evidence
contracts.

| Domain | Primary user outcomes | Representative surfaces |
|---|---|---|
| Overview and Pulse | Prioritize current posture, changes, and decision-ready signals. | Dashboard, Verdict, Pulse, Footprint |
| Assets and attack surface | Inventory repositories, domains, discovered assets, and coverage gaps. | Repositories, Domains, Asset Map, Asset Coverage |
| Code and red-team | Review code findings, run authorized verification, and inspect generated evidence. | Issues, Pentest, Product Verification, AutoFix, Architecture, Code Scans |
| Exposure and CTEM | Join findings, mitigations, attack paths, vendor risk, and risk matrices. | Posture Overview, Findings, CTEM Actions, Attack Paths, Mitigations, Vendor Risk |
| Runtime, cloud, and identity | Govern AI/MCP activity and inspect enabled cloud, container, and identity posture. | Agent Firewall, MCP, Cloud Posture, Cloud Findings, Containers, Identity |
| Threat intelligence | Correlate actors, malware, ransomware, leaks, indicators, sensors, and brand exposure. | Threat Actors, Malware Families, Ransomware, Data Leaks, IoC Lookup, Sensor Map |
| Scoring, compliance, and history | Explain score authority, trends, controls, and evidence chronology. | Scoring, Score Trends, Compliance, Audit Timeline, Timeline |
| Operations and administration | Operate health, reports, workspace settings, members, integrations, and notifications. | Operations, Reports, VA Report, Settings |
| Enterprise control | Expose edition-aware enterprise controls without moving authorization into the browser. | Enterprise Control Plane |

The domain matrix is maintained in
[`docs/platform-loops/flyto2-module-matrix.json`](./platform-loops/flyto2-module-matrix.json).
`npm run audit:module-matrix` verifies enable, disable, test, deployment,
commercial, evidence, and unified-cockpit boundaries.

## Core Workflows

### Connect And Observe

1. Authentication resolves through Firebase, local JWT, community, or
   Enterprise-compatible adapters selected at build time.
2. The projects route loads organizations and connectable repository state.
3. The workspace loads organization and project capability snapshots.
4. Module manifests build navigation and route bindings from the same source.
5. Product clients fetch engine-owned data through shared query keys.
6. Organization SSE events invalidate the affected queries.

### Finding To Verification Evidence

1. A finding is selected from an enabled code, exposure, or red-team surface.
2. The UI requests the engine's verification/preflight contract.
3. Authorization, target safety, budget, and runner readiness remain
   server-side decisions.
4. Progress and evidence events update the corresponding React Query caches.
5. Terminal state renders persisted verdict and evidence data rather than a
   client-computed conclusion.

### Product Verification

The Product Verification surface separates command generation, scheduler
configuration, automation execution, evidence tabs, deterministic state
modeling, and controller logic. This makes loading, denied, failed, retry,
scheduled, and completed states independently testable. Related source is
under `src-next/components/compounds/product-verification/`.

### Community And Self-Hosted Onboarding

Community builds expose the provider-neutral product-loop contract. A fresh
local JWT deployment can route sign-up to a one-time first-administrator form.
Once registration closes, the same route returns to normal sign-in. Locale and
light/dark/system appearance preferences work before authentication.

### Reports And Evidence

Report surfaces consume engine response fields and export registries. The
browser may format presentation, but it must not invent compliance status,
finding severity, grade authority, or evidence validity. Release audits keep
report source catalogs, timeline contracts, and export paths connected.

## Cross-Cutting Features

- **Dual-mode design:** light and dark themes use shared semantic tokens.
- **Internationalization:** locale state is loaded through the shared Flyto2
  i18n adapter; hardcoded-copy debt is tracked by a non-increasing baseline.
- **Capability-aware navigation:** route, sidebar, page guard, and action
  state are checked against the same module/capability contracts.
- **SSE-driven freshness:** server events invalidate shared query keys; page
  components do not create independent polling authorities.
- **Defensive data readiness:** loading, unavailable, empty, denied, partial,
  and stale states are distinct UI states.
- **Open-core boundaries:** CE-exportable module packages and Enterprise/moat
  packages are validated from physical module manifests.
- **Air-gap boundaries:** Enterprise checks reject hidden SaaS dependencies in
  flows represented as air-gap capable.

## Adding Or Changing A Feature

Update all affected contracts in one change:

1. Add or modify the engine client in `src-next/lib/engine/` or the automation
   client in `src-next/lib/cloud/`.
2. Use a shared query-key factory and explicit mutation invalidation.
3. Add the product component under its domain in `components/compounds/`.
4. Add a thin route page and a module-manifest entry when navigation changes.
5. Register capability, edition, smoke, and event behavior where applicable.
6. Add unit/component tests for loading, error, empty, denied, and success.
7. Run `npm run docs:generate`; generated references will expose the new
   callable, route, API path, and environment surface.
8. Run `npm run release:gate` and `flyto-index verify . --strict --json`.

## Detailed References

- [Source API reference](./reference/source-api.md)
- [Routes and module surfaces](./reference/routes-and-modules.md)
- [HTTP and environment reference](./reference/http-and-environment.md)
- [Frontend architecture](./FRONTEND.md)
- [API client contracts](./API_CLIENTS.md)
- [Testing and release gates](./TESTING.md)
