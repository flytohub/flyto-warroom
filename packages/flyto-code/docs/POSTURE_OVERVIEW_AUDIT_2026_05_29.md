# PostureOverview Panel Audit — 2026-05-29

Source: `src-next/components/compounds/exposure/PostureOverview.tsx` (1267 lines).

The page is the most-visited operator surface and the most mixed-truth one. The kernel cut has landed for the Domain Status score/grade columns, but every other panel still threads three to four read models. This audit lists what each panel actually reads, whether the source is canonical or legacy, and what would have to land on the backend / in an adapter before the panel can leave its current contract.

The output is a **next-PR-able list** at the bottom — each line is sized so a future PR can pick it up without re-doing this audit.

> Scope: this audit is doc-only. No source changes were made while producing it.

---

## 1. Query inventory (12 read models)

| # | Variable | Endpoint | Canonical? | Notes |
|---|---|---|---|---|
| 1 | `postureQ` | `/api/v1/code/orgs/{id}/external-posture` | **legacy** | Last broad-shape envelope from before the kernel cut. Still drives score_trend, risk_summary, sla_violations, improvements, supply_chain, domains[], last_scan_at, scan_cadence. |
| 2 | `kernelPostureQ` | `/external-posture/kernel` | canonical | Per-asset score/grade/findings/sources/last_scanned. **NOT** a strict superset of #1 — missing trend, sla, supply, improvements, env, asset_count, issue_count. |
| 3 | `assetsQ` | `/attack-surface` | legacy | Raw scanner output. Used for asset enumeration + Shodan metadata + BU filter + KPI tile counts. |
| 4 | `snapshotsQ` | `/posture-snapshots?days=90` | canonical | Worker-written daily snapshots. |
| 5 | `runsQ` | `/discovery-runs?limit=20` | canonical | Discovery observability. |
| 6 | `activityQ` | `/monitoring-events?limit=200` | canonical | Activity feed. |
| 7 | `sourceHealthQ` | `/verifier-source-health?window=24h` | canonical | Source PASS/FAIL/INCONCLUSIVE tally. |
| 8 | `ctemQ` | `/ctem-priorities?bu={buFilter}` | canonical | Priority queue + per-finding metadata (kev_listed, threat_actor, asset_tier, sla_*). |
| 9 | `pathsQ` | `/attack-paths` | canonical | Open attack-path count. |
| 10 | `benchmark` | `/org-benchmark` | **legacy** | Pre-Phase-A industry benchmark. Phase B is `peer_baseline_snapshots` via #11. Phase B doesn't fully replace yet — `display_text` + `sector` shape differ. |
| 11 | `peerData` | `/peer-baseline?sector=` | canonical | Phase A daily public-corpus percentiles. |
| 12 | `leakData` | `/leak-exposure` | canonical | HIBP exposure. Lazy-loaded only when `tab === 'darkweb'`. |

**Legacy load problem:** every PostureOverview mount fans out 11 concurrent fetches (12 minus the darkweb gate). Two of them are full-list payloads (`postureQ`, `assetsQ`) on orgs that may carry thousands of assets, just to count tiles in the hero + quick-links rows.

---

## 2. Panel-by-panel breakdown

### 2.1 Header + BU filter (lines 243–253)

| | |
|---|---|
| Endpoint | none — pure layout |
| Fields | `BUFilterDropdown` reads its own list internally |
| Canonical | n/a |
| Frontend derivation | none |
| Action | — |

### 2.2 Cross-query error banner (lines 259–286)

| | |
|---|---|
| Endpoint | meta — aggregates `.isError` over queries #1–9 |
| Fields | `dimensionQueries` literal list |
| Canonical | n/a |
| Frontend derivation | label list + retry fan-out |
| Action | — (this is the right pattern; do not move) |

### 2.3 Tab bar (lines 293–313)

| | |
|---|---|
| Endpoint | none |
| Action | — |

### 2.4 Activity tab (lines 318–327)

| | |
|---|---|
| Endpoint | `/monitoring-events` (#6) → `<ActivityFeed monitoringEvents={...}>` |
| Fields | `activityEventsData.events[]` |
| Canonical | **yes** |
| Frontend derivation | none — ActivityFeed owns its presentation |
| Action | **none — clean** |

### 2.5 Supply Chain tab (lines 328–332)

| | |
|---|---|
| Endpoint | `<SupplyChainView embedded>` — separate file `SupplyChainView.tsx` |
| Fields | reads `/external-posture.supply_chain` internally |
| Canonical | **no** (legacy) |
| Frontend derivation | inside SupplyChainView; out of this audit's scope |
| Action | covered by **handoff PR-5 / "Known Remaining Legacy Consumers"** — needs kernel `supply_chain` endpoint before frontend cut |

### 2.6 Dark Web tab (lines 333–337 + `DarkWebTab` 1114–1207)

| | |
|---|---|
| Endpoint | `/leak-exposure` (#12) |
| Fields | `leakData.domain_count`, `.hit_count`, `.total_pwned`, `.domains[].{breach_count, total_pwned, sensitive_hit, worst_breach.{Title,Name,BreachDate}}` |
| Canonical | **yes** |
| Frontend derivation | `hits = data.domains.filter(d => d.breach_count > 0)` — trivial display split |
| Action | **none — clean** |

### 2.7 Hero card — score + grade + GradeCircle (lines 396–451)

| | |
|---|---|
| Endpoint | `/external-posture` (#1) — `data.score_available`, `data.avg_score`, `data.avg_grade`, `data.message`, `data.domain_count` |
| Frontend derivation | `hasScore` gate + GradeCircle render |
| Canonical | **no** — legacy endpoint owns avg_score / avg_grade |
| Backend gap | `/external-posture/kernel` should expose `avg_score` + `avg_grade` + `score_available` (org-aggregate, not per-asset — kernel today only ships per-asset rows) |
| Frontend gap | none (the A3 no-score gate is already correct — just on the wrong endpoint) |
| Action | **BACKEND-FIRST** — wait for kernel org-aggregate fields, then swap the read. Trivial frontend change once backend ships. |

### 2.8 Hero — sub-stats footer (lines 415–449)

| | |
|---|---|
| Endpoint | `/external-posture` (#1) for `data.domain_count`; `/attack-surface` (#3) for subdomain count |
| Frontend derivation | `assetStats` useMemo (lines 228–239): walks every asset, `JSON.parse(metadata)` to check `m.resolves` |
| Canonical | **no** — client-side JSON parse of scanner metadata |
| Backend gap | `/external-posture/kernel` (or a new posture-summary endpoint) should ship `subdomain_count` + `resolving_subdomain_count` |
| Frontend gap | `JSON.parse(metadata)` in React is a "derive truth in component" violation; even without backend change, move into adapter (`externalModel.subdomainStats`) |
| Action | **adapter-first** — move `assetStats` into `externalModel.ts`, then chase backend field. |

### 2.9 Hero — score delta chip (line 452–458)

| | |
|---|---|
| Endpoint | `/external-posture.risk_summary.score_change_7d` |
| Canonical | **no** (legacy) |
| Backend gap | kernel `risk_summary` |
| Action | bundled with **2.10**. |

### 2.10 Hero — legacy industry benchmark chip (lines 459–481)

| | |
|---|---|
| Endpoint | `/org-benchmark` (#10) |
| Fields | `benchmark.percentile`, `.sector`, `.display_text` |
| Canonical | **no** (legacy) — already superseded by `peer_baseline_snapshots` per inline comment |
| Backend gap | none (replacement exists in #11) |
| Frontend gap | redundant fetch — should be removed once #11 chip is operator-validated as equivalent |
| Action | **frontend-only**: A/B confirm with operator that #11 (Phase A corpus chip, panel 2.11) carries the same message, then delete the `benchmark` query + chip. |

### 2.11 Hero — Phase A corpus percentile chip (lines 482–508)

| | |
|---|---|
| Endpoint | `/peer-baseline` (#11) |
| Fields | `peerData.latest[N].value`, `.corpus_size`, `.corpus_version`, `peerData.sector` |
| Canonical | **yes** (Phase A) |
| Frontend derivation | `computeCorpusPercentile(score, latest)` — pure bucket math (lines 1242–1267), maps avg_score against P25..P95 |
| Backend gap | the percentile labelling (`Top 5%` / `Top 10%` / ...) is display-layer; backend doesn't need to do it |
| Frontend gap | the function is self-contained and pure — should live in `externalModel.ts` alongside the other display helpers |
| Action | **adapter-first**: move `computeCorpusPercentile` into `externalModel.ts` as `peerPercentileBand(score, latest)`. |

### 2.12 Hero — severity chip row + SLA chip (lines 515–559)

| | |
|---|---|
| Endpoint | `/external-posture.risk_summary` — `critical_count`, `high_count`, `medium_count`, `low_count`, `sla_breaches` |
| Canonical | **no** (legacy) |
| Backend gap | kernel posture should expose per-severity counts + sla_breaches at org-aggregate level |
| Frontend gap | none — already pure read + deep-link |
| Action | **BACKEND-FIRST**, then swap. Same migration as 2.7. |

### 2.13 Hero — last-scan chip (lines 561–573)

| | |
|---|---|
| Endpoint | `/external-posture.last_scan_at`, `data.scan_cadence` |
| Canonical | **no** (legacy) |
| Backend gap | bundled with 2.7 — kernel posture should ship org-aggregate `last_scan_at` + `scan_cadence` |
| Action | bundled with 2.7. |

### 2.14 Quick-links chip row (lines 583–681)

| | |
|---|---|
| Endpoint | `/ctem-priorities` (#8) + `/attack-paths` (#9) + `/attack-surface` (#3) |
| Frontend derivation | `quickCounts` useMemo (lines 173–206): client-side filter loop over `assets` (with BU narrow) to count `asset_type` for 5 categories (`lookalike`, `phishing_url`, `stealer_log_hit`, `suspicious_cert`, `saas_posture`); filter over `ctemItems` for KEV / crown_jewel / threat_actor / auth_verified / active_verified counts; filter over `pathsData.paths` for open count |
| Canonical | **no** — `quickCounts` is the worst client-derivation in the page; downloads full `/attack-surface` (1k+ rows for a 50-domain org) just to count 5 tiles |
| Backend gap | already explicitly TODO'd in source (lines 166–172, "audit M3"): `/external-posture` (or a new `/posture/summary`) should expose `summary: { kev, crown_jewel, threat_actor, brand, phishing, stealer_logs, susp_certs, saas_posture, auth_verified, active_verified, paths }` optionally scoped by `?business_unit={bu}` |
| Frontend gap | the BU filter narrowing is also done client-side — backend should honour `?business_unit=` as the scope filter |
| Action | **BACKEND-FIRST + biggest payoff** — single new summary endpoint kills both the full `/attack-surface` payload AND the client-side filter loop. Probably the #1 perf win on this page for large orgs. |

### 2.15 Score Trend mini chart (lines 719–755)

| | |
|---|---|
| Endpoint | `/external-posture` — `data.score_trend[]`, `data.sla_violations[]`, `data.risk_summary.score_change_30d` |
| Canonical | **no** (legacy) |
| Backend gap | kernel needs `score_trend` (also blocks `ScoreTrends.tsx` per handoff "Known Remaining Legacy Consumers") |
| Frontend gap | `<MiniTrendChart>` is pure SVG math, lives in this file (lines 1209–1234) — fine as-is |
| Action | **BACKEND-FIRST** — same kernel field as `ScoreTrends.tsx`; one backend PR unblocks both. |

### 2.16 Posture Snapshot 90-day chart (lines 764–794)

| | |
|---|---|
| Endpoint | `/posture-snapshots` (#4) → `<PostureSnapshotChart>` |
| Fields | `snapshotsData.snapshots[]` |
| Canonical | **yes** |
| Frontend derivation | none |
| Action | **none — clean** |

### 2.17 Discovery Runs panel (lines 800–810)

| | |
|---|---|
| Endpoint | `/discovery-runs` (#5) → `<DiscoveryRunsPanel>` |
| Canonical | **yes** |
| Action | **none — clean** |

### 2.18 Shodan Enrichment panel (lines 817–823)

| | |
|---|---|
| Endpoint | `/attack-surface` (#3) → `<ShodanEnrichmentPanel assets={...}>` |
| Fields | the panel internally reads `asset.metadata` JSON for Shodan ports / CVEs / tags |
| Canonical | **no** — but raw Shodan metadata is genuinely scanner-shaped; promoting it into kernel is debatable |
| Backend gap | optional: kernel could project `shodan_summary` per asset (ports count, top CVE, last enriched) |
| Frontend gap | `<ShodanEnrichmentPanel>` parses JSON metadata — same "derive in component" pattern |
| Action | **defer** — low priority. Raw Shodan data is legitimately scanner-shaped; this panel's existence justifies keeping the `/attack-surface` fetch alive even after KPI counts move server-side. |

### 2.19 Verifier Source Health badge (lines 830–841)

| | |
|---|---|
| Endpoint | `/verifier-source-health` (#7) → `<VerifierHealthBadge>` |
| Canonical | **yes** |
| Action | **none — clean** |

### 2.20 Domain Status master table (lines 854–899)

| | |
|---|---|
| Endpoint | `/external-posture.domains[]` (#1) + `/external-posture/kernel.assets[]` (#2 — score/grade) |
| Fields read | from legacy: `domain`, `environment`, `asset_count`, `issue_count`; from kernel: `score`, `grade` (preferred), with legacy fallback |
| Canonical | **partial** (kernel score/grade landed in last PR via `extractHostFromAssetValue`-keyed map; envelope still legacy) |
| Backend gap | kernel `assets[]` needs `environment`, `asset_count`, `issue_count` (or equivalents — `sources.length` already there, `findings.length` already there but issue_count semantics may differ — backend confirm needed) |
| Frontend gap | once backend ships those fields, can drop legacy `data.domains[]` entirely for this table |
| Action | **BACKEND-FIRST** — small extension to kernel `KernelAsset` shape; once available, ~10 LOC frontend change. |

### 2.21 DomainDetailPanel (lines 904–917 + 933–1057)

| | |
|---|---|
| Endpoint | merged legacy + kernel row from 2.20 — same shape constraints |
| Action | covered by **2.20** — flips at the same time. |

---

## 3. Aggregate gaps summary

### Backend gaps (block frontend cuts)

1. **Org-aggregate fields on `/external-posture/kernel`** — `avg_score`, `avg_grade`, `score_available`, `message`, `risk_summary {critical/high/medium/low_count, sla_breaches, score_change_7d, score_change_30d}`, `last_scan_at`, `scan_cadence`, `domain_count`, `subdomain_count`, `resolving_subdomain_count`. Unblocks panels **2.7 / 2.8 / 2.9 / 2.12 / 2.13** (entire hero card except chips fed by other endpoints).
2. **Org-aggregate `summary` field** with KPI counts (`kev`, `crown_jewel`, `threat_actor`, `brand`, `phishing`, `stealer_logs`, `susp_certs`, `saas_posture`, `auth_verified`, `active_verified`, `paths`), scoped by optional `?business_unit=`. Unblocks **2.14** and lets us drop the full `/attack-surface` payload that's downloaded just to count tiles. **Biggest single-PR perf win on this page.**
3. **`score_trend` array on kernel posture** — unblocks **2.15** AND the standalone `ScoreTrends.tsx` page (handoff Known Remaining Legacy Consumers).
4. **Per-asset envelope extension on `KernelAsset`** — `environment`, `asset_count`, `issue_count`. Unblocks **2.20** + **2.21** (Domain Status table + detail panel).
5. **Kernel `supply_chain`** — unblocks `SupplyChainView` (out of this page's scope; handoff PR-5 territory).

### Frontend-only gaps (can ship without backend)

| # | Action | Cost | Status |
|---|---|---|---|
| F1 | Move `computeCorpusPercentile` (lines 1242–1267) into `externalModel.ts` as `peerPercentileBand` | tiny, pure | ✅ shipped 2026-05-29 |
| F2 | Move `assetStats` derivation (lines 228–239) into `externalModel.ts` as `subdomainStats(assets)` | small; ends a `JSON.parse(metadata)` in React | ✅ shipped 2026-05-29 |
| F3 | A/B confirm legacy `<benchmark>` chip (panel 2.10) is redundant with Phase A corpus chip (2.11), then delete the `benchmark` query + chip | small, deletes 1 fetch + ~25 LOC | ✅ shipped 2026-05-29 (operator confirmed consolidation: deleted legacy `/org-benchmark` query + chip, Phase A corpus chip is the single hero benchmark) |

### Out-of-scope notes

- The 1267-line file size itself is a problem (handoff "結構性問題 #4"), but splitting before backend gaps close just shuffles the same mixed-truth across multiple files. **Wait for the BE-first items to land, then split by section.** Suggested split anchors once data flow is clean: `<PostureHero>` (panels 2.7–2.13), `<PostureQuickLinks>` (2.14), `<PostureCharts>` (2.15–2.19), `<PostureDomainMaster>` (2.20 + 2.21), `<PostureTabs>` (the wrapper). Today's component already has those as visual sections.
- `dimensionQueries` (line 216–225) does NOT include `benchmark` / `peerData` / `leakData`. Adding them is a small follow-up but not in this audit's scope.

---

## 4. Suggested next-PR sequence

Each line is sized to fit in a single focused PR.

1. ✅ **[FE — DONE 2026-05-29] Move `computeCorpusPercentile` + `assetStats` into `externalModel.ts`.** No backend dependency. Shipped as `peerPercentileBand(score, latest)` + `subdomainStats(assets)`; PostureOverview now calls the adapters (kept `useMemo` only for referential stability), local copies deleted. 6 new adapter unit tests. Closed F1 + F2.
2. ✅ **[FE — DONE 2026-05-29] Delete the legacy `/org-benchmark` chip after Phase A corpus chip A/B confirm.** Operator confirmed the duplication; deleted the `benchmark` query + chip + `getOrgBenchmark` import. Phase A corpus chip is now the sole hero benchmark. Closed F3.
3. **[BE] Org-aggregate fields on `/external-posture/kernel`** (BE gap 1). Smallest backend PR that lets us cut the hero card entirely off legacy. Frontend follow-up ~30 LOC after BE ships.
4. **[BE] `summary: {…}` rollup endpoint** (BE gap 2). Single biggest perf win — kills the full-`attack-surface` fetch on this page. Frontend follow-up ~40 LOC.
5. **[BE] `score_trend` on kernel posture** (BE gap 3). Joint unblock for PostureOverview Score Trend panel + standalone `ScoreTrends.tsx`. Frontend follow-up ~20 LOC × 2 files.
6. **[BE] Extend `KernelAsset` with `environment` / `asset_count` / `issue_count`** (BE gap 4). Lets the Domain Status table drop legacy entirely. Frontend follow-up ~15 LOC.
7. **[FE — only after #3–#6 land] Delete the `postureQ` query** from PostureOverview, retire `getExternalPosture` callers in this file, drop legacy fallback paths in the table.
8. **[FE — only after #7 lands] Split the file into 5 sub-components** along the section anchors listed above.

Items 1, 2, 7, 8 are frontend-only and depend on the BE PRs in order. Items 3–6 are independent backend PRs and can land in parallel.
