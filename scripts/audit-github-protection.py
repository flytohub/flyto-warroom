#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()

REQUIRED_MARKERS = {
    "TRADEMARK.md": [
        "do not grant rights to the Flyto2 name",
        "Modified Distributions",
        "official Flyto2 build",
    ],
    "SECURITY.md": [
        "Reporting A Vulnerability",
        "Never submit credentials",
    ],
    "GOVERNANCE.md": [
        "Source Of Truth",
        "Contributor Certificate",
        "private Flyto2 source workspace",
    ],
    "docs/official-builds.md": [
        "Official Images",
        "OPEN_CORE_MANIFEST.json",
        "Docker image digests",
    ],
    "docs/github-hardening.md": [
        "require pull requests before merging",
        "docker-image-audit",
    ],
    "docs/account-security.md": [
        "Official publisher accounts must use 2FA",
        "Docker Hub pushes should use access tokens",
        "CE local JWT auth is password-based",
    ],
    ".github/CODEOWNERS": [
        "@ChesterHsu",
        "/packages/flyto-contracts/",
        "/install/",
    ],
    ".github/pull_request_template.md": [
        "private image coordinates",
        "Signed-off-by:",
        "commercial releases",
    ],
    ".github/workflows/ci.yml": [
        "release-audit",
        "governance-audit",
        "docker-image-audit",
        "Audit GitHub protection files",
        "Export upstream patch preview",
    ],
}


def main() -> int:
    blockers: list[str] = []
    for rel, markers in REQUIRED_MARKERS.items():
        path = ROOT / rel
        if not path.exists():
            blockers.append(f"missing protection file: {rel}")
            continue
        text = path.read_text(encoding="utf-8")
        for marker in markers:
            if marker not in text:
                blockers.append(f"{rel} missing marker: {marker}")
    if blockers:
        for blocker in blockers:
            print("BLOCKED: " + blocker, file=sys.stderr)
        return 2
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
