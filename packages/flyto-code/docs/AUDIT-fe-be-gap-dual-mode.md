# flyto-code (FE) × flyto-engine (BE) 主管稽核報告：深後端、淺前端、與雙模式缺口

> 產出方式：ultracode 多代理稽核（22 agents）。盤點 FE 34 頁 / 實際呼叫 217 條 API，對照 BE 513 條路由 / 11 大面向。共發現 **99 個覆蓋缺口（23 P0）**。

## 1. 總結 (TL;DR)

- **後端是真的深，前端只摸到皮。** BE 有 **513 條路由、11 大面向**，計算了 ranked 攻擊鏈、per-finding 跨 repo 融合、$ 金額影響、SLA 違約時鐘、mitigation 信任衰減、5-phase 紅隊 pipeline——但 FE 只是一個 **4 頁 Fuse/MUI 殼**，實際只打到 **~217 條路徑**。算力做好了，畫面看不到。
- **缺口巨大：共 99 個覆蓋缺口，其中 23 個是 P0。** 不是「醜」的問題，是**整條閉環沒有觸發點**：Footprint 的 confirm/reject 擁有權閘門、`GET /findings/{fingerprint}` 統一視圖、per-repo scan 執行、AI fix-plan 修復路線圖——這些最可賣的差異化能力，UI 是**全黑的**。
- **今天完全沒有「主管 vs 工程師」分流。** 只有兩種 gating：**方案權益**（買了什麼：all/code/ctem/custom）與**角色權限**（能改什麼：org:delete/pentest:run）。沒有 persona toggle、沒有 executive mode、沒有簡化的管理者落地頁。`useCapabilities` 只吐 `canSeePage/canDoAction/hasFeature`，從來沒有 audience 開關。
- **「主管視角」目前只是程式碼註解和一個匯出器。** AttackPaths 標頭寫著「Dashboard=executive lens / AttackPaths=attacker lens」，但三頁是**同一套密集 operator 畫面**。唯一真正把 audience 當一等公民的地方是 **Exec Report 匯出**（Board/SOC/External/Compliance preset）——那是報告產生器，不是 app 體驗。
- **FE 本身不是廢品，是被 operator 罵到很密的 war room。** 旗艦頁（Dashboard/Posture/Scoring/SensorMap）有 3D Asset City、攻擊弧線地球、自製 gauge/donut，craft ~7/10；但長尾與 brochure 頁（CapabilityPage 幾乎空白）掉到 4-5/10，外加一條**沒做完的雙重導航遷移**（sidebar + 舊 War Room accordion 並存）是最大結構性異味。

---

## 2. 前後端落差全景（最嚴重缺口，P0 優先）

| 面向 | 能力 | 端點 | 嚴重度 | 為何重要 |
|---|---|---|---|---|
| Footprint | 候選攻擊路徑（紅隊皇冠） | `GET /footprint/candidate-paths` | **P0** | ranked leaf→seed 攻擊鏈（score/hops/distinct sources/全節點鏈）。最可賣的 EASM 差異化，UI 渲染**零**。 |
| Footprint | 擁有權 Confirm/Reject 閘門 | `POST /footprint/entities/{id}/confirm`、`/reject` | **P0** | 人在迴路的驗證橋。confirm 會 mirror 進 /domains 並開 CTEM issue。**沒這顆按鈕，整條 footprint→inventory→CTEM 閉環沒有觸發點**，3D 圖是死路。 |
| CTEM | 統一 per-finding 視圖 | `GET /findings/{fingerprint}` | **P0** | 全域最豐富的讀取：把一個 finding 融合跨 repo 位置、autofix 狀態、verdicts、open PR、blast radius。**FE 零 caller**，工程師只看到碎片。 |
| CTEM | $ 金額影響 + PriorityBreakdown + SLA 時鐘 | `GET /ctem/priorities` | **P0** | payload 帶 base+tier+exploit-mitigation 分解、low/mid/high 美元區間、breach 倒數、5 種排序梯。FE 渲染成扁平清單，**丟掉金額、分數分解、違約倒數**——正是主管儀表板要的訊號。 |
| Code | per-repo scan 執行 | `GET/POST /repos/{id}/scans`、`POST /scans/{id}/cancel`、`/scan-upload`、`GET /scans/{id}/results` | **P0** | 「跑一次掃描」這個核心迴圈**完全沒有 UI**：不能對單一 repo 起掃、看佇列、取消 hung scan、上傳離線產物。durable-queue/idempotency/失敗分類全黑。 |
| Code | AI fix-context + 修復路線圖 | `GET /repos/{id}/ai-fix-context`、`POST/GET /repos/{id}/fix-plan` | **P0** | LLM 產的週期分桶修復 backlog（effort_hours/critical_path/total effort）。**全域最主管友善的產出物，零 UI。** |
| Code | 閉環 verify + workflow 時間軸 | `POST /repos/{repo_id}/findings/{fingerprint}/verify`、`/workflow-executions`、`/verify-history`、`/verify-targets` | **P0** | 「證明這個 finding 是真的/已修」的整套動作（靜態判決+動態 runner+Before/After 時間軸）無法觸發也無法瀏覽。核心差異化，幾乎全黑。 |
| Footprint | Surface 聯合讀 + per-asset 歸因證據 | `GET /footprint/surface`、`/surface/{rid}/evidence` | P1 | 回答 EASM 第一信任問題「**這為什麼算我的？**」FE 用 graph 與 attack-surface 分開，從不打統一歸因池視圖。 |
| Footprint | Attack Surface inventory 變更 | `PATCH /attack-surface/{id}/validate`、`POST /scan`、`POST /domains/import` | P1 | Domains 表目前只能讀+刪。不能標 false positive、一鍵起掃、批次匯入域名——核心 inventory 生命週期動作缺席。 |
| CTEM | per-alert blast 力導向圖 | `GET /alerts/{id}/blast-graph` | P1 | 後端最強的單 finding 視覺，FE 很可能只渲染成一個數字。 |
| Code | AI CVE-bump 提案 | `GET /repos/{id}/ai-proposals`、`POST .../accept` | P1 | 一鍵 dependency-bump auto-PR，高價值低工，**零 UI**。 |
| Code | 5-phase 紅隊 pipeline | `POST /pipeline/runs`、`/phase`、`/evidence`、`/finalize`、`/retest`、`GET /pipeline/runs/{id}` | P1 | baseline→probe→verify→recheck→report 含 per-phase intel/confidence/token 與 evidence(payload)。最炫的引擎資產，pentest 頁只顯示 campaign-level report。 |
| CTEM | mitigation 信任衰減 | `GET /mitigations`、`/mitigations/{id}/evidence` | P1 | freshness_factor + evidence_tier(verified/fading/stale/aspirational) + append-only ledger。最精密、最少曝光的後端邏輯，被攤平成清單。 |

> 整份稽核共 **99 缺口 / 23 P0**。上表是槓桿最高的子集。

---

## 3. 雙模式架構建議（管理者 / 工程師）— 核心交付物

### 3.1 機制：一個 audience 開關，不是新 app

今天 gating 是兩維（權益 × 權限）。新增**第三維：audience**，與權益/權限正交。

- **資料層**：把 `useCapabilities` 擴成 `useExperience()`，回傳 `mode: 'manager' | 'engineer'`，來源優先序：URL `?mode=` ＞ 使用者偏好（存 org membership / localStorage）＞ 角色預設（`pentest:run`/`org:delete` 類角色預設 engineer，純 viewer/billing 角色預設 manager）。
- **路由**：不要做兩棵完全分離的 route tree（維護地獄）。用**單一 route + mode-aware 容器**。每個 domain 頁匯出 `<XManagerView/>` 與 `<XEngineerView/>`，由一個 `<DomainPage mode>` 切換。URL 維持 `/projects/:orgId/ctem`，mode 走 query 或 layout context。
- **全域 toggle**：放在 top app bar 的一個 segmented control（「管理者 / 工程師」），切換時做 Framer Motion 的淡入轉場，並把選擇寫回偏好。**不需要重新登入、不影響權限**——看不到的還是看不到（plan/role 照舊隱藏）。
- **落地頁**：登入後依 mode 預設落地頁不同。Manager → `/projects/:orgId/exec`（新的一眼儀表板）；Engineer → 現有 dashboard / pulse。

### 3.2 兩種模式的導航結構

**管理者模式（少、寬、美、一眼）** — 5-6 個落地，全部是 KPI + 圖表 + 敘事卡：
1. 風險總覽（org score、grade、$ at-risk、SLA breach、趨勢）
2. 外部曝險（Footprint manager view）
3. 修復進度（fix-plan 燃盡 + autofix 吞吐）
4. 合規與信任（mitigation 衰減 sunburst、稽核 cadence）
5. 報告中心（現有 ExecReportView，已是 audience-aware，直接接上）

**工程師模式（多、密、深、可操作）** — 保留現有 ~30 頁 sidebar，但**砍掉舊 War Room accordion 雙軌**，並把每頁升級成可排序表 + drilldown drawer + 原始證據。

### 3.3 管理者模式的設計系統硬棒（必須統一）

- **圖表**：把已安裝但只用在 Reports 的 **apexcharts** 升格為**管理者模式唯一圖表庫**（Bar/Line/Donut/Radar/Heatmap/Treemap/RadialBar 都現成）。停止在 manager 頁手刻 SVG。工程師模式可續用手刻密集視覺。
- **動畫**：`motion`（Framer v12）做 KPI count-up、卡片 stagger 進場（沿用既有 JellyCard）、mode 轉場。每個 KPI 數字都 count-up。
- **KPI 卡**：統一一個 `<KpiCard>`（大數字 + 單位 + 上下箭頭 vs 前期 + sparkline + 點擊下鑽到工程師視圖）。
- **顏色 / 嚴重度語言**：**強制走 `designTokens/severity-tokens`**，禁止再 inline `#ef4444/#7c3aed/#22c55e`。severity 一律 token：critical/high/medium/low/info + 衰減色階。
- **3D**：管理者模式**預設不載 WebGL**（Asset City / 地球降為 opt-in tab），回收 520px 高度。

### 3.4 工程師模式如何曝光原始深度

- 每個 domain：預設**密集可排序表**（material-react-table，目前只用在 3 處，應推廣），右側 **evidence drawer**。
- 曝露後端已算好的分解：CTEM 的 base/tier/exploit/-mitigation stacked bar、taint flows、attribution evidence 鏈、mitigation ledger、pipeline phase stepper。
- 所有 mutation（confirm/reject、validate、scan、verify、run autofix、edit rule）以 inline row action + 樂觀更新 + toast（連結到新建資產 / CTEM issue）。
- 配置面（autofix rules PUT、verify-targets PUT、rule-overrides POST/DELETE、scan-schedule）集中成工程師模式的 settings drawer。

### 3.5 逐面向對映（Manager 儀表板 ↔ Engineer 視圖）

| 面向 | 管理者儀表板（apex + KPI + 敘事） | 工程師視圖（表 + drawer + 動作） |
|---|---|---|
| **Footprint** | 本期新曝險大數字（`/footprint/delta`）、4-tier verdict donut（`/actionable`）、曝險趨勢 area（`/timeseries`）、品牌仿冒 bar（`/visual-similarity`）、攻擊者敘事卡 + Evidence Pack PDF（`/narrative`,`/evidence-pack`） | Actionable 表（三子分數 mini-bar）+ **Candidate Attack-Paths 表（`/candidate-paths`）** + Surface 歸因池表（`/surface`）+ 每列 **Confirm/Reject**；3D 降為 Graph tab |
| **CTEM** | $ impact-at-risk 依 asset-tier stacked bar、SLA breach gauge+倒數、noise-reduction gauge（`/triage-stats`）、attack-path bubble（`/ctem-paths`）、mitigation 衰減 sunburst | 統一佇列（score 分解欄 + breach_at 倒數 chip + 5 排序梯）、**統一 finding drawer（`/findings/{fingerprint}`）**、blast 力導向圖、mitigation evidence ledger |
| **Code** | org health score+grade、at-risk/secure repo、MTTR、**修復路線圖燃盡卡（`/fix-plan`）**、autofix 吞吐（`/autofix/runs`）、PR velocity/CI pass-rate health | repo 詳情（`/repos/{id}/health`+`/findings`+`/arch`）、per-repo **Scan/Cancel/Upload**、**Run AutoFix + rule 編輯**、verify 時間軸、**5-phase pipeline stepper** |
| **Posture/Scoring** | 已接近 manager-grade：score hero + weight donut + category accordion，補上 percentile 與趨勢敘事 | dimension 3D / 原始 category 分解表 |
| **SensorMap/DarkWeb** | 攻擊弧線地球（保留，這頁本來就漂亮）+ 國家 bar 升 apex | 原始 ranked 命中清單 + 證據 drawer |
| **Reports/Audit** | 直接複用 ExecReportView（Board/SOC/External/Compliance）+ cadence | 原始 section 編輯器 |

---

## 4. UI 品質硬傷與修法（彙整）

1. **Split-brain 樣式**：同一元件混用 MUI `sx` + Tailwind `className`（`Paper className="rounded-xl" sx={{...}}`）。→ 訂一條規則：layout/spacing 走一種、嚴重度色彩走 token，新元件不得 inline hex。
2. **硬編碼 hex 顏色**滿地（`#ef4444` 等），明明有 `designTokens/severity-tokens`。→ 全面換 token，加 lint 規則擋 raw hex。
3. **IA 雙軌**：~30 頁 sidebar + 舊 War Room accordion（走 backward-compat redirect）= 沒做完的遷移。→ **砍掉 accordion，收斂成單一 nav**；這也是 §3 雙模式的前提。
4. **拋光落差大**：旗艦頁 7/10，但 `/capability/*` brochure 頁 maxWidth 800、py:5、純靜態無 API。→ **要嘛從登入後殼移除，要嘛換成 live mini-dashboard**（`/footprint/latest-run`、`/actionable` donut、delta KPI）。
5. **3D 吃高度**：Dashboard Asset City 520px、地球 520px，小螢幕滑動是苦差（註解已自承）。→ 降為 opt-in tab 或上限 ~280px；管理者模式預設不載。
6. **圖表不一致**：apexcharts 只用在 Reports，其餘全手刻 SVG。→ 管理者模式統一 apex；手刻保留給工程師密集視覺。
7. **material-react-table 只用 3 處**：多數表手刻 MUI Box rows，密度/排序不一致。→ 工程師模式表格統一遷 MRT。

---

## 5. 分階段路線圖（依槓桿排序）

**Phase 0 — 解鎖架構（沒有這個，後面都白做）**
- `useExperience()` mode 維度 + top-bar segmented toggle + mode-aware `<DomainPage>` 容器 + 依 mode 落地頁。
- 設計系統收斂：severity token 強制、apexcharts 升為 manager 圖表庫、統一 `<KpiCard>`、`motion` count-up/轉場。
- **砍掉 War Room accordion 雙軌導航**，收斂單一 sidebar。
- brochure `/capability/*` 頁處置（移除或換 live mini-dashboard）。

**Phase 1 — 最高價值閉環與旗艦儀表板**
- **Footprint Confirm/Reject 閘門**（`/confirm`,`/reject`）＋ **Candidate Attack-Paths 面板**（`/candidate-paths`）→ 把死圖變成 footprint→inventory→CTEM 產品化管線。
- **CTEM 統一 finding drawer**（`/findings/{fingerprint}`）＋ 停止丟棄 `/ctem/priorities`（score 分解 + $ impact + SLA 倒數 + 排序梯）。
- **Manager CTEM 儀表板**（$ at-risk + SLA breach KPI，apex 動畫）與工程師 worklist 分離。
- **Code fix-plan 燃盡卡**（`/fix-plan`）＋ org health KPI 上移到 fold 之上。

**Phase 2 — 補齊核心操作迴圈**
- **per-repo scan 執行**（`/repos/{id}/scans`、`/scans/{id}/cancel`、`/scan-upload`、`/scans/{id}/results`）+ repo 詳情（`/health`+`/findings`+`/arch`）。
- **closed-loop verify**（`/findings/{fingerprint}/verify`、`/verify-history`、`/verify-targets`）+ workflow 時間軸。
- **Domains inventory 生命週期**（validate / scan / domains import / tier / compliance-scope）。
- **Run AutoFix + rule 編輯**（`/repos/{id}/autofix/run`、`PUT /autofix/rules/{id}`）+ **AI CVE-bump 提案**（`/ai-proposals`）。

**Phase 3 — 深度與差異化炫技**
- **5-phase 紅隊 pipeline 視圖**（`/pipeline/runs/{id}`、`/campaigns/{id}/pipeline`、`report.html`）。
- **mitigation 信任衰減**視覺化（freshness_factor / evidence_tier / append-only ledger）。
- **per-alert blast 力導向圖**升級成 war-room graph。
- attribution「為什麼這是我的」evidence drawer（`/footprint/surface/{rid}/evidence`）。
- 診斷/管理面板（kernel-parity、per-repo-test、SBOM 匯出、run-detail drilldown）。

---

## 6. 快速戰果（5 件、快、看起來強 10 倍）

1. **接上 `GET /findings/{fingerprint}` 統一 drawer** — 全域最豐富的讀取、**目前零 caller**。一個 drawer 就把跨 repo 位置/verdicts/open PR/blast radius 從碎片變成一個故事。
2. **不要再丟棄 `/ctem/priorities` payload** — 同一份資料渲染成 score stacked bar + $ impact 區間 + SLA breach 倒數 chip + 排序梯 segmented control。Pulse 與 Dashboard 同時免費升級。
3. **Footprint 每列加 Confirm/Reject 按鈕** — 一顆按鈕 + 樂觀更新 + 連結到新資產/CTEM issue 的 toast，把整個 footprint 引擎從唯讀圖變成產品化閉環。
4. **severity token + 統一 KpiCard + count-up 動畫** — 把滿地 inline hex 換 token、Dashboard manager hero 改成 $ at-risk / SLA breach 大數字 count-up，瞬間「儀表板感」。
5. **3D 降為 opt-in tab + brochure 頁換 live KPI** — 回收 Asset City/地球的 1040px 高度、把 `/capability/*` 空白頁換成 `/footprint/latest-run` + actionable donut，消滅 app 內最弱的兩個密度黑洞。
