#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit


ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
MANIFEST_NAME = "OPEN_CORE_MANIFEST.json"
IGNORED_DIRECTORIES = {
    ".git", ".flyto", ".flyto-index", ".flyto-runs", ".hypothesis",
    ".mypy_cache", ".pytest_cache", ".ruff_cache", ".venv", ".venv-sec",
    ".vite", ".vitest", "__pycache__", "build", "dist", "dist-next",
    "node_modules", "out", "output", "reports", "test-results",
}


def ignored(rel: Path) -> bool:
    return rel.as_posix() == MANIFEST_NAME or rel.suffix == ".pyc" or any(
        part in IGNORED_DIRECTORIES for part in rel.parts
    )


def inventory() -> tuple[dict[str, str], str, list[str]]:
    files: dict[str, str] = {}
    digest = hashlib.sha256()
    blockers: list[str] = []
    for path in sorted(ROOT.rglob("*")):
        rel = path.relative_to(ROOT)
        if ignored(rel):
            continue
        if path.is_symlink():
            blockers.append(f"CE release contains a symlink: {rel.as_posix()}")
            continue
        if not path.is_file():
            continue
        rel_text = rel.as_posix()
        file_hash = hashlib.sha256(path.read_bytes()).hexdigest()
        files[rel_text] = file_hash
        digest.update(rel_text.encode("utf-8"))
        digest.update(b"\0")
        digest.update(file_hash.encode("ascii"))
        digest.update(b"\n")
    return files, digest.hexdigest(), blockers


def unsafe_url(value: str) -> bool:
    if not value or "://" not in value:
        return not value
    parsed = urlsplit(value)
    return parsed.username is not None or parsed.password is not None


def main() -> int:
    blockers: list[str] = []
    try:
        payload = json.loads((ROOT / MANIFEST_NAME).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"BLOCKED: cannot read {MANIFEST_NAME}: {exc}", file=sys.stderr)
        return 2

    if payload.get("schema") != "flyto.open-core-export.v2":
        blockers.append("OPEN_CORE_MANIFEST.json must use flyto.open-core-export.v2")
    provenance = payload.get("provenance")
    if not isinstance(provenance, dict):
        blockers.append("OPEN_CORE_MANIFEST.json provenance must be an object")
        provenance = {}
    if provenance.get("schema") != "flyto.open-core-provenance.v1":
        blockers.append("provenance schema must be flyto.open-core-provenance.v1")
    if not re.fullmatch(r"[0-9a-f]{40}", str(provenance.get("source_commit", ""))):
        blockers.append("provenance source_commit must be a full Git SHA")
    if unsafe_url(str(provenance.get("source_repository", ""))):
        blockers.append("provenance source_repository must be credential-free")

    source_manifest = provenance.get("source_manifest")
    manifest_owner = ""
    if not isinstance(source_manifest, dict):
        blockers.append("provenance source_manifest must be an object")
    else:
        manifest_owner = str(source_manifest.get("repository", ""))
        manifest_path = Path(str(source_manifest.get("path", "")))
        if not manifest_owner or manifest_path.is_absolute() or ".." in manifest_path.parts:
            blockers.append("provenance source_manifest must use a repository-relative path")

    sources = provenance.get("source_repositories")
    if not isinstance(sources, dict):
        blockers.append("provenance source_repositories must be an object")
        sources = {}
    required = {
        str(package.get("repo", ""))
        for package in payload.get("packages", [])
        if isinstance(package, dict) and package.get("repo")
    }
    release = payload.get("release", {})
    if isinstance(release, dict):
        required.update(
            str(name)
            for name in release.get("build_source_repositories", [])
            if str(name)
        )
    missing = sorted(required - set(sources))
    if missing:
        blockers.append("provenance is missing source repositories: " + ", ".join(missing))
    for name, source in sources.items():
        if not isinstance(source, dict):
            blockers.append(f"provenance source repository {name} must be an object")
            continue
        if not re.fullmatch(r"[0-9a-f]{40}", str(source.get("commit", ""))):
            blockers.append(f"provenance source repository {name} has an invalid commit")
        if unsafe_url(str(source.get("repository", ""))):
            blockers.append(f"provenance source repository {name} has an unsafe URL")
    owner = sources.get(manifest_owner, {})
    if isinstance(owner, dict):
        if owner.get("commit") != provenance.get("source_commit"):
            blockers.append("provenance source_commit does not match the manifest owner")
        if owner.get("repository") != provenance.get("source_repository"):
            blockers.append("provenance source_repository does not match the manifest owner")

    files, tree_hash, inventory_blockers = inventory()
    blockers.extend(inventory_blockers)
    if provenance.get("files") != files:
        blockers.append("provenance file inventory does not match the CE release tree")
    if provenance.get("tree_sha256") != tree_hash:
        blockers.append("provenance tree_sha256 does not match the CE release tree")

    if blockers:
        for blocker in blockers:
            print("BLOCKED: " + blocker, file=sys.stderr)
        return 2
    print(f"ok: {len(files)} files tree_sha256={tree_hash}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
