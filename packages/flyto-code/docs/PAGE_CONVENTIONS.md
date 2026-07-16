# Page Conventions (flyto-code)

The single checklist every page / compound view should satisfy. Born from
the 2026-06 "unify all pages" audit (62 routes, 27 domains): adoption of the
shared shell/header/state atoms had drifted to 40–85%, and severity/status
badges + filter toolbars had each been re-implemented several times.

Goal: every page reads as the **same product**, and recurring concerns are
solved **once** in `components/atoms/`, not per view.

## The shell

- Every routed page renders through **`@atoms/PageShell`** — no page manages
  its own outer scroll/padding. (`feedback_workspace_scroll_pattern`.)
  - list / table / full-height views: `scroll="host" padded={false}`
  - simple linear reading views: `scroll="self" maxWidth={1200}`
- Full-bleed paths are derived from
  `types/module-manifests/*.ts` (`getFullBleedPaths`) — set
  `fullBleed: true` on the module entry, not by hand in `WorkspaceLayout`.

## The header

- Titled pages use **`@atoms/FlytoPageHeader`** (`title` / `subtitle` /
  `action` / `count`). Do not hand-roll `Typography variant="h5"` + Box.
- Detail views that need tabs: pass a **`@atoms/TabBar`** to FlytoPageHeader's
  `tabs` prop — don't build a bespoke header+tabs layout.
- Spatially-constrained layouts (3-column, 3D scene, bento) may skip the
  header, but **say so in a code comment** so it reads as a decision.

## Recurring states (always use the atom)

| Concern | Atom | Rule |
|---|---|---|
| Loading | `@atoms/LoadingState` (or `Skeleton`/`SkeletonRows`) | lists → skeleton; single blocking fetch → spinner. **No bare `CircularProgress` for list loading.** |
| Empty | `@atoms/EmptyStateGuide` | no hand-rolled "no data" markup |
| Query error | `@atoms/QueryError` | mutation errors → toast/snackbar |

## Small components (single source)

| Concern | Atom |
|---|---|
| Severity badge | `@atoms/SeverityChip` (+ `severityColor()` helper) — replaces scanning `SevBadge`, domains `sevBadge`, FindingRow `severityToColor` |
| Status badge | `@atoms/StatusChip` (+ `statusColor()`) — open/snoozed/ignored/solved/verifying |
| Signal/decoration pill | `@atoms/SignalPill` |
| Filter + sort toolbar | `@atoms/FilterToolbar` *(extracted during the exposure pilot — see plan)* |
| Tabs | `@atoms/TabBar` |

Never hardcode severity/status hex. Severity / grade / importance colours come
from the canonical table `lib/tokens/severity.ts` (`SEVERITY_TONE` etc.) —
`SeverityChip` is the component layer over it. Other semantic colours come from
`styles/designTokens.ts` (`colors.semantic`). Required for dual-mode
(`reference_flyto_code_theme_darkcanonical`).

## File structure (per domain under `components/compounds/<domain>/`)

Match the clean reference domains — **`domains/`**, **`organization/`**,
**`dashboard/`**:

```
<domain>/
  <Domain>View.tsx     orchestrator (data fetch + compose) — target < ~400 lines
  <Parts>.tsx          row / panel / drawer sub-components, one concern each
  types.ts             shared types + constants for the domain
  __tests__/           where logic is non-trivial
```

Avoid: one mega-`View.tsx` with many inline sub-components + helpers (the
1000-line files). Extract sub-components to their own files.

## Guardrails

- **Behaviour-neutral refactors**: splitting files / swapping in atoms must not
  change visuals or data flow. Verify per batch: `tsc -p tsconfig.app.json
  --noEmit` + `npm run build` + dark/light smoke.
- New mutations must close their data loop. Use `qk` invalidation /
  `setQueryData` / `refetch`, or document a non-cache mutation with one of:
  `@closure local-result`, `@closure download-only`,
  `@closure redirect-only`, `@closure callback`. CI runs
  `npm run audit:closure`.
- New or moved navbar surfaces must stay connected across module route, engine
  API client, `qk` cache key, SSE invalidation, and a flyto-core recipe in
  `docs/platform-loops/recipes/`. CI runs `npm run audit:loops`.
- New org-scoped React Query keys go through `src-next/lib/queryKeys.ts`.
  Inline `queryKey: [...]` literals are migration debt, not the pattern for new
  code.
- Don't touch `@fuse/` template styling (`reference_flyto_code_gradient_button_ring`).
- New UI uses semantic palette tokens (`text.primary`, `background.paper`),
  never raw `#fff` / `#000` or single-mode `bg-white/N`.
