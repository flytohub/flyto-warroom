# Install Assets

This directory contains the public CE install surface:

- `docker-compose.ce.yml` starts the self-hosted Community Edition stack.
- `docker-compose.source.yml` rebuilds the public CE engine, worker, and
  frontend source without private service images.
- `docker-compose.ee-sim.yml` overlays local Enterprise-gate simulation.
- `.env.ce.example` and `.env.ee-sim.example` document generated env files.
- `demo-workspace.json` is the public demo seed bundle.
- `scripts/setup-ce.py` creates local-only infrastructure secrets; the first
  administrator is created in the browser after startup.
- `scripts/preflight.py` validates local configuration before compose starts.
- `scripts/smoke-ce-stack.py` verifies a running compose stack, including the
  engine CE product-loop route and frontend API proxy.
- `scripts/smoke-source-stack.py` verifies the source-built engine, worker,
  `/community` frontend route, and same-origin API proxy.
- `scripts/seed-demo-workspace.py` seeds the demo evidence workspace through the
  public local JWT API.
- `scripts/verify-docker-images.py` checks Docker Hub tags and digests.
- `scripts/audit-docker-build-boundary.py` checks source-image boundaries before
  maintainers publish official images.
- `scripts/publish-multiarch-images.sh` publishes official `linux/amd64` and
  `linux/arm64` CE image manifest lists.

Do not place real credentials in this directory.
