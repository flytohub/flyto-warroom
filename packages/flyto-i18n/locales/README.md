# locales/

Source translation files live here. This directory is the human-edited source
of truth for every Flyto product scope.

## Layout

Each product scope has locale-specific JSON files:

```text
locales/{scope}/{locale}/{category}.json
```

Examples:

```text
locales/code/en/code.json
locales/cloud/zh-TW/template.json
locales/shared/ja/common.json
```

## Rules

- Edit `locales/**` first; do not patch `dist/**` as the source of truth.
- Keep keys stable and dot-separated.
- Use `{name}` placeholders for variables.
- Leave untranslated community-language values as `""`; apps fall back to English.
- After changing source files, run `python3 scripts/validate.py --strict` and `python3 scripts/build-dist.py`.

## Sync Contract

`scripts/sync-locales.py` mirrors English keys into the other locales. It adds
missing keys with empty values and removes keys that no longer exist in English.
