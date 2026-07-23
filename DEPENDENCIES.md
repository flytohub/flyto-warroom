# External Dependencies

Flyto2 Warroom CE uses public registry dependencies only. The generated tree
contains all five CE Go entrypoints, their CE-safe kernel, the independent React
frontend, and built-in locale strings, so a source build never requires another
Flyto repository or private service image.

| Package | Install from | Source repository | License |
| --- | --- | --- | --- |
| Go modules | `proxy.golang.org` / declared module source | `services/flyto-engine-ce/go.mod` | Per module |
| React, Vite, TypeScript | npm registry | `packages/flyto-code/package-lock.json` | Per package |
| PostgreSQL | Official container image | `install/docker-compose*.yml` | PostgreSQL License |
| Alpine, Go, Node, nginx base images | Public image registries | Public Dockerfiles | Per image |

`OPEN_CORE_MANIFEST.json` pins the two Flyto source repositories that contribute
implementation (`flyto-engine` and `flyto-code`) and records the generated tree
digest.
