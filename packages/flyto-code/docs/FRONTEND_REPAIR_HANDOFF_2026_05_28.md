# Frontend Repair Handoff - 2026-05-28

This is the current handoff for continuing the frontend repair after the large backend/read-model refactor.

## Current State

Recent commits already pushed to `origin/main`:

- `34d1e28 feat: consume kernel asset map`
- `0a01fe2 feat: consume kernel domain posture`
- `a14fdf3 fix: refresh and consume external kernel data`
- `f40d237 docs: add frontend repair handoff`

Verification after `a14fdf3`:

- `npm run build` passes.
- `npx vitest run` passes: 66 test files, 324 tests.
- `npm run lint` now exits 0. It still reports existing warnings, mostly from Fuse/template code and React Compiler rules.

## Problem Summary

The frontend is not fundamentally unsalvageable. The main failure mode is mixed data truth:

- legacy `/external-posture`
- new `/external-posture/kernel`
- `/external-issues`
- `/attack-surface`
- `/computed-score`
- `/ctem-priorities`
- report/localStorage fallbacks
- page-local row builders and summary aggregation

After the redesign, pages drift because they read different sources, update under different React Query keys, and sometimes synthesize domain/finding/score data in component code.

The repair strategy is not a rewrite. Keep the UI, but move pages onto explicit backend-owned read models and isolate any legacy compatibility behind adapters.

## Data Boundary Rules

Use one primary read model per product area.

| Area | Primary source | Notes |
| --- | --- | --- |
| Domains | `/external-posture/kernel` | List/domain issue/score truth is kernel. `attack-surface` is still used for detail raw signals only. |
| Domain Intel | `/external-posture/kernel` | Uses `assets[].findings`. |
| Asset Map | `/asset-map/kernel` | Already cut over. |
| Dashboard score | `/computed-score` | Do not mix in legacy health-summary score fallbacks. |
| Dashboard external inventory | `/external-posture/kernel` | Asset City domain nodes now use kernel assets. |
| SLA | `/external-issues` + `/ctem-priorities` | Open issue list and breach state should not come from legacy `/external-posture.open_issues`. |
| Trends | legacy `/external-posture` for now | Kernel does not yet expose `score_trend`. Do not hard-cut yet. |
| Supply Chain | legacy `/external-posture` for now | Kernel does not yet expose `supply_chain`. Do not hard-cut yet. |
| Brand Protection | `/attack-surface` for now | It specifically needs lookalike/takedown fields not in kernel posture. |
| Reports | mixed | Needs separate cleanup; report builder still has fallback/localStorage behavior. |

When backend does not expose the needed field, do not fake it in the frontend. Keep the legacy read temporarily or file/add the backend contract.

## Already Fixed

Use this section as the running completion checklist. When a repair lands, update the checkbox in this file in the same PR/commit.

### Asset Map

- [x] Cut `AssetMapView` to `/asset-map/kernel`.
- [x] Render `asset_scores[]` surface badges.

`AssetMapView` now reads `/asset-map/kernel` and renders `asset_scores[]` surface badges.

### Domains

- [x] Cut `DomainsView` to `/external-posture/kernel`.
- [x] Prefer kernel `assets[].findings` for domain issues.
- [x] Prefer kernel `score` / `grade` for domain rows.
- [x] Keep `attack-surface` only for detail raw signal tabs.

`DomainsView` now queries `/external-posture/kernel`.

`buildDomainRows` behavior:

- If kernel assets are provided, issues and score/grade come from kernel.
- Legacy client-side metadata issue synthesis remains only as fallback for unmigrated/offline callers.
- `attack-surface` remains for detail raw signals like SSL/DNS/ports/PageSpeed tabs.

### Domain Intel

- [x] Cut `DomainIntel` to `/external-posture/kernel`.
- [x] Map `assets[].findings` into issue rows.
- [x] Remove the legacy recent-changes panel instead of mixing legacy improvements back into the page.

`DomainIntel` now uses `/external-posture/kernel` and maps `assets[].findings` into the issue list.

Tradeoff: the old recent-changes side panel was removed from this page because that data only exists on legacy `/external-posture.improvements`. Do not re-add it by reintroducing dual-truth unless backend adds the field to a canonical endpoint.

### SLA Monitor

- [x] Cut open issue list to `/external-issues`.
- [x] Use `/ctem-priorities` for breached/upcoming SLA timing.
- [x] Stop using legacy `/external-posture.open_issues` as issue truth.

`SLAMonitorView` now uses:

- `/external-issues` for open external issue rows.
- `/ctem-priorities` for breached/upcoming SLA timing.

It no longer relies on legacy `/external-posture.open_issues` as the issue source.

### Query Refresh

- [x] Invalidate `external-posture`.
- [x] Invalidate `external-posture-kernel`.
- [x] Invalidate `external-issues`.
- [x] Invalidate `asset-map-kernel`.
- [x] Invalidate `attack-surface`.
- [x] Update `useOrgEvents` tests for new keys.

`useOrgEvents` now invalidates both old and new external keys during the transition:

- `external-posture`
- `external-posture-kernel`
- `external-issues`
- `asset-map-kernel`
- `attack-surface`

Domain import and domain detail scan actions also invalidate the same external/kernel keys.

### Lint

- [x] Exclude generated/build/vendor directories from repo lint.
- [x] Restore `npm run lint` to exit 0.
- [~] Reduce existing repo-wide warnings. — partial, 2026-06-01: **393 → 352** (−41) by removing genuinely-unused imports/helpers in `WorkspaceSidebar.tsx` (26 dead icon imports + dead `healthSummary` binding converted to a bare cache-warming call) and `ProjectsPage.tsx` (dead imports + `formatDate`). Build/test/lint stay green. Remaining 352 are the risky categories left intentionally: 117 `react-refresh/only-export-components` (dev-HMR only, needs file splits), 124 `react-hooks/*` (`set-state-in-effect` / `exhaustive-deps` — behavioural, must not bulk-fix), 63 `no-explicit-any` (needs real typing), ~8 unused vars in tests / caught-errors. Those need a focused, test-covered refactor pass, not a blind sweep. `eslint --fix` only strips unused `no-console` disable directives leaving trailing whitespace — net-zero, not used.

`eslint.config.js` now ignores:

- `dist`
- `dist-next`
- `node_modules`
- `Fuse-React-v17.0.0-vitejs-demo`

This fixed `npm run lint` failing on the vendored Fuse demo's missing `eslint-plugin-prettier`.

## Next Recommended Repairs

### 1. Query Key Factory

- [x] Add `src-next/lib/queryKeys.ts`.
- [x] Migrate `useOrgEvents` to query key factory.
- [x] Migrate Domains / Asset Map / Dashboard / Domain Intel / SLA Monitor to query key factory.
- [x] Add tests that guard key names used by SSE invalidation.

Shipped: `qk` factory in `src-next/lib/queryKeys.ts` builds the six external / kernel / score keys (`attackSurface`, `externalPosture`, `externalPostureKernel`, `externalIssues`, `assetMapKernel`, `computedScore`) as `as const` readonly tuples. Migrated all 24 call-site files in one pass — 5 listed views + 16 additional consumers found by grep (`useOrgEvents`, `DomainImportModal`, `_shared`, `WorkspaceSidebar`, `OrgCard`, `useRepoScores`, `RepoListView`, `ScoringView`, `RepoDetailView`, `ScoreTrendsView`, `SupplyChainView`, `ScoreTrends`, `BrandProtectionView`, `DomainComplianceScopePicker`, `DomainBUAssignChip`, `DomainAssetTierPicker`) + 3 atom follow-ups caught in operator review (`AssetTierPicker` invalidate ternary, `ComplianceScopePicker` invalidate ternary, `DomainBUAssignChip` `invalidateOnChange` prop) — leaving half the codebase on the factory and half on literals would re-introduce typo drift on the next sweep. New `__tests__/queryKeys.test.ts` (7 cases) locks the literal wire shape of every key.

Create a shared query key module, for example:

`src-next/lib/queryKeys.ts`

Suggested shape:

```ts
export const qk = {
  attackSurface: (orgId?: string) => ['attack-surface', orgId] as const,
  externalPosture: (orgId?: string) => ['external-posture', orgId] as const,
  externalPostureKernel: (orgId?: string) => ['external-posture-kernel', orgId] as const,
  externalIssues: (orgId?: string) => ['external-issues', orgId] as const,
  assetMapKernel: (orgId?: string) => ['asset-map-kernel', orgId] as const,
  computedScore: (orgId?: string) => ['computed-score', orgId] as const,
}
```

Then migrate `useOrgEvents`, Domains, Asset Map, Dashboard, Domain Intel, SLA Monitor first.

Goal: stop typo/key drift and make SSE invalidation auditable.

### 2. External Adapter Module

- [x] Add `src-next/components/compounds/exposure/externalModel.ts`.
- [x] Move kernel asset -> issue row mapping out of `DomainIntel`.
- [x] Move kernel asset -> dashboard domain building mapping out of `DashboardView`.
- [x] Move external issue + CTEM priority -> SLA row mapping out of `SLAMonitorView`.
- [x] Add adapter unit tests for empty/no-score/kernel findings/SLA breached cases.

Create a frontend adapter module for external read models, for example:

`src-next/components/compounds/exposure/externalModel.ts`

Move these conversions out of components:

- kernel asset -> display issue row
- kernel asset -> dashboard domain building
- external issue + CTEM priority -> SLA row
- severity normalization

Goal: components render; adapters map contracts.

### 3. Posture Overview Split

- [x] Audit every panel in `PostureOverview.tsx`. See [POSTURE_OVERVIEW_AUDIT_2026_05_29.md](./POSTURE_OVERVIEW_AUDIT_2026_05_29.md).
- [x] Document which panels still require legacy `/external-posture`. Captured in panel-by-panel table.
- [ ] Move domain/finding rows to shared adapter after backend exposes required fields (audit BE gap #4).
- [ ] Replace client-side full `attack-surface` KPI aggregation when backend summary exists (audit BE gap #2 — biggest perf win on this page).

`PostureOverview.tsx` is still too mixed:

- legacy `/external-posture` for summary/trend/domain rows
- `/attack-surface` for KPI counts
- `/ctem-priorities`
- `/attack-paths`
- monitoring events
- peer baseline
- leak exposure

Do not hard-cut the whole page to kernel yet. Instead:

- Keep trend data on legacy until backend exposes kernel trend/timeseries.
- Move domain rows and finding counts to a shared adapter when backend has the required fields.
- Stop downloading full `attack-surface` just to count KPI tiles once backend exposes summary counts.

### 4. Dashboard Cleanup

- [x] Use kernel assets for Dashboard Asset City domain buildings.
- [x] Use query key factory.
- [x] Move external threat strip derivation into an adapter.
- [x] Verify no score fallback from `health-summary` is reintroduced.

Dashboard still mixes many sources by design, but should not compute product truth locally.

Already fixed:

- 3D domain buildings read kernel assets.

Still to clean:

- Use query key factory.
- Move external threat strip data derivation into an adapter.
- Avoid adding score fallbacks from `health-summary`.
- Keep `computed-score` as score truth.

### 5. Reports Builder

- [x] Audit report data sources using legacy `attack-surface`. → [REPORTS_AUDIT_2026_06_01.md](./REPORTS_AUDIT_2026_06_01.md) §1.
- [x] Audit widgets that require legacy field names. → audit §2 (`asset_type` / `status` block the kernel cut).
- [x] Identify localStorage fallback paths that mask backend persistence failures. → audit §3 (`utils.ts` keys + `ReportsView` read/write masking; root cause = missing `report_templates`/`report_components` engine tables).
- [x] Convert local fallback into explicit local/draft state. → `ReportsView` now surfaces a visible "Local draft — not synced to server" banner on `isPlaceholderData` (fallback kept, not removed). audit §4 + 2 new tests.

Reports are high risk because they still include API/localStorage fallback behavior.

Do not remove fallback blindly if user reports depend on it. First audit:

- Which report data sources still point at legacy `attack-surface`.
- Which widgets expect legacy field names.
- Which fallback paths make a report appear saved when backend persistence failed.

Then isolate fallback behind a visibly local/draft state.

## Do Not Do

- Do not rewrite the app from scratch.
- Do not replace every legacy endpoint in one PR.
- Do not derive score, grade, SLA breach, issue truth, blast radius, or asset identity in React components.
- Do not join tables by `domain` string when a backend `resource_id` contract exists.
- Do not delete `attack-surface` from Domains detail until SSL/DNS/ports/PageSpeed raw signal tabs have a kernel-backed replacement.
- Do not cut `ScoreTrends` or `SupplyChainView` to kernel until backend provides `score_trend` and `supply_chain` equivalents.

## Known Remaining Legacy Consumers

Still expected for now:

- `ScoreTrends.tsx` -> `/external-posture` for `score_trend`, `sla_violations`, `risk_summary`.
- `SupplyChainView.tsx` -> `/external-posture` for `supply_chain`.
- `PostureOverview.tsx` -> mixed legacy and auxiliary reads.
- `BrandProtectionView.tsx` -> `/attack-surface` for lookalike/takedown workflow.
- Reports data sources/templates -> mixed sources.

Not expected long term:

- Component-local domain/finding construction.
- Client-side business aggregation over full `attack-surface`.
- Duplicate React Query key literals scattered across pages.

## Suggested Next PR Order

- [x] Add query key factory and migrate the external/kernel keys.
- [x] Extract `externalModel.ts` adapters for Domain Intel, Dashboard domain buildings, and SLA rows.
- [x] Audit `PostureOverview.tsx` and list each panel's real contract dependency. → [POSTURE_OVERVIEW_AUDIT_2026_05_29.md](./POSTURE_OVERVIEW_AUDIT_2026_05_29.md).
- [ ] Backend task: add kernel-backed summary/timeseries fields needed to replace legacy `/external-posture`. (flyto-engine — blocks PostureOverview gap #2/#4 + Reports `attack-surface` repoint.)
- [x] Reports audit: identify which widgets need schema adapters vs backend changes. → [REPORTS_AUDIT_2026_06_01.md](./REPORTS_AUDIT_2026_06_01.md).

Keep PRs small. Each PR should include targeted tests for the adapter or query invalidation behavior.

## Review Notes - 2026-05-28

Reviewed against current `origin/main` after `a57ef96`.

- [x] Dashboard no-score fallback check: `useDashboardMetrics` derives score/grade from `computed-score`; `health-summary` remains only for distribution/count metadata.
- [x] `DomainIntel.tsx`: removed dead `fixSteps?: string[]` prop and the unused fix-step rendering block. Also collapsed the leftover one-cell IIFE wrapper that only existed to host the removed two-column branch.
- [x] `AssetMapView.tsx`: `score.display_score || score.score` is now `?? score.score` in both `scoreLabel` and the `ScoreChip` label so a valid `0` display score does not fall back incorrectly.
- [x] `DashboardView.tsx`: `oldestSlaDays` display derivation now lives in `externalModel.oldestSlaViolationDays`, called from the dashboard's `useMemo` wrapper. Breach truth still comes from backend; this was the final piece of locally-derived SLA logic flagged in the previous Review Notes batch.
- [x] `PostureOverview.tsx`: Domain Status table + selected-domain detail panel now prefer kernel `score` / `grade` from `/external-posture/kernel`, falling back to the legacy `data.domains[].score/grade` row when kernel hasn't projected that domain yet. Legacy `/external-posture` stays primary for `score_trend` / `sla_violations` / `risk_summary` / `supply_chain` / `improvements` until backend ships those on the kernel endpoint. KPI aggregation (`quickCounts`) over the full `attack-surface` list is still client-side; that's the M3 backend dependency tagged in the inline TODO and the PR-3 checklist below.
- [x] `@compounds/exposure/shared.ts`: extracted `extractHostFromAssetValue` from `buildDomainRows.ts` into a shared exported helper. PostureOverview's kernel-by-domain map now writes the normalised host (lowercased, scheme-stripped, suffix-stripped) AND reads with the same normalisation on the lookup side, so a legacy posture row carrying `Example.COM` / `https://example.com` / `example.com — extra` still matches the kernel entry instead of silent-falling-back to legacy score/grade. `buildDomainRows.ts` now imports the helper instead of declaring it locally — single source of truth, identical normalisation contract across DomainsView / PostureOverview / future callers. New dedicated unit-test file `exposure/__tests__/extractHostFromAssetValue.test.ts` (10 cases) locks the contract.
- [x] `DomainsView.tsx`: Domains tab list now scrolls locally. Outer view Box owns `overflow: hidden`, but the Domains-tab branch previously rendered `GroupedDomainList` flush against that overflow with no flex sizing of its own — long lists got clipped instead of scrolling. Wrapped the list in a `flex: 1, minHeight: 0, overflow: auto` region with `Pagination` pinned below (`flexShrink: 0`). The Checks tab already had this treatment via its `TableContainer`; this brings Domains in line with the "main shell fixed, sections scroll locally" rule.
- [x] `DomainsView.tsx`: count chip in `FlytoPageHeader` + Domains tab label now shows `groups · domains` when grouping is reducing the row count (e.g. `1 · 5` when 1 root project has 4 discovered subdomains), and the plain `N` when they match. Group count is derived from the same `parent_id` / `project.id` keying that `GroupedDomainList.groupRows` uses, so the chip's "groups" number always matches the visible group headers.
- [x] `VAReportView.tsx`: error branch now surfaces the actual backend error message (`reportQ.error.message`) below the generic title and adds an inline Retry button. Previously the page collapsed every failure mode — scan-still-running / no-domains / backend 500 / auth-expired — into a single opaque "Failed to generate VA report" line, leaving the operator no signal for what to do next. `request()` in `@lib/engine/client.ts` already unpacks the backend's nested / flat / status-text shapes into the thrown Error, so this is purely a UI surfacing fix.

## Review Notes - 2026-05-29

- [x] **VA report 404 — full migration to `/reports/build`.** Diagnostic fix from 2026-05-28 exposed that the backend retired all three `/va-report*` endpoints on 2026-05-24 (engine `api/router.go:673`); replacement is `POST /api/v1/code/orgs/{id}/reports/build` with `{template_id: "external_ctem", format: "html" | "pdf"}` returning rendered HTML or PDF bytes (no JSON envelope). Rewrote `lib/engine/reports/vaReport.ts` — dropped dead `getVAReport`, `vaReportHtmlUrl`, `downloadVAReportPdf`, `VAReport`, `VASummary`; added `buildReport(orgId, req): Promise<Blob>` plus `buildReportHTML(orgId, req): Promise<string>` and `downloadBuiltReport(orgId, req, filename)` helpers. Rewrote `VAReportView.tsx` — the markdown-preview-plus-summary-tiles design depended on a JSON `{markdown, summary}` shape that no longer exists, replaced with an inline iframe preview (`srcdoc` from the HTML blob, `sandbox="allow-same-origin"` defence in depth) plus Refresh / Open HTML / Download PDF buttons. Open HTML opens the new tab synchronously inside the click gesture (`window.open('', '_blank')` + `win.opener = null` + `win.document.write(html)`) so popup blockers don't intercept after the `await`. Backend's per-template access gate (`surface_external` feature + `asset:read` action) now surfaces as a 403 with message — the diagnostic error Alert from the previous round already handles that. Test rewritten: 3 cases cover title, button presence, iframe `srcdoc` wiring against the mocked HTML.
- [x] **PR-2 External adapter module shipped.** New `src-next/components/compounds/exposure/externalModel.ts` is now the single shape-translation layer between engine read models (`/external-posture/kernel`, `/external-issues`, `/ctem-priorities`) and view row types. Exports `kernelFindingToIntelIssue` + bulk `kernelAssetsToIntelIssues` (DomainIntel), `kernelAssetsToDomainBuildings` (Dashboard Asset City), `externalIssuesToSLAIssues` + `ctemPrioritiesToSLAViolations` + `formatOverdue` (SLA Monitor), and `oldestSlaViolationDays` (Dashboard hero tooltip — closes the deferred item from the previous Review Notes batch). All three consumers (`DomainIntel.tsx`, `DashboardView.tsx`, `SLAMonitorView.tsx`) lost ~50 lines of inline derivations in exchange for typed adapter calls; the deletion includes the local `formatOverdue` copy and the inline `oldestSlaDays` `useMemo` body. New `exposure/__tests__/externalModel.test.ts` (21 cases) covers empty inputs, no-score / display-name fallback, severity normalisation, kind/breach filtering on CTEM priorities, hour-vs-day formatting boundary, and the unparseable-timestamp skip. Adapter is pure (no React imports, fake timers for the two time-dependent helpers) so future cleanups can call it from anywhere without dragging the component tree along.
- [x] **PR-5B audit — Reports PDF Export Registry Audit shipped.** New [docs/REPORTS_EXPORT_REGISTRY_AUDIT_2026_05_29.md](./REPORTS_EXPORT_REGISTRY_AUDIT_2026_05_29.md) walks every preset in `templates.ts` (19 templates, ~140 widgets total), classifies each widget against `BACKEND_SUPPORTED_SOURCES`, and tells you per template whether it would export today or block. Headline finding: **only 3 of 19 presets (`security-trend`, `ctem-posture`, `compliance-soc2`) export end-to-end today**; the other 16 block on at least one unsupported KPI/table widget. Top backend-add ROI: `issues` (unblocks 4 presets), `pulse` / `autofix` (3 each). 4 frontend-used IDs (`scan-diff`, `enriched-deps`, `dependencies`, `api-definitions`) are chart-only across all presets, so backend never needs to support them. Bottom of doc has an 8-step next-PR sequence split between FE (template rewrites — items 1–3 + 8) and BE (registry additions — items 4–7); FE items ship first so customers get working exports without waiting on backend cadence. Doc-only audit; no source changes from this PR.
- [x] **PR-5A — custom-report PDF export migrated to `/reports/build` with explicit unsupported-widget blocking.** Backend retired `/reports/generate` on 2026-05-24; full /reports/build migration shipped here. New `src-next/components/compounds/reports/buildSections.ts` partitions an active template into supported / unsupported widgets according to the backend `data_source` registry (17 IDs hard-coded in `BACKEND_SUPPORTED_SOURCES` mirroring `api/report_engine.go:getDataSourceRegistry()`). Rules: **text** always supported (no fetch needed); **chart** always supported via image-only path (frontend captures via `ApexCharts.exec(id, 'dataURI')`, backend embeds the PNG verbatim — `data_source` intentionally omitted so the backend doesn't drop the section on unknown source); **kpi / gauge / radialBar** require `dataSourceId ∈ BACKEND_SUPPORTED_SOURCES`; **table** same; **JOIN widgets** always blocked (backend has no JOIN). `widgetToSection` does the descriptor mapping with chart-type mapping (`donut/bar/line/radar` direct, everything else `chart_hint: 'auto'`). `ReportsView.handleExportPdf` now partitions first → if any unsupported widget, surfaces a blocking dialog listing widget title + reason + offending data source (e.g. "Top Findings by Blast Radius (data source \"pulse\" not registered on backend)") and bails BEFORE doing any chart capture work; otherwise captures chart PNGs, builds section descriptors, calls `downloadBuiltReport(orgId, {sections, settings, format:'pdf'})`. Extended `BuildReportRequest` in `lib/engine/reports/vaReport.ts` to accept either `template_id` (built-in templates — original VA path) or `sections + settings` (custom — this PR). Dead code dropped: `generateReportPdf` removed from `reports.ts`, `pdf/collectWidgetPayload.ts` deleted entirely, test mock for it removed, drift allowlist entry for `POST /reports/generate` dropped (script now reports 263 frontend calls / 1fe allowlist instead of 264 / 2fe). **Honest outcome**: many of today's preset templates (security-audit / executive-summary) include widgets backed by `issues` / `pulse` / `dependencies` which are NOT in the backend registry — exports of those templates now block with a clear list instead of silently 404'ing. Closing the blocking surface is **PR-5C** (backend grows registry) or **PR-5B** (frontend rewrites templates to only use supported sources); this PR is the user-visible 404 fix, not the parity work. 20 new test cases (`buildSections.test.ts`) cover text/chart/kpi/table mapping, JOIN block, unknown-source block, chart hint fallback, throw-on-unsupported, full suite 70 files / 382 tests green.
- [x] **Contract drift detection script shipped.** New `scripts/check-route-drift.py` + `scripts/route-drift.allowlist` + `npm run check:routes`. Compares HTTP endpoints called from `src-next/` against `mux.HandleFunc` registrations in `flyto-engine/api/router.go`, surfaces frontend-missing (likely-404) and (opt-in) backend-unused routes. Brace-aware template extractor handles `${query ? '?' + query : ''}` style paths without false positives; trailing query-suffix templates that concat onto a path segment (e.g. `/issues${qs}`) are stripped via the "no `/` before `${`" heuristic. Skip-gracefully behaviour when `--engine-path` is missing so CI can wire it before flyto-engine becomes co-checked-out. **Current baseline** (post PR-5A): 263 frontend calls vs 403 backend routes; 1 known retired-pending-migration entry allowlisted (`GET /external-report` — 2026-05-24 Report-PR3 retirement, migration tracked under PR-5B); 5 unknown-drift entries left visible for team triage — `GET /orgs/{*}/invitations` + `DELETE /orgs/{*}/invitations/{*}` (backend only has POST), `GET /orgs/{*}/duplicates` (arch.ts:194), `POST /orgs/{*}/pulse/ai-advisor` (issues.ts:329), `POST /orgs/{*}/pulse/ai-summary` (issues.ts:259). Each is either a real silent-404 (operator should fix or allowlist) or a backend route my regex missed (operator should add a backend-pattern test). The original `POST /reports/generate` retirement was also flagged here on first run but its allowlist entry was retired in PR-5A — the call site is gone, so the script no longer reports it. `--strict` flag exits 1 on drift for CI use; not wired into ci.yml yet because (a) the 5 unknowns need triage first and (b) flyto-engine isn't currently checked out alongside flyto-code in CI — the script already skips cleanly in that case. Next-step: triage the 5 unknowns, decide which are fixes vs allowlists, then add an `actions/checkout flyto-engine` step + `python3 scripts/check-route-drift.py --strict` to ci.yml.
- [x] **Reports component-save 400 fix + PDF-export 404 diagnostic.** Two unrelated `Reports` page failures hit production: (1) saving a JOIN component to the library was returning `400 "json: unknown field \"join_config\""` because the backend uses `DisallowUnknownFields()` and the `report_components` table has no JOIN column today — the old comment "silently dropped by the handler" was stale. (2) "Export PDF" was returning 404 because backend retired `/reports/generate` on 2026-05-24 (router.go:450, same date as the VA-report `/va-report*` retirement) — successor is `POST /reports/build`. Both bugs were also masked by component-level snackbars that printed generic banners instead of the real backend message. **For (1)**: dropped `join_config` from the POST body in `ReportsView.createComponentMut` (JOIN configs are already persisted via the saved-index localStorage path so design survives reload without backend support); updated `createReportComponent` typed signature in `lib/engine/reports/reports.ts` to remove the field; refactored the `onError` snackbar to surface the real backend message. **For (2)**: kept the call surface intact but updated `generateReportPdf` jsdoc to flag the endpoint as retired with the migration plan pointer, and refactored `handleExportPdf`'s catch to surface the actual error message — full migration to `/reports/build` is non-trivial because the request body shape changes from pre-fetched `widget_data[]` to section descriptors that the backend re-fetches, AND most frontend `DATA_SOURCE_MAP` IDs (`issues`, `pulse`, `arch-map`, `dependencies`, `taint-flows`, `dead-code`, `autofix`, `ci-checks`, `containers`, `iac`, `licenses`, `malware`, `cspm`, `runtime-events`, `pentest-projects`, `scan-log`, `score-events`, `monitoring-events`, `api-definitions`) have no equivalent in the backend's 16-source registry (`computed-score`, `score-history`, `health-summary`, `cve`, `alerts`, `repos`, `top-risks`, `attack-surface`, `dast-findings`, `external-issues`, `ioc`, `brand-protection`, `vendor-risk`, `compliance`, `ransomware`, `threat-actors`, `malware-families`). Only ~5 sources line up. Superseded 2026-05-29 by PR-5A: `generateReportPdf` is gone, the export now routes through `POST /reports/build` with explicit `unsupported-widget` blocking dialog (see PR-5A note below). Diagnostic snackbar remains for any new failure modes the migration surfaces.
- [x] **PR-3 PostureOverview panel-by-panel audit shipped.** New [docs/POSTURE_OVERVIEW_AUDIT_2026_05_29.md](./POSTURE_OVERVIEW_AUDIT_2026_05_29.md) inventories all 12 read models the page fans out, breaks down every panel by endpoint / canonical-status / frontend derivation / backend gap, and aggregates the findings into 5 backend-blocking gaps + 3 frontend-only cleanups. Bottom of the doc carries an 8-step next-PR sequence sized so each can land independently (3 frontend-only PRs, 4 backend PRs that unblock the rest, plus the eventual file split). Headline observations: (a) the page fans out 11 concurrent fetches per mount, two of them full-list payloads (`/external-posture` + `/attack-surface`) on orgs that may carry thousands of assets, just to count chip tiles; (b) `quickCounts` is the worst client-derivation in the page and downloading the full `/attack-surface` for it is the #1 perf win once backend ships a `summary: {...}` rollup; (c) the entire hero card is one backend PR (kernel org-aggregate fields) away from being legacy-free; (d) `computeCorpusPercentile` + `assetStats` are pure functions trapped in the component file and can move into `externalModel.ts` today with no backend coordination. Doc-only — no source changes in this PR.
- [x] **PR-4 close-out — external threat strip derivation moved to adapter.** Added `externalThreatCountsFromCtem(items)` to `externalModel.ts` returning `{ kev, threatActor, crownJewel }`. `DashboardView` now wraps the adapter call in a `useMemo` (single-line body) instead of the inline 3-filter derivation that lived above the render block. Field names renamed `actor → threatActor` / `crown → crownJewel` so the destructure at the `<ExternalThreatStrip>` call site reads identically to the prop names. Scope-contract behaviour preserved: the adapter counts whatever the caller passes (today's call site sends the full `/ctem-priorities` list which mixes `external` + `code` kinds — pre-PR-4 the inline filter did the same). Adapter docstring spells the contract out so a future "external-only" caller is added explicitly via a new variant rather than silently flipping the dashboard's tile numbers. 3 new test cases (empty input, multi-flag rows, code-kind passthrough) on top of the previous 21 → externalModel test now 24 cases.
