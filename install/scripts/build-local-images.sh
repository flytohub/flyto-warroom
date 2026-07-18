#!/bin/sh
set -eu

WORKSPACE="${1:-/Users/chester/flytohub}"
IMAGE_REPOSITORY="${FLYTO_WARROOM_IMAGE_REPOSITORY:-docker.io/chesterhsu/flyto-warroom}"
ENGINE_IMAGE="${FLYTO_WARROOM_ENGINE_IMAGE:-$IMAGE_REPOSITORY}"
ENGINE_TAG="${FLYTO_WARROOM_ENGINE_TAG:-engine-ce}"
WORKER_IMAGE="${FLYTO_WARROOM_WORKER_IMAGE:-$IMAGE_REPOSITORY}"
WORKER_TAG="${FLYTO_WARROOM_WORKER_TAG:-worker-ce}"
FRONTEND_IMAGE="${FLYTO_WARROOM_FRONTEND_IMAGE:-$IMAGE_REPOSITORY}"
FRONTEND_TAG="${FLYTO_WARROOM_FRONTEND_TAG:-code-ce}"
RUNNER_IMAGE="${FLYTO_WARROOM_RUNNER_IMAGE:-$IMAGE_REPOSITORY}"
RUNNER_TAG="${FLYTO_WARROOM_RUNNER_TAG:-runner-ce}"
VERIFICATION_IMAGE="${FLYTO_WARROOM_VERIFICATION_IMAGE:-$IMAGE_REPOSITORY}"
VERIFICATION_TAG="${FLYTO_WARROOM_VERIFICATION_TAG:-verification-ce}"
BRAND_VISION_IMAGE="${FLYTO_WARROOM_BRAND_VISION_IMAGE:-$IMAGE_REPOSITORY}"
BRAND_VISION_TAG="${FLYTO_WARROOM_BRAND_VISION_TAG:-brand-vision-ce}"
PDF_IMAGE="${FLYTO_WARROOM_PDF_IMAGE:-$IMAGE_REPOSITORY}"
PDF_TAG="${FLYTO_WARROOM_PDF_TAG:-pdf-ce}"

docker build -t "$ENGINE_IMAGE:$ENGINE_TAG" "$WORKSPACE/flyto-engine"
docker tag "$ENGINE_IMAGE:$ENGINE_TAG" "$WORKER_IMAGE:$WORKER_TAG"
docker build -t "$RUNNER_IMAGE:$RUNNER_TAG" "$WORKSPACE/flyto-engine/runner"
docker build -f "$WORKSPACE/flyto-core/Dockerfile.verification" -t "$VERIFICATION_IMAGE:$VERIFICATION_TAG" "$WORKSPACE/flyto-core"
docker build -t "$BRAND_VISION_IMAGE:$BRAND_VISION_TAG" "$WORKSPACE/flyto-engine/brand-vision"
docker build -t "$PDF_IMAGE:$PDF_TAG" "$WORKSPACE/flyto-engine/pdf-service"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT
CODE_CTX="$TMP_ROOT/flyto-code"
mkdir -p "$CODE_CTX"
tar -C "$WORKSPACE/flyto-code" -cf - . | tar -C "$CODE_CTX" -xf -
rm -rf "$CODE_CTX/node_modules"   "$CODE_CTX/dist"   "$CODE_CTX/dist-next"   "$CODE_CTX/out"   "$CODE_CTX/test-results"   "$CODE_CTX/flyto-design-tokens-pkg"
find "$CODE_CTX/public/i18n" -maxdepth 1 -type f -name '*.json' -delete 2>/dev/null || true
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
python3 - "$CODE_CTX/package.json" "$CODE_CTX/package-lock.json" "$CODE_CTX/flyto-design-tokens-pkg/package.json" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
lock_path = Path(sys.argv[2])
tokens_path = Path(sys.argv[3])
payload = json.loads(path.read_text(encoding="utf-8"))
for section in ("dependencies", "devDependencies"):
    deps = payload.get(section, {})
    for name, value in list(deps.items()):
        if name == "@flyto/design-tokens" or value in ("file:../flyto-design-tokens", "file:./vendor/@flyto/design-tokens"):
            deps[name] = "file:./flyto-design-tokens-pkg"
path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

tokens = json.loads(tokens_path.read_text(encoding="utf-8"))
tokens["name"] = "@flyto/design-tokens"
tokens_path.write_text(json.dumps(tokens, indent=2) + "\n", encoding="utf-8")

if lock_path.exists():
    lock = json.loads(lock_path.read_text(encoding="utf-8"))
    packages = lock.setdefault("packages", {})
    root_package = packages.setdefault("", {})
    root_package.setdefault("dependencies", {})["@flyto/design-tokens"] = "file:./flyto-design-tokens-pkg"
    for key in list(packages):
        if key == "../flyto-design-tokens" or key == "vendor/@flyto/design-tokens" or key.endswith("/flyto-design-tokens"):
            packages.pop(key, None)
    packages["flyto-design-tokens-pkg"] = {
        "name": "@flyto/design-tokens",
        "version": tokens.get("version", "0.1.0"),
        "license": tokens.get("license", "Apache-2.0"),
    }
    packages["node_modules/@flyto/design-tokens"] = {
        "resolved": "flyto-design-tokens-pkg",
        "link": True,
    }
    lock_path.write_text(json.dumps(lock, indent=2) + "\n", encoding="utf-8")
PY
docker build \
  --build-arg VITE_ENGINE_URL="${FLYTO_CODE_ENGINE_URL:-http://localhost:8080}" \
  --build-arg VITE_AUTH_MODE="${FLYTO_CODE_AUTH_MODE:-local_jwt}" \
  --build-arg VITE_AUTOMATION_URL="${FLYTO_AUTOMATION_URL:-http://localhost:8080}" \
  --build-arg VITE_CORTEX_URL="${FLYTO_CORTEX_URL:-http://localhost:8080}" \
  -t "$FRONTEND_IMAGE:$FRONTEND_TAG" \
  "$CODE_CTX"
