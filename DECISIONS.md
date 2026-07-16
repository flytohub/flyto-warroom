# DECISIONS.md

## 2026-07-16 - Mirror upstream CE frontend package-manifest API

Decision: keep `packages/flyto-code` aligned with upstream `flyto-code` for CE
package-manifest helpers and product-loop manifest discovery.

Rationale: Warroom CE must look and behave like the source platform without
forking frontend split logic. CE packaging, product-loop audits, and module
boundary tests should consume the same public `@code/modules` helper surface.

Consequences:

- Lasting changes still belong in upstream `flyto-code` first.
- Generated Warroom sync must not introduce separate CE filters.
- Product-loop checks read physical module manifest files, not only the
  `types/modules.ts` re-export shim.

## 2026-07-16 - Adopt Flyto2 Workspace Memory Standard

Decision: `flyto-warroom` follows the Flyto2 project memory scaffold and frontend quality gate.

Rationale: All 27 Flyto2 repositories need consistent handoff context, durable decisions, and UI quality constraints.

Consequences:

- Root memory files must stay current.
- UI changes must avoid the eight forbidden frontend failures in `AGENTS.md`.
- Handoffs must be registered in `handoffs/_registry.md`.
