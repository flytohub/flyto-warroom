#!/usr/bin/env python3
"""Validate Flyto2 Code documentation ownership and local links."""

from __future__ import annotations

import fnmatch
import json
import re
import subprocess
from pathlib import Path
from typing import Iterable, Optional


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "docs" / "documentation-manifest.json"
MARKDOWN_LINK = re.compile(r"(?<!!)\[[^\]]+\]\((?:<([^>]+)>|([^)]+))\)")
SOURCE_ROOTS = (
    ".github/",
    "e2e/",
    "public/",
    "scripts/",
    "src-next/",
    "vendor/",
    "workflows/",
)
ROOT_SOURCE_FILES = {
    ".env.example",
    ".env.production",
    ".flyto-rules.yaml",
    "Dockerfile",
    "cloudbuild.yaml",
    "eslint.config.js",
    "index-next.html",
    "nginx.conf",
    "nginx.enterprise-airgap.conf",
    "package.json",
    "playwright.config.ts",
    "playwright.ctem.config.ts",
    "tsconfig.app.json",
    "tsconfig.json",
    "tsconfig.node.json",
    "vite.config.next.ts",
    "vitest.config.ts",
}
SOURCE_EXTENSIONS = {
    ".conf",
    ".css",
    ".example",
    ".go",
    ".html",
    ".js",
    ".json",
    ".mjs",
    ".production",
    ".py",
    ".scss",
    ".sh",
    ".svg",
    ".toml",
    ".ts",
    ".tsx",
    ".txt",
    ".yaml",
    ".yml",
}


def repository_files() -> list[str]:
    """Return tracked and pending repository files, respecting Git ignores."""
    result = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return sorted(
        relative
        for relative in result.stdout.splitlines()
        if (ROOT / relative).is_file()
    )


def documentation_paths(manifest: dict) -> Iterable[str]:
    """Yield every durable document declared by the ownership manifest."""
    yield from manifest["documentation"].values()
    for area in manifest["source_areas"]:
        yield from area["documentation"]


def local_target(source: Path, raw_target: str) -> Optional[Path]:
    """Resolve a local Markdown target while ignoring URLs, mail, and anchors."""
    target = raw_target.strip().split(maxsplit=1)[0].strip("<>")
    if target.startswith(("#", "http://", "https://", "mailto:")):
        return None
    path = target.split("#", 1)[0]
    return (source.parent / path).resolve() if path else None


def owned_source_files(files: list[str]) -> list[str]:
    """Return source/configuration files that require a documentation owner."""
    owned = []
    for relative in files:
        if relative in ROOT_SOURCE_FILES:
            owned.append(relative)
            continue
        if not relative.startswith(SOURCE_ROOTS):
            continue
        if Path(relative).suffix.lower() in SOURCE_EXTENSIONS:
            owned.append(relative)
    return owned


def main() -> int:
    """Fail when generated docs drift, source is unowned, or links are broken."""
    if not MANIFEST.exists():
        raise RuntimeError("docs/documentation-manifest.json is missing")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    files = repository_files()
    missing = []
    for raw_path in documentation_paths(manifest):
        path = raw_path.split("#", 1)[0]
        if path and not (ROOT / path).exists():
            missing.append(f"manifest: {raw_path}")

    patterns = [
        pattern
        for area in manifest["source_areas"]
        for pattern in area["paths"]
    ]
    owned = owned_source_files(files)
    unowned = [
        relative
        for relative in owned
        if not any(fnmatch.fnmatch(relative, pattern) for pattern in patterns)
    ]

    markdown_files = [ROOT / relative for relative in files if relative.endswith(".md")]
    checked_links = 0
    for source in markdown_files:
        if not source.exists():
            continue
        content = source.read_text(encoding="utf-8")
        for match in MARKDOWN_LINK.finditer(content):
            raw_target = match.group(1) or match.group(2) or ""
            target = local_target(source, raw_target)
            if target is None:
                continue
            checked_links += 1
            if not target.exists():
                missing.append(
                    f"{source.relative_to(ROOT).as_posix()}: {raw_target}"
                )

    if missing or unowned:
        details = []
        if missing:
            details.append("missing documentation targets:\n" + "\n".join(missing))
        if unowned:
            details.append("unowned source/configuration:\n" + "\n".join(unowned))
        raise RuntimeError("\n\n".join(details))

    print(
        "documentation contract passed: "
        f"{len(markdown_files)} Markdown files, "
        f"{len(owned)} owned source/config files, "
        f"{checked_links} local links"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
