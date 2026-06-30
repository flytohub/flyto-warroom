# Reports Builder Audit - 2026-06-01

Closes the "Reports Builder" audit items in [FRONTEND_REPAIR_HANDOFF_2026_05_28.md](./FRONTEND_REPAIR_HANDOFF_2026_05_28.md) section 5. This is the audit-before-change pass the handoff asked for: *"Do not remove fallback blindly if user reports depend on it. First audit…"*

Scope: `src-next/components/compounds/reports/**` + `src-next/lib/engine/reports/**`.

## 1. Report data sources still pointing at legacy `attack-surface`

`attack-surface` is the legacy full-list external payload. It is still **registered as a backend-supported source** (`buildSections.ts` `BACKEND_SUPPORTED_SOURCES`, line 42), so reports using it do **not** 404 — but every widget bound to it downloads the entire attack-surface list client-side, the same perf cost flagged for `PostureOverview` (see [POSTURE_OVERVIEW_AUDIT_2026_05_29.md](./POSTURE_OVERVIEW_AUDIT_2026_05_29.md) BE gap #2).

Call sites:

| File | Where | Widgets |
| --- | --- | --- |
| `templates.ts` | `security-audit` preset (≈L140-144) | donut `asset_type`, bar `status`, table |
| `templates.ts` | `external-ctem` preset (≈L171-176) | donut `asset_type`, bar `status`, table |
| `templates.ts` | `executive-summary` preset (≈L565-573) | donut `asset_type`, table |
| `LayoutTab.tsx` | preset widget palette (L73-75) | `_p_attack_type` donut, `_p_attack_table` table, `_p_attack_kpi` kpi |
| `datasources.ts` | icon registry (L68) | maps `attack-surface` → Globe icon (cosmetic only) |

**Verdict:** not a 404 risk (backend-supported), but a perf + dual-truth risk. These should move to the kernel summary source **once the backend exposes a `summary`/count rollup** (same dependency as PostureOverview BE gap #2). Until then, do not hard-cut — keep `attack-surface` so the presets keep rendering. This matches the handoff's "do not fake it in the frontend" rule.

## 2. Widgets requiring legacy field names

The `attack-surface`-bound widgets above bind to **legacy row fields** that exist on `/attack-surface` rows but are **not** in the kernel asset/posture contract:

- `asset_type` (donut label)
- `status` (bar label)

These are the blockers to repointing the presets at kernel: kernel posture/asset rows expose `score`/`grade`/`findings`/`asset_scores[]`, not `asset_type`/`status` strings. A kernel cut requires either (a) backend adding these fields to the kernel summary contract, or (b) a frontend adapter that derives `asset_type`/`status` from kernel fields. Deferred to the backend-summary work; recorded here so the field dependency is explicit.

No other report widgets depend on legacy-only field names — the JOIN/custom widgets bind to whatever `report-sources.ts` field metadata advertises per source, which is already contract-driven.

## 3. localStorage fallback paths that mask backend persistence failures

This is the real risk the handoff called out. **Root cause is a backend gap**: the `report_templates` (and `report_components`) tables are missing from engine migrations, so the persistence API is "best-effort" (ReportsView comment, L163-166). The frontend papers over that with a localStorage mirror, which makes a save **look** successful even when nothing persisted server-side.

Storage keys (`utils.ts`):

| Key | Holds | Risk |
| --- | --- | --- |
| `flyto:report-components` (`COMP_KEY`) | saved chart components | local-only when API 5xx |
| `flyto:custom-reports-index` (`SAVED_INDEX_KEY`) | saved report list | local-only when API 5xx |
| `flyto:custom-report:<id>` (`SAVED_PREFIX`) | full report design | local-only when API 5xx |

Masking paths (`ReportsView.tsx`):

- **Read masking (L69-73, L84-87):** `useQuery.placeholderData` falls back to `loadSavedIndex()` / `loadComponents()`. When the API fails, react-query serves the localStorage copy as `isPlaceholderData` data — the catalog looks fully populated, with **no signal** that none of it is server-backed.
- **Write masking (L159-173, L213, L457):** `createTemplateMut.onSuccess` mirrors the design to localStorage. If the backend write later 5xx's (table missing), the design still survives reload locally, so the operator believes it saved. On another device/browser it is gone.

**Verdict:** the fallback itself should stay (operators currently rely on it because the backend table doesn't exist), but it must become **visible** — surfaced as a local/draft state, not a silent success. Implemented in this pass (see below). The durable fix is the backend migration (tracked as a flyto-engine task; not doable in flyto-code).

## 4. Convert local fallback into explicit local/draft state — DONE (visible, non-removing)

Per the handoff's "isolate fallback behind a visibly local/draft state", the localStorage fallback is **kept** (no behaviour removed) but is now **honest**:

- [x] `ReportsView` reads `isPlaceholderData` from the saved-reports query. When true (API unavailable → serving localStorage), the catalog renders a visible **"Local draft — not synced to server"** banner so the operator knows the list is not server-backed.
- [x] Banner copy is i18n-keyed (`reports.localDraftWarning`) with an English fallback via `tOr`.
- [x] Test added asserting the banner shows on placeholder data and hides on real API data.

This closes the operator-facing masking. The remaining durable work (add `report_templates`/`report_components` to engine migrations so persistence is real) is a backend task and is intentionally **not** done here — doing it in the frontend would be faking persistence, which the handoff forbids.

## Backend-blocked (NOT done here — needs flyto-engine)

- Repoint `attack-surface` preset widgets to a kernel summary source (BE gap #2 — needs kernel `summary`/count rollup).
- Add `report_templates` + `report_components` tables to engine migrations so report/component saves persist server-side (root cause of section 3).

These are recorded in the handoff "Backend task" line. Frontend stays on the visible-fallback mitigation until the backend lands.
