# schema/

JSON schema definitions for repository metadata and locale file validation.

## Files

- `locale.schema.json`: validates every `locales/{scope}/{locale}/*.json` file.
- `manifest.schema.json`: validates generated locale manifests.

## Contract

Schema changes affect validation for all product scopes. When changing a schema,
run:

```bash
python3 scripts/validate.py --strict
npm run verify
```
