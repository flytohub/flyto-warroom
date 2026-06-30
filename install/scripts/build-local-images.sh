#!/bin/sh
set -eu

WORKSPACE="${1:-/Users/chester/flytohub}"
TAG="${FLYTO_WARROOM_TAG:-ce-local}"
ENGINE_IMAGE="${FLYTO_WARROOM_ENGINE_IMAGE:-docker.io/flytohub/flyto2-warroom-engine-ce}"
WORKER_IMAGE="${FLYTO_WARROOM_WORKER_IMAGE:-docker.io/flytohub/flyto2-warroom-worker-ce}"
FRONTEND_IMAGE="${FLYTO_WARROOM_FRONTEND_IMAGE:-docker.io/flytohub/flyto2-warroom-code-ce}"
RUNNER_IMAGE="${FLYTO_WARROOM_RUNNER_IMAGE:-docker.io/flytohub/flyto2-warroom-runner-ce}"
VERIFICATION_IMAGE="${FLYTO_WARROOM_VERIFICATION_IMAGE:-docker.io/flytohub/flyto2-warroom-verification-ce}"
BRAND_VISION_IMAGE="${FLYTO_WARROOM_BRAND_VISION_IMAGE:-docker.io/flytohub/flyto2-warroom-brand-vision-ce}"
PDF_IMAGE="${FLYTO_WARROOM_PDF_IMAGE:-docker.io/flytohub/flyto2-warroom-pdf-ce}"

docker build -t "$ENGINE_IMAGE:$TAG" "$WORKSPACE/flyto-engine"
docker build -f "$WORKSPACE/flyto-engine/Dockerfile.worker" -t "$WORKER_IMAGE:$TAG" "$WORKSPACE/flyto-engine"
docker build -t "$RUNNER_IMAGE:$TAG" "$WORKSPACE/flyto-engine/runner"
docker build -f "$WORKSPACE/flyto-core/Dockerfile.verification" -t "$VERIFICATION_IMAGE:$TAG" "$WORKSPACE/flyto-core"
docker build -t "$BRAND_VISION_IMAGE:$TAG" "$WORKSPACE/flyto-engine/brand-vision"
docker build -t "$PDF_IMAGE:$TAG" "$WORKSPACE/flyto-engine/pdf-service"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT
CODE_CTX="$TMP_ROOT/flyto-code"
mkdir -p "$CODE_CTX"
tar -C "$WORKSPACE/flyto-code" -cf - . | tar -C "$CODE_CTX" -xf -
rm -rf "$CODE_CTX/flyto-design-tokens-pkg"
if [ -d "$WORKSPACE/flyto-design-tokens" ]; then
  cp -R "$WORKSPACE/flyto-design-tokens" "$CODE_CTX/flyto-design-tokens-pkg"
else
  echo "missing $WORKSPACE/flyto-design-tokens" >&2
  exit 1
fi
mkdir -p "$CODE_CTX/public/i18n/code"
if [ -d "$WORKSPACE/flyto-i18n/dist/code" ]; then
  cp -R "$WORKSPACE/flyto-i18n/dist/code/." "$CODE_CTX/public/i18n/code/"
fi
python3 - "$CODE_CTX/package.json" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
payload = json.loads(path.read_text(encoding="utf-8"))
for section in ("dependencies", "devDependencies"):
    deps = payload.get(section, {})
    for name, value in list(deps.items()):
        if value == "file:../flyto-design-tokens":
            deps[name] = "file:./flyto-design-tokens-pkg"
path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY
npm install --package-lock-only --ignore-scripts --legacy-peer-deps --prefix "$CODE_CTX"
docker build \
  --build-arg VITE_ENGINE_URL="${FLYTO_CODE_ENGINE_URL:-http://localhost:8080}" \
  --build-arg VITE_AUTH_MODE="${FLYTO_CODE_AUTH_MODE:-local_jwt}" \
  --build-arg VITE_AUTOMATION_URL="${FLYTO_AUTOMATION_URL:-http://localhost:8080}" \
  --build-arg VITE_CORTEX_URL="${FLYTO_CORTEX_URL:-http://localhost:8080}" \
  -t "$FRONTEND_IMAGE:$TAG" \
  "$CODE_CTX"
