# Platform Loop Closure

This file is the maintainer-facing contract for keeping flyto-code as one
system instead of isolated pages. The 8 surfaces can still be shipped and
tested independently, but each one must keep the same structural loop:

```
navbar module -> engine API client -> qk cache key -> org SSE invalidation -> flyto-core recipe
```

CI runs `npm run audit:loops` to verify that loop. If a branch adds, renames, or
splits a surface, update `docs/platform-loops/platform-loop-registry.json` and
the matching recipe in `docs/platform-loops/recipes/`.

Before pushing an AI-generated branch, run `npm run guard:branch`. It aggregates
route drift, mutation closure, platform loop closure, navbar smoke registry,
AI code quality, and compliance evidence.

## Surfaces

| Surface | Modules | Closure intent |
|---|---|---|
| Overview / Pulse | dashboard, pulse, footprint | The operator sees scan, footprint, score, and action changes without manual refresh. |
| Assets / Attack Surface | repos, domains, asset_map | Domain discovery, asset evidence, API definitions, and asset map use the same source tables. |
| Code / Red-team | issues, pentest, autofix, architecture, code-scans | Findings can move into verification, AutoFix, pentest targets, and campaign execution without copy-paste handoff. |
| Exposure / CTEM | posture_overview, findings, ctem_actions, attack_paths, mitigations, vendor_risk | External posture, findings, attack paths, mitigation evidence, and vendor risk stay query-linked. |
| Runtime / Cloud / Identity | mcp, cloud_posture, cloud_findings, identity | MCP policy, runtime events, cloud posture, and identity posture remain auditable even when pages are separate. |
| Darkweb / Threat Intel | threat_actors, malware_families, ransomware_incidents, data_leaks, ioc_lookup | Threat and leak intelligence can seed footprint and red-team prep instead of sitting in a feed island. |
| Scoring / Compliance / History | audit_timeline, scoring, score_trends, compliance | Score, score events, audit chain, and compliance export are connected as evidence. |
| Operations / Reports / Settings | operations, reports, va_report, settings | Admin settings, reports, API keys, health, and CI evidence are visible as operator controls. |

## AI Branch Rules

- New org-scoped data reads use `src-next/lib/queryKeys.ts`.
- New pages must go through `PageShell`; new manager views must go through
  `ManagerDashboard` unless the AI code guard has an explicit delegate entry.
- New view code must not import `@lib/engine/client`, call bare `fetch`, open a
  raw WebSocket/EventSource, or grow the legacy transport baseline.
- New mutations close their data loop with invalidation, cache write, refetch,
  or an explicit `@closure` annotation accepted by `npm run audit:closure`.
- New navbar modules must be assignable to one of the 8 surfaces, or a new
  surface must be added to this document and
  `docs/platform-loops/platform-loop-registry.json`.
- New visible navbar modules must be added to
  `docs/platform-loops/navbar-smoke-registry.json` with a route, expected text,
  surface owner, mode, and scroll policy.
- New SSE event types must be routed through `useOrgEvents.ts` or explicitly
  ignored with a reason.
- New flows that depend on browser/MCP verification need a recipe skeleton in
  `docs/platform-loops/recipes/`.
- Before merging AI-generated or multi-agent branches, run
  `npm run guard:branch`; CI runs the same underlying controls as separate
  steps.

## Registries

- `platform-loop-registry.json` owns the 8 product surfaces and their
  module/API/qk/SSE/recipe closure expectations.
- `navbar-smoke-registry.json` owns the browser-smoke plan for every visible
  sidebar module. `npm run audit:navbar-smoke` compares it against
  `src-next/types/modules.ts`, so a new navbar page cannot ship without a smoke
  target.
- `npm run guard:ai-code` blocks the current AI failure modes: view transport
  bypasses, inline query keys, missing PageShell, and manager layouts that skip
  the shared dashboard shell.

## Recipe Format

The recipes are intentionally YAML-shaped but lightweight. They describe what a
flyto-core browser/API run should exercise once the environment is available.
The loop audit requires these top-level fields:

- `id`
- `surface`
- `steps`
- `assertions`

The recipe runner is allowed to evolve; the contract above should not.
