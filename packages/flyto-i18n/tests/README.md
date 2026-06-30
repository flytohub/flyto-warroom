# tests/

Regression tests for locale tooling. These tests focus on script behavior that
can silently break source-to-dist or dist-to-consumer synchronization.

## Run

```bash
python3 -m pytest tests
```

The repository-level verification command also runs schema validation and
coverage:

```bash
npm run verify
```

## Test Scope

- Locale creation and metadata handling.
- Consumer sync behavior.
- Guardrails for generated output freshness.
