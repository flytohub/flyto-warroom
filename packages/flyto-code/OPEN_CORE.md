# Flyto2 Code In Flyto2 Warroom CE

This physically independent frontend package is exported from `flyto-code/src-ce`
by `flyto2-open-core-export`. It does not contain the private unified cockpit.

Contribution rule:

- Change this package in public PRs when the fix is frontend-specific.
- Maintainers import accepted public changes back into `/Users/chester/flytohub/flyto-code`.
- After source tests pass, maintainers rerun the open-core exporter and update
  `flyto-warroom` from the generated output.
- Enterprise capabilities are paid build-time overlays on a pinned CE commit;
  they are never copied into this public package.
- Enterprise and SaaS frontend code remains outside this tree and composes
  through reviewed contracts on a pinned CE commit.

The CE UI includes local administrator setup, repository scans, evidence,
transparent risk hypotheses, remediation re-verification, portable reports,
language selection, and light/dark/system themes. Do not add credentials,
hosted-only configuration, private image coordinates, or commercial
implementation details to this package.
