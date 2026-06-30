# CI Compliance Evidence

`scripts/ci-compliance-evidence.mjs` is the repo-level compliance contract for
Flyto Code. It checks that the GitHub Actions pipeline still enforces the
minimum controls required for a secure frontend release and writes a JSON
evidence artifact to `out/compliance/ci-evidence.json`.

The artifact is uploaded by `.github/workflows/ci.yml` as
`ci-compliance-evidence` and can be ingested later by the product compliance
surface or the engine evidence store.

## Covered Controls

- `CI-*`: deterministic install, lint, typecheck, unit tests, route drift, build.
- `SEC-*`: blocking gitleaks, blocking production dependency audit, Semgrep
  command-risk rule self-test, command-risk SARIF artifact.
- `SCA-*`: Dependabot coverage for npm and GitHub Actions.
- `GOV-*`: local scripts for compliance evidence and dependency audit.

## Current Policy

- Secrets: blocking.
- Production dependency high/critical CVEs: blocking.
- Command-risk Semgrep findings: non-blocking findings, blocking rule self-test.

This is deliberate: secrets and dependency CVEs are now clean and should not
regress. Command-risk needs baseline cleanup before findings become blocking.

## Not Yet Covered

- Runtime DAST evidence from flyto-core YAML executions.
- SBOM/provenance generation.
- Branch protection / required-check verification through GitHub API.
- Mapping this artifact into `/api/v1/code/orgs/:orgId/compliance`.
