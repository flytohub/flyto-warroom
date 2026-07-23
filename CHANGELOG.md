# Changelog

## 2026-07-24

- Advanced the public source profile to `v0.5.1` after restoring the canonical
  Flyto2 Warroom authentication and product-shell UI in the independent CE
  frontend.
- Included the original lightning logo in the public export and final frontend
  image, with a contract test that fails when Docker packaging omits the
  `public` asset directory.
- Revalidated a fresh seven-container source install, one-time local
  administrator bootstrap, repository scan, evidence/report pipeline, and
  frontend proxy in under the 60-second startup ceiling.

## 2026-07-23

- Advanced the public source profile to `v0.5.0` with independent engine,
  worker, scheduler, analysis, report, and frontend images.
- Replaced private-frontend pruning with a dedicated `src-ce` workbench and
  minimal CE-only npm manifest/lockfile.
- Preserved the canonical Flyto2 product UI in that independent workbench,
  including the lightning logo asset, Warroom wordmark, original authentication
  composition, purple navigation palette, locale control, and themes.
- Added evidence, risk hypotheses, remediation re-verification, portable
  reports, 16 languages, themes, and a measured 60-second startup ceiling.
- Removed build dependencies on sibling Flyto2 repositories and legacy
  runner/verification/brand-vision/PDF images.
- Advanced the clean installer path to `v0.3.2`: the generated environment now
  pins immutable release image tags, exposes the public worker health endpoint
  on loopback, and generates only the PostgreSQL/JWT secrets used by CE.
- Replaced the stale legacy-sidecar `ce-smoke` with the complete public product
  smoke: first administrator, local JWT, workspace, public repository, queued
  worker scan, findings, score, HTML report, and frontend proxy.
- Replaced the diagnostic-only CE source slice with a complete local product
  runtime: one-time administrator bootstrap, local JWT sessions, organizations,
  projects, credential-free public repository connections, durable scan jobs,
  native findings, computed scores, and HTML reports.
- Added a public-source worker that clones supported public Git hosts and runs
  bounded secrets, IaC, SAST, and dependency checks without private services.
- Changed Docker Compose and the tag release workflow to build engine, worker,
  and frontend images directly from this public source tree.
- Serialized empty-database schema installation across engine and worker so a
  fresh Compose deployment is safe when both processes start concurrently.
- Ordered tag-release source verification before local Compose secret setup
  and advanced the complete-source release to `v0.3.1` after the immutable
  `v0.3.0` publication attempt stopped before image push.

## 2026-07-19

- Added a deterministic CE product-loop contract at
  `/api/v1/ce/product-loop`, shared by the official Flyto2 engine runtime and
  the CE-safe source runtime.
- Added `install/scripts/smoke-ce-stack.py` plus `make ce-smoke` so local
  Docker Compose installs verify engine health, frontend proxying, runner,
  verification, brand-vision, and product-loop payload shape.
- Updated README, Docker Hub overview, feature matrix, install docs, and
  release-readiness docs around Flyto2 Warroom CE as a self-hosted source-available
  security warroom and BYO offensive validation platform.
- Kept commercial intelligence, public rating authority, Enterprise identity,
  managed remediation, and live cloud/container/runtime remediation behind
  private signed overlays.

## 2026-07-01

- Added multi-arch Docker publishing for official CE images. Release scripts
  now publish and verify `linux/amd64` plus `linux/arm64` manifest lists instead
  of ARM64-only tags.
- Added a Docker build boundary audit so official image publishing checks for
  broad final-stage source copies and denied secret/private markers before
  pushing public tags.
- Closed the public Warroom CE release loop with a tracked frontend
  `.env.example`, feature matrix, public roadmap, AutoFix whitepaper,
  benchmark/evidence methodology, and demo seed workspace.
- Added `install/scripts/seed-demo-workspace.py` plus
  `install/demo-workspace.json` so CE users can validate or seed a local
  workspace that explains code/container/cloud/external/evidence/autofix.
- Extended release and CE-boundary audits so missing docs, seed assets, or CE
  env examples fail closed.
- Added `verify-fast` and wired CI to run the generated Warroom root verify
  loop.
