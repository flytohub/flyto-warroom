#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()

REQUIRED_MARKERS = {
    "TRADEMARK.md": [
        "No source license grants rights to the Flyto2 name",
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
    "AGENTS.md": [
        "generated Flyto2 Warroom CE mirror",
        "flyto-indexer",
        "After Changes",
    ],
    "docs/enterprise-cloud-bridge.md": [
        "Enterprise Cloud Bridge",
        "Premium actions must fail closed",
        "Airgap Alternative",
    ],
    "docs/official-builds.md": [
        "Official Images",
        "OPEN_CORE_MANIFEST.json",
        "Docker image digests",
    ],
    "docs/github-hardening.md": [
        "require pull requests before merging",
        "source-build-smoke",
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
        "audit-ce-boundary.py",
        "Signed-off-by:",
        "commercial releases",
    ],
    ".github/workflows/ci.yml": [
        "release-audit",
        "governance-audit",
        "source-build-smoke",
        "Audit CE moat and privacy boundary",
        "Audit deterministic source provenance",
        "Audit open-core overlay contract",
        "Audit GitHub protection files",
        "Export upstream patch preview",
        "flyto-index verify",
    ],
    ".github/workflows/release-images.yml": [
        "Build And Publish CE Images From Public Source",
        "Require a tagged main commit with successful CE CI",
        "Build and publish engine, worker, and frontend from this tag",
        "DOCKERHUB_TOKEN",
        "Create or update GitHub release",
    ],
    "scripts/audit-ce-boundary.py": [
        "CE_CONTROL_FILES",
        "POSTHOG",
        "Flyto2 Warroom CE",
    ],
    "scripts/audit-provenance.py": [
        "flyto.open-core-provenance.v1",
        "tree_sha256",
        "source_repositories",
    ],
    "scripts/audit-open-core-overlay.py": [
        "generated_source_available_ce",
        "public_pr_to_private_source_to_regenerated_ce",
        "local_external_observation_only",
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
