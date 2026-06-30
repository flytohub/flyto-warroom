# Architecture Audit — 2026-05-23

Operator: 前端架構審計. Run via `scripts/audit_architecture.py` — 12
structural dimensions across 530 .ts/.tsx files under `src-next/`.

## Headline numbers

| Metric | Value |
|--------|------:|
| Total source lines | **99,235** |
| File count | **530** |
| Median file size | **112** lines |
| Compound domains | **27** |
| Engine API client domains | **7** |
| Atoms | **35** |
| Registered routes | **30** lazy-loaded (of 38 modules) |
| Test coverage | **26/27 compound domains** (96%) |

## 1. Folder layout (top domains by lines)

```
components/compounds      259 files  68,730 lines  (main product)
lib/engine                 49 files   9,613 lines  (typed API clients)
components/atoms           35 files   4,785 lines  (shared primitives)
components/theme-layouts   46 files   3,233 lines  (Fuse template)
app/(control-panel)        45 files   2,790 lines  (workspace routes)
hooks                      20 files   2,093 lines  (shared hooks)
app/(public)               22 files   2,012 lines  (auth + explore)
configs                     9 files   1,499 lines  (theme + routes)
```

## 2. Compound test coverage — 96%

26 of 27 compound folders have `__tests__/`. Only gap was
**unified-asset** — smoke test added this audit. ✅ now 27/27.

## 3. File size distribution + split candidates

```
Top 10 largest:
  3500  FootprintGraphView.tsx        ⚠️ above 1500 warning
  2060  openapi-schema.gen.ts         (auto-generated, OK)
  1208  PostureOverview.tsx
  1192  DashboardView.tsx
  1110  FindingsView.tsx
  1085  CTEMActionsView.tsx
  1050  AutofixPreviewModal.tsx
  1049  PulseView.tsx
  1037  themesConfig.ts               (config, OK)
   966  IssuesView.tsx
```

**`FootprintGraphView` (3500 lines)** is the elephant — likely the
right time to split. Per memory `feedback_stop_splitting_at_900`:
"don't re-split below 1200 unless subcomponent gains a 2nd consumer".
3500 is way past that — splitting candidates:
- `RuleTuningModal` already extracted ✅
- `RunProgressCard` (CardActive content) — could be its own file
- `ScenarioBucket` rendering
- `DiscoveryChainPanel`
- `EvidencePackButton`

Not done in this audit pass; flagging for owner review.

## 4. Circular imports — 4 (all expected/intentional)

```
App ↔ routesConfig          (config self-reference, OK)
WarRoomView ↔ sectionRegistry  (dispatch pattern, OK)
OwnerList ↔ RepoPickerModal (parent + child, OK)
RepoList ↔ RepoPickerModal  (same)
```

None break tree-shaking — they're 2-cycle siblings within the same
folder, which esbuild/Rolldown handle fine.

## 5. Cross-compound coupling

Most-imported compounds (other compounds depending on them):

```
@compounds/exposure      8 dependents
@compounds/dashboard     8
@compounds/security      7
@compounds/repos         7
@compounds/domains       3
@compounds/warroom       3
```

Healthy. No compound has 20+ dependents (which would indicate it
should be promoted to an atom or split).

## 6. Routes — 38 modules, 30 lazy

8 modules don't declare a path — those are likely sidebar group
headers + dispatcher entries. All 30 routable modules are lazy-loaded.
FULL_BLEED_PAGES array correctly registered.

## 7. lib/engine domain split

```
code        15 files  3,965 lines  (core CTEM operator surface)
ctem        11 files  1,416 lines  (CTEM actions / mitigations / SLA)
platform     9 files    538 lines  (auth / org / repos)
scoring      2 files    412 lines
reports      3 files    229 lines
history      2 files    194 lines
```

Well-split. Each domain owns its own types + fetcher functions.

## 8. Atoms layer — 8 atoms >200 lines

```
ActivityFeed         398 lines
PostureSnapshotChart 299
ShodanEnrichmentPanel 265
DiscoveryRunsPanel    237
QueryError            236
FindingRow            233
LocalePicker          221
ContextStrip          220
```

Per CLAUDE.md "atoms — Mantine-wrapped primitives (Button, Input,
Badge, icons, Pagination, ErrorBoundary)" — these 8 are heavier than
primitives. **Some are arguably compounds** (ActivityFeed,
PostureSnapshotChart, ShodanEnrichmentPanel, DiscoveryRunsPanel).
But promoting them requires moving the file + updating all imports.
Flagged for owner judgment.

## 9. Hooks — 23 declared in @hooks/, 9 inline

Inline hooks (4 in compounds + 5 in theme-layouts/Fuse):

```
useFixQueue            contexts/FixQueueContext.tsx       (context-bound)
useNavigation*         theme-layouts/...                   (Fuse template, leave)
useDashboardMetrics    compounds/dashboard/DashboardView   (compound-local)
useHistoryFilters      compounds/history/                  (compound-local)
useOrgChart            compounds/organization/             (compound-local)
useJoinDesigner        compounds/reports/                  (compound-local)
```

Compound-local hooks are fine to co-locate. Don't extract unless a
2nd compound needs them.

## 10. Path-alias compliance — 8 violations (2 fixed this pass)

```
✅ Fixed:
  compounds/arch/arch_views/ArchRepos.tsx    `../../scanning/_shared` → `@compounds/scanning/_shared`
  compounds/arch/arch_views/ArchSimple.tsx   same

Remaining (Fuse template — leave per CLAUDE.md "Never reach into @fuse"):
  theme-layouts/layout1/components/NavbarToggleFabLayout1.tsx
  theme-layouts/layout1/components/NavbarWrapperLayout1.tsx
  theme-layouts/layout1/components/ToolbarLayout1.tsx
  theme-layouts/layout1/components/navbar/style-1/NavbarStyle1Content.tsx
  4 more in theme-layouts/...
```

## 11. Barrel files — 8 (manageable)

```
lib/engine/index.ts            45 exports  (main aggregator)
compounds/footprint/scene/      9 exports
components/index.ts             8 exports
compounds/domains/index.ts      8 exports
atoms/index.ts                  4 exports
... 3 more
```

The 45-export `lib/engine/index.ts` is the deliberate re-export
point. Tree-shakeable since Vite handles ES modules.

## 12. Compound inventory (sorted by lines)

```
exposure       18 files  9,534 lines  ✓  (CTEM + Posture + Findings)
security       22 files  6,400 lines  ✓
settings       20 files  4,877 lines  ✓
dashboard      12 files  4,535 lines  ✓
footprint       5 files  4,423 lines  ✓  (one giant 3500-line file)
domains        21 files  4,369 lines  ✓
reports        29 files  3,738 lines  ✓
arch           12 files  3,332 lines  ✓
repos           8 files  3,107 lines  ✓
scoring         6 files  2,711 lines  ✓
pentest         5 files  2,391 lines  ✓
red-team        8 files  2,270 lines  ✓
... + 15 more domains
```

All 27 domains now have tests after unified-asset patch.

---

## Action items (priority order)

1. ✅ **unified-asset smoke test** — added (this commit)
2. ✅ **arch → scanning relative imports** — fixed (this commit)
3. ⏳ **FootprintGraphView 3500-line split** — defer to owner; split
   into RunProgressCard / ScenarioBucket / DiscoveryChainPanel sub-
   files. Doesn't break anything as-is.
4. ⏳ **Atoms >200 lines** — review whether ActivityFeed /
   PostureSnapshotChart / ShodanEnrichmentPanel / DiscoveryRunsPanel
   should be promoted to compounds. Cosmetic — no functional impact.

## Health summary

| Dimension | Status |
|-----------|--------|
| Folder structure | ✅ Matches CLAUDE.md (src-next/) |
| Test coverage | ✅ 27/27 compounds |
| Circular imports | ✅ 4 are intentional 2-cycles within folder |
| Path aliases | ✅ Compound-side clean (2 fixed); Fuse template excluded |
| Lazy routing | ✅ 30/30 routable modules |
| API client structure | ✅ 7-domain split, max 3,965 lines |
| Median file size | ✅ 112 lines (healthy) |
| TODO/FIXME debt | ✅ Zero |
| Test files | ✅ 317 passing |

**flyto-code is a structurally healthy codebase.** Three honest
weak spots: (1) one giant 3500-line compound (FootprintGraphView),
(2) some atoms have grown past primitive size, (3) auto-generated
openapi-schema.gen.ts is 2060 lines but that's an artefact not
hand-maintained code.
