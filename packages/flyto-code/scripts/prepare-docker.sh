#!/bin/bash
# prepare-docker.sh — Prepare Docker build context for flyto-code (Warroom).
#
# Resolves local file: dependencies that Docker can't follow:
#   - @flyto/design-tokens (file:../flyto-design-tokens)
#   - flyto-i18n dist (public/i18n/)
#
# Usage:
#   ./scripts/prepare-docker.sh          # from flyto-code root
#   docker build -t flyto-warroom .      # then build normally

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

echo "==> Copying flyto-design-tokens..."
rm -rf flyto-design-tokens-pkg
if [ -d ../flyto-design-tokens ]; then
  cp -r ../flyto-design-tokens flyto-design-tokens-pkg
else
  echo "ERROR: ../flyto-design-tokens not found" >&2
  exit 1
fi

echo "==> Copying flyto-i18n dist..."
mkdir -p public/i18n/code
if [ -d ../flyto-i18n/dist/code ]; then
  cp -r ../flyto-i18n/dist/code/* public/i18n/code/
else
  echo "WARN: ../flyto-i18n/dist/code not found, i18n will use CDN fallback"
fi

echo "==> Rewriting package.json for Docker context..."
sed 's|file:../flyto-design-tokens|file:./flyto-design-tokens-pkg|g' package.json > package.docker.json
mv package.docker.json package.json

echo "==> Regenerating package-lock.json..."
npm install --package-lock-only --ignore-scripts 2>/dev/null

echo "==> Done. Ready for: docker build -t flyto-warroom ."
