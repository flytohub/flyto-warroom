# Changelog

## 2026-07-19

- Added a deterministic CE product-loop contract at
  `/api/v1/ce/product-loop`, shared by the official Flyto2 engine runtime and
  the CE-safe source runtime.
- Added `install/scripts/smoke-ce-stack.py` plus `make ce-smoke` so local
  Docker Compose installs verify engine health, frontend proxying, runner,
  verification, brand-vision, and product-loop payload shape.
- Updated README, Docker Hub overview, feature matrix, install docs, and
  release-readiness docs around Flyto2 Warroom CE as a self-hosted open-core
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
