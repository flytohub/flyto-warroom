# Scan Upload UI — 設計規格

## 出現的位置

Upload scan 入口要出現在**三個地方**，確保不管使用者在哪個階段都能找到。

---

## 1. Onboarding（第一次，沒有 repo）

當 `repos.length === 0` 時顯示。現有三步流程下面加 "or" 分隔線。

```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│    ①──────────②──────────③                               │
│  Connect    Select     First                             │
│  GitHub     Repos      Scan                              │
│                                                          │
│  ┌────────┐ ┌────────┐ ┌────────┐                       │
│  │ GitHub │ │ Select │ │ Scan   │                       │
│  │ icon   │ │ repos  │ │ icon   │                       │
│  │        │ │ icon   │ │        │                       │
│  │[Connec]│ │[Select]│ │ ...    │                       │
│  └────────┘ └────────┘ └────────┘                       │
│                                                          │
│  ─────────── or ───────────                              │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │  Upload a local scan                              │    │
│  │                                                    │    │
│  │  Already scanned with flyto-indexer?               │    │
│  │  Upload results without connecting GitHub.          │    │
│  │                                                    │    │
│  │  ┌──────────────────────────────────────────┐     │    │
│  │  │  Drag & drop scan.json                    │     │    │
│  │  │  or click to select file                  │     │    │
│  │  └──────────────────────────────────────────┘     │    │
│  │                                                    │    │
│  │  pip install flyto-indexer                         │    │
│  │  flyto-index scan . && flyto-index export .        │    │
│  │                                  > scan.json       │    │
│  │                                                    │    │
│  │  Repo name: [________________]                     │    │
│  │                                                    │    │
│  │  [Upload & Analyze]                                │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**元件：** `OnboardingView.tsx` 新增 `ScanUploadSection` 在三步卡片下方。

**流程：**
1. 用戶拖放或選擇 `scan.json`
2. 輸入 repo 名稱（因為沒有 GitHub 連接，所以手動輸入）
3. 點 Upload & Analyze
4. 前端：
   a. `POST /api/v1/code/orgs/{orgId}/repos` 建立 repo（provider: "local", fullName: 用戶輸入）
   b. `POST /api/v1/code/repos/{repoId}/scan-upload` 上傳 JSON
5. 跳到 Dashboard（repo 有了，onboarding 消失）

---

## 2. Settings → Integrations Tab（已有 repo 後加新的）

現有的 IntegrationsTab 有 GitHub / GitLab 連接按鈕。在下方加一個
"Local Scan Upload" 區塊。

```
┌─────────────────────────────────────────────────────┐
│ Settings                                             │
│ ┌──────┐ ┌───────────┐ ┌────────┐ ┌──────────────┐  │
│ │Genera│ │Integrations│ │Scanning│ │Notifications │  │
│ └──────┘ └───────────┘ └────────┘ └──────────────┘  │
│                                                      │
│ GitHub    [Connected ✓]     [Manage Repos]           │
│ GitLab    [Not connected]   [Connect]                │
│                                                      │
│ ──────── Local Scan Upload ────────                  │
│                                                      │
│ Upload flyto-indexer results for a new or             │
│ existing repository.                                  │
│                                                      │
│ Target repo: [dropdown: existing repos + "New repo"] │
│ New repo name: [________] (只在選 "New repo" 時出現) │
│                                                      │
│ ┌────────────────────────────────────────┐           │
│ │  Drag & drop scan.json                  │           │
│ │  or click to select file                │           │
│ └────────────────────────────────────────┘           │
│                                                      │
│ [Upload]                                             │
└─────────────────────────────────────────────────────┘
```

**元件：** `IntegrationsTab.tsx` 新增 `LocalScanUpload` section。

**流程：**
- 選擇現有 repo → `POST /scan-upload`（覆蓋上次 scan 結果）
- 選擇 "New repo" → 先建 repo，再 upload
- Dashboard 自動更新（SSE `scan.complete` event）

---

## 3. Repo Detail View — Re-upload（同一個 repo 重新掃描）

在 RepoDetailView 的 Scan 按鈕旁邊加一個 Upload 按鈕。

```
┌─────────────────────────────────────────────────────┐
│ flyto-engine                                         │
│ backend · B · 640/100                                │
│                                                      │
│ [Scan] [Upload Local Scan] [Verify]                  │
│                                                      │
│ Health Dimensions                                    │
│ ...                                                  │
└─────────────────────────────────────────────────────┘
```

**元件：** `RepoDetailView.tsx` 在 ScanButton 旁加 `UploadButton`。

**流程：**
- 點 Upload → 彈出 Modal（拖放 JSON + Upload 按鈕）
- `POST /scan-upload` → Dashboard 刷新
- 如果有 `--full` 的 index data → verify confidence 自動升級

---

## 共用元件設計

### `ScanUploadDropzone`

可複用的拖放區元件，三個入口都用同一個。

```tsx
interface ScanUploadDropzoneProps {
  repoId?: string          // 已有 repo 時直接用
  orgId: string
  onSuccess?: () => void   // 上傳成功 callback
  onRepoCreated?: (id: string) => void  // 新 repo 建立後
  showRepoNameInput?: boolean  // onboarding 模式顯示 repo name 輸入
}
```

**功能：**
- 拖放 `.json` 檔案
- 檢查 JSON 格式（有 `profile` 欄位）
- 顯示上傳前摘要（health score, file count, dep count）
- 進度條（uploading → processing → done）
- 錯誤處理（格式錯誤、認證失敗、server error）

**檔案位置：** `src/components/compounds/repo/ScanUploadDropzone.tsx`

---

## Engine 端需要的調整

### 新增 "local" provider 類型

`connected_repos` 表的 `provider` 欄位目前只有 `github` / `gitlab`。
需要支持 `local`（沒有 GitHub/GitLab 連接的 repo）。

```go
// handlers_scan_upload.go 的 handleScanUpload 已經存在
// 但需要一個 "create repo without provider" 的 endpoint

// POST /api/v1/code/orgs/{orgId}/repos/local
// Body: { "name": "my-project", "full_name": "my-org/my-project" }
// → 建立 provider="local" 的 connected_repo
```

或者複用現有的 `POST /repos` endpoint，允許 `provider: "local"`。

---

## 操作流程圖

```
第一次使用:
  用戶打開 flyto-code
    → 沒有 repo → 顯示 Onboarding
      → 選 GitHub/GitLab 路線 → 現有流程
      → 選 Upload 路線:
          1. 拖放 scan.json
          2. 輸入 repo 名稱
          3. Upload & Analyze
          4. → Dashboard

已有 repo，加新的:
  Settings → Integrations
    → GitHub [Manage Repos] → 現有 picker
    → Local Scan Upload:
        1. 選 "New repo" → 輸入名稱
        2. 拖放 scan.json
        3. Upload
        4. → repo 出現在 list

已有 repo，重新掃描:
  Repo Detail → [Upload Local Scan]
    → Modal → 拖放 scan.json → Upload
    → Dashboard 刷新

已有 repo，CI 自動:
  GitHub Action → POST /scan-upload
    → 背景處理 → SSE event → Dashboard 刷新
```
