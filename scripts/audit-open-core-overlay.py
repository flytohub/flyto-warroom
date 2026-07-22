#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()

REQUIRED_FILES = [
    "OPEN_CORE_MANIFEST.json",
    "install/edition-overlays.json",
    "services/flyto-engine-ce/SOURCE_BOUNDARY.json",
    "packages/flyto-code/OPEN_CORE.md",
    "packages/flyto-code/CE_SOURCE_BOUNDARY.md",
    "packages/flyto-code/src-next/types/module-manifests/packageManifest.ts",
    "install/docker-compose.ce.yml",
    "install/docker-compose.ee-sim.yml",
    "Makefile",
    "README.md",
    "docs/edition-profiles.md",
    "docs/upstream-feedback-loop.md",
    "scripts/audit-ce-boundary.py",
    "scripts/audit-open-core-overlay.py",
]

REQUIRED_PROFILES = {"community", "enterprise-onprem", "enterprise-airgap", "saas"}
REQUIRED_PACKAGES = {"flyto-code", "flyto-contracts", "flyto-engine-ce"}
REQUIRED_MOATS = {
    "commercial-intel",
    "enterprise-control-plane",
    "firebase-rating-authority",
    "managed-remediation",
    "public-rating-authority",
    "saas-control-plane",
}
AUTHORITY_OVERLAYS = {
    "firebase-rating-authority",
    "public-rating-authority",
    "signed-rating-authority",
}

FRONTEND_PRIVATE_PATHS = [
    "packages/flyto-code/src-next/types/module-manifests/enterprise.ts",
    "packages/flyto-code/src-next/types/module-manifests/future.ts",
    "packages/flyto-code/src-next/app/(control-panel)/flyto/workspace/components/pages/EnterpriseControlPlanePage.tsx",
    "packages/flyto-code/src-next/components/compounds/system/EnterpriseControlPlaneView.tsx",
    "packages/flyto-code/src-next/components/compounds/system/__tests__/EnterpriseControlPlaneView.test.tsx",
]


def read_json(rel: str) -> dict:
    path = ROOT / rel
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"{rel} must be valid JSON: {exc}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"{rel} root must be a JSON object")
    return value


def text(rel: str) -> str:
    try:
        return (ROOT / rel).read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return ""


def string_list(value) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if isinstance(item, str) and item.strip()]


def profiles_by_id(payload: dict) -> dict[str, dict]:
    profiles = payload.get("profiles")
    if not isinstance(profiles, list):
        return {}
    return {
        str(profile.get("id")): profile
        for profile in profiles
        if isinstance(profile, dict) and profile.get("id")
    }


def audit_upstream_contract(contract: dict, *, prefix: str) -> list[str]:
    blockers: list[str] = []
    if not isinstance(contract, dict):
        return [f"{prefix} upstream_contract must be an object"]
    if contract.get("schema") != "flyto.open-core-upstream-contract.v1":
        blockers.append(f"{prefix} upstream_contract.schema must be flyto.open-core-upstream-contract.v1")
    if contract.get("model") != "generated_source_available_ce":
        blockers.append(f"{prefix} upstream_contract.model must be generated_source_available_ce")
    if contract.get("public_upstream") != "https://github.com/flytohub/flyto-warroom":
        blockers.append(f"{prefix} upstream_contract.public_upstream must be flytohub/flyto-warroom")
    if contract.get("public_base_selector") != "flyto-warroom@commit_sha":
        blockers.append(f"{prefix} upstream_contract.public_base_selector must be flyto-warroom@commit_sha")
    if contract.get("runtime_source_pull_allowed") is not False:
        blockers.append(f"{prefix} upstream_contract.runtime_source_pull_allowed must be false")
    if contract.get("enterprise_is_overlay_not_fork") is not True:
        blockers.append(f"{prefix} upstream_contract.enterprise_is_overlay_not_fork must be true")
    if contract.get("paid_edition_policy") != "build_time_private_overlay_only":
        blockers.append(f"{prefix} upstream_contract.paid_edition_policy must be build_time_private_overlay_only")
    if contract.get("public_pr_flow") != "public_pr_to_private_source_to_regenerated_ce":
        blockers.append(f"{prefix} public PR flow must route back through private source then regenerated CE")
    missing_repos = sorted({"flyto-engine", "flyto-code"} - set(string_list(contract.get("private_source_repos"))))
    if missing_repos:
        blockers.append(f"{prefix} upstream_contract.private_source_repos missing: " + ", ".join(missing_repos))
    missing_moats = sorted(REQUIRED_MOATS - set(string_list(contract.get("moat_controls"))))
    if missing_moats:
        blockers.append(f"{prefix} upstream_contract.moat_controls missing: " + ", ".join(missing_moats))
    score = contract.get("score_authority")
    if not isinstance(score, dict):
        blockers.append(f"{prefix} upstream_contract.score_authority must be an object")
    else:
        if score.get("ce_scope") != "local_external_observation_only":
            blockers.append(f"{prefix} CE score authority must be local_external_observation_only")
        if score.get("ce_public_comparability") is not False:
            blockers.append(f"{prefix} CE scores must not claim public comparability")
        if score.get("private_code_in_public_score_payload") is not False:
            blockers.append(f"{prefix} private code findings must not enter public score payloads")
        if score.get("public_rating_authority_overlay") != "private_signed_rating_authority":
            blockers.append(f"{prefix} public rating authority must stay a private signed overlay")
    return blockers


def audit_overlay_manifest(manifest: dict, overlay: dict) -> list[str]:
    blockers: list[str] = []
    if overlay.get("schema") != "flyto.open-core-edition-overlays.v1":
        blockers.append("install/edition-overlays.json schema is invalid")
    if overlay.get("runtime_source_pull_allowed") is not False:
        blockers.append("install/edition-overlays.json allows runtime source pull")
    if manifest.get("upstream_contract") != overlay.get("upstream_contract"):
        blockers.append("OPEN_CORE_MANIFEST.json and install/edition-overlays.json upstream_contract drifted")
    blockers.extend(audit_upstream_contract(manifest.get("upstream_contract", {}), prefix="root manifest"))
    blockers.extend(audit_upstream_contract(overlay.get("upstream_contract", {}), prefix="overlay manifest"))

    base = overlay.get("base")
    if not isinstance(base, dict):
        blockers.append("edition overlay base must be an object")
    else:
        if base.get("pin_required") is not True:
            blockers.append("edition overlay base must require commit SHA pinning")
        if "commit_sha" not in string_list(base.get("accepted_ref_kinds")):
            blockers.append("edition overlay base accepted_ref_kinds must include commit_sha")
        if base.get("resolved_at_build_time_only") is not True:
            blockers.append("edition overlay base must resolve at build time only")

    package_names = {
        str(package.get("name"))
        for package in manifest.get("packages", [])
        if isinstance(package, dict) and package.get("name")
    }
    missing_packages = sorted(REQUIRED_PACKAGES - package_names)
    if missing_packages:
        blockers.append("OPEN_CORE_MANIFEST.json missing public packages: " + ", ".join(missing_packages))

    profiles = profiles_by_id(overlay)
    missing_profiles = sorted(REQUIRED_PROFILES - set(profiles))
    if missing_profiles:
        blockers.append("edition overlay manifest missing profiles: " + ", ".join(missing_profiles))
    for profile_id, profile in profiles.items():
        if profile.get("runtime_source_pull_allowed") is not False:
            blockers.append(f"profile {profile_id} allows runtime source pull")
        if profile.get("public_tree_contains_private_overlay") is not False:
            blockers.append(f"profile {profile_id} allows private overlay in public tree")
        profile_base = profile.get("base")
        if not isinstance(profile_base, dict):
            blockers.append(f"profile {profile_id} base must be an object")
        else:
            if profile_base.get("selector") != "flyto-warroom@commit_sha":
                blockers.append(f"profile {profile_id} must use flyto-warroom@commit_sha")
            if profile_base.get("resolved_at_build_time_only") is not True:
                blockers.append(f"profile {profile_id} base must resolve at build time only")
        include_packages = set(string_list(profile.get("include_packages")))
        unknown_packages = sorted(include_packages - package_names)
        if unknown_packages:
            blockers.append(f"profile {profile_id} references unknown packages: " + ", ".join(unknown_packages))
        overlay_kinds = set(string_list(profile.get("private_overlay_kinds")))
        if profile_id == "community":
            if profile.get("license_tier") != "community":
                blockers.append("community profile must use license_tier=community")
            if set(string_list(profile.get("allowed_module_editions"))) != {"ce"}:
                blockers.append("community profile may allow only CE modules")
            if overlay_kinds:
                blockers.append("community profile must not include private overlay kinds")
            missing_moats = sorted(REQUIRED_MOATS - set(string_list(profile.get("forbidden_moats"))))
            if missing_moats:
                blockers.append("community profile missing moat guards: " + ", ".join(missing_moats))
        else:
            if not overlay_kinds:
                blockers.append(f"paid profile {profile_id} must declare private overlay kinds")
            if not overlay_kinds.intersection(AUTHORITY_OVERLAYS):
                blockers.append(f"paid profile {profile_id} must include a rating-authority overlay kind")
    if not string_list(overlay.get("protected_overlay_kinds")):
        blockers.append("edition overlay manifest must list protected overlay kinds")
    return blockers


def source_boundary_private_paths(boundary: dict) -> list[str]:
    blocked = boundary.get("blocked")
    patterns = []
    if isinstance(blocked, dict):
        patterns = string_list(blocked.get("path_patterns"))
    out: list[str] = []
    for pattern in patterns:
        if pattern.startswith("api/"):
            out.append("services/flyto-engine-ce/" + pattern)
        elif pattern.startswith("cmd/"):
            out.append("services/flyto-engine-ce/" + pattern)
        elif pattern.startswith("internal/"):
            out.append("services/flyto-engine-ce/" + pattern)
        elif pattern.startswith("release/"):
            out.append("services/flyto-engine-ce/" + pattern)
    return out


def audit_tree(boundary: dict, manifest: dict) -> list[str]:
    blockers: list[str] = []
    for pattern in source_boundary_private_paths(boundary):
        if pattern.endswith("/**"):
            base = ROOT / pattern[:-3]
            matches = base.rglob("*") if base.exists() else []
        else:
            matches = ROOT.glob(pattern)
        for match in matches:
            if match.is_file():
                blockers.append(f"private engine path escaped into CE tree: {match.relative_to(ROOT)}")
    frontend_boundary = manifest.get("frontend_source_boundary")
    frontend_pruned = FRONTEND_PRIVATE_PATHS
    if isinstance(frontend_boundary, dict):
        frontend_pruned = [
            "packages/flyto-code/" + path
            for path in string_list(frontend_boundary.get("ce_pruned_paths"))
        ]
    for rel in frontend_pruned:
        if (ROOT / rel).exists():
            blockers.append(f"private frontend path escaped into CE tree: {rel}")
    return blockers


def audit_docs() -> list[str]:
    blockers: list[str] = []
    required_markers = {
        "README.md": [
            "Enterprise and SaaS editions are assembled as build-time overlays",
            "pinned Flyto2 Warroom CE commit",
            "never pulls source",
        ],
        "docs/edition-profiles.md": [
            "Source-available Noncommercial Rule",
            "public rating authority remains a private signed overlay",
            "CE scores are local and externally observed",
        ],
        "docs/upstream-feedback-loop.md": [
            "not a permanent fork",
            "public PR",
            "private source",
            "re-export CE",
        ],
        "packages/flyto-code/OPEN_CORE.md": [
            "Maintainers import accepted public changes back",
            "paid build-time overlays",
        ],
        "packages/flyto-code/CE_SOURCE_BOUNDARY.md": [
            "build-time overlays",
            "must not ship enterprise control-plane implementation",
        ],
    }
    for rel, markers in required_markers.items():
        body = text(rel)
        for marker in markers:
            if marker not in body:
                blockers.append(f"{rel} missing open-core marker: {marker}")
    makefile = text("Makefile")
    if "scripts/audit-open-core-overlay.py ." not in makefile:
        blockers.append("Makefile must run scripts/audit-open-core-overlay.py")
    return blockers


def main() -> int:
    blockers: list[str] = []
    for rel in REQUIRED_FILES:
        if not (ROOT / rel).exists():
            blockers.append(f"missing required open-core file: {rel}")
    try:
        manifest = read_json("OPEN_CORE_MANIFEST.json")
        overlay = read_json("install/edition-overlays.json")
        boundary = read_json("services/flyto-engine-ce/SOURCE_BOUNDARY.json")
    except ValueError as exc:
        blockers.append(str(exc))
        manifest = {}
        overlay = {}
        boundary = {}
    if manifest:
        blockers.extend(audit_overlay_manifest(manifest, overlay))
        blockers.extend(audit_tree(boundary, manifest))
    blockers.extend(audit_docs())
    if blockers:
        for blocker in blockers:
            print("BLOCKED: " + blocker, file=sys.stderr)
        return 2
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
