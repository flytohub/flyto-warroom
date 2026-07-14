# Secret-leak remediation runbook (flyto-code)

Status: **PREPARED — 2 human actions remain (rotate + force-push).** Updated 2026-06-08.

## TL;DR after triage (verified with gitleaks 8.30.1)

Of 25 history findings, only **ONE is a real secret**: `GOOGLE_PAGESPEED_KEY`
(was in `.claude/settings.local.json`). The rest are non-secrets:
- the **public-by-design Firebase WEB API key** (shipped in the browser bundle), and
- **example/probe JWTs** inside the pentest detection playbook `secrets_crypto.yaml`.

What's already done (safe, no history rewrite, no rotation):
1. `git rm --cached .claude/settings.local.json` + `.gitignore` (this PR).
2. `.gitleaks.toml` added (this PR) allowlisting ONLY the confirmed non-secrets
   (public Firebase key by value; the pentest playbook by path). The real
   PageSpeed key is deliberately NOT allowlisted.
3. A scrubbed mirror was produced and **verified clean** locally:
   `/tmp/flyto-code-scrub` (git filter-repo removed `.claude/settings.local.json`,
   `dist-next/**`, `test-results/**` from all history) →
   `gitleaks detect --config .gitleaks.toml` = **"no leaks found"** (25 → 0).

The only steps left are the two a tool must not do for you:
- **(A) Rotate** the real `GOOGLE_PAGESPEED_KEY` (it was public in history) — GCP console.
- **(B) Force-push the scrubbed history** (irreversible; rewrites SHAs; breaks every
  clone + open PR — coordinate first). The verified mirror is ready at `/tmp/flyto-code-scrub`.

> Do NOT allowlist the PageSpeed key or `--admin`-merge past the blocking check —
> that would hide/ship a real leaked credential.

## What gitleaks found (values redacted; verified locally with gitleaks 8.30.1)

| Rule | File | Verdict to confirm |
|---|---|---|
| `gcp-api-key` | `.env.production` (still tracked) | Likely the **public-by-design Firebase web API key** (`AIzaSy…`, shipped in the browser bundle). If so → restrict in GCP console, not an emergency. Confirm it isn't a real server GCP key. |
| `gcp-api-key` | `cloudbuild.yaml` (still tracked) | Same key passed as a build arg — same verdict. |
| `generic-api-key` (`GOOGLE_PAGESPEED_KEY`) | `.claude/settings.local.json` (now untracked by this PR) | **Real API key — ROTATE.** Quota-abuse risk. |
| `gcp-api-key` | `.claude/settings.local.json` | Confirm + rotate if real. |
| `jwt` | `src-next/lib/cloud/playbooks/secrets_crypto.yaml`, `src/lib/...` (old) | Confirm whether it's an example/expired token in a detection playbook (false positive) or a real token. |
| `gcp-api-key` / `jwt` | `dist-next/assets/*.js` (already gitignored + untracked now) | Build output that baked the env key in — historical commits only. |
| `gcp-api-key` / `jwt` | `test-results/.playwright-artifacts/*.network` (already gitignored + untracked) | Test traces that captured tokens — historical commits only. |

Offending commits (history): `8ab58b00`, `342ca798`, `160398d6`, `79312c04`,
`1c26f625`, `1510eec8`, `962eedad`, `6b983a64`, `b316c727`.

## Done in this PR (safe, non-history, non-rotation)

- `.claude/settings.local.json` → `git rm --cached` + added to `.gitignore`
  (per-developer local file; must never be tracked). Stops re-leaking going forward.
- `dist`, `dist-next`, `test-results` were already gitignored — no tree change needed.

## Step 1 — ROTATE (owner / SecurityEngineer, do FIRST)

Rotate every key confirmed real **before** scrubbing history (scrubbing doesn't
un-leak a key that's already public):
1. `GOOGLE_PAGESPEED_KEY` — regenerate in Google Cloud Console → update wherever consumed.
2. Any real GCP/service key in `.env.production` / `cloudbuild.yaml` (NOT the public Firebase web key) — rotate.
3. Firebase web API key — not secret, but add **API key restrictions** (HTTP referrer + API allowlist) in the console.
4. Any real JWT in `secrets_crypto.yaml` — invalidate/re-issue.

Move real secrets out of committed files into CI/deploy-time env injection
(`.env.production` should not carry live secrets — CI already injects placeholders).

## Step 2 — SCRUB history (owner, AFTER rotation; rewrites shared history)

⚠️ Irreversible, rewrites SHAs, breaks every existing clone/PR — coordinate first
(freeze pushes, then everyone re-clones). Run on a fresh mirror:

```bash
pip install git-filter-repo
git clone --mirror https://github.com/flytohub/flyto-code.git flyto-code-scrub
cd flyto-code-scrub
cat > /tmp/paths.txt <<'EOF'
.claude/settings.local.json
.env.production
EOF
# Drop the leaky files from ALL history:
git filter-repo --invert-paths --paths-from-file /tmp/paths.txt --force
# For the dist-next/test-results bundles (globs), also:
git filter-repo --path-glob 'dist-next/**' --path-glob 'test-results/**' --invert-paths --force
# (Optional) redact specific strings instead of whole files:
#   git filter-repo --replace-text /tmp/secrets-to-redact.txt   # one regex per line
git push --force --mirror
```

After force-push: rotate again if any window of exposure remained, tell all
collaborators to re-clone, and re-open/rebase the open PRs (#53/#54).

## Step 3 — keep it from recurring

- The `audit:engine-drift` / `guard:branch` additions don't cover secrets; the
  blocking `gitleaks` check already does. Keep it blocking.
- Consider a narrow `.gitleaks.toml` that allowlists ONLY the confirmed
  public-by-design Firebase web key + generated paths (`dist-next/`, `test-results/`),
  so the scan flags only genuine secrets going forward. Do this only after Step 1
  confirms which keys are public.

Cross-ref: FLYA-44 (credential rotation, CTO), FLYA-46 (history scrub, blocked-by FLYA-44).
