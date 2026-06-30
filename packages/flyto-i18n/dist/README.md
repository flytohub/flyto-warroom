# dist/

Tracked CDN distribution artifacts live here. These files are generated from
`locales/**` by `scripts/build-dist.py` and are served directly by Flyto apps.

## Do Not Edit Generated JSON Directly

Change source translations under `locales/**`, then rebuild:

```bash
python3 scripts/validate.py --strict
python3 scripts/build-dist.py
```

## Contents

- `dist/{scope}/{locale}.json`: nested runtime bundles for one app scope.
- `dist/{scope}/manifest.json`: locale metadata and completion scores.
- `dist/{locale}.json`: aggregate bundle for full-platform/admin consumers.
- `dist/flags/*.svg`: flag assets used by locale pickers.

`dist/` is tracked intentionally so CDN and consuming-project sync jobs can use
the exact built output from the repository.
