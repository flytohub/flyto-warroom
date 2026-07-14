# Flyto2 Warroom CE Worker Runtime

This package is the source-published Flyto2 Warroom CE worker runtime slice.
It is intentionally smaller than the private production worker and exposes
only CE-safe execution primitives:

- bounded scan queue probe
- stable scheduler bucket probe
- adaptive backoff probe
- circuit-breaker probe
- scanner canary regression probe

It does not include production scheduler dispatch, runner callback
authentication, customer connector credentials, proprietary intelligence,
enterprise retention, or live remediation orchestration.

Run locally:

```sh
go run ./ce/worker-ce
```

Test:

```sh
go test ./ce/worker-ce
```
