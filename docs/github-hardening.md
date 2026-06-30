# GitHub Hardening

Recommended repository settings for `flytohub/flyto-warroom`:

- default branch: `main`;
- require pull requests before merging;
- require at least one approving review;
- dismiss stale approvals when new commits are pushed;
- require review from CODEOWNERS;
- require conversation resolution;
- require linear history;
- block force pushes and branch deletion;
- require the `release-audit` and `governance-audit` status checks;
- restrict release publishing to maintainer-owned GitHub Actions.

The repository also carries file-level guardrails:

- `.github/CODEOWNERS` defines sensitive ownership.
- `.github/pull_request_template.md` requires DCO, trademark, and secret checks.
- `scripts/audit-github-protection.py` fails CI if protection files are removed
  or weakened.
