# Domains 分層設計

## 現狀問題

目前 PentestProject 只有 `name` + `target_url` + `project_type`。
所有 domain 平等對待，沒有區分生產 / 測試 / 開發環境，
也沒有「訂閱觀察」和「主要評分」的概念。

---

## 新設計

### Domain 資料模型

```
PentestProject（改名概念上 = Domain）
├── name: "Flyto2 API"           ← 用戶取的名字
├── target_url: "https://api.flyto2.com"
├── project_type: "rest_api"
│
├── environment: "production"   ← 新增：production / staging / development / testing
├── role: "primary"             ← 新增：primary / subscribe
├── display_name: "主要 API"    ← 新增：用戶自訂顯示名稱（可選）
├── tags: ["payment", "auth"]   ← 新增：自由標籤
├── linked_repo_id: "repo-xxx"  ← 已有
│
├── scoring_enabled: true       ← 由 role 決定：primary=true, subscribe=false
└── discovery_schedule: "daily" ← primary 才自動跑 discovery
```

### 兩種 Role

| Role | 說明 | Discovery | 評分 | 計入 Dashboard |
|---|---|---|---|---|
| **primary** | 自己的 domain，完整掃描 | ✅ 自動排程 | ✅ 計入 org health | ✅ |
| **subscribe** | 觀察別人的 domain，只看不打 | ❌ 手動才跑 | ❌ 不計入 health | 僅顯示 |

### 四種 Environment

```
┌─────────────────────────────────────────────────────────┐
│ Flyto2 API                                                │
│                                                          │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐           │
│  │ Production │ │  Staging   │ │   Dev      │           │
│  │ api.flyto  │ │ stg.flyto  │ │ dev.flyto  │           │
│  │ 🟢 A (92)  │ │ 🟡 B (71)  │ │ ⚪ --     │           │
│  │ primary    │ │ primary    │ │ subscribe  │           │
│  └────────────┘ └────────────┘ └────────────┘           │
│                                                          │
│  ┌────────────┐                                          │
│  │ Competitor │                                          │
│  │ aikido.dev │                                          │
│  │ 📋 subscribe│                                          │
│  └────────────┘                                          │
└─────────────────────────────────────────────────────────┘
```

---

## UI 設計

### Domain 列表（改版 — 展開式分組）

根 domain 作為可展開的 group header，子網域收在裡面。
CSV 匯入後自動分組。

```
┌──────────────────────────────────────────────────────────────┐
│ Domains                      [Import CSV] [+ Add Domain]     │
│                                                              │
│ ┌─ Filter ──────────────────────────────────────────────┐   │
│ │ All  Production  Staging  Dev  Testing  Subscribe      │   │
│ └───────────────────────────────────────────────────────┘   │
│                                                              │
│ ▼ flyto2.com                            3 subdomains         │
│ ┌────────────────────────────────────────────────────────┐   │
│ │ 🟢  flyto2.com                                         │   │
│ │     Root · Production · Attack Surface                  │   │
│ │     Score: A (92) · Last scan: 2h ago                   │   │
│ ├─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤   │
│ │   🟢  api.flyto2.com     Production  REST API          │   │
│ │   🟡  stg.flyto2.com     Staging     REST API          │   │
│ │   ⚪  dev.flyto2.com     Dev         Frontend          │   │
│ └────────────────────────────────────────────────────────┘   │
│                                                              │
│ ▶ aikido.dev                            1 subdomain ·📋      │
│                                                              │
│ ▶ competitor.io                         0 subdomains ·📋     │
└──────────────────────────────────────────────────────────────┘
```

**展開邏輯：**
- 根 domain = `groupByRootDomain()` 的結果
- 點 ▶ 展開看子網域
- 預設展開第一個 group
- 每個子網域行顯示 environment badge + type

**CSV 匯入流程：**
1. 用戶點 [Import CSV]
2. 拖放 CSV 或選檔
3. 預覽分組結果（哪些是 root、哪些是 sub）
4. 選擇 environment + role（套用全部）
5. 確認 → `POST /domains/import`
6. 每個 root domain 自動觸發 16-pass discovery

### 新增 Domain Modal（改版）

```
┌─────────────────────────────────────────────┐
│ Add Domain                                   │
│                                              │
│ Name:        [Flyto2 API              ]       │
│ URL:         [https://api.flyto2.com ]       │
│                                              │
│ Environment:                                 │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐        │
│ │ Prod │ │ Stag │ │ Dev  │ │ Test │        │
│ └──────┘ └──────┘ └──────┘ └──────┘        │
│                                              │
│ Role:                                        │
│ ○ Primary — 完整掃描，計入評分               │
│ ○ Subscribe — 觀察，不計入評分               │
│                                              │
│ Type:                                        │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│ │ Frontend │ │ REST API │ │ GraphQL  │     │
│ └──────────┘ └──────────┘ └──────────┘     │
│                                              │
│ Tags: [payment, auth               ]         │
│                                              │
│ [Create & Scan]                              │
└─────────────────────────────────────────────┘
```

---

## Engine 改動

### DB Schema（PentestProject 加欄位）

```sql
ALTER TABLE pentest_projects
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'primary',
  ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tags TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS scoring_enabled BOOLEAN NOT NULL DEFAULT true;
```

### API 改動

**POST /api/v1/code/orgs/{id}/targets** — owned 目標建立或復用 pentest project，並支援欄位：

```json
{
  "name": "Flyto2 API",
  "target": "https://api.flyto2.com",
  "target_url": "https://api.flyto2.com",
  "relationship": "owned",
  "assessment_intent": "passive_full_footprint",
  "project_type": "rest_api",
  "environment": "production",
  "role": "primary",
  "display_name": "主要 API",
  "tags": ["payment", "auth"]
}
```

**GET /api/v1/code/orgs/{id}/pentests** — 回傳新增欄位 + filter：

```
GET /pentests?environment=production    ← 篩選環境
GET /pentests?role=primary              ← 只看主要
GET /pentests?role=subscribe            ← 只看訂閱
```

### 評分規則

```
計算 Org Health Score 時：
  只加總 role=primary 的 domain 分數
  subscribe domain 完全不影響 org health

Discovery 自動排程：
  primary → 依 scan_cron 設定自動跑（預設每天 3AM）
  subscribe → 只有手動觸發時才跑

Verify（closed-loop）：
  primary → 可以跑 dynamic verify
  subscribe → 只能跑 static verify（不送 payload 到別人的 domain）
```

---

## 前端改動

### 修改檔案清單

| 檔案 | 改動 |
|---|---|
| `domains/types.ts` | 加 `DomainEnvironment`、`DomainRole` type |
| `domains/DomainsView.tsx` | 加 environment filter tab、role badge |
| `domains/DomainTable.tsx` | 顯示 environment + role badge |
| `domains/DomainDetail.tsx` | 顯示 environment + subscribe warning |
| `lib/engine/pentest.ts` | API client 加新欄位 |

### 新元件

| 元件 | 用途 |
|---|---|
| `EnvironmentBadge` | Production 🟢 / Staging 🟡 / Dev ⚪ / Testing 🔵 |
| `RoleBadge` | Primary / Subscribe 標籤 |

---

## Subscribe 模式用途

1. **監控競爭對手** — 加 `aikido.dev` 為 subscribe，看他的 tech stack / SSL / 變更
2. **監控供應商** — 加供應商 API domain，發現他 SSL 過期或 WAF 掉了及時通知
3. **Dev 環境觀察** — dev domain 不需要計分，只是想看跟 prod 有什麼差異
4. **客戶環境** — 如果幫客戶做資安評估，加客戶 domain 為 subscribe

---

## API 盲掃 — 不看 code 也能發現的 API

Discovery 現有 12 pass 都是基礎設施層（DNS/SSL/port）。
要在 Domain Detail 裡顯示「這台 server 對外有哪些 API」，
需要新增以下 discovery pass：

### 已有

| Pass | 做什麼 | 資料來源 |
|---|---|---|
| `api_verify` | 拿 code scan 的 API 定義去打 domain 驗證活不活 | 需要 code scan |

### 要新增

| Pass | 做什麼 | 資料來源 | 複雜度 |
|---|---|---|---|
| `api_docs_probe` | 試 `/swagger`, `/docs`, `/openapi.json`, `/api/docs`, `/graphql` | HTTP 200 + content sniff | 低 |
| `api_crawl` | 從首頁開始爬，收集所有 fetch/XHR 呼叫的 URL | headless browser (Playwright) | 中 |
| `js_bundle_scan` | 下載 JS bundle，regex 搜 `/api/`, `baseURL`, `fetch(` | HTTP GET + regex | 低 |
| `error_fingerprint` | 打不存在的路徑，從 error response 推框架 | HTTP 404 response body | 低 |
| `graphql_introspect` | 對 `/graphql` 送 introspection query | HTTP POST | 低 |

### 每個 pass 的輸出

全部存成 `AttackSurfaceAsset`，`asset_type` 分別是：

```
api_docs_probe     → { "swagger_url": "/docs", "openapi_url": "/openapi.json", "spec": {...} }
api_crawl          → { "endpoints": [{ "method": "POST", "path": "/api/v1/login", "source": "xhr" }] }
js_bundle_scan     → { "endpoints": [{ "path": "/api/v1/users", "source": "bundle", "file": "main.abc123.js" }] }
error_fingerprint  → { "framework": "FastAPI", "server": "uvicorn", "evidence": "404 response" }
graphql_introspect → { "types": [...], "queries": [...], "mutations": [...] }
```

### 前端顯示

Domain Detail 加一個 **API Discovery** tab：

```
┌─────────────────────────────────────────────────────┐
│ api.flyto2.com                                       │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌────────┐ ┌─────┐        │
│ │ SSL │ │WHOIS│ │ WAF │ │TechStk │ │ API │        │
│ └─────┘ └─────┘ └─────┘ └────────┘ └─────┘        │
│                                                      │
│ API Discovery                                        │
│                                                      │
│ 📄 OpenAPI spec found at /docs                       │
│    164 endpoints, FastAPI                             │
│    [View Full Spec]                                   │
│                                                      │
│ 🔍 Crawled endpoints (12 found)                      │
│    POST /api/v1/auth/login                           │
│    GET  /api/v1/users/me                             │
│    POST /api/v1/code/orgs                            │
│    ...                                               │
│                                                      │
│ 📦 JS bundle endpoints (8 found)                     │
│    /api/v1/health  (from main.js)                    │
│    /api/v1/config  (from main.js)                    │
│    ...                                               │
│                                                      │
│ 🔧 Framework: FastAPI (uvicorn)                      │
│    Evidence: 404 response pattern                    │
│                                                      │
│ ⚠️  GraphQL introspection enabled                    │
│    23 queries, 15 mutations exposed                  │
│    [This is a security risk — disable in production] │
└─────────────────────────────────────────────────────┘
```

### 優先順序

```
Phase 1（最快能做，純 HTTP）:
  1. api_docs_probe — 試常見 doc 路徑，有就解析 OpenAPI spec
  2. error_fingerprint — 打 404 看框架
  3. graphql_introspect — 送 introspection query

Phase 2（需要 JS 解析）:
  4. js_bundle_scan — 下載 JS，regex 掃 endpoint

Phase 3（需要 headless browser）:
  5. api_crawl — Playwright 爬頁面收集 XHR
```

Phase 1 的三個 pass 都是簡單 HTTP 請求，每個 50 行 Go 以內。

---

## 實作順序

1. **Engine**: migration 加欄位 + API 接受新欄位 + health 排除 subscribe
2. **Engine**: 新增 api_docs_probe / error_fingerprint / graphql_introspect discovery pass
3. **Frontend**: filter tab + badge + create modal 改版 + API Discovery tab
4. **Discovery**: primary 自動排程 / subscribe 手動
5. **Verify**: subscribe 限制只能 static
6. **Phase 2-3**: js_bundle_scan + api_crawl（需要更多時間）
