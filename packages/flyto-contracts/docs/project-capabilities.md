# Project Capability System

Last reviewed: 2026-06-24.

This is the current product architecture for composing Flyto2 security work.
Older documents that frame Flyto2 primarily as a scanner, dashboard, or report
generator are historical context unless they explicitly defer to this model.

## Core Model

Flyto2 is an evidence-backed security automation platform.

```text
Project is the container.
Module is the capability.
Evidence is the common language.
```

Every security capability should flow through the same backend loop:

```text
Asset -> Finding -> Verification -> Evidence -> Score -> Action -> Report
```

The point of a module is not to create another isolated dashboard. Code,
external attack surface, cloud, container, dark web, identity, AutoFix, Product
Verification, red team simulation, AI Gate, and reporting all share the same
project, finding, workflow, evidence, scoring, permission, and audit contracts.

## Layers

| Layer | Examples | Contract |
| --- | --- | --- |
| Core evidence platform | Project, asset, finding, evidence pack, workflow, score, audit, permission | Always present |
| Surface modules | Code, external, cloud, container, dark web, identity, vulnerability management | Feed assets and findings |
| Verification and remediation runtime | Product Verification, AutoFix, runner gate, callbacks | Proves findings and fixes |
| Simulation and gate layer | Red team, AI Gate, policy/test gate | Approval-gated risk controls |
| Program and reporting layer | CTEM, reporting, compliance, proof of fix | Aggregates modules into a program |

CTEM is a program layer, not just another scanner. It can consume code,
external, cloud, container, dark web, vulnerability, verification, and AutoFix
signals when those modules are enabled.

## Registry

The module catalog is embedded in:

```text
internal/modulecatalog/catalog.yaml
```

The catalog owns:

- canonical module key and legacy aliases
- title and description keys
- category, risk level, and status
- required dependencies
- entitlement and page features
- permissions and commercial action keys
- default navigation hints
- source/provider metadata
- project templates

Canonical keys are:

```text
code
external
cloud
container
dark_web
vuln_mgmt
identity
product_verification
autofix
red_team
ai_gate
reporting
```

Legacy aliases such as `code_audit`, `ctem`, `cspm`, and `mcp` are normalized
at the API and store boundary. Do not add new code paths that persist aliases
as the primary module key.

## Capability Resolution

A project capability is visible only when all required policy dimensions allow
it:

```text
tenant entitlement
AND project enabled module
AND user permission / role capability
AND target scope policy
AND workflow action gate
```

The backend remains authoritative. Frontend hiding is presentation only.

Primary APIs:

```http
GET /api/v1/module-registry
GET /api/v1/code/orgs/{orgId}/module-registry
GET /api/v1/code/orgs/{orgId}/projects/{projectId}/capabilities
PUT /api/v1/code/orgs/{orgId}/fusion/projects/{projectId}/modules
```

The project capabilities response returns:

- enabled module keys
- per-module state: `enabled`, `disabled`, `locked`, or `blocked`
- missing dependency reasons
- allowed permissions and commercial actions
- navigation hints
- resolved capability booleans

## Edition Boundary Matrix

The engine is the policy authority for both general and enterprise modes.
Frontend code should render this state; it should not create a parallel policy
engine.

| Contract | General / Community / SaaS | Enterprise cloud / self-hosted / airgap |
| --- | --- | --- |
| Edition profile | Community and SaaS report their active providers and unsupported actions, but enterprise audit APIs remain unavailable. | `enterprise_cloud`, `self_hosted_online`, and `enterprise_airgap` expose enterprise profile plus enterprise-only audit routes when system permission and org scope pass. |
| Auth and billing | Community may use local auth/local storage. SaaS may use Firebase and Stripe-derived entitlements. | Enterprise uses enterprise/local auth, contract or offline license state, and provider declarations that stay separate from SaaS Firebase/Stripe assumptions. |
| Capability snapshot | `/me/capabilities` remains the frontend source of page/action/surface truth. | Same snapshot shape, with enterprise edition/provider values and enterprise unsupported-action rules. |
| Project modules | `internal/modulecatalog/catalog.yaml` composes code, external, cloud, container, dark web, identity, product verification, AutoFix, red team, AI gate, and reporting. | Same catalog model; enterprise modules may add stricter dependencies, approval gates, audit evidence, offline provider requirements, and deployment edition blockers. |
| Action enforcement | Handlers must check membership, role permission, commercial action, project module/action state, and target scope before execution. | Enterprise handlers add edition, license, data residency, audit, legal-hold, airgap, and provider checks where applicable. |
| Audit and evidence | Standard audit/evidence remains available according to module entitlement. Enterprise audit control-plane routes fail closed. | Enterprise audit ledger is append-only, org-scoped, hash chained, redacted, exportable, and verified over the full org chain. |
| Frontend rendering | `flyto-code` pages use `useCapabilities`, project capabilities, module registry, and structured API errors. | Enterprise pages additionally consume `/api/v1/system/enterprise/profile` and audit ledger/export APIs; action buttons still use capability action gates. |

## Frontend / Backend Responsibilities

Backend responsibilities:

- Own edition resolution, provider selection, entitlement, RBAC, commercial
  action access, project module state, target scope, and workflow gates.
- Return stable structured contracts: capability snapshots, module registry,
  project capabilities, enterprise profile, audit events, and evidence export.
- Fail closed when edition, license, provider, org scope, or action permission
  is missing.
- Record audit/evidence for security-relevant decisions, especially enterprise
  exports, approvals, legal hold, offline license, and remediation promotion.

Frontend responsibilities:

- Treat backend snapshots as facts. Do not infer entitlement from Stripe price
  ids, Firebase state, local constants, or route names.
- Keep controls visible-but-disabled while capability state is loading; hide or
  deny only after the backend snapshot resolves.
- Use project capabilities for module-level navigation and `/me/capabilities`
  for page/action gates.
- Route all user-facing text through `flyto-i18n`; surface backend error codes
  as explanatory states, not as alternate policy.
- Show enterprise-specific pages as a clear disabled state outside enterprise
  when reachable, and never pretend that an enterprise-only export or audit
  action succeeded.

## Frontend Contract

`flyto-code` must fetch the registry instead of hardcoding product structure
where possible. The create-project wizard uses registry templates and then
persists selected modules through the project module API. The workspace sidebar
uses project capabilities to filter module-specific navigation, while existing
page capability gates continue to enforce entitlement visibility.

Frontend code should treat the response as a policy snapshot, not as a local
recommendation. If a workflow is not allowed by the backend, the UI should not
try to re-derive why from local booleans.

## Documentation Rule

Do not delete old strategy or audit files only because the framing changed.
Update their status and point readers here. Historical documents are useful for
audit trails, but current implementation work should follow this document,
`PROJECT.md`, `STATE.md`, `ROADMAP.md`, and the live registry.
