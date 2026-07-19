# CE Public Product Loop

Date: 2026-07-19

## Summary

Warroom CE now has a deterministic, provider-free product-loop contract that is
available from the official engine runtime and the CE-safe source runtime.

The endpoint is `GET /api/v1/ce/product-loop`. It returns a complete demo loop:
code, container, cloud, runtime, and external assets; findings; attack paths;
evidence; remediation; validation; SLA/MTTR state; split/merge contracts; and
Enterprise overlay boundaries.

## Boundary

The loop is demo seed evidence for install smoke and onboarding. It does not
claim public rating authority, does not call commercial providers, does not
execute live remediation, and does not include private SaaS/Enterprise source.

## Verification

```text
go test ./internal/ceproductloop ./ce/engine-ce
go test ./api -run 'TestCEProductLoopRouteIsPublicAndProviderFree|TestAuthzRegistryMatchesRouter|TestAuthzRegistryClosedSets|TestEveryExceptionHasJustification|TestExceptionSetMatchesAllowlist|TestBareRoutesAreDeclaredExceptions|TestNoAccidentalPublicExposure|TestSystemRoutePathDiscipline'
python3 -m pytest release/tests/test_open_core_cycle.py -q
python3 -m release.cli flyto2-open-core-cycle /Users/chester/flytohub
make verify
make build-local-images
make ce-up ENV_CE=/tmp/flyto-warroom-ce-public-polish.env
make ce-smoke ENV_CE=/tmp/flyto-warroom-ce-public-polish.env
make ce-reset-db ENV_CE=/tmp/flyto-warroom-ce-public-polish.env
```

The Docker smoke used a temporary local-only `/tmp` env file with a hashed local
password and removed the containers, network, volume, and env file afterward.
