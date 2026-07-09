# Agent Instructions

This repository is a generated Flyto2 Warroom CE mirror. Do not treat it as the
private Flyto2 source of truth.

## Before Changes

- Identify whether the change belongs to `flyto-code`, `flyto-contracts`, or
  generated release files. (`flyto-core`, `flyto-indexer`, and `flyto-i18n` are
  external open-source dependencies — contribute to their own public repos, not
  here. See `DEPENDENCIES.md`.)
- Prefer `flyto-indexer` search, impact, audit, and verify workflows for code
  exploration when the tool is available.
- If a generated file needs a lasting change, update the source package or the
  exporter template first, then regenerate this repository.

## Safety

- Do not commit credentials, customer data, private image coordinates, private
  connector secrets, or enterprise-only implementation details.
- Keep Enterprise features connected only through public capabilities, public
  API/evidence contracts, signed bridge requests, and gated UI states.
- Premium paths must fail closed when entitlement, permission, connector, cloud,
  or evidence-signature checks fail.

## After Changes

Run the relevant verification before committing:

```sh
make audit
python3 install/scripts/verify-docker-images.py --dry-run
```

The exporter that generates this repository lives in the external `flyto-indexer`
package (`src/flyto2_open_core.py`), not in this tree — change it there and
regenerate.
