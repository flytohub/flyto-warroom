# Frontend Remaining Work — verified 2026-05-31

A code-verified inventory of what the flyto-code frontend still has open,
cross-checked against the actual `src-next/` tree (not just the planning
docs, several of which had drifted). Produced in response to "give me a
checklist of frontend things not yet done; verify P5/P6/P7."

> Method: every "pending" claim below was grep-verified against the
> current source. Where a doc/memory note disagreed with the code, the
> code wins and the drift is flagged in §4.

---

## 1. Phase verdict (P5 / P6 / P7)

The canonical roadmap is **P0–P6** (`project_roadmap_p0_p6_canonical.md`,
`kernel_4surface_r1_r5_plan.md`). There is **no P7** — the numbering stops
at P6.

| Phase | Scope | Backend | Frontend (verified) |
|-------|-------|---------|---------------------|
| **P5** | Cross-surface graph (asset-map first) | graph read model | ✅ **DONE** — `AssetMapView.tsx` consumes `/asset-map/kernel`, routed via `modules.ts` (`asset-map`) + `AssetMapPage`, renders all 4 surfaces (external/code/container/cloud) from `asset_scores[]` + `by_surface` + surface filter |
| **P6** | Impact / blast radius / CTEM loop | blast engine ⏳ **not started** | partial viz already exists (`CrossDimNetwork3D`, `PulseView`, `ContextStrip` all consume `blast_radius`); full UI waits on the backend engine |
| **P7** | — | — | does not exist |

---

## 2. Remaining work

### A. Blocked on backend (frontend waits for contract)

| Item | State | Blocker |
|------|-------|---------|
| **Domains list/detail → kernel** | Stage-1 (sidebar `count`) shipped `b92f814`; list + detail NOT migrated | new `/attack-surface` (68e2e78) is not a true superset — dropped raw `ssl_cert`/`dns_security`/`port_scan` assets + `metadata` (→ DomainDetail SSL/DNS/WHOIS/Tech/Ports/PageSpeed tabs) and `asset_tier`/`business_unit_id` (→ DomainAssetTierPicker + DomainBUAssignChip). Backend must restore the raw-signal source + re-add 2 fields. |
| **Posture Overview off legacy** | F1/F2/F3 shipped (`4937436`); hero / `quickCounts` / score-trend still legacy | kernel needs org-aggregate fields + a `summary` KPI rollup + `score_trend` (`POSTURE_OVERVIEW_AUDIT` BE gaps 1–4) |
| **ScoreTrends / SupplyChain pages** | still read legacy `/external-posture` | kernel has no `score_trend` / `supply_chain` yet |
| **P6 blast-radius / CTEM-loop UI** | partial viz only | P6 backend blast engine not started |

### B. Frontend-only (not blocked — can ship now)

| Item | State | Source |
|------|-------|--------|
| **Reports template rewrite** | only 3 of 19 presets export end-to-end; 16 block on widgets backed by sources the backend registry doesn't support | `REPORTS_EXPORT_REGISTRY_AUDIT` (FE can rewrite templates to supported sources — items 1–3 + 8). **Highest user-facing ROI: users hit a blocking dialog today.** |
| **Posture Overview file split** | 1267-line single file | audit step 8 (best done after the BE-first items land, else it just shuffles mixed-truth) |
| **no-score UI** for legacy score-fallback removal | health-summary fallback still present; needs an explicit "no score" empty state before the fallback can be deleted | memory PR-2 / scoring-4surface |
| **repo-wide lint warnings** | `npm run lint` exits 0 but still warns (mostly Fuse/React-Compiler) | `FRONTEND_REPAIR_HANDOFF` §Lint unchecked item |

### C. Product features not built (FE + BE)

| Area | Items |
|------|-------|
| Pillar 1 (VA/PT) | DAST active-scan UI, VA-report PDF UI, compliance-mapping UI |
| Pillar 2 (CTEM) | continuous-monitoring alerts, peer benchmarking, third-party-risk portal, dark-web monitoring, brand-impersonation UI |
| Pillar 3 (Cloud, ~25%) | cloud-connector setup UI, deeper CSPM results page, attack-path graph |
| CLAUDE.md Phase 4 | arch-map auto-gen, cross-repo dependency drift, doc-coverage scoring, test-coverage integration |

---

## 3. Already done (so it isn't re-assigned)

- ✅ P5 asset-map multi-surface UI (`AssetMapView`)
- ✅ query-key factory + `externalModel.ts` adapter (repair handoff §1/§2)
- ✅ Posture F1/F2/F3 + legacy benchmark-chip consolidation (`4937436`)
- ✅ Dashboard cleanup (computed-score truth, adapters)
- ✅ Reports custom export migrated to `/reports/build` (PR-5A) + 2 audit docs
- ✅ REFACTOR_PLAN 4 phases (dead code / tokens / module manifest / tests)
- ✅ Sidebar Domains count → kernel (`b92f814`)

---

## 4. Doc/memory drift corrected by this pass

These notes were **stale** — corrected here so the record stays honest:

1. "`/asset-map/kernel` has no UI consumer" / "asset_scores[] consumer
   pending" — **false now**: `AssetMapView` consumes it and renders the
   per-surface badges. P5 frontend is done.
2. "container/cloud `surface_scores` are ghost contracts (written, no
   reader)" — **partially false**: they ARE read, in `AssetMapView`'s
   `asset_scores[]`. The narrower true gap is only that there is no
   dedicated container/cloud *posture page*.

---

## 5. Recommended next pickup

**Reports template rewrite (§B)** — it's frontend-only, unblocked, and the
only item where users hit a hard wall today (16/19 presets refuse to
export). Everything else is either backend-blocked or polish.
