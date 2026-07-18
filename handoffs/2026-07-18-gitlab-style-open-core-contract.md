# GitLab-style Open-core Contract

Date: 2026-07-18

## Summary

The generated Warroom CE tree now carries a machine-readable upstream contract
in both `OPEN_CORE_MANIFEST.json` and `install/edition-overlays.json`.

CE is the pinned public upstream base. Enterprise, SaaS, on-prem, and airgap
editions are private build-time overlays, not forks. Runtime source pulls are
forbidden, and public rating authority remains a private signed overlay.

## Change

- Added `scripts/audit-open-core-overlay.py`.
- Wired `make audit` and `make open-core-audit` to the new check.
- Added public regression tests for runtime source pull, private path escape,
  and CE public-rating-authority claims.
- Documented the public PR -> private source -> re-export CE contribution loop.

## Verification

```text
python3 scripts/audit-open-core-overlay.py .
python3 -m pytest install/tests/test_open_core_overlay_audit.py -q
make audit
```
