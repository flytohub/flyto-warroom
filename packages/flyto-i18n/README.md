# flyto-i18n

Shared translations for the Flyto Platform. Edit a JSON file, merge to main, and every Flyto app updates automatically — no rebuild needed.

## How It Works

```
You edit a translation     CI rebuilds dist/     CDN cache purged     Apps load new text
─────────────────── ──▶ ────────────────── ──▶ ──────────────── ──▶ ─────────────────
locales/code/ja/        dist/code/ja.json      ~5 min total         No deploy required
```

All Flyto apps (Code, Cloud, Cortex, Landing) load translations from CDN at runtime. When you merge a PR here, the pipeline rebuilds `dist/`, purges the CDN cache, and every app picks up the changes within minutes.

## Quick Start: Fix a Translation

**No setup required. You can do this entirely on GitHub.**

1. Find the file: `locales/{project}/{locale}/{category}.json`
2. Click the pencil icon on GitHub to edit
3. Fix the translation value
4. Submit a Pull Request

That's it. Once merged, the fix goes live automatically.

### Example

To fix a Japanese translation in the Code app:

```
locales/code/ja/code.json
```

Find the key and change the value:

```json
{
    "translations": {
        "code.item.archRepos": "リポジトリ"
    }
}
```

## Quick Start: Add a New Language

```bash
# 1. Clone and run the add-locale script
git clone https://github.com/flytohub/flyto-i18n.git
cd flyto-i18n
python scripts/add-locale.py <locale-code>   # e.g. "ru" for Russian

# 2. Translate — fill in the empty values in locales/*/<locale-code>/
#    (all keys are pre-created with "" placeholder)

# 3. Add a flag SVG to dist/flags/<region>.svg (circle-flag style, 512x512)

# 4. Validate
python scripts/validate.py --locale <locale-code>

# 5. Build & preview
python scripts/build-dist.py

# 6. Submit PR
```

Once merged, the new language appears in every Flyto app's language picker automatically.

## File Structure

```
locales/
├── cloud/{locale}/*.json     # Flyto Cloud (automation platform)
├── code/{locale}/*.json      # Flyto Code (war room)
├── modules/{locale}/*.json   # Flyto Core (workflow modules)
├── landing/{locale}/*.json   # Landing page & marketing
├── shared/{locale}/*.json    # Common translations (shared across apps)
├── app/{locale}/*.json       # Flutter mobile app
├── console/{locale}/*.json   # Flyto Console
└── data/{locale}/*.json      # Flyto Data

dist/                         # Auto-generated, served via CDN
├── {scope}/{locale}.json     # Merged + nested (what apps actually load)
├── {scope}/manifest.json     # Locale metadata (completion %, region)
├── locale-meta.json          # Shared metadata (flags, region mapping)
└── flags/*.svg               # Country flag icons (21 flags)
```

## Translation File Format

```json
{
    "$schema": "../../../schema/locale.schema.json",
    "locale": "ja",
    "category": "code",
    "version": "1.0.0",
    "translations": {
        "code.nav.dashboard": "ダッシュボード",
        "code.nav.repos": "リポジトリ",
        "code.nav.issues": "セキュリティ問題"
    }
}
```

Rules:
- Keys are dot-separated: `{scope}.{section}.{name}`
- Values must be under 500 characters
- Use `{n}`, `{name}` for variables (not `${...}`)
- Empty `""` = untranslated (app falls back to English automatically)

## Supported Languages

| Locale | Language | Status | Coverage |
|--------|----------|--------|----------|
| en | English | Official | 100% |
| zh-TW | 繁體中文 | Official | 100% |
| zh-CN | 简体中文 | Official | ~97% |
| ja | 日本語 | Official | ~85% |
| ko | 한국어 | Community | ~85% |
| fr | Français | Community | ~85% |
| es | Español | Community | ~85% |
| de | Deutsch | Community | ~85% |
| pt-BR | Português (Brasil) | Community | ~85% |
| it | Italiano | Community | ~85% |
| vi | Tiếng Việt | Community | ~85% |
| th | ภาษาไทย | Community | ~85% |
| id | Bahasa Indonesia | Community | ~85% |
| hi | हिन्दी | Community | ~85% |
| tr | Türkçe | Community | ~85% |
| pl | Polski | Community | ~85% |

**Want to help?** Pick a language below 100% and fill in empty values. Every translated key helps.

## CI/CD Pipeline

When you push to `main`:

| Step | Time | What happens |
|------|------|-------------|
| `validate.yml` | ~10s | Schema + format validation |
| `build-dist.yml` | ~30s | Rebuild `dist/` from `locales/` |
| `purge-cdn.yml` | ~10s | Clear jsDelivr + GitHub raw cache |
| `notify-consumers.yml` | ~5s | Dispatch event to flyto-cloud/flyto-code |

**Total: ~1 minute from merge to live.**

Apps don't need to rebuild or redeploy. They fetch from CDN on every page load (with 24h cache + version-gated invalidation).

## Scripts

```bash
# Validate everything
python scripts/validate.py --strict

# Full local closed-loop gate
npm run verify

# Same gate without npm
make verify

# Check coverage
python scripts/coverage.py

# Build dist for CDN
python scripts/build-dist.py

# Add a new language
python scripts/add-locale.py <code>

# Sync keys from flyto-core modules
python scripts/sync-from-core.py --core-path ../flyto-core

# Sync keys from flyto-cloud UI ($t() calls)
python scripts/sync-from-cloud.py --cloud-path ../flyto-cloud
```

## Environment

Most commands in this repository are local and deterministic. Validation,
coverage, dist build, locale sync, and consumer sync do not need credentials.

Create a local `.env` only when running optional assisted translation tooling:

```bash
cp .env.example .env
```

`OPENAI_API_KEY` is read only by `scripts/translate-with-openai.py`. Do not put
real API keys in tracked files.

## Contributing

Use `CONTRIBUTING.md` for review expectations and `workflows/` for task-specific
checklists. For changes that affect generated `dist/` output or consuming app
sync, include these checks before pushing:

```bash
python3 scripts/validate.py --strict
python3 scripts/build-dist.py
npm run verify
```

## CDN Endpoints

```
# Translations (scope = cloud | code | landing | app | console | data)
https://raw.githubusercontent.com/flytohub/flyto-i18n/main/dist/{scope}/{locale}.json

# Manifest (locale metadata + completion %)
https://raw.githubusercontent.com/flytohub/flyto-i18n/main/dist/{scope}/manifest.json

# Flags
https://raw.githubusercontent.com/flytohub/flyto-i18n/main/dist/flags/{region}.svg
```

## License

MIT
