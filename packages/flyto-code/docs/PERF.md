# Frontend Perf Playbook

What we've shipped for "頁面不覺得慢" (2026-05-22) and what's
deliberately deferred. Operator-aligned ROI ranking — read top
to bottom.

## Shipped (this round)

| # | Commit | Win |
|---|--------|-----|
| 1 | `0cd15cf` | `keepPreviousData` + 30 min `gcTime` — every re-render after first load is instant. 9-parallel-query dashboard no longer flashes white on tab return. |
| 2 | `0deac82` | Preload + non-blocking icon CSS — `preconnect` + `dns-prefetch` to Google Fonts warms TLS ~200 ms earlier. Material Icons fonts load via `media="print" onload` so 120 KB of icon CSS no longer blocks LCP. |
| 3 | `0deac82` | `<LazyMount>` atom + AssetCity3D wrap — `IntersectionObserver` defers the ~400 KB three.js + react-three-fiber chunk until the user scrolls within 200 px of the viewport. Above-fold dashboard cards render before the WebGL scene boots. |
| 4 | `0deac82` | Sidebar hover prefetch — each `NavItem` fires `mod.lazyImport()` on first mouseenter / focus. Vite + React.lazy cache the import promise, so destination chunk is parsed by click time. Sub-second sidebar nav across the workspace. |
| 5 | `fadd547` | Bundle visualizer — `npm run build:stats` generates `dist-next/stats.html` (interactive sunburst). Future features can see at a glance if they balloon a chunk. |

Net effect:
  - First paint: faster LCP (preload + lazy 3D + non-blocking icons).
  - Second paint onward: instant (`keepPreviousData` + 30 min cache).
  - Sub-second sidebar navigations.

## Deferred (real but secondary)

### 6. Composite `/dashboard` endpoint

**Cost:** 3-4 h backend + frontend
**Win:** ~150-200 ms saving on first paint (9 round-trips → 1)
**Risk:** breaks per-card error isolation — one failing query
            currently degrades to a single card's empty state;
            with a composite endpoint, one failing dep takes
            down the whole dashboard unless every store call is
            wrapped in error-and-continue.

Mostly invisible to operators on a fast network. Revisit when
`/dashboard` shows up consistently in real-user-monitoring as
the biggest first-paint contributor.

**To implement when ready:**
1. Backend `api/handlers_code_dashboard.go::handleGetDashboard`
   - `errgroup.Group` with 9 store calls in parallel.
   - Each call wrapped: failure → log + nil payload, don't fail
     the whole response.
   - Response shape: `{ healthSummary, attackSurface, pentests,
     computedScore, pulse, externalPosture, ctemPriorities,
     peerBaseline, scoreEvents, partialErrors: [...] }`.
2. Frontend `lib/engine/code/dashboard.ts::getOrgDashboard()`.
3. `DashboardView`: collapse 9 `useQuery` into 1; destructure
   `data.healthSummary`, `data.computedScore`, etc.
4. Per-card `data?.X ?? null` checks already exist for graceful
   degradation.

### 7. Lodash blanket-import → tree-shake

`import _ from 'lodash'` in ~20 files pulls full ~70 KB gzip lib
where each consumer only uses 1-3 functions. Switching to
`import isEqual from 'lodash/isEqual'` (or `lodash-es`) saves
~50 KB on the entry bundle.

Skipped this round because most consumers are `@fuse/` template
files; per `CLAUDE.md` we don't touch `@fuse/`. Could refactor
our own product code (~5 files) for a smaller win.

### 8. Reports chunk pruning

`apexcharts.esm` 572 KB → 154 KB gzip. Only loads when an
operator opens a `/reports` route. Already correctly lazy. If
the operator never opens Reports, they never pay this cost.
Could fall back to SVG (like ScoreTrendChart did) for the 3-4
simpler chart types to remove the dep entirely — ~1 day work.

## Anti-patterns (don't do)

- **Don't prefetch query DATA on hover** — only chunks. Data
  fetch on hover means dozens of unwanted API calls when the
  operator sweeps the sidebar.
- **Don't disable `gcTime`** — 30 min is the right balance.
  Permanent (Infinity) cache leaks memory. Default 5 min was
  too aggressive given the 9-query dashboard.
- **Don't `eagerlyImport` heavy chunks** — three.js / ApexCharts
  / globe stay lazy. The whole point of the bento layout is
  that only what's on screen pays.

## Measurement runbook

```bash
# Bundle composition snapshot
npm run build:stats
# → open dist-next/stats.html

# Lighthouse on a deployed environment
npx lighthouse https://warroom.flyto2.com --view --preset=desktop

# Manual: open DevTools → Performance → Record →
# reload page → look for Long Tasks > 50 ms in scripting.
```

## Field-debugging "slow page" reports

When an operator says a page feels slow, walk down this list:

1. **Is `keepPreviousData` working?** → If they're switching tabs
   and seeing skeleton/empty, the query may have a per-call
   `placeholderData: undefined` override. Check the compound.
2. **Is the route chunk preloaded?** → Sidebar hover prefetch
   only works if the operator hovers before clicking. Direct
   URL nav still pays the chunk download. Add manual
   `linkPreload` if a specific entry route is critical.
3. **Is a heavy widget above the fold?** → If yes, consider
   `<LazyMount>` to defer.
4. **Is data the bottleneck?** → Open Network tab, sort by
   duration. Slow API = backend issue, not frontend perf.
5. **Bundle ballooned?** → `npm run build:stats` and diff
   sunburst vs previous stable. Anything new and large is
   the suspect.
