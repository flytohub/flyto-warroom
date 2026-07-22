# Flyto2 Code Operations

## Build Artifacts

`npm run build` runs TypeScript project build and Vite production bundling.
`vite.config.next.ts` writes `dist-next/`; `npm run preview` serves the same
configuration. Release static smoke rejects drift between build and preview
artifacts.

The build splits large 3D, chart, editor, and framework dependencies into
cacheable chunks while route-level lazy imports keep nonessential product
surfaces out of the initial shell. `BUNDLE_STATS=1 npm run build` writes an
ignored visualization for local analysis.

## Deployment Paths

| Mode | Configuration |
|---|---|
| Hosted production | GitHub Actions and Cloud Build deploy the production frontend with hosted endpoint/auth settings |
| Hosted staging | Separate workflow and service target with staging environment inputs |
| Community/self-hosted | Docker plus same-origin Nginx `/api/` proxy to local Flyto2 Engine |
| Enterprise air-gap | Air-gap Nginx policy and build-time edition checks |

Deployment workflows reference cloud service accounts as infrastructure
identities. They are not public Flyto2 contact addresses and their credentials
must stay in workload identity/secret configuration, never repository files.

## Community Export

`npm run export:community` creates the CE source/package output from the module
package manifest. `npm run audit:community-export` verifies the deterministic
result without publishing. Module package and physical-boundary audits prevent
private, moat, Enterprise, or incompatible license markers from crossing into
CE-exportable packages.

## Release Evidence

`npm run release:evidence` writes machine-readable evidence after test, build,
security, bundle, static smoke, deploy, and Actions checks. Compliance evidence
generation is deterministic and should record the exact commit and gate status;
it must not imply live production validation when only static/local checks ran.

Runtime/full-stack evidence requires explicit service URLs, organization ids,
and authentication supplied from CI secrets. Plan-only loop audits prove recipe
structure but are not equivalent to live execution.

## Security Operations

- Production dependency audit fails on high-severity vulnerabilities.
- GitHub security workflows run gitleaks against the relevant commit range and
  current tree.
- Browser artifacts and local environment files remain ignored.
- Public security reports use `security@flyto2.com`.
- Provider credential rotation and repository-history remediation are tracked
  separately from current-tree secret scanning.

## GitHub Actions

The Actions startup audit validates workflow syntax and startup contracts.
Release, deployment, branding, command-risk, security, and i18n workflows must
pin the intended actions and avoid assuming a sibling checkout unless the job
explicitly creates it.

## Operational Commands

```bash
npm ci --legacy-peer-deps
npm run release:gate
flyto-index scan . --full
flyto-index verify . --strict --json
```

For cross-repository frontend/backend changes, also run workspace verification
against `flyto-code`, `flyto-engine`, and `flyto-indexer` as documented in
`AGENTS.md`.

## Ownership

- Build and deployment configuration: root config files, `.github/workflows/`,
  Docker, Nginx, and `cloudbuild.yaml`.
- Release and architecture automation: `scripts/`.
- Product runtime: `src-next/`.
- Browser/full-stack scenarios: `e2e/`.
- Durable contracts: `docs/` and project-memory files.
- Generated runtime evidence: `reports/` and ignored `out/` paths as defined by
  the relevant script.
