# External Dependencies

Flyto2 Warroom CE builds on these open-source packages. They are **not vendored**
into this repository — the published CE container images install them from their
public registries at build time, and their source lives in their own public
repositories (where contributions and issues should go).

| Package | Install from | Source repository | License |
| --- | --- | --- | --- |
| `flyto-core` | PyPI (`pip install flyto-core`) | github.com/flytohub/flyto-core | Apache-2.0 |
| `flyto-indexer` | PyPI (`pip install flyto-indexer`) | github.com/flytohub/flyto-indexer | Apache-2.0 |
| `flyto-i18n` | locale bundle (build-time) | github.com/flytohub/flyto-i18n | MIT |

Why they are not in this repo: copying already-open, separately-published
packages here only duplicated source and created regeneration churn without
being used at runtime (the CE `docker-compose` runs prebuilt images). Depending
on them from their registries keeps this distribution small and each project's
own repo the single source of truth.
