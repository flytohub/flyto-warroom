# Flyto2 Code 頁面 ↔ Engine API 對照表

整理日期：2026-05-24
來源：`src-next/types/modules.ts`（MODULES 清單）+ 各 `*Page.tsx` 對應 compound 的實際呼叫。

> 共通基礎：所有 workspace 頁面外層皆透過
> - `useOrg()` → `GET /api/v1/code/orgs`
> - `useConnectedRepos(orgId)` → `GET /api/v1/code/orgs/{id}/repos`
>
> `WorkspacePage` 根部還會掛一個 `useOrgEvents(orgId)` SSE 連線
> → `GET /api/v1/code/orgs/{id}/events`
> 用來做 React Query 的 invalidation。以下每頁不再重覆列這三個。
>
> 標 `(on action)` 的 endpoint 表示「使用者點按鈕、開 modal、送表單時才觸發」，
> 非 page mount 即拉。

---

## OVERVIEW 群組

### Dashboard（`/projects/:orgId/dashboard`）
- Page: `src-next/app/(control-panel)/flyto/workspace/components/pages/DashboardPage.tsx`
- Compound: `src-next/components/compounds/dashboard/DashboardView.tsx`（無 repos 時改 render `compounds/onboarding/OnboardingView.tsx`）
- API:
  - `GET /api/v1/code/orgs/{id}/health-summary` — 平均分、grade 分佈、severity counts
  - `GET /api/v1/code/orgs/{id}/attack-surface` — domain 數量 hero card
  - `GET /api/v1/code/orgs/{id}/pentests` — query cache 預載
  - `GET /api/v1/code/orgs/{id}/computed-score` — 統一分數 + repo_scores
  - `GET /api/v1/code/orgs/{id}/pulse?since=&limit=20` — Top 5 row + cross-dim tiles
  - `GET /api/v1/code/orgs/{id}/external-posture` — SLA chip + External Threat row
  - `GET /api/v1/code/orgs/{id}/ctem/priorities` — KEV / crown jewel counts
  - `GET /api/v1/code/orgs/{id}/peer-baseline?sector=` — sector 位置（僅 sector 設定時）
  - `GET /api/v1/code/orgs/{id}/score-events?days=30` — 7d 動能
  - `GET /api/v1/code/orgs/{id}/leak-exposure` — 暗網外洩計數
  - `POST /api/v1/code/orgs/{id}/token` — (on action) Onboarding 儲存 GitHub token

### Pulse（`/projects/:orgId/pulse`）
- Page: `pages/PulsePage.tsx`
- Compound: `compounds/pulse/PulseView.tsx`
- API:
  - `GET /api/v1/code/orgs/{id}/pulse?since={window}&limit={pageSize}` — 主 cross-dim 排序 feed

### Footprint（`/projects/:orgId/footprint`）
- Page: `pages/FootprintPage.tsx`
- Compound: `compounds/footprint/FootprintGraphView.tsx`（含 ReconBriefView / RunDialog / RuleTuningModal / SelectedDetail）
- API:
  - `GET /api/v1/code/orgs/{id}/footprint/latest-run` — 最近一次 run 摘要
  - `GET /api/v1/code/orgs/{id}/footprint/graph` — 3D 圖節點/邊
  - `GET /api/v1/code/orgs/{id}/footprint/timeseries` — 時間序列
  - `GET /api/v1/code/orgs/{id}/footprint/actionable?kind=red_team_actionable&limit=5` — 可行動清單
  - `GET /api/v1/code/orgs/{id}/footprint/delta` — 上次 vs 這次 diff
  - `GET /api/v1/code/orgs/{id}/footprint/narrative` — AI markdown summary
  - `GET /api/v1/code/orgs/{id}/posture-distribution` — pie
  - `GET /api/v1/code/orgs/{id}/findings/overlay` — domain 風險點覆蓋
  - `GET /api/v1/code/orgs/{id}/footprint/path/{entityId}` — (on click) 選中節點路徑
  - `GET /api/v1/code/orgs/{id}/footprint/threat-seed-suggestions` — (on action) 推薦種子
  - `POST /api/v1/code/orgs/{id}/platform-pipeline/run` — (on action) 重新跑 pipeline
  - `GET /api/v1/code/orgs/{id}/footprint/rule-overrides` — (on action) RuleTuningModal
  - `POST /api/v1/code/orgs/{id}/footprint/rule-overrides` — (on action) 新增 / 調整 rule
  - `DELETE /api/v1/code/orgs/{id}/footprint/rule-overrides/{claimKind}` — (on action) 刪除 override

---

## ASSETS 群組

### Repos（`/projects/:orgId/repos`）
- Page: `pages/ReposPage.tsx`
- Compound: `compounds/repos/RepoListView.tsx`
- API:
  - `GET /api/v1/code/orgs/{id}/repos` — 列表（共用 hook）
  - `GET /api/v1/code/orgs/{id}/health-summary` — 每 repo 摘要
  - `GET /api/v1/code/orgs/{id}/computed-score` — 統一 grade
  - `GET /api/v1/code/repos/{repoId}/scans?limit=3` — 每 repo 最近 3 次 scan
  - `POST /api/v1/code/repos/{repoId}/scans` — (on action) 觸發單 repo scan
  - `POST /api/v1/code/scans/{scanId}/cancel` — (on action) 取消單筆
  - `POST /api/v1/code/orgs/{id}/scans/cancel-all` — (on action) 取消全部 running
  - `POST /api/v1/code/orgs/{id}/repos` — (on action) RepoPicker 連 repo
  - `DELETE /api/v1/code/repos/{repoId}` — (on action) 解除連接
  - `GET /api/v1/code/orgs/{id}/github/user-orgs` — (on action) Picker 來源
  - `GET /api/v1/code/orgs/{id}/github/user-repos?per_page=&page=` — (on action)

### Domains（`/projects/:orgId/domains`）
- Page: `pages/DomainsPage.tsx`
- Compound: `compounds/domains/DomainsView.tsx`（含 DomainDetail / DomainScoreTrend / DomainImportModal / domain_detail/*）
- API:
  - `GET /api/v1/code/orgs/{id}/attack-surface?enrich=true` — 主表
  - `GET /api/v1/code/orgs/{id}/pentests` — pentest 連結欄
  - `GET /api/v1/code/orgs/{id}/external-posture` — 上方 summary tiles
  - `GET /api/v1/code/orgs/{id}/api-definitions?domain=` — (on detail) API tab
  - `GET /api/v1/code/pentests/{projectId}/score-events?days=` — (on detail) DomainScoreTrend
  - `GET /api/v1/code/orgs/{id}/asset-evidence?...` — (on detail) Evidence tab
  - `POST /api/v1/code/pentests/{projectId}/analyze` — (on detail) AI Analysis tab
  - `POST /api/v1/code/orgs/{id}/targets` — (on action) 新增單一 domain / target
  - `DELETE /api/v1/code/orgs/{id}/domains/{domain}` — (on action) 刪除
  - `POST /api/v1/code/orgs/{id}/discover-all` — (on action) Scan All
  - `POST /api/v1/code/pentests/{projectId}/scan-asset` — (on action) 重掃單一 asset
  - `POST /api/v1/code/pentests/{projectId}/discover` — (on action) 單一 project discovery

### Asset Map（`/projects/:orgId/asset-map`）
- Page: `pages/AssetMapPage.tsx`
- Compound: `compounds/asset-map/AssetMapView.tsx`
- API:
  - `GET /api/v1/code/orgs/{id}/asset-map/kernel?limit=50000` — canonical kernel asset graph, nodes, edges, surface badges, and `asset_scores[]`
  - Legacy `/asset-mappings` write helpers remain exported for compatibility, but the Asset Map page no longer reads them as its source of truth.

---

## CODE 群組

### Code Issues（`/projects/:orgId/issues`）
- Page: `pages/IssuesPage.tsx`
- Compound: `compounds/security/IssuesView.tsx`（+ UniversalFindingPanel / PackageFindingDrawer / VerifyFindingModal / AutofixPreviewModal）
- API:
  - `GET /api/v1/code/orgs/{id}/issues?enrich=true` — 主表，含 ContextStrip
  - `PATCH /api/v1/code/orgs/{id}/issues/status` — (on action) snooze / ignore / solved
  - `GET /api/v1/code/orgs/{id}/findings/{fingerprint}` — (on row) UniversalFindingPanel
  - `GET /api/v1/code/orgs/{id}/findings/by-package?pkg=&type=` — (on drawer) Package 聚合
  - `GET /api/v1/code/alerts/{id}/history` — (on detail) HistoryTimeline
  - `GET /api/v1/code/alerts/{id}/blast-graph` — (on detail) BlastGraph
  - `POST /api/v1/code/repos/{repoId}/findings/{fingerprint}/verify` — (on action) VerifyFindingModal 啟動
  - `GET /api/v1/code/workflow-executions/{executionId}` — (on modal) 輪詢結果
  - `GET /api/v1/code/repos/{repoId}/verify-targets` — (on modal) 可選 targets
  - `POST /api/v1/code/workflow-executions/{executionId}/explain` — (on modal) AI 解釋
  - `GET /api/v1/code/repos/{repoId}/health` — (on modal) Verify 用 repo profile
  - `GET /api/v1/code/orgs/{id}/autofix/findings/{findingId}` — (on AutofixPreviewModal)
  - `POST /api/v1/code/orgs/{id}/autofix/findings/{findingId}/preview` — (on action) preview diff
  - `POST /api/v1/code/orgs/{id}/autofix/findings/{findingId}/pr` — (on action) Open PR

### Pentest（`/projects/:orgId/pentest`）
- Page: `pages/PentestPage.tsx`
- Compound: `compounds/pentest/PentestView.tsx`（+ PentestScanDetail / SafetyTab / SuggestedTargetsPicker）
- API:
  - `GET /api/v1/code/orgs/{id}/pentests` — 專案列表
  - `GET /api/v1/code/orgs/{id}/scan-approvals?scan_type=active_dast` — DAST 核准
  - `GET /api/v1/code/pentests/{projectId}/scans` — 每專案最近 scans
  - `POST /api/v1/code/pentests/{projectId}/run` — (on action) Run / Re-run
  - `POST /api/v1/code/orgs/{id}/scan-approvals/request` — (on action) 申請 DAST 核准
  - `GET /api/v1/code/orgs/{id}/pentest/suggested-targets` — (on dialog) 推薦
  - `POST /api/v1/code/orgs/{id}/targets` — (on action) 建立或復用 project
  - SafetyTab：`GET /scan-approvals`、`POST .../approve`、`POST .../deny`、`GET /scan-credentials`、`DELETE /scan-credentials`、`GET /visual-similarity`

### AutoFix（`/projects/:orgId/autofix`）
- Page: `pages/AutofixPage.tsx`
- Compound: `compounds/autofix/AutofixView.tsx`（+ AuditTab / PromotionTab / RunButton / SettingsTab）
- API:
  - `GET /api/v1/code/orgs/{id}/autofix/findings` — 主表
  - `GET /api/v1/code/orgs/{id}/autofix/rules` — Settings tab
  - `GET /api/v1/code/orgs/{id}/autofix/runs` — Audit tab
  - `GET /api/v1/code/orgs/{id}/autofix/runs/{runId}/gates` — (on row) gate 細節
  - `GET /api/v1/code/orgs/{id}/autofix/promotions` — Promotion tab
  - `POST /api/v1/code/orgs/{id}/autofix/promotions/{shapeHash}/decision` — (on action) Approve / Reject
  - `POST /api/v1/code/repos/{repoId}/autofix/run` — (on action) RunButton 觸發 repo 級 AutoFix

---

## EXPOSURE 群組

### Posture Overview（`/projects/:orgId/posture-overview`）
- Page: `pages/PostureOverviewPage.tsx`
- Compound: `compounds/exposure/PostureOverview.tsx`
- API:
  - `GET /api/v1/code/orgs/{id}/external-posture` — 主資料來源
  - `GET /api/v1/code/orgs/{id}/attack-surface` — domain 列表
  - `GET /api/v1/code/orgs/{id}/posture-snapshots?days=90` — 歷史曲線
  - `GET /api/v1/code/orgs/{id}/discovery-runs?limit=20` — 最近發現 run
  - `GET /api/v1/code/orgs/{id}/monitoring-events?limit=200` — Recent events
  - `GET /api/v1/code/orgs/{id}/verifier-source-health?hours=24` — 驗證源健康度
  - `GET /api/v1/code/orgs/{id}/ctem/priorities` — Priority pane
  - `GET /api/v1/code/orgs/{id}/attack-paths` — Attack path summary
  - `GET /api/v1/code/orgs/{id}/benchmark` — Bench mark card
  - `GET /api/v1/code/orgs/{id}/peer-baseline?sector=` — Peer corpus
  - `GET /api/v1/code/orgs/{id}/leak-exposure` — Dark-web counts

### Findings（`/projects/:orgId/findings`）
- Page: `pages/FindingsPage.tsx`
- Compound: `compounds/exposure/FindingsView.tsx`
- API:
  - `GET /api/v1/code/orgs/{id}/findings/facets?include_resolved=` — 篩選 facets
  - `GET /api/v1/code/orgs/{id}/findings?{filters}` — 主列表
  - `GET /api/v1/code/orgs/{id}/findings/{findingId}/assets` — (on detail) 受影響 assets
  - `GET /api/v1/code/orgs/{id}/findings/{findingId}/history?limit=200` — (on detail) 歷史
  - `POST /api/v1/code/orgs/{id}/findings/bulk-action` — (on action) bulk resolve / comment

### CTEM Actions（`/projects/:orgId/ctem-actions`）
- Page: `pages/CTEMActionsPage.tsx`
- Compound: `compounds/exposure/CTEMActionsView.tsx`
- API:
  - `GET /api/v1/code/orgs/{id}/issues?enrich=true&severity=critical,high` — code 端高嚴重
  - `GET /api/v1/code/orgs/{id}/ctem/priorities` — external 端優先序
  - `POST /api/v1/code/orgs/{id}/ctem/issues/mark-fixed` — (on action) external 標記已修
  - `POST /api/v1/code/orgs/{id}/ctem/code-issues/mark-fixed` — (on action) code 標記
  - `POST /api/v1/code/orgs/{id}/ctem/issues/verify` — (on action) external false-positive
  - `POST /api/v1/code/orgs/{id}/ctem/code-issues/verify` — (on action) code false-positive
  - `POST /api/v1/code/orgs/{id}/ctem/issues/assign` — (on action) 指派

### Attack Paths（`/projects/:orgId/attack-paths`）
- Page: `pages/AttackPathsPage.tsx`
- Compound: `compounds/attack-paths/AttackPathsView.tsx`
- API:
  - `GET /api/v1/code/orgs/{id}/attack-paths?limit=5&min_confidence=&sort=` — 攻擊路徑候選

> 註：另存 `compounds/exposure/AttackPathsView.tsx`（用 `/ctem-paths`），但 top-level route 沒指到它，僅 war-room dispatch `exp-paths` 用到。

### Mitigations（`/projects/:orgId/mitigations`）
- Page: `pages/MitigationsPage.tsx`
- Compound: `compounds/exposure/MitigationsView.tsx`
- API:
  - `GET /api/v1/code/orgs/{id}/mitigations` — 緩解措施
  - `GET /api/v1/code/orgs/{id}/ctem/priorities` — 對應 finding 來源
  - `GET /api/v1/code/orgs/{id}/mitigations/{mitId}/evidence?limit=50` — (on detail) Evidence
  - `POST /api/v1/code/orgs/{id}/mitigations` — (on action) 新增 / Upsert
  - `DELETE /api/v1/code/orgs/{id}/mitigations/{mitId}` — (on action) 刪除
  - `POST /api/v1/code/orgs/{id}/mitigations/{mitId}/verify` — (on action) 驗證

### Vendor Risk（`/projects/:orgId/vendors`）
- Page: `pages/VendorRiskPage.tsx`
- Compound: `compounds/vendor-risk/VendorRiskView.tsx`（+ VendorFormDialog / VendorQuestionnaireDialog）
- API:
  - `GET /api/v1/code/orgs/{id}/vendors` — 主表
  - `GET /api/v1/code/orgs/{id}/vendor-risk-summary` — 上方統計
  - `POST /api/v1/code/orgs/{id}/vendors` — (on action) 新增
  - `PATCH /api/v1/code/vendors/{vendorId}` — (on action) 更新
  - `DELETE /api/v1/code/vendors/{vendorId}` — (on action) 刪除
  - `POST /api/v1/code/vendors/{vendorId}/assess` — (on action) 重評估 / Questionnaire 送出

---

## DARKWEB & THREAT INTEL 群組

### Threat Actors（`/projects/:orgId/threat-actors`）
- Page: `pages/ThreatActorsPage.tsx`
- Compound: `compounds/threat-intel/ThreatActorsView.tsx`
- API:
  - `GET /api/v1/code/orgs/{id}/threat-intel/actors?{filter}` — MITRE ATT&CK groups
  - `POST /api/v1/code/orgs/{id}/threat-intel/refresh` — (on action) RefreshButton（platform admin）

### Malware Families（`/projects/:orgId/malware-families`）
- Page: `pages/MalwareFamiliesPage.tsx`
- Compound: `compounds/threat-intel/MalwareFamiliesView.tsx`
- API:
  - `GET /api/v1/code/orgs/{id}/threat-intel/malware?{filter}` — MITRE software

### Ransomware（`/projects/:orgId/ransomware-incidents`）
- Page: `pages/RansomwarePage.tsx`
- Compound: `compounds/threat-intel/RansomwareView.tsx`
- API:
  - `GET /api/v1/code/orgs/{id}/threat-intel/ransomware?{filter}` — ransomware.live mirror

### IoC Lookup（`/projects/:orgId/ioc-lookup`）
- Page: `pages/IoCLookupPage.tsx`
- Compound: `compounds/threat-intel/IoCLookupView.tsx`
- API:
  - `GET /api/v1/code/orgs/{id}/threat-intel/iocs?{filter}` — attack_surface 中的 IoC
  - `GET /api/v1/code/orgs/{id}/threat-intel/feed-status` — feed 健康度

### Sensor Map（`/projects/:orgId/sensor-map`）
- Page: `pages/SensorMapPage.tsx`
- Compound: `compounds/threat-intel/SensorMapView.tsx`（+ WorldHeatGlobe lazy）
- API:
  - `GET /api/v1/code/orgs/{id}/threat-intel/sensor-map` — 每國家計數

### Brand Protection（`/projects/:orgId/brand-protection`）
- Page: `pages/BrandProtectionPage.tsx`
- Compound: `compounds/exposure/BrandProtectionView.tsx`（+ TakedownLetterDialog）
- API:
  - `GET /api/v1/code/orgs/{id}/attack-surface` — 篩 lookalike / typosquat
  - `PATCH /api/v1/code/orgs/{id}/attack-surface/{assetId}/takedown` — (on action) takedown state
  - `GET /api/v1/code/orgs/{id}/attack-surface/{assetId}/screenshot` — (on detail) 視覺證據（blob）
  - `GET /api/v1/code/orgs/{id}/attack-surface/{assetId}/evidence-bundle` — (on action) 下載 evidence zip
  - `GET /api/v1/code/orgs/{id}/attack-surface/{assetId}/takedown-letter` — (on action) 下載 letter

---

## HISTORY 群組

### Audit Timeline（`/projects/:orgId/audit-timeline`）
- Page: `pages/AuditTimelinePage.tsx`
- Compound: `compounds/history/HistoryFeedView.tsx`（export `AuditTimelineView`）
- API:
  - `GET /api/v1/code/orgs/{id}/history-feed?{filters}` — 跨 dim 歷史 feed
  - `POST /api/v1/code/orgs/{id}/reports/render-pdf` — (on action) 匯出 PDF

---

## SCORING 群組

### Scoring（`/projects/:orgId/scoring`）
- Page: `pages/ScoringPage.tsx`
- Compound: `compounds/scoring/ScoringView.tsx`
- API:
  - `GET /api/v1/code/orgs/{id}/computed-score` — 唯一資料來源（categories / repo_scores / domain_scores / 權重）

### Score Trends（`/projects/:orgId/score-trends`）
- Page: `pages/ScoreTrendsPage.tsx`
- Compound: `compounds/scoring/ScoreTrendsView.tsx`
- API:
  - `GET /api/v1/code/orgs/{id}/computed-score` — 當前位置
  - `GET /api/v1/code/orgs/{id}/score-events?days=90` — 90 日事件
  - `GET /api/v1/code/orgs/{id}/peer-baseline?sector=` — peer 對照
  - `GET /api/v1/code/peer-corpus` — 全平台 corpus 算 percentile

### Compliance（`/projects/:orgId/compliance`）
- Page: `pages/CompliancePage.tsx`
- Compound: `compounds/scoring/ComplianceDashboardView.tsx`
- API:
  - `GET /api/v1/code/orgs/{id}/compliance` — SOC2 / ISO27001 / PCI-DSS 框架結果
  - `GET /api/v1/code/orgs/{id}/compliance/evidence?framework=&format=json` — (on action) Evidence Binder
  - `GET /api/v1/code/orgs/{id}/compliance/evidence?framework=&format=md` — (on action) Markdown 下載

---

## ADMIN 群組

### Reports（`/projects/:orgId/reports`）
- Page: `pages/ReportsPage.tsx`
- Compound: `compounds/reports/ReportsView.tsx`（+ CustomBuilder / DataStudioTab / DataWidget / ChartPreviewDialog / JoinDesignerModal）
- API:
  - `GET /api/v1/code/orgs/{id}/report-templates` — 模板列表
  - `GET /api/v1/code/orgs/{id}/report-components` — 共用 component
  - `POST /api/v1/code/orgs/{id}/report-templates` — (on action) 新增模板
  - `PUT /api/v1/code/report-templates/{id}` — (on action) 更新
  - `DELETE /api/v1/code/report-templates/{id}` — (on action) 刪除
  - `POST /api/v1/code/orgs/{id}/report-components` — (on action) 新增 component
  - `DELETE /api/v1/code/report-components/{id}` — (on action)
  - `POST /api/v1/code/orgs/{id}/reports/ai-polish` — (on action) AI 潤飾
  - `POST /api/v1/code/orgs/{id}/reports/generate?format=pdf` — (on action) PDF 匯出
  - `POST /api/v1/code/orgs/{id}/reports/render-pdf` — (on action) client 端組好內容再 render
  - 各 widget 的 data source 會 on-demand 打對應 endpoint（如 `/issues`、`/repos`、`/health-summary`、`/findings`，已在前面列）

### VA Report（`/projects/:orgId/va-report`）
- Page: `pages/VAReportPage.tsx`
- Compound: `compounds/va-report/VAReportView.tsx`
- API:
  - `GET /api/v1/code/orgs/{id}/va-report` — JSON 報告
  - `GET /api/v1/code/orgs/{id}/va-report.html` — (on action) 內嵌預覽
  - `POST /api/v1/code/orgs/{id}/va-report/pdf` — (on action) 下載 PDF blob

### Settings（`/projects/:orgId/settings`）
- Page: `pages/SettingsPage.tsx`
- Compound: `compounds/settings/SettingsView.tsx`（dispatch 至 17 個 tab）
- API（按 tab）：
  - **General**: `PATCH /api/v1/code/orgs/{id}` / `DELETE /api/v1/code/orgs/{id}`
  - **Members**: `GET /api/v1/code/orgs/{id}/invitations`、`POST .../invitations`、`DELETE .../invitations/{id}`、`GET /api/v1/code/orgs/{id}/github/members?org_login=`
  - **Source Control / Integrations**: `GET /api/v1/code/orgs/{id}/token/status?provider=github|gitlab`、`POST /api/v1/code/orgs/{id}/token`
  - **Local Upload**: `POST /api/v1/code/orgs/{id}/repos`（建 local repo + 上傳）
  - **Notifications**: `GET/POST /api/v1/code/orgs/{id}/webhooks`、`DELETE /api/v1/code/webhooks/{id}`、`GET/PUT /api/v1/code/orgs/{id}/scan-schedule`
  - **Scanning**: `GET /api/v1/code/orgs/{id}/scan-schedules`、`PUT .../scan-schedules/{kind}`、`POST .../pause`、`.../resume`、`.../run-now`；platform admin 另有 `GET /api/v1/system/scanners`、`PATCH /api/v1/system/scanners/{id}`、`POST /api/v1/system/scanners/{id}/run-now`
  - **CI Gate**: `GET/PUT /api/v1/code/orgs/{id}/ci-policy`
  - **Budget Policies**: `GET/POST /api/v1/code/orgs/{id}/campaign-budget/policies`、`DELETE .../policies/{policyId}`
  - **API Keys**: `GET/POST /api/v1/code/orgs/{id}/api-keys`、`DELETE .../api-keys/{keyId}`
  - **Scan Log**: `GET /api/v1/code/orgs/{id}/scan-log?limit=`
  - **Business Units**: `GET/POST /api/v1/code/orgs/{id}/business-units`、`POST .../business-units/{buId}/archive`
  - **Scan Approvals**: `GET /api/v1/code/orgs/{id}/scan-approvals`、`POST .../approve`、`POST .../deny`
  - **Scan Credentials**: `GET/POST/DELETE /api/v1/code/orgs/{id}/scan-credentials`
  - **Canonical Login**: `GET /api/v1/code/orgs/{id}/visual-similarity`、`POST /api/v1/code/orgs/{id}/canonical-login`
  - **SLA Policies**: `GET/POST /api/v1/code/orgs/{id}/sla-policies`、`DELETE .../sla-policies/{severity}`、`GET .../business-units`
  - **Scoring Config**: `GET/PUT /api/v1/code/orgs/{id}/scoring-config`、`POST .../scoring-config/reset`
  - **System Events** (platform admin): `GET /api/v1/events/scope`、`GET /api/v1/events?{filters}`、`GET /api/v1/events/aggregate?{filters}`

---

## HIDDEN（無 sidebar、有 route）

### Org Chart（`/projects/:orgId/org`）
- Page: `pages/OrgPage.tsx`
- Compound: `compounds/organization/OrgTree.tsx`（透過 `useOrgChart`）
- API:
  - `GET /api/v1/code/orgs/{id}/chart` — 節點 / 連線
  - `PUT /api/v1/code/orgs/{id}/chart` — (on action) 編輯後儲存

### Repo Detail（`/projects/:orgId/repos/:repoId`）
- Page: `pages/RepoDetailPage.tsx`
- Compound: `compounds/repos/RepoDetailView.tsx`（+ FixPlanPanel / ScanUploadDropzone / repo_detail/*）
- API:
  - `GET /api/v1/code/repos/{repoId}/health` — Repo profile（file_count / findings / dimensions）
  - `GET /api/v1/code/orgs/{id}/computed-score` — 取 repo 對應 grade
  - `GET /api/v1/code/repos/{repoId}/ai-fix-context` — AI fix 上下文
  - `POST /api/v1/code/repos/{repoId}/scans` — (on action) 觸發 scan
  - `POST /api/v1/code/repos/{repoId}/fix-plan` — (on action) FixPlanPanel 生成
  - `GET /api/v1/code/repos/{repoId}/fix-plan` — (on action) 快取版讀回
  - GitHub metadata 經 `useRepoDetails` → `GET /api/v1/code/orgs/{id}/github/repos/{owner}/{repo}`

### WarRoom Dispatch（`/projects/:orgId/warroom/:sectionId`）
- Page: `pages/WarRoomPage.tsx`
- Compound: `compounds/warroom/WarRoomView.tsx`（透過 `sectionRegistry.tsx` 分派）
- 公共：
  - `GET /api/v1/code/orgs/{id}/health-summary` — `needsHealth` section
  - `GET /api/v1/code/orgs/{id}/api-definitions` — `arch-api` section
- 各 section 對應 API（僅列尚未在上方頁面涵蓋者）：
  - `arch-overview` / `arch-api` / `arch-deps` / `arch-repos`：`GET .../arch-map`、`GET .../dependencies[?enrich=true]`、`GET /api/v1/code/repos/{repoId}/arch`
  - `arch-dead-code`：`GET .../dead-code`
  - `arch-duplicates`：`GET .../duplicates`
  - `arch-scan-diff`：`GET .../scan-diff`
  - `sec-iac`：`GET .../iac-findings`
  - `sec-license`：`GET .../license-issues`
  - `sec-malware`：`GET .../scan-results?category=malware`
  - `sec-cspm`：`GET .../cspm-findings`
  - `sec-runtime`：`GET .../runtime-events?limit=`
  - `sec-reachability`：`GET .../arch-map`、`GET .../taint-flows`
  - `sec-redteam`：`POST/GET /api/v1/code/pipeline/runs/...`、`POST .../campaigns/{id}/report`、`GET .../campaign-budget/incidents`
  - `sec-news`：`GET /api/v1/code/news`
  - `sec-overview`：`GET .../issues?status=open`
  - `history-va`（Code Activity）：同 `/history-feed`（篩 kind 為 code）
  - `exp-paths`：用 `compounds/exposure/AttackPathsView.tsx`（**和 top-level `/attack-paths` 不同**） → `GET /api/v1/code/orgs/{id}/ctem-paths`、`POST .../ctem-paths/recompute`、`PATCH .../ctem-paths/{pathId}/status`
  - 其它 `exp-*` / `scoring-*` 沿用同名 top-level 頁面

---

## PROJECTS / CAPABILITY / PUBLIC

### Projects 列表（`/flyto/projects`）
- Page: `src-next/app/(control-panel)/flyto/projects/components/ProjectsPage.tsx`
- API:
  - `GET /api/v1/code/orgs` — Org 列表
  - `GET /api/v1/code/orgs/{id}/health-summary` — 每張 OrgCard 摘要
  - `GET /api/v1/code/orgs/{id}/computed-score` — OrgCard grade
  - `POST /api/v1/code/orgs` — (on action) 建立新 org
  - `DELETE /api/v1/code/orgs/{id}` — (on action) 刪除 org

### Capability 介紹頁（`/flyto/capability/...`）
- Page: `src-next/app/(control-panel)/flyto/capability/components/CapabilityPage.tsx`
- **無 API**（純行銷靜態頁，內容皆 i18n 字串）

### 認證頁（`/sign-in`、`/sign-up`、`/sign-out`、`/callback/*`）
- Page: `src-next/app/(public)/(auth)/...`
- **無 engine API 直接呼叫**。走 Firebase Auth SDK / GitLab PKCE / GitHub OAuth。
- 登入完成後在 OnboardingView 或 SourceControlTab 才會打 `POST /api/v1/code/orgs/{id}/token` 把 provider token 上傳。

### 錯誤頁（`/404`、`/401`）
- Page: `src-next/app/(public)/(errors)/...`
- **無 API**（純靜態）

---

## 附錄：跨頁共用的 endpoint 速查

| Endpoint | 主要使用頁面 |
|---|---|
| `GET /orgs/{id}/computed-score` | Dashboard / Repos / Repo Detail / Projects / Scoring / Score Trends |
| `GET /orgs/{id}/health-summary` | Dashboard / Repos / Projects / WarRoom（needsHealth） |
| `GET /orgs/{id}/attack-surface[?enrich=true]` | Dashboard / Domains / Posture Overview / Brand Protection |
| `GET /orgs/{id}/external-posture` | Dashboard / Domains / Posture Overview |
| `GET /orgs/{id}/pulse` | Dashboard / Pulse |
| `GET /orgs/{id}/ctem/priorities` | Dashboard / Posture Overview / CTEM Actions / Mitigations |
| `GET /orgs/{id}/issues?enrich=true` | Issues / CTEM Actions / WarRoom sec-overview |
| `GET /orgs/{id}/pentests` | Dashboard / Domains / Pentest |
| `GET /orgs/{id}/events` (SSE) | 所有 workspace 頁（全域 cache invalidation） |
| `GET /orgs/{id}/peer-baseline?sector=` | Dashboard / Posture Overview / Score Trends |
| `POST /orgs/{id}/reports/render-pdf` | Audit Timeline / Reports |
