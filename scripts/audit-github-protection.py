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
        "Upload upstream patch preview",
        "upstream-patch-preview-",
        "if-no-files-found: error",
        "flyto-index verify",
    ],
    ".github/workflows/cla.yml": [
        "Public Contribution Policy",
        "contents: read",
        "pull-requests: read",
        "statuses: write",
        "cla/verified",
        "upstream/regenerated",
        "upstream-regenerated:",
        "author_association",
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
    "scripts/export-upstream-patches.py": [
        "flyto.warroom-upstream-patches.v1",
        "allowed_source_repositories",
        "flyto-engine",
        "flyto-code",
        "PATCH_MANIFEST.json",
    ],
}

FORBIDDEN_WORKFLOW_MARKERS = {
    "CLA_PAT": "public contribution policy must not require a private PAT",
    "contributor-assistant/": "public contribution policy must remain first-party",
    "repository_dispatch": "public workflows must not dispatch into another repository",
    "flyto-cloud": "public workflows must not couple to a private hosted repository",
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

    workflow_dir = ROOT / ".github" / "workflows"
    for workflow in sorted(workflow_dir.glob("*.y*ml")):
        text = workflow.read_text(encoding="utf-8")
        for marker, reason in FORBIDDEN_WORKFLOW_MARKERS.items():
            if marker in text:
                blockers.append(f"{workflow.relative_to(ROOT)}: {reason}")

    contribution_workflow = ROOT / ".github/workflows/cla.yml"
    if contribution_workflow.exists():
        text = contribution_workflow.read_text(encoding="utf-8")
        if "actions/checkout@" in text:
            blockers.append(
                ".github/workflows/cla.yml must not check out untrusted PR code"
            )
        if "secrets." in text:
            blockers.append(
                ".github/workflows/cla.yml must not read repository or organization secrets"
            )

    ci_workflow = ROOT / ".github/workflows/ci.yml"
    if ci_workflow.exists():
        text = ci_workflow.read_text(encoding="utf-8")
        if "permissions:\n  contents: read" not in text:
            blockers.append(".github/workflows/ci.yml must keep read-only contents permission")

    release_workflow = ROOT / ".github/workflows/release-images.yml"
    if release_workflow.exists():
        text = release_workflow.read_text(encoding="utf-8")
        trigger = text.split("permissions:", 1)[0]
        if "pull_request" in trigger or "workflow_dispatch" in trigger:
            blockers.append(
                ".github/workflows/release-images.yml must remain tag-push-only"
            )

    if blockers:
        for blocker in blockers:
            print("BLOCKED: " + blocker, file=sys.stderr)
        return 2
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
