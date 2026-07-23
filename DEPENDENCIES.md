# External Dependencies

Flyto2 Warroom CE builds on these open-source packages. Their source remains in
their own public repositories (where contributions and issues should go). The
generated public tree contains the complete CE engine/worker Go module and the
frontend's generated locale assets, so a CE source build never requires a
private Flyto2 repository or private Flyto2 service image.

| Package | Install from | Source repository | License |
| --- | --- | --- | --- |
| `flyto-core` | PyPI (`pip install flyto-core`) | github.com/flytohub/flyto-core | Apache-2.0 |
| `flyto-indexer` | PyPI (`pip install flyto-indexer`) | github.com/flytohub/flyto-indexer | Apache-2.0 |
| `flyto-i18n` | locale bundle (build-time) | github.com/flytohub/flyto-i18n | MIT |

Why the full upstream repositories are not copied here: the CE runtime uses a
reviewed allowlist of public engine packages plus built frontend assets. Keeping
the upstream packages separate avoids duplicated source while the generated
`OPEN_CORE_MANIFEST.json` pins every contributing source commit.
