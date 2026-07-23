# Public Source Build

The public source profile is the complete PolyForm Noncommercial 1.0.0 CE
product: PostgreSQL, engine, scan worker, and React frontend all rebuild
directly from this repository for permitted noncommercial purposes.
It does not pull Flyto2 service images and it does not require credentials.

```sh
make setup-ce
make source-build
make source-up
make source-smoke
```

Open `http://127.0.0.1:18088/sign-in`; a fresh database redirects to the
one-time administrator form, then continues to the regular `/projects` surface.

The source-built engine owns local authentication, project/repository state,
durable scan jobs, finding queries, posture summaries, and HTML reports. The
source-built worker clones approved public Git hosts without credentials and
runs native secret, IaC, SAST, and dependency checks. Commercial intelligence,
signed public rating authority, managed execution, live remediation, and
Enterprise identity remain private overlays.

On an empty PostgreSQL volume, engine and worker may start at the same time.
Schema installation is guarded by a transaction-scoped PostgreSQL advisory
lock; one process performs the idempotent migration while the other waits, so
the first boot does not depend on container scheduling order.

Stop and remove source-profile containers with:

```sh
make source-down
```
