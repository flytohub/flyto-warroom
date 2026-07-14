# Contributing

Flyto2 Code changes must preserve the product loop between navbar pages,
engine API clients, query keys, CI evidence, and flyto-indexer verification.

Before editing:

- Use flyto-indexer search and impact analysis for the target surface.
- Check whether the page or API is already registered in
  `docs/platform-loops/`.

Before handing off:

```bash
npm run guard:branch
npm run lint -- --quiet
npm run build
```

For frontend/backend changes, also run workspace verification:

```bash
PYTHONPATH=../flyto-indexer python3 -m src.cli verify-workspace .. \
  --project . \
  --project ../flyto-engine \
  --project ../flyto-indexer
```
