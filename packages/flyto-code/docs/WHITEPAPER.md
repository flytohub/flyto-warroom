# Flyto2 Code White Paper

**Version 1.0, July 2026**

Flyto2 Code is an open-source application-security and code-intelligence war
room. It joins repository architecture, code findings, attack surface,
continuous threat exposure management (CTEM), authorized verification,
runtime/AI governance, remediation, reports, and evidence in one
capability-aware frontend.

This paper describes the product contract implemented by this repository. A
frontend route indicates a supported presentation surface, not that every
backend capability is available in every edition or deployment.

## 1. Executive Summary

Security and engineering decisions rarely fit inside one scanner result. A
finding becomes useful only when a team can answer several connected questions:

- What asset, repository, owner, dependency, API, and runtime path does it
  affect?
- Is the issue reachable and authorized for verification?
- What evidence proves the current state?
- Which action is permitted now, and what is blocked by policy or edition?
- Did remediation change the score, exposure graph, and audit timeline?

Flyto2 Code presents those relationships as a single decision surface. Flyto2
Engine owns persisted state, authorization, scoring, lifecycle, and capability
policy. Flyto2 Cloud performs delegated automation. Flyto2 Indexer supplies
local code/dependency/security context. The frontend composes their contracts
without becoming a second authority.

The core design bet is integration: a war room is valuable when architecture,
findings, exposure, verification, remediation, policy, and evidence can be read
together. A collection of disconnected dashboards does not provide that
decision chain.

## 2. Problem Definition

### 2.1 Fragmented security context

Software teams commonly separate code scanning, dependency risk, attack
surface, dynamic testing, cloud posture, runtime governance, compliance, and
reporting. The resulting tools may disagree about asset identity, severity,
ownership, score, lifecycle, or evidence. Operators spend time reconciling
records before they can decide what to do.

### 2.2 Findings without proof

A static finding can be high severity while unreachable in a deployed system,
or appear low priority while sitting on an exposed, business-critical path.
Useful verification needs target authorization, safety policy, an executable
test, evidence capture, a terminal verdict, and a retained audit trail. A UI
that only says “possible” leaves this work manual.

### 2.3 Frontend-created authority

Browsers are poor places to own authorization, billing, security scoring, or
workflow lifecycle. Client-side aggregation and entitlement logic drift across
screens and can fail open when data is missing. Flyto2 Code therefore treats
the frontend as a renderer and command client. Engine responses remain the
authority.

## 3. Product Model

Flyto2 Code organizes the workspace into nine joined product domains:

1. overview and Pulse;
2. assets and attack surface;
3. code security and red-team verification;
4. exposure and CTEM;
5. runtime, cloud, container, and identity;
6. threat intelligence;
7. scoring, compliance, and history;
8. operations, reports, and administration;
9. Enterprise edition control.

The [Feature Guide](./FEATURES.md) describes workflows and representative
surfaces. The generated [Routes And Module Surfaces](./reference/routes-and-modules.md)
is the exact static inventory.

### 3.1 Capability states

Module and action state comes from Flyto2 Engine:

- `enabled`: permitted surface/action is usable;
- `locked_preview`: context may be visible while protected actions stay locked;
- `hidden`: navigation and route affordances are omitted;
- future module: the frontend intentionally presents a non-operational preview.

The browser applies these states for honest UX, while the backend independently
enforces every protected operation.

### 3.2 Decision chain

The product joins this evidence path:

```text
asset/repository
  -> observation or finding
  -> reachability and business context
  -> engine capability/action decision
  -> authorized verification or remediation
  -> execution evidence and terminal state
  -> score, timeline, report, and follow-up action
```

The decision-chain audit protects representative links across frontend and
Flyto2 Engine contracts. Missing evidence must remain visible as missing; the
frontend does not fabricate a successful adapter, provider, or verification.

## 4. System Architecture

```text
Flyto2 Code (React browser workspace)
       | REST, SSE, authenticated commands
       v
Flyto2 Engine (data, policy, lifecycle, scoring, evidence authority)
       | code analysis                  | delegated execution
       v                                v
Flyto2 Indexer                     Flyto2 Cloud
(local graph/security context)     (automation and verification worker)
                                         |
                                         v
                                   Flyto2 Core workflows
```

### 4.1 Flyto2 Code

This repository uses React 19, strict TypeScript, Vite, React Router, and
TanStack React Query. Physical module manifests connect route, navigation,
capability, edition, package, and lazy-import ownership. Public pages and
authenticated workspaces use the same locale and light/dark/system preference
boundaries.

The active source root is `src-next/`. Product code remains outside the Fuse
template layer. Named classes, components, hooks, functions, methods, and type
contracts are generated into the [Source API Reference](./reference/source-api.md).

### 4.2 Flyto2 Engine

Flyto2 Engine owns organization/project state, capabilities, action policy,
findings, scans, exposure, scoring, workflow lifecycle, and evidence contracts.
The frontend uses typed domain clients and generated route/capability snapshots
to detect drift.

### 4.3 Flyto2 Indexer

Flyto2 Indexer supplies local code graph, dependency, secret, taint,
architecture, and documentation analysis. It can run before source is uploaded
and supports impact/context workflows for development. Product availability and
server persistence remain Engine concerns.

### 4.4 Flyto2 Cloud And Core

Flyto2 Cloud accepts delegated automation/verification work when policy and
deployment permit it. Flyto2 Core executes the workflow contract. Flyto2 Code
renders preflight, progress, failure, evidence, and terminal state but does not
replace the worker with a client-side simulation.

## 5. State And Freshness

Server state flows through shared clients, hooks, query keys, and React Query.
Mutations explicitly invalidate affected read models. An organization-scoped
SSE stream maps lifecycle/change events to the same query-key families.

SSE is a freshness signal, not a second data authority. Re-fetching the server
contract resolves the state after an event. The correspondence audit checks
that meaningful server events have handlers or explicit no-op policy.

Views distinguish loading, loaded-empty, partial, stale, denied, failed,
in-progress, and completed states. This prevents “no data” from hiding an auth,
network, capability, or backend error.

## 6. Trust And Security Model

### 6.1 Progressive trust

Flyto2 supports local analysis before server synchronization. Deployments may
choose how much analysis metadata and graph context to share. The frontend's
upload and community surfaces must explain the selected boundary without
claiming that source was uploaded when only summaries were sent.

### 6.2 Browser trust boundary

Untrusted inputs include route parameters, form input, Engine responses,
imported reports/evidence, AI output, Markdown, connector data, URLs, and live
events. Components must render these through safe primitives and avoid
executing untrusted content.

Client-side capability checks do not secure mutations. Engine authorization,
target authorization, rate/budget policy, and evidence retention remain
server-side.

### 6.3 Authentication modes

- Hosted SaaS can use Firebase browser authentication.
- Community/self-hosted deployments use provider-neutral Engine JWTs.
- Enterprise builds use supported Enterprise identity adapters.
- Development bypass is compile-time guarded by Vite's development flag.

Browser configuration contains public identifiers only. Secrets and OAuth
client secrets must never be placed in `VITE_*` variables.

## 7. Open-Core And Deployment

The same frontend repository supports hosted, community/self-hosted, and
Enterprise build boundaries. Physical module manifests declare package and CE
export ownership. Audits reject private/moat/Enterprise markers in CE-exportable
packages and reject ad hoc filtering that bypasses the shared manifest.

Community deployment uses a same-origin Nginx `/api/` proxy and local Engine
origins. Enterprise air-gap policy rejects enabled flows that silently depend
on hosted auth, external CDN, Stripe, hosted AI, threat feeds, or SaaS callback
services.

The repository vendors its design-token package so a standalone clone can
install and build without a private sibling checkout.

## 8. User Experience Principles

### 8.1 One capability, one honest state

Navigation, page guards, buttons, paywall copy, and direct actions should all
derive from the same capability/action contracts. A protected action does not
become available because one component forgot a check.

### 8.2 Evidence over decorative dashboards

Workspace surfaces prioritize scannable state, relationships, history, and
actions. Repeated decorative cards, oversized headings, unexplained gauges,
and client-created metrics reduce operational value.

### 8.3 Dual-mode and accessible

Light, dark, and system-following themes use semantic tokens. Visual regression
budgets prevent new hardcoded palette, gradient, tiny text, radius, raw style,
and direct-surface debt. Keyboard operation, accessible names, stable layout,
and responsive constraints are part of the component contract.

### 8.4 International by default

The same locale boundary serves public auth and authenticated workspace pages.
Translation keys are loaded through the shared Flyto2 i18n adapter. Existing
hardcoded-copy debt is tracked with a non-increasing baseline.

## 9. Verification And Release Quality

The local release gate combines:

- documentation generation, ownership, links, and brand/email policy;
- TypeScript, lint-warning budget, and the complete unit/component suite;
- route, API, module, capability, authorization, query, SSE, and product-loop
  closure;
- data-readiness, defensive-UX, interaction, and visual-system audits;
- CE/open-core, Enterprise, air-gap, and deployment policy;
- production dependency audit, production build, bundle budget, static smoke,
  GitHub Actions startup, and release evidence.

Flyto2 Indexer adds graph integrity, secret, taint, documentation, CI, and
repository policy verification. See [Testing And Release Gates](./TESTING.md).

## 10. Current Limits And Roadmap Discipline

Some static module routes are intentionally future or edition-gated. Some
full-stack tests require live Engine/Cloud targets and explicit credentials.
Air-gap validation requires both static policy and network-level proof. Those
states must not be described as universally shipped merely because source code
or a route exists.

Current release blockers and verified counts live in [`STATE.md`](../STATE.md).
Planned work lives in [`ROADMAP.md`](../ROADMAP.md) and
[`PRODUCT_ROADMAP.md`](./PRODUCT_ROADMAP.md). Roadmap entries are not current
feature claims.

## 11. Documentation And Reproducibility

`docs/documentation-manifest.json` maps source/configuration to durable guides.
The generated references provide line-linked inventories for callables, routes,
modules, endpoint literals, and environment names. CI rejects stale output,
unowned source, broken local links, legacy product naming, non-`@flyto2.com`
email literals, and unregistered public contact aliases.

Start at the [Documentation Hub](./README.md) for the complete structure.
