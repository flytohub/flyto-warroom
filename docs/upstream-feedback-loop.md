# Upstream Feedback Loop

This repository is designed to accept community PRs without becoming a separate
product line.

## Maintainer Flow

1. Review the public PR in `flyto-warroom`.
2. Generate source-repo patches from the public diff:

   ```sh
   python scripts/export-upstream-patches.py --base origin/main --output upstream-patches
   ```

3. Apply package patches to the private workspace:

   ```sh
   git -C /Users/chester/flytohub/flyto-code apply /path/to/upstream-patches/flyto-code.patch
   git -C /Users/chester/flytohub/flyto-engine apply /path/to/upstream-patches/flyto-engine.patch
   ```

   (`flyto-core`, `flyto-indexer`, and `flyto-i18n` are external dependencies,
   not vendored here — contributions to them go to their own public repos.)

4. For generated-only changes listed in `REVIEW_GENERATED.md`, change the
   source generator or private engine contract first.
5. Run source-repo tests.
6. Re-export CE:

   ```sh
   python -m release.cli flyto2-open-core-export /Users/chester/flytohub --output /tmp/flyto-warroom
   python /tmp/flyto-warroom/install/scripts/audit-release-tree.py /tmp/flyto-warroom
   ```

7. Push the regenerated public tree to this repo.

## Why This Exists

Community changes should improve Flyto itself, not only the public mirror. The
patch exporter gives maintainers a repeatable bridge from public contribution to
private source-of-truth, while release audits prevent private code or credentials
from flowing in the other direction.
