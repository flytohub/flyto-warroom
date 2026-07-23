# Public Source Build

The public source profile is the complete PolyForm Noncommercial 1.0.0 CE
product: PostgreSQL, engine API, scan worker, scheduler, analysis service,
report service, and React frontend all rebuild directly from this repository
for permitted noncommercial purposes.
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
runs native secret, IaC, source, and dependency checks. The scheduler queues
due scans, analysis builds evidence and transparent risk hypotheses, and the
report service renders portable HTML. Commercial intelligence, signed public
rating authority, managed execution, live remediation, and Enterprise identity
remain private overlays.

On an empty PostgreSQL volume, all five Go services may start at the same time.
Schema installation is guarded by a transaction-scoped PostgreSQL advisory
lock; one process performs the idempotent migration while the others wait, so
first boot does not depend on container scheduling order.

Stop and remove source-profile containers with:

```sh
make source-down
```
