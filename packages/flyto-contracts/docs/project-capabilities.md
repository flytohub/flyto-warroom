# Project Capability System

Last reviewed: 2026-06-24.

This is the current product architecture for composing Flyto security work.
Older documents that frame Flyto primarily as a scanner, dashboard, or report
generator are historical context unless they explicitly defer to this model.

## Core Model

Flyto is an evidence-backed security automation platform.

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
