# Upstream Feedback Loop

This repository is designed to accept community PRs without becoming a separate
product line.

Flyto2 Warroom CE is the public upstream base, not a permanent fork. Paid
Enterprise, SaaS, on-prem, and airgap editions are build-time overlays on a
pinned CE commit. A public PR should either become a private source patch and a
re-exported CE change, or be rejected as a generated/overlay-only change.
Short rule: import the accepted public change, test private source, then
re-export CE with the exporter.

## Maintainer Flow

1. Review the public PR in `flyto-warroom`.
2. Generate source-repo patches from the public diff:

   ```sh
   python scripts/export-upstream-patches.py --base origin/main --output upstream-patches
   ```

3. Apply package patches to the authoritative source repositories:

   ```sh
   git -C /Users/chester/flytohub/flyto-code apply /path/to/upstream-patches/flyto-code.patch
   git -C /Users/chester/flytohub/flyto-engine apply /path/to/upstream-patches/flyto-engine.patch
   ```

   (`flyto-core`, `flyto-indexer`, and `flyto-i18n` are external dependencies,
   not vendored here — contributions to them go to their own public repos.)

4. For generated-only changes listed in `REVIEW_GENERATED.md`, change the
   `flyto-engine` release generator or Engine contract first.
5. Run source-repo tests.
6. Re-export CE:

   ```sh
   python -m release.cli flyto2-open-core-export /Users/chester/flytohub --output /tmp/flyto-warroom
   python /tmp/flyto-warroom/install/scripts/audit-release-tree.py /tmp/flyto-warroom
   ```

7. Confirm the regenerated public tree contains the intended PR change and no
   unrelated diff, then post this exact PR comment using its current head SHA:

   ```text
   upstream-regenerated: <exact-pr-head-sha>
   ```

8. Push the regenerated public tree to this repo.
9. Run the open-core overlay audit to prove the regenerated tree still uses CE
   as the pinned public upstream and keeps private overlays out of runtime:

   ```sh
   python scripts/audit-open-core-overlay.py .
   ```

## Why This Exists

Community changes should improve Flyto2 itself, not only the public mirror. The
patch exporter gives maintainers a repeatable bridge from public contribution to
the authoritative `flyto-engine` / `flyto-code` source, while release audits
prevent private code or credentials from flowing in the other direction. The
public workflow has no credential that could push to either source repository.
