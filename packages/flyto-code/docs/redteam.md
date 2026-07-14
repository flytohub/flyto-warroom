# Red Team War Room

flyto-code 的紅軍演練能力。本文說明**做到哪、沒做到哪、怎麼用**。

---

## TL;DR

- 12 支官方 pentest YAML（從 flyto-core 複製）涵蓋 OWASP Top 10 + LLM + business logic
- 4 層守門：Scope Guard、Consent Ladder、Evidence Pack、Regression Vault
- 策略層：規則式 Planner（依前輪結果決定下一步）+ AI 指揮官（BYOK 可用，simulator fallback）
- 多 campaign tabs，持久化到 localStorage，週末關機回來狀態還在
- **實證**：對 OWASP Juice Shop 跑出 5 個 BREACH + 11 個 critical findings，含完整攻擊鏈（SQLi → token 盜取 → chained IDOR → admin 提權）

**尚未達到：** production-grade recon/discovery 自動化（目前 playbook 假設 generic API shape，對非標準路徑盲點大），cloud 端 platform key fallback（客戶還不能零配置 SaaS），UI chip 還沒把 scope/consent/evidence/vault 狀態顯示出來。

---

## 架構

```
┌──────────────────────────────────────────────────────────────────┐
│ flyto-code (React)                                               │
│                                                                  │
│   RedTeamView                                                    │
│     ├─ useRedTeamCampaign (hook)                                 │
│     │    ├─ planner  → 依 round shape 選下一支 playbook            │
│     │    ├─ scope    → YAML 發前驗 URL/method 在範圍               │
│     │    ├─ consent  → active/destructive playbook 須授權          │
│     │    ├─ evidence → 每輪簽章 (SHA256 + HMAC)                   │
│     │    ├─ vault    → 攻破的 YAML 入庫，regression 重跑          │
│     │    └─ AI       → /api/ai/chat (cloud BYOK) or sim          │
│     │                                                            │
│     └─ BrowserLiveView (Chrome 串流 from cloud worker)           │
│                                                                  │
└───────────────────────────┬──────────────────────────────────────┘
                            │ HTTPS
┌───────────────────────────┴──────────────────────────────────────┐
│ flyto-cloud (FastAPI, Cloud Run)                                 │
│                                                                  │
│   POST /api/workflows/run  → 執行 YAML                            │
│   POST /api/ai/chat        → LLM 呼叫（BYOK 存放）                │
│   GET  /api/workflows/executions/{id}                             │
│   WS   /ws/browser/{id}    → Chrome JPEG 串流                    │
│                                                                  │
│   import flyto_core        → 實際跑模組 (http.batch/browser.*)    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Key 流向：** AI key 永遠住在 flyto-cloud 伺服器 env var 或 BYOK 加密儲存。frontend 與 git 完全不碰。

---

## 檔案清單

```
src/lib/cloud/
├── playbooks/
│   ├── access_control.yaml     (BOLA/IDOR, A01)
│   ├── auth_session.yaml       (A07)
│   ├── business_logic.yaml     (A04)
│   ├── client_side.yaml        (XSS/CSRF, A03/A07)
│   ├── code_injection.yaml     (RCE, A03)
│   ├── deserialization.yaml    (A08)
│   ├── file_misconfig.yaml     (A05)
│   ├── hardening.yaml          (A05)
│   ├── llm_injection.yaml      (LLM01:2025)
│   ├── secrets_crypto.yaml     (A02)
│   ├── sql_injection.yaml      (A03)
│   └── ssrf.yaml               (A10)
├── playbooks.ts                SEED_PLAYBOOKS registry + runnablePlaybooks()
├── planner.ts                  analyseRounds + planNextRound
├── scope.ts                    validateYamlInScope + extractRequests
├── consent.ts                  requiredConsentFor + hasConsent + grantConsent
├── evidence.ts                 buildEvidence + verifyEvidence (HMAC-SHA256)
├── vault.ts                    addToVault + staleVaultEntries + markReplayed
├── ai.ts                       chat() + buildRedTeamPrompt + extractYaml
├── ai-sim.ts                   simulateChat (deterministic fallback)
├── client.ts                   cloudRequest + cloudWsUrl
├── workflows.ts                runWorkflow + getExecution
└── persistence.ts              saveCampaign + loadCampaign (v3 schema)

src/hooks/useRedTeamCampaign.ts  主 orchestrator

src/components/compounds/warroom/RedTeamView.tsx
                                War room UI (3 panel: playbooks / stage / log+AI)
```

---

## Playbook 庫

12 支從 `flyto-core/workflows/pentests/` 直接複製。**不要在 flyto-code 改寫 YAML** — flyto-core 才是 source of truth，這邊只是 Vite `?raw` 內嵌。

每支 playbook 有：
- `id` — 內部識別
- `kind` — `recon` 自動過 consent / `active` 需授權
- `severity` — moderate/high/critical
- `owasp` — 分類
- `requires` — 必要 params（`target_url` 之外的額外變數）
- `yaml` — flyto-core 格式 (`steps: / edges:`)

新增 playbook 的流程：
1. 在 `flyto-core/workflows/pentests/` 寫新 YAML 並測試
2. 複製到 `flyto-code/src/lib/cloud/playbooks/`
3. 在 `playbooks.ts` 加一筆 `SeedPlaybook` 元資料
4. 更新 `CAMPAIGN_ORDER`（若該支要排進預設序列）
5. 跑 `playbooks.test.ts` 驗證

---

## 一輪攻擊的生命週期

```
rounds[i] 觸發
   │
   ▼
[1] planner.planNextRound(rounds, consumed, runnable)
   │    ├─ rounds 為空 → hardening (baseline)
   │    ├─ staticOnly → 只留 safe-static，用完 done
   │    ├─ hasApi → sqli/client/access 插隊
   │    ├─ hasAuthSurface → auth_session/secrets 插隊
   │    └─ default priority
   │
   ▼
[2] consent gate
   │    if playbook.kind != 'recon' && !hasConsent():
   │        status = 'awaiting-consent'
   │        await operator grant()
   │
   ▼
[3] scope guard
   │    validateYamlInScope(yaml, scope, params) → violations
   │    if violations: status='blocked', skip dispatch
   │
   ▼
[4] cloud dispatch
   │    POST cloud.flyto2.com/api/workflows/run
   │    { workflowYaml, params: { target_url, ...extraParams } }
   │    ← { execution_id }
   │
   ▼
[5] poll execution
   │    while not terminal: getExecution(id); update logs
   │
   ▼
[6] analyse result
   │    verdict = exploitable | sanitized | unreachable | null
   │    findings = execution.output.findings_count
   │
   ▼
[7] evidence pack
   │    buildEvidence({ yaml, result, ... })
   │    → { yamlHash, resultHash, signature }
   │
   ▼
[8] vault push (if exploitable)
   │    addToVault({ yaml, executionId, ... })
   │
   ▼
[9] next round (loop back to [1])
```

**停止條件：** `verdict=exploitable` / `status=stopped` / `rounds >= maxRounds` / `planner → done`

---

## 守門層

### Scope Guard (`scope.ts`)

**問題：** AI 可能產生打其他 host 的 YAML（LLM hallucination / prompt injection）。
**解法：** YAML 發前解析每個 URL，比對 `CampaignScope`：
- `allowedHosts` — 支援 `*.example.com` 單層 wildcard
- `allowedPathPrefixes` — 可選的 path allowlist
- `allowedMethods` — 可選的 HTTP method allowlist
- `allowTemplateOnly` — 未解析 `{{var}}` 是否放行（預設 true）

```ts
validateYamlInScope(yaml, scope, params) → ScopeViolation[]
```

**預設 scope：** `scopeFromTargetUrl(targetUrl)` 鎖該 target host。零設定也不會打別人的 server。

### Consent Ladder (`consent.ts`)

**問題：** 一個 campaign 跑一週，第一天按過「允許 destructive」不代表第 7 天還該允許。
**解法：** 三級授權 + TTL：

| Level | 觸發 | TTL | 誰歸類 |
|---|---|---|---|
| `recon` | 自動，不問 | 365 天 | hardening, file_misconfig (recon 面) |
| `active` | 按鈕確認 | 60 分鐘 | 一般 active playbook |
| `destructive` | 2FA / 雙確認 | 10 分鐘 | code_injection, deserialization, secrets_crypto, 及 critical+injection |

```ts
requiredConsentFor(playbook) → ConsentLevel
hasConsent(grants, 'destructive') → boolean
grantConsent('active', userEmail) → ConsentGrant
pruneGrants(grants) → ConsentGrant[]  // 清過期
```

高等級 grant 隱含覆蓋低等級（有 destructive 就能做 active）。

### Evidence Pack (`evidence.ts`)

**問題：** 紅軍報告給客戶要有稽核鏈。
**解法：** 每輪產 SHA256(yaml) + SHA256(canonicalJSON(result)) + HMAC-SHA256 簽章：

```ts
buildEvidence({ round, campaignId, executionId, playbookId, timestamp, yaml, result })
  → { schema:1, yamlHash, resultHash, signature }

verifyEvidence(entry, yaml, result) → boolean  // 篡改任一項返 false
```

**簽章密鑰：** 每個 campaign 獨立 32-byte 隨機值，存在 `localStorage` key `flyto_redteam_evidence_key_<campaignId>`。campaign 結束時 `destroyEvidenceKey()` 清除。

**JSON 正規化：** `canonicalJSON()` 遞迴排序 key，確保相同邏輯 payload 產相同 hash（key 順序無關）。

**注意：** 這**不是**合規級 chain-of-custody。localStorage 可被操作者篡改。合規需求要 push 到 tamper-evident log (Sigstore/Rekor/blockchain) — API 已備妥，換 key 來源即可升級。

### Regression Vault (`vault.ts`)

**問題：** 兩個月前打穿的漏洞，修補過了嗎？
**解法：** 每個攻破的 YAML 自動入庫，排程器每日重跑，結果標 `still-exploitable` / `patched`。

```ts
addToVault(orgId, { projectId, targetUrl, playbookId, yaml, originalExecutionId })
  → VaultedExploit  // id = projectId:playbookId:executionId

listVault(orgId) → VaultedExploit[]        // capturedAt 倒序
staleVaultEntries(orgId, 24h) → ...        // 排程器用
markReplayed(orgId, id, 'patched')         // 重跑後更新
```

**Replay 路徑：** hook 的 `replay(exploitId)` 會走同樣的 scope guard（避免原本合規的 YAML 因 scope 變小而變違規），再次 dispatch，標新 verdict。

---

## 策略層（Planner）

`planner.ts` 做的是：**依前輪 findings 推斷 target shape，決定下一支該打哪個 playbook**。

`analyseRounds(rounds)` 產出 `TargetShape`：
- `dynamicScore` — 所有輪 findings 加總
- `hasApi` — sqli/client/access_control/business_logic 有 finding → true
- `hasGraphql` — llm_injection 有 finding → true
- `hasAuthSurface` — auth_session 有 finding → true
- `hasFetchParam` — ssrf 有 finding → true
- `staticOnly` — dynamic playbook ≥3 attempted + 0 hits → true
- `activeRoundsFired` — 非 recon 輪次數

`planNextRound(input)` 決策：

| 條件 | 決策 |
|---|---|
| `rounds.length >= maxRounds` | `done: reached maxRounds` |
| `rounds.length == 0` | `fire: hardening (baseline)` |
| `shape.staticOnly` | `fire static-safe only (file_misconfig / secrets_crypto)`；用完 `done` |
| `shape.hasApi` | 優先序：sqli → client → access → business → default |
| `shape.hasGraphql` | 優先序：llm → business → default |
| `shape.hasAuthSurface` | 優先序：auth_session → secrets_crypto → default |
| `shape.hasFetchParam` | 優先序：ssrf → default |
| 其他 | `DEFAULT_PRIORITY` + 跳過 consumed |

**這層不是 AI**。是確定性規則，讓系統在沒有 LLM 的情況下也能合理行動。

---

## AI 指揮官

`ai.ts` + `ai-sim.ts` 提供兩條路：

### 真 AI（cloud BYOK）
```
hook → chat({ message, history, session_id }) → POST /api/ai/chat
   ← flyto-cloud 用 user 的 BYOK 呼 OpenAI/Anthropic
   ← 回傳 { message, tool_output: { yaml } }
extractYaml() 從 fenced block 或 tool_output 抽 YAML
```

### Simulator（無 key）
`simulateChat(req, ctx)` 讀 rounds + runnable playbooks，呼叫 planner 決策，生成 plausible 評論 + 包裝成 `ChatResponse` 格式。**API 與真 AI 完全兼容**，hook 感受不到切換。

### 模式切換
```ts
useRedTeamCampaign({ aiMode: 'auto' })
// 'auto'      → 先試 cloud，失敗 fallback sim
// 'cloud'     → 硬走 cloud，失敗就錯
// 'simulator' → 永遠不打 cloud
```

---

## Campaign 持久化

`persistence.ts` schema v3 存在 `localStorage.flyto_redteam_v3_<orgId>`：

```json
{
  "<campaignId>": {
    "schema": 3,
    "id": "project-id",
    "projectId": "...",
    "targetUrl": "https://...",
    "environment": "staging",
    "startedAt": 1700000000000,
    "lastActivityAt": 1700123456789,
    "status": "running|breached|stopped|...",
    "rounds": [Round, ...],
    "aiMessages": [AIMessage, ...]
  }
}
```

**限制：**
- `MAX_ROUNDS_PERSISTED = 60`（tail-trim）
- `MAX_AI_MESSAGES_PERSISTED = 40`
- `MAX_YAML_LEN = 3000 bytes`
- 30 天沒活動自動 expire
- 約 5MB localStorage quota 可容納幾十個 campaign

**Hydrate 流程：** hook 的 `load(projectId)` 讀回、檢查最後一輪是否還 in-flight，還在跑就重新 `getExecution()` 拉狀態；完了就直接顯示；非 terminal 就接續 poll。

---

## 實測結果（OWASP Juice Shop）

對 `http://localhost:3000` 跑 10 輪 campaign。結果：

| Round | Playbook | Verdict | 關鍵 findings |
|---|---|---|---|
| R0 | hardening | — | 3 missing security headers |
| R1 | file_misconfig | **EXPLOIT** | /ftp/, /api-docs, /metrics, swagger spec exposed |
| R2 | discovery | — | JS bundle scan → 2 API endpoints 抓到 |
| R3 | access_control | — | /rest/languages 42 records unauth（低風險） |
| R4 | sql_injection | **EXPLOIT** | `admin@flyto2.com' OR 1=1--` → 偷到管理員 JWT |
| R5 | access_control (chained) | **EXPLOIT** | 用偷到的 token dump 5 個用戶購物車（跨租戶 IDOR） |
| R6 | file_misconfig (deep) | **EXPLOIT** | /ftp/legal.md + /ftp/incident-support.kdbx (KeePass 密碼庫) |
| R7 | client_side | — | 無 XSS reflection |
| R8 | secrets_crypto | — | JWT alg=RS256, role=admin（用來驗 R4 偷的 token） |
| R9 | privesc (admin) | **EXPLOIT** | /rest/admin/application-configuration 200 + admin token |

**總計：** 10 輪 / 27 findings / 11 critical / **5 BREACHES**

**攻擊鏈：** R4 SQLi 偷 token → R5 用 token IDOR 其他用戶資料 → R9 用 token 打 admin endpoint = 完整 privilege escalation chain。

Replay 簡化版於 repo root `docs/redteam-campaign-juiceshop.txt`（未 commit，視情況補）。

---

## 2026-04-24 更新

### 架構變更：Frontend → Engine → Runner

紅軍 campaign 不再直接打 cloud.flyto2.com。完整鏈路：

```
Frontend (useRedTeamCampaign)
    ↓ POST /api/v1/code/workflows/run
Engine (Go, handlers_workflow.go)
    ↓ POST /run
Runner (Python, main.py + executor.py)
    ↓ flyto-core modules
flyto-core (http.batch, browser.*, llm.agent)
```

### 新增模組

| 檔案 | 用途 |
|------|------|
| `src/lib/cloud/artefacts.ts` | 偵察結果提取 — 從 step output 解析 API paths、tech stack、WAF 指紋 |
| `src/lib/cloud/stealth.ts` | 隱匿設定 — quiet/balanced/aggressive 三級，UA 池，inter-step delay |
| `runner/executor.py` | Workflow 執行器 — 單 thread 跑所有 steps（browser context 共享） |
| `api/handlers_workflow.go` | Engine proxy — 轉發 /run 和 /executions 到 runner |

### Runner 能力

- **http.batch** — 發 HTTP 探測請求 ✅
- **browser.launch + evaluate** — Chrome 自動化（表單發現、JS 分析）✅
- **llm.agent** — GPT-4o 分析 HTTP response（prompt→task remap + API key 自動注入）✅
- **test.assert_*、output.display** — 結果判定 ✅
- **Stealth** — UA 注入、inter-step delay、jitter ✅
- **Findings extraction** — 從 LLM text response 提取 JSON findings ✅

### 已知落差（Roadmap）

### Recon discovery playbook
12 支官方 YAML 用硬編碼路徑。Artefact extraction 能從 response headers 提取 tech stack 和 API paths，但還沒有專門的 `recon.discovery.yaml` 做主動路徑爬取。

### Evidence chain-of-custody
HMAC 簽章用 localStorage 存的 campaign key，操作者可篡改。production 級合規需求要 push 到 tamper-evident log。API 已備妥。

### Scheduler 未實作
`staleVaultEntries()` 會回「該重跑的 exploit」清單，但還沒有 Cloud Scheduler / cron 每日呼叫這支 + 自動 replay。排程邏輯落在 flyto-cloud 後端，配合 `useRedTeamCampaign.replay()` 的 HTTP endpoint（尚未暴露）。

---

## 測試

```
src/lib/cloud/__tests__/
├── ai.test.ts          (8)   YAML extraction + prompt builder
├── ai-sim.test.ts      (5)   Simulator opening/breach/done paths
├── consent.test.ts     (12)  Ladder semantics, TTL, pruning
├── evidence.test.ts    (8)   Round-trip, tamper detection, canonicalisation
├── persistence.test.ts (6)   Save/load/trim/schema versioning
├── planner.test.ts     (12)  analyseRounds + planNextRound
├── playbooks.test.ts   (8)   12 canonical playbooks schema + requires
├── scope.test.ts       (19)  Host wildcard, path prefix, method, extract
└── vault.test.ts       (8)   Add/remove/replay/stale

src/hooks/__tests__/
└── useRedTeamCampaign.test.ts  (9)   Integration: scope block, consent gate,
                                      evidence attach, vault on breach
```

**總計：220+ 項測試，覆蓋策略層 + 所有守門層。**

跑法：
```bash
cd flyto-code
npx vitest run                 # 全部
npx vitest run src/lib/cloud/  # 只 cloud 模組
```

---

## 如何跑一次 Campaign（產品使用者）

1. **瀏覽器登入 flyto-code**（Firebase auth）
2. 在 cloud.flyto2.com 的 `/settings` 頁，AI Assistant 區塊貼 OpenAI/Anthropic key（BYOK）—或等 platform key fallback 上線就不用這步
3. flyto-code 打開 `Red Team` 頁
4. 點 `[+ new campaign]` → 選 target domain
5. 第一輪 hardening 自動跑（recon，不需授權）
6. 第二輪進 `file_misconfig` 時跳 consent 彈窗（active tier）→ 確認
7. 後續輪次 planner 自動決定，AI 若有 key 會接手 round 12+
8. 攻破時 status 變 BREACH，vault 自動收錄 exploit YAML
9. 隔天重開頁面：campaign 從上次狀態 resume（persistence）
10. 點 vault 標籤看 regression：哪些 exploit 還活著、哪些已修補

---

## 如何新增一條紅軍能力（工程師）

### Case 1: 新增一支 playbook
1. 寫 YAML 放 `flyto-core/workflows/pentests/`（tested locally）
2. `cp` 到 `flyto-code/src/lib/cloud/playbooks/`
3. 在 `playbooks.ts` 加 `SeedPlaybook` 元資料（surface/kind/severity/owasp/requires）
4. 若要排進預設序列，更新 `CAMPAIGN_ORDER`
5. `playbooks.test.ts` 裡新增測試確保 YAML schema 正確

### Case 2: 加新的 TargetShape signal
1. 在 `planner.ts` 的 `TargetShape` 介面加欄位
2. `analyseRounds()` 裡計算
3. `planNextRound()` 裡依此 signal 調優先序
4. `planner.test.ts` 加 test case

### Case 3: 加新的 consent 等級
1. `consent.ts` 的 `ConsentLevel` 型別加新層
2. `LEVEL_ORDER` 加 numeric rank
3. `requiredConsentFor()` 分類規則加一條
4. UI 端加授權按鈕（RedTeamView 尚未做）

### Case 4: 自訂 Evidence 簽章來源（升級到合規級）
1. `evidence.ts` 的 `getOrCreateCampaignKey()` 改從 KMS / HSM 取 key
2. `signature` 格式若要升級成 signed JWT 或 COSE，修 `hmacSha256Hex()`
3. `verifyEvidence()` 同步更新
4. `evidence.test.ts` 裡的 deterministic assertion 可能要 mock key 源

---

## 安全與合規注記

- **永遠不在 frontend / git 儲存 AI key**：BYOK 進 flyto-cloud 加密欄位，platform key 進 Cloud Run env var
- **攻擊 scope 必須明確聲明**：預設只鎖 target_url 的 host，要擴充範圍需手動改 `scope.allowedHosts`
- **Consent 不能繞過**：active/destructive 沒 grant 就 pause，stop() 會把 pending consent resolve 成 false
- **Evidence 可驗**：任何輸出的紅軍報告都該附 evidence signatures，第三方可以重跑 `verifyEvidence()` 確認 yaml + result 沒被改
- **洩漏處理**：若 API key 不小心進 chat / log，唯一有效措施是**立刻去 provider revoke**。用 key 的次數不重要，暴露才是重點
- **合規顧客**：enterprise 必須 BYOK（租戶隔離）；SMB 預設 platform key；兩條路徑並行

---

## 相關檔案

| 路徑 | 作用 |
|---|---|
| `src/lib/cloud/*.ts` | Data layer 全部 |
| `src/lib/cloud/playbooks/*.yaml` | 12 支官方 pentest YAML |
| `src/hooks/useRedTeamCampaign.ts` | Orchestrator hook |
| `src/components/compounds/warroom/RedTeamView.tsx` | UI |
| `src/styles/warroom.css` | 紅軍視覺設計 |
| `flyto-core/workflows/pentests/` | YAML source of truth (不在此 repo) |
| `flyto-cloud/src/ui/web/backend/api/ai/routes.py` | `/api/ai/chat` (BYOK) |
| `flyto-cloud/src/ui/web/backend/api/workflows/execution.py` | `/api/workflows/run` |
