# Install Assets

This directory contains the public CE install surface:

- `docker-compose.ce.yml` starts the self-hosted Community Edition stack.
- `docker-compose.source.yml` rebuilds the five public CE Go runtimes and
  frontend without private service images.
- `docker-compose.ee-sim.yml` verifies Enterprise-shaped values fail closed in
  public Community images.
- `.env.ce.example` and `.env.ee-sim.example` document generated env files.
- `demo-workspace.json` is the public demo seed bundle.
- `scripts/setup-ce.py` creates local-only infrastructure secrets; the first
  administrator is created in the browser after startup.
- `scripts/preflight.py` validates local configuration before compose starts.
- `scripts/smoke-ce-stack.py` verifies the official-image stack through the
  complete disposable first-install product path: admin, repository, worker
  scan, analysis, findings, evidence, report, five Go health endpoints, and
  frontend proxy.
- `scripts/smoke-source-stack.py` runs that same complete product path against
  the source-built engine, worker, scheduler, analysis, report, and frontend.
- `scripts/seed-demo-workspace.py` seeds the demo evidence workspace through the
  public local JWT API.
- `scripts/verify-docker-images.py` checks Docker Hub tags and digests.
- Git tags publish official `linux/amd64` and `linux/arm64` engine, worker,
  scheduler, analysis, report, and frontend images through GitHub Actions.

Do not place real credentials in this directory.
