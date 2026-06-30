#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()

CE_CONTROL_FILES = [
    "Makefile",
    "install/.env.ce.example",
    "install/docker-compose.ce.yml",
    "install/scripts/build-local-images.sh",
    "install/scripts/preflight.py",
    "install/scripts/setup-ce.py",
    "packages/flyto-code/.env.example",
    ".github/workflows/ci.yml",
]

REQUIRED_FILES = [
    "docs/docker-hub-overview.md",
    "docs/code-protection.md",
    "docs/enterprise-cloud-bridge.md",
    "docs/official-builds.md",
    "TRADEMARK.md",
    "GOVERNANCE.md",
]

DENIED_CONTROL_PATTERNS = [
    (re.compile(r"VITE_SENTRY_DSN\s*=\s*\S+"), "CE must not ship a default Sentry DSN"),
    (re.compile(r"SENTRY_AUTH_TOKEN\s*=\s*\S+"), "CE must not ship a Sentry auth token"),
    (re.compile(r"POSTHOG", re.IGNORECASE), "CE must not ship PostHog configuration"),
    (re.compile(r"SEGMENT_(WRITE_)?KEY", re.IGNORECASE), "CE must not ship Segment configuration"),
    (re.compile(r"AMPLITUDE(_API)?_KEY", re.IGNORECASE), "CE must not ship Amplitude configuration"),
    (re.compile(r"GA_MEASUREMENT|GOOGLE_ANALYTICS|GTM_ID", re.IGNORECASE), "CE must not ship GA/GTM configuration"),
    (re.compile(r"FLYTO_CE_TELEMETRY|INSTALL_PING|PHONE_HOME", re.IGNORECASE), "CE telemetry must not be enabled implicitly"),
    (re.compile(r"https?://(api\.)?flyto2\.com/(telemetry|install|usage|events)", re.IGNORECASE), "CE must not phone home to Flyto2 telemetry endpoints"),
    (re.compile(r"ghcr\.io/.+-ee", re.IGNORECASE), "CE must not reference enterprise images"),
    (re.compile(r"flyto2-warroom-[a-z-]+-ee", re.IGNORECASE), "CE must not reference enterprise image tags"),
]

DENIED_TREE_PATTERNS = [
    "packages/flyto-contracts/internal",
    "packages/flyto-contracts/cmd",
    "packages/flyto-contracts/api/handlers_",
    "packages/flyto-code/.env.production",
    "packages/flyto-code/.env.local",
]

REQUIRED_MARKERS = {
    "docs/docker-hub-overview.md": [
        "Flyto2 Warroom CE Preview",
        "does not enable product telemetry by default",
        "Recommended install path is Docker Compose",
        "currently published as linux/arm64 images",
    ],
    "docs/code-protection.md": [
        "open-core release protects private code by construction",
        "Enterprise Cloud Bridge integration",
        "audit-ce-boundary.py",
    ],
    "docs/enterprise-cloud-bridge.md": [
        "Flyto2 Enterprise Cloud Bridge",
        "What Can Be Cloud-Backed",
        "Premium requests should follow the same contract",
        "Airgap Alternative",
    ],
    "docs/official-builds.md": [
        "Official Images",
        "Forks may rebuild CE under their own names",
    ],
    "TRADEMARK.md": [
        "Modified Distributions",
        "official Flyto2 build",
    ],
    "GOVERNANCE.md": [
        "private Flyto2 source workspace",
        "community edition is public",
    ],
}


def read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return ""


def main() -> int:
    blockers: list[str] = []

    for rel in REQUIRED_FILES + CE_CONTROL_FILES:
        if not (ROOT / rel).exists():
            blockers.append(f"missing required CE boundary file: {rel}")

    for rel in CE_CONTROL_FILES:
        path = ROOT / rel
        if not path.exists():
            continue
        body = read(path)
        for pattern, reason in DENIED_CONTROL_PATTERNS:
            if pattern.search(body):
                blockers.append(f"{rel}: {reason}")

    for denied in DENIED_TREE_PATTERNS:
        matches = list(ROOT.glob(denied + "*"))
        if matches:
            blockers.append(f"private path escaped into CE tree: {denied}")

    for rel, markers in REQUIRED_MARKERS.items():
        path = ROOT / rel
        if not path.exists():
            continue
        body = read(path)
        for marker in markers:
            if marker not in body:
                blockers.append(f"{rel} missing CE boundary marker: {marker}")

    if blockers:
        for blocker in blockers:
            print("BLOCKED: " + blocker, file=sys.stderr)
        return 2
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
