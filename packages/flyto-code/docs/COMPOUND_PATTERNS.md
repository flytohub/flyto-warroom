# Compound Patterns

Reference shapes for building new workspace compounds. Five
patterns cover ~80% of the current codebase. Picking the closest
match + adapting beats inventing from scratch.

Each pattern lists:
- **Type signature** — what props the compound takes
- **Internal shape** — header, body, footer responsibilities
- **Reference compound** — the file to study
- **When to use** vs the others

---

## Pattern 1 — List Table

Tabular data with header + filter chips + paginated rows + optional
detail drawer. Sortable columns optional.

### Type signature
```ts
export function FindingsView(): JSX.Element  // org from useOrg()
```
Compound usually doesn't take an `orgId` prop — pulls from `useOrg()`.

### Internal shape
```
┌────────────────────────────────────────┐
│ Header                                  │
│   • h1 title + lede                    │
│   • [search] [filter chips] [actions]  │
├────────────────────────────────────────┤
│ Body — overflow:auto                    │
│   • table or facet sidebar + table     │
│   • paginated; PAGE_SIZE = 100         │
├────────────────────────────────────────┤
│ Footer                                  │
│   • prev/next pagination chevrons      │
└────────────────────────────────────────┘
```

### Reference compound
`src-next/components/compounds/exposure/FindingsView.tsx` —
Bitsight-parity table with facet sidebar + 3D toggle + bulk
action toolbar + history drawer + customize columns modal.

`src-next/components/compounds/threat-intel/IoCLookupView.tsx` —
simpler version: stat tiles + filter chips + flat table.

### When to use
- Rows are addressable individual items (each clickable)
- Data fits a tabular shape (every row has the same columns)
- Filter set is bounded (≤ 6 categorical dimensions)

### When NOT to use
- Rows are heterogeneous (use Pattern 2: Card Grid instead)
- Data is hierarchical / tree (use Pattern 4: 3D Scene or build custom)

---

## Pattern 2 — Card Grid

Items rendered as cards in a responsive grid. Each card surfaces
~5-7 fields with an icon header. Used for catalog-style views.

### Type signature
```ts
export function ThreatActorsView(): JSX.Element  // org-aware via hook
```

### Internal shape
```
┌────────────────────────────────────────┐
│ Header                                  │
│   • h1 title + total count             │
│   • [search] [select filter] [refresh] │
├────────────────────────────────────────┤
│ Body — overflow:auto                    │
│   • grid: minmax(280px, 1fr)           │
│   • each card: ~5 fields + Last Seen   │
├────────────────────────────────────────┤
│ Footer                                  │
│   • prev/next pagination chevrons      │
└────────────────────────────────────────┘
```

### Reference compounds
- `compounds/threat-intel/ThreatActorsView.tsx` (135 MITRE actors)
- `compounds/threat-intel/MalwareFamiliesView.tsx` (~700 malware)

### When to use
- Each item has a "personality" (logo / icon / aliases) worth a
  preview-sized card
- Operator browses to discover, not to triage (sort+filter ≠
  primary action)
- Catalog size is bounded (≤ ~5000); for larger sets, switch to
  Pattern 1's table

---

## Pattern 3 — Detail Drawer Row

Master-detail: table on the left, sliding drawer on the right when
a row is clicked. Drawer shows history / linked assets / comments.

### Type signature
Drawer state lives in the parent table compound. The drawer
component itself is a sub-component:
```ts
function HistoryDrawer({ orgId, finding }: { orgId: string; finding: Finding }): JSX.Element
```

### Internal shape
```
┌────────────────────┬───────────────────┐
│ Master table       │ Detail drawer     │
│ (Pattern 1)        │ (slide-in, 460px) │
│                    │                    │
│ Click row →        │ Header (entity)    │
│ setSelected()      │ Body (timeline /   │
│                    │       linked rows) │
│                    │ Footer (actions)   │
└────────────────────┴───────────────────┘
```

Use MUI `<Drawer anchor="right" open={!!selected} ...>` with the
detail component as child.

### Reference compounds
- `compounds/exposure/FindingsView.tsx` history + comments drawer
- `compounds/footprint/FootprintGraphView.tsx`'s SelectedDetail
  (sliding panel)

### When to use
- A table row has 10+ context fields you don't want as columns
- Operator workflow is "scan list → drill one → return to list"
- Multi-asset / multi-comment expansions per row

---

## Pattern 4 — 3D Scene

three.js / react-three/fiber-backed visualization with orbital
controls + node selection. Heavy chunk; lazy-load.

### Type signature
```ts
export function FootprintGraphView({ orgId }: { orgId: string }): JSX.Element
```

### Internal shape
```
┌────────────────────────────────────────┐
│ Top bar — view mode + filters          │
├────────────────────────────────────────┤
│ <Canvas>                                │
│   <Scene>                               │
│     <fog /> <lights /> <Stars />        │
│     <EdgeLine /> × many                 │
│     <NodeMesh /> × many                 │
│     <OrbitControls />                   │
│   </Scene>                              │
│ </Canvas>                               │
├────────────────────────────────────────┤
│ Side panel — SelectedDetail (clicks)   │
└────────────────────────────────────────┘
```

### Reference compounds
- `compounds/footprint/FootprintGraphView.tsx` + `./scene/` sub-folder
  (Phase 5 split: Scene, NodeMesh, EdgeLine, palette, layout
  helpers)
- `compounds/threat-intel/WorldHeatGlobe.tsx` + `countryCentroids.ts`
  (globe with animated arcs)

### When to use
- Spatial / relational data benefits from 3D (entity graph,
  geographic distribution)
- Operator needs to rotate / zoom to see structure
- The data has natural "node + edge" or "lat + lng" structure

### When NOT to use
- Tabular data — 3D is overkill, see Pattern 1
- < 20 entities — flat list reads faster
- Heavy data filtering — three.js doesn't filter in CSS; you
  re-mount the scene

---

## Pattern 5 — Map / Heatmap

Choropleth / point-data over a geographic projection. Lazy-load
(map libraries are heavy).

### Reference compounds
- `compounds/threat-intel/SensorMapView.tsx` — ranked bar chart
  fallback + lazy-loaded 3D globe via `WorldHeatGlobe`
- Earlier 2D choropleth deleted Phase 1 (replaced by globe)

### When to use
- Country-level or coordinate-level aggregation
- Operator needs to spot regional clustering
- Want a "this looks impressive" moment for stakeholder demos

### Constraints
- World atlas / topojson asset (~120KB) — CDN-hosted, cache 24h
- For air-gapped deploys, bundle the topojson locally
- jsdom can't render the 3D globe in tests — stub it via
  `vi.mock('./WorldHeatGlobe', () => ({ WorldHeatGlobe: () => null }))`

---

## Anti-patterns

### Don't inline color tables

Use `@lib/tokens/severity` for SEVERITY_TONE / GRADE_TONE /
IMPORTANCE_TONE / KIND_TONE / ACTIVITY_TONE. Don't redefine
`{ critical: '#ef4444', ... }` per file — that's the bug Phase 2
fixed across 7 compounds.

### Don't hand-write a route entry

Add one `Module` entry to the relevant
`src-next/types/module-manifests/<package>.ts` file. Sidebar + route +
full-bleed shell update automatically. See Phase 3 commit for the why
(used to be 6 touch points per new module).

### Don't skip the page wrapper

Every workspace route gets a thin `app/.../pages/XPage.tsx`
wrapper. Even if it's 12 lines:

```tsx
import { lazy } from 'react'
import { PageShell } from '@atoms/PageShell'

const XView = lazy(() =>
  import('@compounds/Y/XView').then(m => ({ default: m.XView })),
)

export default function XPage() {
  return (
    <PageShell padded={false} scroll="host">
      <XView />
    </PageShell>
  )
}
```

This isolates the compound from route-level concerns (FeatureGate,
PageShell layout, lazy loading).

### Don't add a NavItem outside the manifest

Adding `<NavItem .../>` directly in WorkspaceSidebar.tsx bypasses
the capability gate + the FULL_BLEED_PAGES derivation. Adding an
entry to the package module manifest is the only correct path.

---

## Adding a new compound — checklist

1. **Backend YAML** — add a `pages` entry to
   `flyto-engine/internal/permission/capabilities.yaml`
2. **Compound** — create `src-next/components/compounds/<domain>/<X>View.tsx`
   using the closest pattern above
3. **Page wrapper** — create `src-next/app/(control-panel)/flyto/workspace/components/pages/<X>Page.tsx`
   (the 12-line shape above)
4. **Module manifest** — add an entry to the relevant
   `src-next/types/module-manifests/<package>.ts` file with `id` +
   `path` + `lazyImport` + `sidebar` + `fullBleed: true`
5. **i18n** — add `code.nav.<x>` label to `flyto-i18n/locales/code/{en,zh-TW,zh-CN,ja}/code.json`
6. **Smoke test** — add `src-next/components/compounds/<domain>/__tests__/<X>View.test.tsx`
   following the threat-intel test pattern (mock `@lib/i18n`, `@hooks/useOrg`,
   the data fetch, react-query)

Done. Route + sidebar + shell scroll behaviour auto-update from the
manifest entry.

---

## What we deliberately don't have

### Storybook

Investigated 2026-05-22. Storybook 8.4+ supports React 19 but the
init pulls ~150 npm packages + ~50MB. For a team of 1-2 active
editors with no designer in the loop, the ROI is poor — the smoke
tests already catch render breakage, and the patterns above
document what a "story" would visualize.

**Revisit when**: a designer joins or the team scales past 4
active contributors.

### Server Components (RSC)

Vite-based SPA can't add RSC without migrating to Next.js or a
similar SSR framework. That's a multi-month effort touching every
route. Not actionable as a "refactor" — would be a parallel rewrite.

**Revisit when**: bundle size / SEO genuinely hurt (currently
neither — auth-gated app).

### Generated API types from OpenAPI

The engine ships `api/openapi.yaml`. We currently hand-write
`lib/engine/code/*.ts` types. Drift is real (Phase 1 caught
two latent type bugs).

**Future task** (not Phase 7): add `openapi-typescript` generator
+ make a CI check that regenerated types match. Estimated 2-3h.
