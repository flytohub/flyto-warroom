# Flyto2 Code — API Response Field Map

> **Phase 1：scoring + posture + cross-dim stack**（A3 / Section C #4 / P1-G readers / PR4 直接影響範圍）
>
> Phase 2（pending）：repos / pentest / autofix / findings / mitigations / vendors / attack-paths / verify / scoring-audit / asset-evidence / kernel-asset-map / discovery-runs / unified-finding …
>
> Phase 3（pending）：threat-intel / footprint / brand-protection / VA report / reports（外掛 datasource）/ org-events SSE payload / settings tabs（webhooks / sla-policies / scan-schedules / credentials / API keys / monitoring）…

Pair with `docs/PAGES_API_MAP.md`（page → API）和 `docs/FRONTEND_BACKEND_IS_TRUTH_HANDOFF.md`（哪些欄位前端禁止重算）。

---

## Hard rules（A3 scoring contract — 違反 = bug）

1. `0` = real score（真正算出來的零分），**不是**「沒分數」。一個 fully-broken 但有 evidence 的 surface 可以合法地拿到 0/F。
2. `null` + `score_available === false` = no data。**唯一**合法的「沒分數」訊號，由 backend 統一發出。
3. Frontend **MUST NOT** infer no-data from `score === 0`、`grade === ""`、`grade === "?"`、`grade === "F"`、`grade === "--"`、`raw === 0 && display === 250`。
4. Frontend **MUST NOT** fallback render `"?"` / `"F"` / `"--"` / 灰底 0 分 / 灰底 250 分；`score_available=false` ⇒ render explicit no-score empty state（顯示 `message` 或依 `no_score_reason` 查 i18n）。
5. `score_available` 是**唯一**可信的 gate，**不要**用 `score != null && score > 0` 自己合成；也不要用 `?? 0` / `?? 250` / `?? '--'` 在 score / grade / display 欄位 — 直接 branch 在 `score_available`。
6. `mode` (`external` / `internal` / `combined`) 決定哪些 category 該渲染。**沒設定** mode ⇒ render combined，**不要** assume 兩個 dimension 都有資料（違反 `feedback_scoring_modes`）。

---

## 圖例

- **Status**:
  - `contract` — backend 穩定欄位，frontend 可放心吃
  - `new (A3 backend landed, frontend pending)` — A3 已落地、TS / consumer 尚未對接，文件先寫死
  - `new (A3)` — A3 全新欄位，TS 與 consumer 都待補
  - `changed (A3)` — 舊欄位，A3 把 nullable 語意改了（null 變成「no data」訊號）
  - `legacy fallback` — A3 之後要砍的舊欄位（aggregated / health_summary 的 avg_score / avg_grade）
  - `deprecated` — 已標 deprecated、未來移除
  - `frontend-derived` — 前端自己算的、不在 wire 上，列出來提醒「不該算的不要算」
  - `unknown` — 找不到 type 定義或 backend 行為不明
- **Source**: `external` / `code` / `cloud` / `container` / `shared (kernel)` / `report`
- **Purpose**: `display` / `filter` / `sort` / `chart` / `badge` / `count` / `route param` / `permission gate` / `gate(empty-state)` / `join key` / `evidence` / `cross-dim`
- **Empty behavior**: 描述 component 拿到 null / undefined / 0 時實際做什麼，**並標出**「用 0 / "F" / "?" 代表 no data」這種 A3 違規

---

## GET /api/v1/code/orgs/{id}/computed-score

TS type: `lib/engine/scoring/scoring.ts → ComputedScoreResponse`（含 `ComputedCategoryServer` / `ComputedSubVectorServer` / `DrillScoreServer` / `RepoScoreResultServer` / `ScoringExplanationServer`）

Backend 端責任：unified scoring engine 的權威輸出（B1 backend-truth）。**重要：A3 預計加入 `score_available` / `no_score_reason` / `message` 但 TS 還沒對應**。

| Field | Used by (file) | Purpose | Nullable | Empty behavior | Source | Status |
|---|---|---|---|---|---|---|
| `score_available` | _(A3 — 所有 consumer 待補)_ | gate(empty-state) | false | false ⇒ 不渲染 gauge / breakdown / badge，改 render no-score empty state | shared (kernel) | new (A3 backend landed, frontend pending) |
| `no_score_reason` | _(A3 — 所有 consumer 待補)_ | display | true | enum: `bootstrap` / `insufficient_data` / `surface_disabled`；查 i18n 顯示文案 | shared (kernel) | new (A3) |
| `message` | _(A3 — 所有 consumer 待補)_ | display | true | 直接顯示 backend 翻譯好的文案；不要 `?? '—'` | shared (kernel) | new (A3) |
| `overall_raw` | compounds/dashboard/DashboardView.tsx:58, compounds/dashboard/ScoreTrendChart.tsx:60, compounds/scoring/ScoringView.tsx:143, compounds/scoring/ScoreTrendsView.tsx:190,236, compounds/dashboard/CrossDimNetwork3D.tsx, compounds/exposure/PostureOverview.tsx (via computeCorpusPercentile), compounds/repos/RepoListView.tsx (via useRepoScores) | display / chart / 0-100 input to `displayScore()` | true | A3 後只在 `score_available=false` 時 null。**現況違規**：DashboardView `?? server?.avg_score ?? 0`、ScoreTrendsView `?? 0`、ScoreTrendChart `?? 0` — 都把 null 當 0 渲染 | shared (kernel) | changed (A3) |
| `overall_display` | compounds/scoring/ScoreTrendsView.tsx:171, compounds/dashboard/ScoringBreakdown.tsx:111, app/(control-panel)/.../OrgCard.tsx:92, compounds/dashboard/ScoreTrendChart.tsx:61 | display（250-900 已換算） | true | A3 後只在 `score_available=false` 時 null。**現況違規**：OrgCard `?? 250`（fake 250 floor）、ScoringBreakdown `?? displayScore(avgScore)`（合成 fallback）、ScoreTrendChart `?? 0` | shared (kernel) | changed (A3) |
| `overall_grade` | compounds/dashboard/DashboardView.tsx:59, compounds/scoring/ScoringView.tsx:146, compounds/scoring/ScoreTrendsView.tsx:166, compounds/dashboard/ScoringBreakdown.tsx:112, app/(control-panel)/.../OrgCard.tsx:91, compounds/dashboard/ScoreTrendChart.tsx:62 | display / badge | true (server 在 no-score 時送 "")/string | A3 後只在 `score_available=false` 時 null。**現況違規**：DashboardView `?? '--'`、ScoreTrendsView `?? '—'`、OrgCard `?? '--'`、useRepoScores.getRepoScore `?? { grade: '--', ... }` | shared (kernel) | changed (A3) |
| `overall_grade_color` | compounds/scoring/ScoringView.tsx:146 | display (hex) | false (預設 `'#94a3b8'`) | server 給空字串時前端 `\|\| '#94a3b8'` — 灰色 swatch | shared (kernel) | contract |
| `active_count` | compounds/scoring/ScoringView.tsx:148 | display "{active}/{total} sub-vectors" | false | 0 = 沒任何 sub-vector 啟用；應與 `score_available=false` 配對 | shared (kernel) | contract |
| `total_count` | compounds/scoring/ScoringView.tsx:149 | display | false | — | shared (kernel) | contract |
| `mode` | compounds/scoring/ScoringView.tsx (透過 mapServerResult), reports `SCORING_REPORT_SOURCES` (line 331) | gate(empty-state) / display | false | enum `external` / `internal` / `combined`；決定哪些 category 該渲染（見 Hard rule #6） | shared (kernel) | contract |
| `categories[]` | compounds/scoring/ScoringView.tsx, compounds/dashboard/ScoringBreakdown.tsx:116 | chart / breakdown | false (可空陣列) | 空陣列 ⇒ no category；ScoringBreakdown 此時 fallback 到 local heuristic（**B1/M2 違規**，見 dangerous patterns） | shared (kernel) | contract |
| `categories[].id` | ScoringView, ScoringBreakdown | join with `CATEGORY_META` | false | — | shared (kernel) | contract |
| `categories[].label` | 同上 | display | false | i18n fallback | shared (kernel) | contract |
| `categories[].weight` | ScoringBreakdown:122 | display | false | — | shared (kernel) | contract |
| `categories[].effective_weight` | ScoringBreakdown:127 | display (重分配後權重) | false | — | shared (kernel) | contract |
| `categories[].color` | ScoringView, ScoringBreakdown | display | false | — | shared (kernel) | contract |
| `categories[].raw` | ScoringView (mapServerResult), ScoringBreakdown, ScoreDimensions3D.tsx:74 | display | true | A3 後只在 `score_available=false` ⇒ null。ScoreDimensions3D `?? 0` ⚠️ | shared (kernel) | changed (A3) |
| `categories[].display` | ScoringView, ScoringBreakdown:183 | display (250-900) | true | 同上 | shared (kernel) | changed (A3) |
| `categories[].grade` | ScoringView, ScoringBreakdown, ScoreDimensions3D.tsx:75 | badge | true | ScoreDimensions3D `?? '-'` ⚠️ | shared (kernel) | changed (A3) |
| `categories[].grade_color` | ScoringView | display | false (`'#94a3b8'` fallback) | — | shared (kernel) | contract |
| `categories[].sub_vectors[]` | ScoringView mapServerResult | display / drill | false | — | shared (kernel) | contract |
| `categories[].sub_vectors[].mode` | ScoringView ModeBadge | badge | false | enum `scored` / `observing` / `context`；`observing` + `context` 永遠不算分（Hard rule） | shared (kernel) | contract |
| `categories[].sub_vectors[].drill_down_type` | ScoringView | route param | false | enum `repo` / `domain` | shared (kernel) | contract |
| `categories[].sub_vectors[].raw / display / grade / grade_color` | ScoringView | display | grade/raw/display: true | 同 category 規則 | shared (kernel) | changed (A3) |
| `categories[].sub_vectors[].repo_scores / domain_scores` | ScoringView drill | drill | true | undefined = 不展開該 tab | shared (kernel) | contract |
| `cross_dim.blast_radius_penalty` | ScoringView (mapServerResult) | cross-dim chip | false | 0 = 真實沒罰，不是 missing；mode=`external`/`internal` 時 backend 該送 0（gated by mode） | shared (kernel) | contract |
| `cross_dim.pr_adjacency_penalty` | 同上 | cross-dim chip | false | 同上 | code | contract |
| `cross_dim.taint_adjacency_penalty` | 同上 | cross-dim chip | false | 同上 | code | contract |
| `cross_dim.pentest_verdict_modifier` | 同上 | cross-dim chip | false | 同上 | code | contract |
| `cross_dim.autofix_coverage_bonus` | 同上 | cross-dim chip | false | 同上 | code | contract |
| `cross_dim.total` | 同上 | display | false | — | shared (kernel) | contract |
| `explanations[]` | ScoringView (mapServerResult) | drill explainer | true (`?`) | undefined ⇒ 不顯示 explainer panel | shared (kernel) | contract |
| `repo_scores[]` | hooks/useRepoScores.ts:32, compounds/dashboard/DashboardView.tsx:62 | top-risks list / per-repo grade map | true (`?`) | undefined ⇒ getRepoScore 拿到 default `{ grade: '--', raw: 0, display: 250, scorable: false }` ⚠️ A3 違規（用 250 當 sentinel） | code | contract |
| `repo_scores[].repo_id` | useRepoScores | join key | false | — | code | contract |
| `repo_scores[].raw / display / grade` | useRepoScores | display | false (但 scorable=false 時數值無意義) | A3 後 backend 該對 `scorable=false` 的 row 給 `null`；目前 frontend 用 `scorable` filter（DashboardView line 65） | code | contract |
| `repo_scores[].scorable` | DashboardView:65, useRepoScores | gate(empty-state) | false | false ⇒ 該 repo 跳過 top-risks list；**正確使用 pattern**，A3 的 `score_available` 是 org 級的這個 | code | contract |

### Consumers summary

- **ScoringView**（compounds/scoring/ScoringView.tsx）：唯一 full-fidelity consumer，吃 `categories / overall_* / cross_dim / explanations`，把 wire 轉成內部 `ScoringResult`。
- **DashboardView**：拿 `overall_raw / overall_grade / repo_scores` 餵 HealthGauge + Top Risks + 跨維度 tile（透過 `pulseItems`）。**hero gauge 同時 fallback 到 health-summary aggregated，是 B1 dual-truth bug**。
- **ScoringBreakdown**（compounds/dashboard/ScoringBreakdown.tsx）：computedScore 缺席時 fallback 到 local heuristic（securityScore/complexityScore/deadCodeScore），TODO 已標 M2，**等於前端自己再算一套分**。
- **ScoreTrendsView**：拿 `overall_raw / overall_grade / overall_display` 顯示 current grade + sector positioning。Fallbacks `?? 0` / `?? '—'`。
- **OrgCard**（projects 列表卡）：`overall_display ?? 250` + `overall_grade ?? agg?.avg_grade ?? '--'`。**最嚴重的 A3 違規**：250 = "F 下限分數" 被當成「沒分數」的 sentinel。
- **useRepoScores hook**：包裝 `repo_scores`，default `{ grade: '--', raw: 0, display: 250 }` 給沒分數的 repo。
- **ScoreTrendChart**：實際吃 unified-score-history 但 `overallRaw ?? overall_raw ?? 0`（snake/camel 雙吃 + zero fallback）。

### Dangerous patterns spotted (computed-score)

- `app/(control-panel)/flyto/projects/components/OrgCard.tsx:92` — `computedScore?.overall_display ?? 250` (A3 違規 — 用 250 floor 當「沒分數」)
- `app/(control-panel)/flyto/projects/components/OrgCard.tsx:91` — 三層 fallback `?? agg?.avg_grade ?? '--'`（B1 dual-truth + A3 違規）
- `components/compounds/dashboard/DashboardView.tsx:58-59` — `computedScore?.overall_raw ?? server?.avg_score ?? 0`（B1 dual-truth + A3 zero fallback）
- `components/compounds/dashboard/ScoringBreakdown.tsx:46-71,111` — 整套 local heuristic 在 computedScore 缺席時跑（B1/M2 違規，前端自己算分）
- `components/compounds/dashboard/ScoreTrendChart.tsx:60-62` — `overallRaw ?? overall_raw ?? 0` snake/camel 雙吃 + zero fallback
- `hooks/useRepoScores.ts:48` — default `{ grade: '--', display: 250 }` 把「沒分數的 repo」偽裝成「F 下限」
- `components/compounds/dashboard/ScoreDimensions3D.tsx:74-76` — `c.raw ?? 0` / `c.grade ?? '-'`（A3 違規）

---

## GET /api/v1/code/orgs/{id}/external-posture

TS type: `components/compounds/exposure/shared.ts → ExternalPosture`（注意：**這個 type 不在 lib/engine 底下**，違反「engine client 一處」慣例）

| Field | Used by (file) | Purpose | Nullable | Empty behavior | Source | Status |
|---|---|---|---|---|---|---|
| `score_available` | _(A3 — 所有 consumer 待補)_ | gate(empty-state) | false | false ⇒ hero card + 趨勢圖 + supply chain 改 render empty state | external | new (A3 backend landed, frontend pending) |
| `no_score_reason` | _(A3 — 所有 consumer 待補)_ | display | true | enum；對 external 而言常見 `surface_disabled`（沒連 domain）/ `bootstrap` | external | new (A3) |
| `message` | _(A3 — 所有 consumer 待補)_ | display | true | 直接顯示 | external | new (A3) |
| `org_id` | — | join key | false | — | external | contract |
| `domain_count` | compounds/exposure/PostureOverview.tsx | count / badge | false | 0 ⇒ render onboarding | external | contract |
| `avg_score` | compounds/exposure/PostureOverview.tsx:397,443,444,447,672, compounds/exposure/ScoreTrends.tsx, compounds/exposure/SLAMonitorView.tsx, compounds/exposure/SupplyChainView.tsx, compounds/exposure/DomainIntel.tsx | display / chart | false (server 在 no-score 時給 0) | **A3 違規**：PostureOverview 多處 `data?.avg_score ?? 0` 把 null 當 0；應 gate on `score_available` | external | changed (A3) |
| `avg_grade` | compounds/exposure/PostureOverview.tsx:350,389, compounds/dashboard/DashboardView.tsx (fallback) | display / badge | false (server 在 no-score 時給 "") | PostureOverview `GRADE_COLORS[data.avg_grade] ?? '#94a3b8'` 處理空字串；DashboardView 當 computedScore fallback | external | changed (A3) |
| `score_trend[]` | compounds/exposure/PostureOverview.tsx:675, compounds/exposure/ScoreTrends.tsx | chart | false (可空陣列) | 空陣列 ⇒ 不顯示 mini trend | external | contract |
| `score_trend[].date` | 同上 | x-axis | false | — | external | contract |
| `score_trend[].score` | 同上 | y-axis | false | — | external | contract |
| `score_trend[].grade` | 同上 | tooltip | false | — | external | contract |
| `score_trend[].domain` | 同上 | 可選 per-domain breakdown | true (`?`) | — | external | contract |
| `domains[]` | compounds/exposure/PostureOverview.tsx (domain table column), compounds/exposure/DomainIntel.tsx | list | false (可空陣列) | 空 ⇒ render empty domain panel | external | contract |
| `domains[].domain` | 同上 | join key / display | false | **危險**：用 domain 字串當 join key（vs canonical `resource_id`），會在 kernel 收斂時失效 | external | contract |
| `domains[].project_id` | 同上 | drill | false | — | external | contract |
| `domains[].score` | PostureOverview MiniTrendChart, DomainDetailPanel:955 | display | false | 0 = real low score；no-score 該由 `score_available` gate | external | changed (A3) |
| `domains[].grade` | 同上, line 916,952,958 | badge | false (string) | `GRADE_COLORS[domain.grade] ?? '#94a3b8'` | external | changed (A3) |
| `domains[].last_scanned` | 同上 | display | true (`?`) | undefined ⇒ "未掃描" | external | contract |
| `domains[].environment` | 同上 | filter | false | enum | external | contract |
| `domains[].asset_count` | 同上 | count | false | — | external | contract |
| `domains[].issue_count` | 同上 | count | false | — | external | contract |
| `domains[].changes_since_last` | 同上 | badge | false | — | external | contract |
| `domains[].pending_score / pending_grade / pending_observed_at / pending_consecutive` | PostureOverview (verifying badge) | badge "🔄 verifying" | true (`?`) | undefined ⇒ 不顯示 quarantine badge；對應 observation gate 的 tier-2 待確認態 | external | contract |
| `improvements[]` | compounds/exposure/PostureOverview.tsx | list | false (可空陣列) | — | external | contract |
| `open_issues[]` | compounds/exposure/PostureOverview.tsx | list | false (可空陣列) | — | external | contract |
| `next_scan_at / last_scan_at` | PostureOverview | display | true (`?`) | — | external | contract |
| `scan_cadence` | PostureOverview | display | false | — | external | contract |
| `sla_violations[]` | compounds/exposure/PostureOverview.tsx, compounds/dashboard/DashboardView.tsx:199-210, compounds/exposure/SLAMonitorView.tsx | list / count | false (可空陣列) | 空 = no breach；DashboardView `slaViolations.length === 0` 判斷 | external | contract |
| `action_plan[]` | compounds/exposure/PostureOverview.tsx, ActionPlanFull | list | false (可空陣列) | — | external | contract |
| `risk_summary.critical_count / high_count / medium_count / low_count` | PostureOverview.tsx:472-475 | bars | false | `?? 0` 是合理 fallback（count 0 ≠ no data） | external | contract |
| `risk_summary.sla_breaches` | PostureOverview.tsx:502,503, compounds/dashboard/DashboardView.tsx:388 | badge / count | false | DashboardView `?? 0` OK（count 不是 score） | external | contract |
| `risk_summary.score_change_7d / score_change_30d` | PostureOverview.tsx:410-413, 690-694 | trend chip | false | 0 = no change（不是 missing）；正負分別 icon | external | contract |
| `risk_summary.top_risk_domain / top_risk_score` | 對應 hero banner | display | false | — | external | contract |
| `supply_chain.total_vendors / critical_vendors / avg_risk_score / risk_level / top_risks[]` | compounds/exposure/SupplyChainView.tsx, compounds/dashboard/DashboardView.tsx:698 | display / count | true (`?` whole object) | DashboardView `supplyChain?.critical_vendors ?? 0` OK（count 0 ≠ no data） | external | contract |

### Consumers summary

- **PostureOverview**（exposure/PostureOverview.tsx）— 主消費端，9 個 useQuery 並行；data 用法散布在 hero card / domain table / trend chart / KPI tiles / DarkWebTab 五處。
- **DashboardView** — 取 `sla_violations` + `risk_summary` + `supply_chain.critical_vendors` 餵 hero banner 跟 cross-dim threat row。
- **ScoreTrends / SLAMonitor / SupplyChainView / DomainIntel** — 都重複呼叫 `getExternalPosture`，造成 4-5 個 component 各自切 same payload（M3 audit 已標待 backend 補 summary endpoint）。

### Dangerous patterns spotted (external-posture)

- `lib/engine` 沒這個 fetcher，被放在 `components/compounds/exposure/shared.ts` — engine client boundary 漏網之魚
- `domains[].domain` 被當 join key — 違反 canonical `resource_id` 規則
- `data?.avg_score ?? 0` 在 PostureOverview.tsx:443-444 ⚠️ A3 違規
- 4-5 個 compound 各自重抓 external-posture（waste + cross-component race），M3 待 backend 補 summary slice

---

## GET /api/v1/code/orgs/{id}/health-summary

TS type: `lib/engine/code/repos.ts → OrgHealthSummaryResponse`（含 `RepoHealthSummary` / `OrgHealthAggregated`）

| Field | Used by (file) | Purpose | Nullable | Empty behavior | Source | Status |
|---|---|---|---|---|---|---|
| `score_available` | _(A3 — 所有 consumer 待補)_ | gate(empty-state) | false | false ⇒ org card / dashboard hero 改 render empty；對 internal-only 空 repo 尤其關鍵 | code | new (A3 backend landed, frontend pending) |
| `no_score_reason` | _(A3 — 所有 consumer 待補)_ | display | true | enum；常見 `bootstrap`（剛連 repo 還沒掃）/ `surface_disabled`（沒 repo） | code | new (A3) |
| `message` | _(A3 — 所有 consumer 待補)_ | display | true | 直接顯示 | code | new (A3) |
| `repos[]` | compounds/repos/RepoListView.tsx, app/(control-panel)/.../OrgCard.tsx:103 (last-scan calc), compounds/dashboard/DashboardView.tsx (healthRepos), compounds/dashboard/ScoringBreakdown.tsx (local heuristic fallback) | list / per-repo metrics | false (可空陣列) | 空 ⇒ DashboardView 仍渲 hero（用 aggregated）；RepoListView 顯示 onboarding | code | contract |
| `repos[].repo_id` | 多處 | join key | false | — | code | contract |
| `repos[].project_type` | RepoListView | filter | false | — | code | contract |
| `repos[].scanned_at` | OrgCard.tsx:103-108 (latest 計算) | display | true (`?`) | undefined ⇒ "Never scanned"；OrgCard 抓全 repo 最新一筆 | code | contract |
| `repos[].secret_count / security_findings / complex_functions / dead_code_count / cve_critical / cve_high / cve_total / license_issues / alert_total / alert_resolved` | ScoringBreakdown.tsx:46-71 (heuristic), DashboardView.tsx:358-362 (size calc), RepoListView severity dots | count / heuristic input | true (各 `?`) | `?? 0` 在 count 欄位是 OK；**但 ScoringBreakdown 拿來算 securityScore/complexityScore/deadCodeScore 是 B1/M2 違規** | code | contract |
| `repos[].autofix_eligible` | _(待用)_ | count | true | — | code | contract |
| `repos[].mttr_hours / mttr_median_hours / mttr_sample_size` | RepoListView (隱含) | display | true | — | code | contract |
| `repos[].display_score` | _(B1 backend-truth — 已存在但 frontend 多半繞道 useRepoScores)_ | display (250-900) | true (`?`) | 注釋寫死「絕對不可 displayScore() 二次換算」；A3 後與 `score_available` 配對 | code | contract → changed (A3) |
| `repos[].grade` | _(同上)_ | badge | true (`?`) | A3 後與 `score_available` 配對 | code | contract → changed (A3) |
| `scanned_count` | DashboardView.tsx:83, OrgCard.tsx:90, RepoListView | count / gate（>0 才顯示 hero） | false | 0 ⇒ render onboarding，**這是合理的 implicit score_available gate 之一**（但不該作主要 gate） | code | contract |
| `total_count` | DashboardView.tsx:84 | count | false | — | code | contract |
| `aggregated.avg_score` | DashboardView.tsx:58, OrgCard.tsx:91 (二級 fallback) | display (legacy fallback for computedScore) | false (server: 0 when no scan) | **A3 違規 + B1 dual-truth**：當 `computedScore.overall_raw` 缺席時 fallback 到此值，造成 hero 顯示 0 = "looks like score 0" | code | legacy fallback |
| `aggregated.avg_grade` | DashboardView.tsx:59, OrgCard.tsx:91 | display (legacy fallback) | false (server: "--" when none) | OrgCard 寫 `agg?.avg_grade !== '--' ? agg?.avg_grade : undefined`（已知 sentinel）；A3 後該整段砍 | code | legacy fallback |
| `aggregated.grade_dist` | DashboardView.tsx:77 | chart | false | `?? { A:0, B:0, C:0, D:0, F:0 }` | code | contract |
| `aggregated.at_risk_count / secure_count / critical_count / high_count` | DashboardView.tsx:78-81, OrgCard.tsx:93-95 | count / SeverityDot | false | `?? 0` 是 count 欄位 → OK | code | contract |
| `aggregated.top_risks[]` | DashboardView (early version, now用 computedScore.repo_scores) | top risk list | true (`?`) | 注釋警告 `score` 是 raw 0-100（不是 display 250-900）— 與 `display_score` 命名混淆 | code | legacy fallback |
| `active_scan_count` | RepoListView (Scan-All 鎖) | gate | true (`?`) | `> 0` ⇒ Scan-All disabled 鎖直到沒 in-flight 掃描 | code | contract |

### Consumers summary

- **DashboardView**：hero gauge 主訊源是 `computedScore.overall_raw`，**fallback 到 `aggregated.avg_score / avg_grade`** — A3 後須移除這條 fallback。
- **OrgCard**：與 DashboardView 一樣的雙路 fallback pattern，A3 違規同源。
- **RepoListView**：吃 `repos[]` 顯示 per-repo grade（grade 主要走 `useRepoScores` 從 computed-score 拿，不直接吃 `display_score`）+ `active_scan_count` 鎖 Scan-All。
- **ScoringBreakdown**：拿 count 欄位算 local heuristic — 已標 M2 移除。

### Dangerous patterns spotted (health-summary)

- 同 computed-score 的 OrgCard / DashboardView fallback chain（已列）
- `aggregated.top_risks[].score` 命名語意是 raw 0-100，但 `repos[].display_score` 是 250-900，**同一個 response 內 score 欄位語意不一致**

---

## GET /api/v1/code/orgs/{id}/pulse

TS type: `lib/engine/code/issues.ts → PulseResponse`（含 `PulseItem`，與 `EnrichedAlert` 共用 cross-dim 欄位）。

備註：pulse 不直接給 org-level score，是「ranked feed」；A3 對 pulse 影響較小（不需 `score_available`），但個別 item 的 `blast_radius` 仍是計算欄位。

| Field | Used by (file) | Purpose | Nullable | Empty behavior | Source | Status |
|---|---|---|---|---|---|---|
| `items[]` | compounds/pulse/PulseView.tsx:122, compounds/dashboard/DashboardView.tsx:197 (pulseItems), compounds/layout/AiPanelHotFindings.tsx, compounds/layout/AiPanelBriefing.tsx, compounds/fix-queue/FixQueueDrawer.tsx, compounds/dashboard/CrossDimNetwork3D.tsx | list / cross-dim | false (可空陣列) | 空 ⇒ render empty state；DashboardView `pulseData?.items ?? []` OK | shared (kernel) | contract |
| `items[].id` | 多處 | join | false | — | shared (kernel) | contract |
| `items[].source` | PulseView (icon + colour), reports source field | discriminator / filter | false | enum `alert` / `container` / `iac` / `license` / `dast` / `pentest` | shared (kernel) | contract |
| `items[].severity` | PulseView, DashboardView crossDim filter | filter / sort | false (string) | `.toLowerCase()` 比對；DashboardView line 228 | shared (kernel) | contract |
| `items[].title` | PulseView | display | false | — | shared (kernel) | contract |
| `items[].description` | PulseView | display | true (`?`) | — | shared (kernel) | contract |
| `items[].repo_id` | PulseView (route) | route param | true (`?`) | — | code | contract |
| `items[].file_path / line_number / category / status` | PulseView | display / nav | true (`?`) | — | code | contract |
| `items[].created_at` | PulseView newItemIds (line 146), reports source | filter (new-since) | false | Date.parse；NaN 處理 | shared (kernel) | contract |
| `items[].blast_radius` | PulseView line 553,864,876,883,884, CrossDimNetwork3D:235, DashboardView crossDim | sort / chart | false (server 0..100) | **多處 `?? 0` ⚠️**：合理（0 = real low blast），但因 backend 一定送、`??` 是死碼 | shared (kernel) | contract |
| `items[].open_prs_touching[]` | PulseView line 162-165, DashboardView line 234, IssuesView ContextStrip | cross-dim chip | true (`?`) | undefined ⇒ 不顯示 PR chip | code | contract |
| `items[].taint_adjacency` | PulseView line 167, DashboardView line 233 | cross-dim chip | true (`null`) | null ⇒ 沒 taint flow | code | contract |
| `items[].autofix_eligible` | PulseView line 176, DashboardView line 235 | cross-dim chip / filter | true (`?`) | undefined ≠ false | code | contract |
| `items[].pentest_verdict` | PulseView line 168, DashboardView line 236 | cross-dim chip | true (`null`) | null ⇒ 沒 pentest result | code | contract |
| `items[].fingerprint` | PulseView open-finding-panel | route param | true (`?`) | 只有 source=`alert` 才有 | code | contract |
| `items[].extra` | PulseView (image_ref / package_name / cve_id...) | display | true (`?`) | `Record<string, string>` | shared (kernel) | contract |
| `count` | PulseView | count | false | — | shared (kernel) | contract |

### Consumers summary

- **PulseView**：主消費端，做 stats + grouping + sort + NEW-badge。
- **DashboardView**：跨維度 tile 計數（reachable / openPR / autofix / pentestVerified）— 對 hot=critical+high 子集算 AND。
- **AiPanel / FixQueueDrawer / CrossDimNetwork3D**：周邊 read-only consumer。

### Dangerous patterns spotted (pulse)

- `blast_radius ?? 0` 死碼（backend 必送）— 不影響但顯示 frontend 對 contract 信心不足
- `compounds/pulse/PulseView.tsx:128` 有 TODO(M5)：嚴重度 filter 該移到 server，避免 filtered set 內 cross-dim ranking 失真

---

## GET /api/v1/code/orgs/{id}/benchmark

TS type: `lib/engine/scoring/scoring.ts → BenchmarkData`（fetcher `getOrgBenchmark` 在 catch 後回 `null`）

備註：A3 對 benchmark 的影響：`org_score` 與 computed-score 的 `overall_display` 必須同源；A3 後 backend 該在 no-score 時直接讓 endpoint 404 / 給 empty payload，而**不是**送 `org_score=0`。

| Field | Used by (file) | Purpose | Nullable | Empty behavior | Source | Status |
|---|---|---|---|---|---|---|
| `score_available` | _(A3 — benchmark 是否要 gate 待 backend 設計)_ | gate(empty-state) | — | _(待補)_ | shared (kernel) | new (A3 backend landed, frontend pending) |
| `org_score` | compounds/scoring/BenchmarkCard.tsx:52,120,131 | display (250-900) | false | benchmark fetcher catch→null 已含 no-score 情境 | shared (kernel) | changed (A3) |
| `percentile` | BenchmarkCard:52,54 | display | false | `topPct = 100 - percentile` | shared (kernel) | contract |
| `sector` | BenchmarkCard:52,69 | display / chip | false | — | shared (kernel) | contract |
| `benchmark.p25 / p50 / p75 / p90` | BenchmarkCard:97-100,105-108 | chart markers | false | line 53 已 `if (!bm) return null`，A3 應該由上層 `score_available` gate | shared (kernel) | contract |
| `benchmark.sample_size` | BenchmarkCard:133 | display | false | — | shared (kernel) | contract |
| `comparison` | BenchmarkCard:52,57 | display / icon | false | enum `above` / `below` / `equal` | shared (kernel) | contract |
| `display_text` | BenchmarkCard:86 | display | false | backend 翻譯好直接顯示 | shared (kernel) | contract |

### Consumers summary

- **BenchmarkCard**（compounds/scoring/）：顯示 distribution bar + org marker。catch→null 已處理 no-data，但**沒 gate** on A3 `score_available`，所以 backend 仍可能 送 `org_score=0` ⇒ 畫在 250 點上（marker 邊緣 sliver）。
- **PostureOverview**、**ScoreTrendsView** 也有 `useQuery(['benchmark'])` / `getOrgBenchmark` 各自 cached（雙抓）。

### Dangerous patterns spotted (benchmark)

- BenchmarkCard 沒 A3 gate，依賴 fetcher catch→null + `!bm` early-return
- 多個 component 重複呼叫 `getOrgBenchmark`（PostureOverview / BenchmarkCard / DashboardView 透過 peer）

---

## GET /api/v1/code/orgs/{id}/score-events

TS type: `lib/engine/scoring/scoring.ts → { events: ScoreEvent[] }`

備註：score-events 是 grade-change timeline，本身沒 `score_available` 概念，但 `from_score / to_score === 0` 仍是 real score（A3 規則 #1）。

| Field | Used by (file) | Purpose | Nullable | Empty behavior | Source | Status |
|---|---|---|---|---|---|---|
| `events[]` | compounds/scoring/ScoreTrendsView.tsx:109, compounds/dashboard/DashboardView.tsx:213 (momentum7d), compounds/dashboard/ScoreTrendChart.tsx:50, compounds/dashboard/ScoreTrendPage.tsx, compounds/dashboard/ScoreTrendChart.tsx, compounds/domains/DomainScoreTrend.tsx, reports `SCORING_REPORT_SOURCES` (id `score-events`) | timeline / chart annotation | false (可空陣列) | 空 ⇒ "No grade changes in 90 days" | shared (kernel) | contract |
| `events[].date` | 多處 | x-axis / sort | false | Date.parse | shared (kernel) | contract |
| `events[].from_grade / to_grade` | ScoreTrendsView TimelineRow, ScoreTrendChart annotations | display / badge | false | — | shared (kernel) | contract |
| `events[].from_score / to_score` | ScoreTrendsView TimelineRow, DashboardView momentum delta | display / delta calc | false | DashboardView `(e.to_score - e.from_score)` 算 7d totalDelta | shared (kernel) | contract |
| `events[].direction` | ScoreTrendsView (icon + tone), DashboardView | display / count | false | enum `upgrade` / `downgrade` / `stable` | shared (kernel) | contract |
| `events[].reasons[]` | ScoreTrendsView TimelineRow:390 | tooltip / display | false (可空陣列) | 空 ⇒ 不顯示 reasons line | shared (kernel) | contract |

### Consumers summary

- **ScoreTrendsView**：主消費端，timeline + 7-day delta。
- **DashboardView**：7d momentum strip。
- **ScoreTrendChart**：把 events 當 annotation 疊在 unified-score-history 折線上。
- **DomainScoreTrend**：用對應的 per-pentest endpoint（`/code/pentests/{projectId}/score-events`），同 type。

### Dangerous patterns spotted (score-events)

- `from_score === 0 && to_score === 0 && direction === 'stable'` 是「持平 0 分」的合法事件，但 UI 可能誤判為「無變動」— A3 對此 unaffected（events 本身沒 gate）

---

## GET /api/v1/code/orgs/{id}/peer-baseline?sector=

TS type: `lib/engine/ctem/upstreamData.ts → PeerBaselineResponse`（含 `PeerBaselineSnapshot`）

備註：這個 endpoint 已遷到 `openapi-fetch` typed client（line 117-132）— 是首個 typed migration。

| Field | Used by (file) | Purpose | Nullable | Empty behavior | Source | Status |
|---|---|---|---|---|---|---|
| `org_id` | — | join | false | — | shared (kernel) | contract |
| `sector` | compounds/scoring/ScoreTrendsView.tsx, compounds/exposure/PostureOverview.tsx | display / chip | false | — | shared (kernel) | contract |
| `metric` | _(隱含)_ | display | false | — | shared (kernel) | contract |
| `latest` | compounds/dashboard/DashboardView.tsx:252-258 (sectorPosition), compounds/scoring/ScoreTrendsView.tsx:193, compounds/exposure/PostureOverview.tsx:443 (computeCorpusPercentile) | map percentile→snapshot | false (可空 object) | `peerData?.latest[50]?.value` / `[90]?.value` 安全 chain | shared (kernel) | contract |
| `latest[N].percentile` | 同上 | display | false | N=50/75/90 | shared (kernel) | contract |
| `latest[N].value` | 同上 | display / 比較 org score | false | DashboardView 用 `score >= p90/p50` 算 sector position | shared (kernel) | contract |
| `latest[N].corpus_size` | PostureOverview.tsx:448,452 | display "(n=X)" | false | `?? 0` ⚠️（count 0 = real "no sample"，OK） | shared (kernel) | contract |
| `latest[N].corpus_version` | PostureOverview tooltip | display | false | `?? 'v1'` fallback | shared (kernel) | contract |
| `latest[N].snapshot_date` | PostureOverview, ScoreTrendsView | display | false | — | shared (kernel) | contract |
| `latest[N].source` | _(內部稽核)_ | metadata | false | — | shared (kernel) | contract |
| `history[]` | _(尚無 consumer)_ | chart | false (可空陣列) | — | shared (kernel) | contract |

### Consumers summary

- **DashboardView**：sectorPosition chip（Top 10% / Above median / Below median）— 需要 `computedScore.overall_raw` 才能比對，**所以間接受 A3 影響**：org no-score 時不該渲染 chip。
- **ScoreTrendsView**：SectorBaselineCard 顯示 P50/P90 + own score；行為已 gate on `orgScore != null`，但 `orgScore = overall?.overall_raw ?? 0` 仍 zero-fallback。
- **PostureOverview**：corpus percentile chip。

### Dangerous patterns spotted (peer-baseline)

- DashboardView `sectorPosition` 需要 `computedScore` + `peerData` 同時 ready，A3 後該優先 gate on `computedScore.score_available`，不該繼續 `overall_raw ?? 0`
- 三個 compound 各自 useQuery `['peer-baseline', orgId, sector]` — staleTime 一致但仍 3 次 cache miss

---

## GET /api/v1/code/orgs/{id}/leak-exposure

TS type: `lib/engine/scoring/scoring.ts → LeakExposureResponse`（含 `DomainLeakExposure` / `LeakBreach`）

備註：leak-exposure 是 dark-web HIBP 計數，本身沒 score；A3 不直接觸這個 endpoint，但若 `hit_count === 0` 表示 0 個 breach，是 real value（不是 missing）。

| Field | Used by (file) | Purpose | Nullable | Empty behavior | Source | Status |
|---|---|---|---|---|---|---|
| `org_id` | — | join | false | — | external | contract |
| `domain_count` | _(隱含)_ | count | false | — | external | contract |
| `hit_count` | compounds/dashboard/DashboardView.tsx:699 | count / badge | false | `leakData?.hit_count ?? 0` OK | external | contract |
| `total_pwned` | compounds/exposure/PostureOverview.tsx:1102, DarkWebTab | count / display | false | — | external | contract |
| `domains[]` | compounds/exposure/PostureOverview.tsx:1082 (filter breach_count > 0), DarkWebTab list | list | false (可空陣列) | 空 ⇒ "no breach" | external | contract |
| `domains[].domain` | 同上, line 1141 | join key / display | false | **危險**：domain 字串 join | external | contract |
| `domains[].breach_count` | PostureOverview line 1082, 1141 | filter / count | false | `> 0` filter | external | contract |
| `domains[].total_pwned` | PostureOverview:1145 | count | false | `.toLocaleString()` | external | contract |
| `domains[].worst_breach` | PostureOverview detail | display | true (`?`) | undefined ⇒ 不展開細節 | external | contract |
| `domains[].sensitive_hit` | PostureOverview line 1128,1133 | badge | false | 紅色邊條 | external | contract |
| `domains[].last_breach_at / fetched_at` | DarkWebTab | display | true (`?`) / false | — | external | contract |
| `generated_at` | _(metadata)_ | freshness | false | — | external | contract |

### Consumers summary

- **DashboardView**：External Threat Snapshot 取 `hit_count`。
- **PostureOverview / DarkWebTab**：完整 domain breakdown。

### Dangerous patterns spotted (leak-exposure)

- 同上 — `domains[].domain` 當 join key

---

## GET /api/v1/code/orgs/{id}/attack-surface[?enrich=true]

TS type: `lib/engine/code/pentest.ts → AttackSurfaceResponse` 或 `EnrichedAttackSurfaceResponse`（enrich=true 時加 cross-dim 欄位）

備註：attack-surface 本身**沒分數**，是 assets 列表，但 enrich=true 後每個 asset 帶 `blast_radius` — A3 對 score 無感，但 enrich 版的 cross-dim 規則同 pulse。

| Field | Used by (file) | Purpose | Nullable | Empty behavior | Source | Status |
|---|---|---|---|---|---|---|
| `assets[]` | compounds/domains/DomainsView.tsx (getEnrichedAttackSurface), compounds/asset-map/AssetMapView.tsx, compounds/dashboard/DashboardView.tsx:113 (domainData), compounds/exposure/PostureOverview.tsx:178 (allAssets), compounds/exposure/BrandProtectionView.tsx, compounds/atoms/DomainAssetTierPicker.tsx, compounds/atoms/DomainBUAssignChip.tsx, compounds/atoms/DomainComplianceScopePicker.tsx | list / cross-dim | false (可空陣列) | 空 ⇒ render empty domain list | external | contract |
| `assets[].id` | 多處 | join | false | — | external | contract |
| `assets[].project_id` | DomainsView buildDomainRows | drill | true (`?`) | undefined = older row（pre-column） | external | contract |
| `assets[].asset_type` | 多處 (PostureOverview countByType filter), DomainsView | filter / display | false | enum: `subdomain` / `domain` / `ip` / `lookalike` / `phishing_url` / `stealer_log_hit` / `suspicious_cert` / `saas_posture` / ... | external | contract |
| `assets[].value` | 多處 | display / join key | false | **危險**：當 domain string join；A3/P5 收斂後該用 `resource_id` | external | contract |
| `assets[].metadata` | DomainsView parseProviderChain, PostureOverview JSON.parse for `resolves`, BrandProtectionView | structured data | false (JSON string) | parse 失敗 → return null/empty | external | contract |
| `assets[].status` | DomainsView | filter | false | — | external | contract |
| `assets[].discovered_at` | DomainsView | display / sort | false | — | external | contract |
| `assets[].asset_tier` | PostureOverview quickCounts.crownJewel, DomainAssetTierPicker | filter / chip | true (`?`) | undefined ⇒ default `internal` (server COALESCE) | external | contract |
| `assets[].compliance_scope` | DomainComplianceScopePicker | filter / chip | true (`?`) | JSON array text, empty `[]` | external | contract |
| `assets[].business_unit_id` | PostureOverview line 184 filter, DomainBUAssignChip | filter | true (`?`) | empty = unassigned | external | contract |
| `assets[].blast_radius` (enriched) | DomainsView via EnrichedAttackSurfaceAsset | cross-dim | true (`?`) | 同 pulse | shared (kernel) | contract |
| `assets[].open_prs_touching[]` (enriched) | 同上 | cross-dim | true (`?`) | 同 pulse | code | contract |
| `assets[].pentest_verdict` (enriched) | 同上 | cross-dim | true (`null`) | 同 pulse | code | contract |
| `aggregated.issue_count` | DomainsView (隱含) | count | true (`?`) | — | external | contract |
| `aggregated.pagespeed_avg.performance / accessibility / best_practices / seo / domain_count` | DomainsView PageSpeedAvg | display | true (`?` 整個 object) | — | external | contract |

### Consumers summary

- **DomainsView**：主消費端，吃 enriched 版做 buildDomainRows + cross-dim ContextStrip。
- **PostureOverview**：吃 raw 版做 countByType（KEV / Crown Jewel / threat actor / phishing / stealer log / suspicious cert / SaaS posture / auth-verified DAST 八種 KPI）。
- **AssetMapView**：4-surface 收斂 view，已知 collapse bug（per-surface scores 被合一）。
- **DashboardView / BrandProtectionView**：周邊 read-only consumer。
- **DomainAssetTierPicker / DomainBUAssignChip / DomainComplianceScopePicker**：tier / BU / compliance 編輯 widget。

### Dangerous patterns spotted (attack-surface)

- `assets[].value` 被當 domain join key（多處）
- PostureOverview 做 8 種 countByType 在 client side — M3 待 backend 補 summary endpoint
- AssetMapView per-surface score collapse（asset-map handler 已知 bug，待 P5/P6 修）

---

## GET /api/v1/code/orgs/{id}/ctem/priorities

TS type: `lib/engine/ctem/ctem.ts → CTEMPriorityResponse`（含 `CTEMPriorityItem` / `PriorityBreakdown` / `ImpactEstimate`）

備註：ctem/priorities 是 finding ranking，本身沒 org-level score；`priority_score` 是 per-item 0-100。

| Field | Used by (file) | Purpose | Nullable | Empty behavior | Source | Status |
|---|---|---|---|---|---|---|
| `org_id / count` | 多處 | metadata | false | — | code | contract |
| `items[]` | compounds/exposure/CTEMActionsView.tsx:222, compounds/exposure/PostureOverview.tsx:125, compounds/exposure/MitigationsView.tsx:162, compounds/exposure/SLAMonitorView.tsx:43, compounds/exposure/CTEMActionsDetail.tsx (FindingDetailPanel), compounds/dashboard/DashboardView.tsx:159 (ctemItems) | list / count | false (可空陣列) | 空 ⇒ render empty bench | code | contract |
| `items[].kind` | CTEMActionsView | discriminator | false | enum `external` / `code` | code | contract |
| `items[].id / fingerprint` | 多處 | join / route | false | — | code | contract |
| `items[].title / description` | 多處 | display | false | — | code | contract |
| `items[].severity / effective_severity` | sortBy SEV_RANK | sort / display | false | — | code | contract |
| `items[].priority_score` | CTEMActionsView sortBy:97-98 | sort | false | 0-100 | code | contract |
| `items[].category` | 多處 | filter | false | — | code | contract |
| `items[].domain` | external row link | route | true (`?`) | — | external | contract |
| `items[].repo_id` | code row link | route | true (`?`) | — | code | contract |
| `items[].asset_tier` | DashboardView line 245 (crown count), PostureOverview line 193 | filter / chip | false | enum | code | contract |
| `items[].kev_listed` | DashboardView line 244, PostureOverview line 192 | filter / chip | false | — | code | contract |
| `items[].epss_score` | CTEMActionsView sortBy:103 | sort tie-break | false | 0..1 | code | contract |
| `items[].mitigation_factor` | display | display | false | 0..0.85 capped | code | contract |
| `items[].sla_hours / sla_breach_at / breached` | SLAMonitorView, CTEMActionsView sortBy `sla` | sort / display | sla_breach_at: true (`?`) | breached=true 優先排前 | code | contract |
| `items[].assigned_to` | CTEMActionsView | display | true (`?`) | — | code | contract |
| `items[].verification_state` | CTEMActionsView | filter / badge | false | enum | code | contract |
| `items[].first_seen_at` | CTEMActionsView sortBy:106 | sort tie-break | false | Date.parse | code | contract |
| `items[].verification_method` | PostureOverview line 203-204 (authVerified / activeVerified count) | filter / badge | true (`?`) | enum 4-tier；undefined = passive (default) | code | contract |
| `items[].impact` | CTEMActionsDetail | display (range + confidence) | true (`?`) | undefined ⇒ 不顯示 monetary impact panel | code | contract |
| `items[].impact.low_usd / mid_usd / high_usd / confidence / label / methodology / input_summary / benchmark_source` | 同上 | display | false | low/mid/high 是 USD | code | contract |
| `items[].marked_fixed_at / marked_fixed_by` | CTEMActionsView verify lifecycle | display | true (`?`) | undefined = never claimed | code | contract |
| `items[].threat_actor / threat_campaign` | DashboardView line 246, PostureOverview line 194 (count), CTEMActionsView display | filter / chip | true (`?`) | external-only | external | contract |
| `items[].recommendation / fix_steps[]` | CTEMActionsDetail | display | true (`?`) | external-only | external | contract |
| `items[].priority_breakdown` | CTEMActionsDetail PriorityBreakdownBar (audit B5) | chart | true (`?`) | undefined ⇒ 不展開 breakdown bar；`null` guard 必須 | code | contract |
| `items[].priority_breakdown.base_severity_weight / tier_multiplier / tier_contribution / exploit_multiplier / exploit_signal / exploit_contribution / mitigation_factor / mitigation_contribution / clamp_contribution` | 同上 | chart segments | false | sum 應 ≈ priority_score（含 clamp） | code | contract |
| `items[].affected_count` | CTEMActionsView dedup chip "×N" | display | true (`?`) | absent ⇒ 非 dedup response | code | contract |
| `sort` | CTEMActionsView (echo back) | display | true (`?`) | server echo of canonical key | code | contract |
| `deduped` | CTEMActionsView | gate "×N affected" 顯示 | false | backend 必送（true / false explicit） | code | contract |

### Consumers summary

- **CTEMActionsView**：主消費端，做 sort + filter + bulk actions。
- **PostureOverview**：KPI tile counts（kev / crownJewel / threatActor）。
- **DashboardView**：cross-dim threat row。
- **MitigationsView / SLAMonitorView / CTEMActionsDetail**：周邊 read-only / lifecycle。

### Dangerous patterns spotted (ctem/priorities)

- `sortBy(items, 'priority')` 4-層 tie-break ladder（CTEMActionsView:88-108）— B8 TODO 已標：`?sort=priority` 該 server-side
- `tierMultiplier()` + `criticalityMultiplier` client compute（ScoringView / PriorityBreakdownBar）— B5 已用 `priority_breakdown` 取代但 fallback 路徑還在

---

## GET /api/v1/code/orgs/{id}/issues?enrich=true

TS type: `lib/engine/code/issues.ts → EnrichedIssuesResponse`（含 `EnrichedSecurityIssue` = `SecurityIssue` + cross-dim 欄位）

備註：issues 是 per-finding 列表，本身沒 org-level score。enrich=true 加 cross-dim（同 pulse）。

| Field | Used by (file) | Purpose | Nullable | Empty behavior | Source | Status |
|---|---|---|---|---|---|---|
| `issues[]` | compounds/security/IssuesView.tsx:107-114, compounds/exposure/CTEMActionsView.tsx (code-side merge), compounds/security/IssuesSidebar.tsx (counts), compounds/security/SecurityOverview.tsx, compounds/security/finding_panel/ContextTab.tsx, OverviewTab, FixTab, UniversalFindingPanel, IssueHelpers, reports `ISSUES_REPORT_SOURCES` | list / count | false (可空陣列) | 空 ⇒ render empty issues board | code | contract |
| `issues[].id / fingerprint` | 多處 | join / verify route | false | fingerprint 是 dedup key | code | contract |
| `issues[].type` | IssuesView filter, IssueHelpers getTypeBadge | filter / badge | false | enum `cve` / `secret` / `security_finding` / `sast` 等 | code | contract |
| `issues[].severity` | IssuesView severity filter, sevChipProps | filter / badge | false | enum CRITICAL/HIGH/MODERATE/LOW | code | contract |
| `issues[].title / description` | 多處 | display | false | rollup row 用 i18n template 取代 title | code | contract |
| `issues[].package / version / fixed_in / cve_id / ecosystem / references / published_at` | IssuesView CVE row, FixTab, finding_panel | display | true (各 `?`) | CVE-only；undefined ⇒ 隱藏 row | code | contract |
| `issues[].repo_id / repo_name` | 多處 | join / route | false | — | code | contract |
| `issues[].status` | IssuesView counts:115-119 | filter / badge | false | enum `open` / `ignored` / `solved` / `snoozed` | code | contract |
| `issues[].source` | 多處 | display | false | enum `osv` / `flyto-indexer` | code | contract |
| `issues[].epss / epss_percentile / in_kev / external_exposed / risk_score` | IssueHelpers hasContextSignals, finding_panel | badge / display | true (各 `?`) | CVE enrichment；undefined = no enrichment available | code | contract |
| `issues[].rollup / count` | IssuesView 翻譯 rollup row | display template | true (`?`) | rollup=true ⇒ count 必存在 | code | contract |
| `issues[].blast_radius` (enriched) | IssuesView ContextStrip, CTEMActionsView | cross-dim badge | true (`?`) | undefined = no signal | shared (kernel) | contract |
| `issues[].open_prs_touching[]` (enriched) | IssuesView ContextStrip, finding_panel/ContextTab | cross-dim chip | true (`?`) | 同 pulse | code | contract |
| `issues[].taint_adjacency` (enriched) | finding_panel/ContextTab:15 | cross-dim chip | true (`null`) | `(issue.taint_adjacency.unsanitized_count ?? 0) > 0` | code | contract |
| `issues[].autofix_eligible` (enriched) | finding_panel/FixTab | cross-dim filter | true (`?`) | — | code | contract |
| `issues[].pentest_verdict` (enriched) | finding_panel/ContextTab | cross-dim chip | true (`null`) | — | code | contract |
| `counts.open / ignored / solved / total` | IssuesView (also recomputes), IssuesSidebar | tab count | false | IssuesView 線 116-120 重算 — **與 server `counts` 雙重 source（小 drift）** | code | contract |

### Consumers summary

- **IssuesView**：主消費端，吃 enriched 版。
- **CTEMActionsView**：code-side rows，merge 到 BenchItem 排序。
- **finding_panel 三個 tab + UniversalFindingPanel**：drill detail。
- **SecurityOverview**：count summary tile。
- **IssuesSidebar**：categories sidebar。

### Dangerous patterns spotted (issues)

- IssuesView line 116-120 **重算 `counts.open/snoozed/ignored/solved`** ignoring server `counts` field — 兩個 source 同個 truth，drift risk
- IssuesView line 108 `queryKey: ['issues', org?.id, 'enriched']` 與 reports source 用 `getEnrichedOrgIssues` 但 key 不同 — 同一份 data 進兩個 cache slot

---

## Cross-cutting dangerous patterns（actionable backlog）

> Phase 1 範圍 (11 endpoint) 掃到的 21 條，每條一個 action + owner。**修正順序＝Critical → High → Medium → Low**。修完一條請把 row 整列刪掉（不要劃線保留）。
>
> **Owner 圖例**：
> - `A3 frontend` — 直接違反 A3 no-score contract，要在 A3 frontend PR 改
> - `B1 dual-truth` — 違反 backend-is-truth，前端在重算後端已給的欄位
> - `P1-G reader` — Reader Boundary 收斂時要碰
> - `P5/P6 asset-map` — surface 合併要碰
> - `M2` / `M3` / `B8` — backend 工作項（前端等 backend 落地後刪 fallback）
> - `later` — 非阻擋性 cleanup
>
> **Backend status 圖例**：`A3 backend landed`（A3 後端已送，前端待對接）/ `live`（穩定 contract）/ `legacy fallback` / `frontend-derived`（前端自己算的，理應後端給）

### Critical（直接違反 A3 contract）

| # | File:line | Pattern | Risk | Backend status | A3 action | Owner |
|---|---|---|---|---|---|---|
| 1 | `app/(control-panel)/flyto/projects/components/OrgCard.tsx:92` | `computedScore?.overall_display ?? 250` | 沒分數偽裝成 F 下限分 | A3 backend landed | 改成 `score_available === false` ⇒ 渲染 no-score empty state；刪 `?? 250` | A3 frontend |
| 2 | `app/(control-panel)/flyto/projects/components/OrgCard.tsx:91` | `overall_grade ?? agg?.avg_grade ?? '--'` 三層 fallback | dual-truth + 假 grade | A3 backend landed | 刪 legacy aggregated leg；grade null ⇒ muted badge + reason 文案 | A3 frontend + B1 |
| 3 | `components/compounds/dashboard/DashboardView.tsx:58-59` | `overall_raw ?? server?.avg_score ?? 0` / `overall_grade ?? server?.avg_grade ?? '--'` | hero gauge 顯示假 0 分 / -- | A3 backend landed | 刪 `server.avg_*` leg + `?? 0`；gate on `score_available` | A3 frontend + B1 |
| 4 | `hooks/useRepoScores.ts:48` | default `{ grade: '--', raw: 0, display: 250, scorable: false }` | 共用 hook 把沒分數 repo 偽裝成最低分 repo | frontend-derived | default 改 `{ grade: null, raw: null, display: null, scorable: false }`；consumer 用 `scorable` 而非 `score === 0` | A3 frontend（**shared hook，修一處連動多處**） |
| 5 | `components/compounds/dashboard/ScoringBreakdown.tsx:46-71,111,131-143` | computedScore 缺席時 fallback 到 local heuristic（securityScore / complexityScore / deadCodeScore） | 前端再算一套分 ⇒ 跟 backend 永遠不一致 | frontend-derived | 整段 local heuristic 刪掉；computedScore 缺席 ⇒ render empty state；保留 M2 TODO 註解直到 backend categories 完整 | A3 frontend（M2 完成後） |
| 6 | `components/compounds/dashboard/ScoreTrendChart.tsx:60-62` | `Number(ec.overallRaw ?? ec.overall_raw ?? 0)` | snake/camel 雙吃 + zero fallback ⇒ chart silently zero | A3 backend landed | 統一 snake_case；刪 `?? 0`；`score_available=false` 的點直接 skip 不畫 | A3 frontend |
| 7 | `components/compounds/scoring/ScoreTrendsView.tsx:171,190,236` | `overall_display ?? overall_raw ?? '—'` / `overall_raw ?? 0` | score 欄位疊 fallback | A3 backend landed | A3 gate + 刪 em-dash / zero fallback | A3 frontend |
| 8 | `components/compounds/exposure/PostureOverview.tsx:443-444` | `computeCorpusPercentile(data?.avg_score ?? 0, peerData.latest)` | null score 當 0 餵 percentile ⇒ sector 位置算錯 | A3 backend landed | `score_available=false` ⇒ 不算 percentile 直接顯示「待資料」 | A3 frontend |
| 9 | `components/compounds/dashboard/ScoreDimensions3D.tsx:74-76` | `c.raw ?? 0` / `c.grade ?? '-'` 對 category score 加 fallback | category 軸顯示假 0 / dash | A3 backend landed | per-category gate；缺 category 直接不畫該軸 | A3 frontend |

### High（dual-truth / 重複算 / boundary 違反）

| # | File:line | Pattern | Risk | Backend status | A3 action | Owner |
|---|---|---|---|---|---|---|
| 10 | `components/compounds/security/IssuesView.tsx:115-120` | 重算 `counts.open/snoozed/ignored/solved` ignoring server `counts` | server vs client drift | live（backend 已給 counts） | 刪 client-side recompute，直接用 `data.counts` | B1 dual-truth |
| 11 | `components/compounds/exposure/PostureOverview.tsx:178-189` | 8 種 `countByType` 在 client 過濾完整 `attack_surface.assets[]` | 1k-domain org 下載完整 list 算 3-8 個數字 | live（M3 待 backend 補 composite endpoint） | 等 backend `/posture-overview-composite`；現階段保留註解 | M3（後端先動） |
| 12 | `components/compounds/exposure/CTEMActionsView.tsx:88-117` | `sortBy(items, 'priority')` 4-層 client tie-break ladder | 不同 client 排序不一致 | live（B8 已標 TODO） | 等 backend 加 `priority_rank` 欄位；前端改成 `sortBy(items, 'priority_rank')` | B8 → A3 frontend |
| 13 | `components/compounds/dashboard/ScoringBreakdown.tsx:73-78` | 自定 `DIMENSIONS` weights 與 Go `internal/scoring` 不同步 | weights drift | frontend-derived | 刪 `DIMENSIONS`；改讀 `computedScore.categories[].weight` | A3 frontend（同 #5） |
| 14 | `components/compounds/exposure/shared.ts:87` | `getExternalPosture` fetcher 不在 `lib/engine/` | engine-client 一處規約違反 | live | 搬到 `lib/engine/ctem/externalPosture.ts`；`shared.ts` re-export 或直接 import | P1-G reader |

### Medium（join key / cache / dead code / M3 待補）

| # | File:line | Pattern | Risk | Backend status | A3 action | Owner |
|---|---|---|---|---|---|---|
| 15 | `compounds/exposure/shared.ts:60,73-76` + `lib/engine/code/pentest.ts:49` + `lib/engine/scoring/scoring.ts:23` | 用 domain 字串當 join key (`domains[].domain` / `AttackSurfaceAsset.value` / `DomainLeakExposure.domain`) | P5/P6 surface 收斂時斷掉 | legacy fallback | 等 kernel R1-R5 提供 canonical `resource_id`；前端 type 加 `resource_id?: string` 先準備；新 join 一律用 `resource_id` | P5/P6 asset-map |
| 16 | `compounds/exposure/PostureOverview.tsx` + `compounds/scoring/BenchmarkCard.tsx` + `compounds/dashboard/DashboardView.tsx` | 三處各自 `useQuery(['benchmark', orgId])` / `useQuery(['peer-baseline', orgId, sector])`，staleTime 5/10/60min 不同 | 同 key 不同 stale，cache fight | live | 抽 `useBenchmark(orgId)` / `usePeerBaseline(orgId, sector)` shared hook，單一 staleTime（建議 15min） | later（cleanup） |
| 17 | `components/compounds/pulse/PulseView.tsx:169,553,864,876,883,884` | `item.blast_radius ?? 0` × 6 | dead code，但反映前端對 contract 信心不足 | live（contract: non-nullable number） | 直接刪 `?? 0`，TS 嚴格模式自然會抓 | later（cosmetic） |
| 18 | `components/compounds/exposure/PostureOverview.tsx` | 9 個 `useQuery` 同頁並行；line 226 `failedDimensions` aggregation 是好習慣 | 等 backend composite endpoint | live（M3） | 等 backend 補 composite；現階段保留 9 query 結構 | M3 |

### Low（語意 / dead fallback / error hygiene）

| # | File:line | Pattern | Risk | Backend status | A3 action | Owner |
|---|---|---|---|---|---|---|
| 19 | `lib/engine/code/repos.ts:484` | `OrgHealthAggregated.top_risks[].score` 是 raw 0-100，同 response `RepoHealthSummary.display_score` 是 250-900；命名衝突 | reader 易誤用 | legacy fallback | 在 type 重命名 `top_risks[].score` ⇒ `raw_score`；同步改 consumer | P1-G reader |
| 20 | `components/compounds/scoring/BenchmarkCard.tsx:36-49` | 沒 `score_available` gate，靠 fetcher catch→null + `!bm` early-return | backend 送 `org_score=0` ⇒ marker 畫在 250 點 sliver | A3 backend landed | 加 A3 gate；`score_available=false` ⇒ 不畫 marker，顯示「待資料」文案 | A3 frontend |
| 21 | `lib/engine/scoring/scoring.ts:298-304` | `getOrgBenchmark` catch→null silently | 502 / no-data 混在一起，操作員看不到 backend error | frontend-derived | 區分 `null`（合法 empty）vs `throw`（error）；caller 區別處理 | later（errx hygiene） |

---

## Phase 2/3 待補 endpoint 清單（提醒）

Phase 2（同樣牽涉 score / cross-dim）：
- `GET /repos/{id}/health`（RepoProfile）
- `GET /pentests/{projectId}/scans` + `/analyze`（Scorecard）
- `GET /orgs/{id}/repos`、`/orgs/{id}/findings`、`/orgs/{id}/mitigations`、`/orgs/{id}/vendors`、`/orgs/{id}/ctem-paths`
- `GET /orgs/{id}/unified-score-history`、`/orgs/{id}/unified-score`
- `GET /orgs/{id}/external-posture/kernel`（KernelExternalPosture — B3 reader convergence target）
- `GET /orgs/{id}/external-issues`、`/orgs/{id}/asset-map`、`/orgs/{id}/sla-budget`、`/orgs/{id}/mttr-history`、`/orgs/{id}/score-forecast`
- `GET /orgs/{id}/scoring-audit/*`、`/orgs/{id}/peer-corpus`

Phase 3（無 score，但 A3 frontend 改動會碰到 view layer）：
- `GET /orgs/{id}/footprint/*`、`/orgs/{id}/threat-intel/*`、`/orgs/{id}/brand/*`、`/orgs/{id}/va-report`
- `GET /orgs/{id}/events` (SSE payload)、`/orgs/{id}/dashboard`（DashboardPayload composite cache）
- `GET /orgs/{id}/posture-snapshots`、`/orgs/{id}/discovery-runs`、`/orgs/{id}/verifier-source-health`
- Settings 系列：`/webhooks`、`/sla-policies`、`/scan-schedules`、`/scan-credentials`、`/api-keys`、`/monitoring`、`/business-units`
