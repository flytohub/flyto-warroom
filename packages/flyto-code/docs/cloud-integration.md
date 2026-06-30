# Cloud Integration — Pushing Workflow Templates to Flyto Automation

When a Flyto Code scan surfaces a gap that a DAST / red-team / page-automation
workflow would validate, we push that workflow (YAML) into **Flyto Automation**
(`flyto-cloud`) so it can run on a schedule against the live target.

Folders on the cloud side mirror the taxonomy flyto-code's AI builds per repo
(e.g. `repo42/auth-tests`, `repo42/injection-tests`). Two-way sync is anchored
by an `external_id` that flyto-code owns.

Design reference: [`flyto-engine/docs/flyto-code-sync.md`](../../flyto-engine/docs/flyto-code-sync.md).

---

## Where the APIs live

Short-term the template APIs live in `flyto-cloud` (FastAPI, Firestore-backed).
They will migrate to `flyto-engine` Phase 3 — same contract, different base URL.

| Env | Current base URL | Future base URL |
|-----|------------------|-----------------|
| Prod | `https://api.flyto2.com/templates` | `https://engine.flyto2.com/api/v1/templates` |
| Local | `http://localhost:8080/templates` | `http://localhost:8080/api/v1/templates` |

Expose as a single env var — `VITE_AUTOMATION_API_URL` — so the switchover is
config-only.

---

## Authentication

Two modes, same endpoints:

### User-interactive (Phase 0, works today)
Reuse the Firebase session the user is already authenticated into via
`useAuth`. Attach the ID token to every call:

```ts
const token = await auth.currentUser?.getIdToken()
fetch(url, { headers: { Authorization: `Bearer ${token}` } })
```

No extra setup. Rate-limited to 120 rpm per user.

### Headless automation (Phase 1+, required for CI / cron)
Issue an API key from the user's account settings UI (exists on the
cloud side: `POST /api-keys/`). Store in the org's secret manager —
never in the repo, never in localStorage.

```ts
fetch(url, { headers: { 'X-API-Key': process.env.FLYTO_API_KEY } })
```

Until the cloud auth middleware accepts `X-API-Key` for template routes
(tracked in the engine design doc as Gap #1), headless mode falls back
to a service account running the interactive Firebase flow.

---

## Core operations

### 1. Sync a repo's folder taxonomy

Idempotent upsert pattern — call once per repo scan:

```
GET  /templates/folders/                      # list existing
POST /templates/folders/           (create)   # when missing
PATCH /templates/folders/{id}      (update)   # when name/color drifted
DELETE /templates/folders/{id}     (delete)   # when repo dropped the bucket
```

Anchor by `external_id` once Gap #3 lands. Until then, flyto-code
maintains an `external_id → folder_id` map in its own store
(`engine:org_external_refs` table, planned).

### 2. Import a YAML workflow

**Single (works today):**
```
POST /templates/import/yaml
Body: { "yaml_content": "<yaml string>" }
Response: { "ok": true, "template": { "id": "tpl_…", … } }
```
Then assign to folder:
```
POST /templates/folders/move/
Body: { "template_ids": ["tpl_…"], "folder_id": "fld_…" }
```

**Bulk (Phase 2):**
```
POST /templates/import/batch
Headers: Idempotency-Key: <sha256(repo_id + scan_id)>
Body: {
  "items": [
    {
      "yaml": "<yaml>",
      "external_id": "repo42/login-brute",
      "folder_external_id": "repo42/auth-tests"
    },
    …
  ]
}
```
Per-item result array; partial success expected. Retry the same request
body with the same `Idempotency-Key` to resume safely.

### 3. Update an existing template

When the AI regenerates a workflow for an already-synced test:

```
PUT /templates/{template_id}/push
Body: { "yaml_content": "<updated yaml>" }
```

Revision-conflict errors (the cloud uses optimistic locking) surface as
`409` — treat as "someone edited by hand, ask before overwriting" rather
than retry-blindly.

### 4. Delete when the source gap is closed

```
DELETE /templates/{template_id}
```

Or, once `external_id` lookup is wired:
```
DELETE /templates?external_id=repo42/login-brute&source_system=flyto-code
```

---

## Sync model

**flyto-code is authoritative.** The cloud is a projection of what flyto-code
has decided to run. Rules:

- Every scan regenerates the desired set of `(folder, template)` for the repo.
- Diff against what the cloud currently has (by `external_id`).
- Create missing, update drifted, delete orphans — all in one batch where
  possible.
- Never pull from cloud → code. Users editing a pushed template in the cloud
  UI means they've forked it; mark the cloud template with a `diverged` flag
  (client-side state) and skip it on the next sync.

No webhooks back into flyto-code. The sync is scan-triggered, not
event-driven.

---

## Rate limiting & batching

- Cloud's current ceiling is **120 rpm per user** (`flyto-cloud/.../middleware/rate_limiter.py:30`).
- For a medium-sized org (50 repos × 10 workflows each), a naive sync
  would need ≥4 minutes. Use `POST /templates/import/batch` (Phase 2)
  or chunk into `100`-template waves with exponential backoff on 429.
- Folder operations are cheap; do them first so template imports can
  reference stable folder IDs.

---

## Error handling

| Status | Meaning | Retry? |
|--------|---------|--------|
| 200 / 201 | OK | — |
| 401 | Token expired / API key invalid | Refresh token, do not retry blindly |
| 402 | Quota exceeded (plan limit on workflows) | Surface to user, do not retry |
| 409 | Revision conflict on PUT | Abort, ask user to resolve |
| 422 | Idempotency-Key collision (same key, different body) | Fix key derivation, bug in caller |
| 429 | Rate limited | Exponential backoff, honour `Retry-After` |
| 5xx | Server error | Retry with idempotency key |

---

## Open gaps (track in engine design doc)

1. API-key auth not accepted on template routes
2. No bulk import endpoint
3. No `external_id` on TemplateDTO
4. No `Idempotency-Key` middleware on template routes
5. Rate limit too low for headless sync

Until those land, flyto-code's sync runner operates in "Phase 0" mode:
Firebase Bearer tokens, single YAML per call, client-side ID mapping,
no retry safety net. Design for Phase 2 from day one — the write path
only becomes production-grade there.

---

## Related

- `flyto-engine/docs/flyto-code-sync.md` — the binding contract & migration plan
- `flyto-code/docs/PRODUCT_ROADMAP.md` — where DAST / pentest YAML lives in the matrix
- `flyto-core/workflows/pentests/` — YAML workflows ready to sync
