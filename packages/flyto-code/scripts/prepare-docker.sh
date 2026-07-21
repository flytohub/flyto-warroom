#!/bin/bash
# prepare-docker.sh — Prepare Docker build context for flyto-code (Warroom).
#
# Copies the optional flyto-i18n distribution into the Docker context.
# @flyto/design-tokens is committed under vendor/ so Docker builds are
# reproducible without sibling repositories or manifest rewrites.
#
# Usage:
#   ./scripts/prepare-docker.sh          # from flyto-code root
#   docker build -t flyto-warroom .      # then build normally

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

if [ ! -f vendor/@flyto/design-tokens/package.json ]; then
  echo "ERROR: vendored @flyto/design-tokens package is missing" >&2
  exit 1
fi

echo "==> Copying flyto-i18n dist..."
mkdir -p public/i18n/code
if [ -d ../flyto-i18n/dist/code ]; then
  cp -r ../flyto-i18n/dist/code/* public/i18n/code/
else
  echo "WARN: ../flyto-i18n/dist/code not found, i18n will use CDN fallback"
fi

echo "==> Done. Ready for: docker build -t flyto-warroom ."
