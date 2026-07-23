#!/bin/sh
set -eu

ROOT="${1:-.}"
IMAGE_REPOSITORY="${FLYTO_WARROOM_IMAGE_REPOSITORY:-docker.io/flyto2/warroom}"
ENGINE_IMAGE="${FLYTO_WARROOM_ENGINE_IMAGE:-$IMAGE_REPOSITORY}"
ENGINE_TAG="${FLYTO_WARROOM_ENGINE_TAG:-engine-ce}"
WORKER_IMAGE="${FLYTO_WARROOM_WORKER_IMAGE:-$IMAGE_REPOSITORY}"
WORKER_TAG="${FLYTO_WARROOM_WORKER_TAG:-worker-ce}"
FRONTEND_IMAGE="${FLYTO_WARROOM_FRONTEND_IMAGE:-$IMAGE_REPOSITORY}"
FRONTEND_TAG="${FLYTO_WARROOM_FRONTEND_TAG:-code-ce}"

if [ ! -f "$ROOT/services/flyto-engine-ce/Dockerfile" ] || [ ! -f "$ROOT/packages/flyto-code/Dockerfile" ]; then
  echo "run from the Flyto2 Warroom CE public source tree or pass its path" >&2
  exit 2
fi

docker build --target engine \
  -t "$ENGINE_IMAGE:$ENGINE_TAG" \
  "$ROOT/services/flyto-engine-ce"
docker build --target worker \
  -t "$WORKER_IMAGE:$WORKER_TAG" \
  "$ROOT/services/flyto-engine-ce"
docker build \
  --build-arg FLYTO_PUBLIC_ENGINE_ORIGIN=__same_origin__ \
  --build-arg FLYTO_PUBLIC_MODE=community \
  --build-arg FLYTO_PUBLIC_AUTOMATION_ORIGIN=__same_origin__ \
  --build-arg FLYTO_PUBLIC_CORTEX_ORIGIN=__same_origin__ \
  -t "$FRONTEND_IMAGE:$FRONTEND_TAG" \
  "$ROOT/packages/flyto-code"
