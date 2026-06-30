#!/usr/bin/env python3
"""Export public Flyto Warroom PR changes as source-repo patch bundles."""

from __future__ import annotations

import argparse
from pathlib import Path
import subprocess


PACKAGE_PATCHES = {
    "packages/flyto-core": "flyto-core",
    "packages/flyto-indexer": "flyto-indexer",
    "packages/flyto-i18n": "flyto-i18n",
    "packages/flyto-code": "flyto-code",
}

GENERATED_REVIEW_PREFIXES = (
    "packages/flyto-contracts/",
    "packages/flyto-code/vendor/@flyto/design-tokens/",
    "install/",
    "docs/",
    ".github/",
)

GENERATED_REVIEW_FILES = {
    "README.md",
    "CONTRIBUTING.md",
    "LICENSES.md",
    "OPEN_CORE_MANIFEST.json",
}


def run_git(root: Path, args: list[str]) -> str:
    result = subprocess.run(
        ["git", "-C", str(root), *args],
        check=True,
        text=True,
        capture_output=True,
    )
    return result.stdout


def strip_package_prefix(patch: str, prefix: str) -> str:
    replacements = {
        f"a/{prefix}/": "a/",
        f"b/{prefix}/": "b/",
        f" {prefix}/": " ",
    }
    out = patch
    for old, new in replacements.items():
        out = out.replace(old, new)
    out = out.replace(f"diff --git a/{prefix}/", "diff --git a/")
    out = out.replace(f" b/{prefix}/", " b/")
    out = out.replace(f"--- a/{prefix}/", "--- a/")
    out = out.replace(f"+++ b/{prefix}/", "+++ b/")
    out = out.replace(f"rename from {prefix}/", "rename from ")
    out = out.replace(f"rename to {prefix}/", "rename to ")
    return out


def changed_files(root: Path, base: str) -> list[str]:
    output = run_git(root, ["diff", "--name-only", base, "--"])
    return [line.strip() for line in output.splitlines() if line.strip()]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default=".", help="Path to the public flyto-warroom repo")
    parser.add_argument("--base", default="origin/main", help="Base ref to diff against")
    parser.add_argument("--output", default="upstream-patches", help="Patch output directory")
    args = parser.parse_args()

    root = Path(args.repo).resolve()
    output_dir = (root / args.output).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    written: list[str] = []
    for prefix, repo_name in PACKAGE_PATCHES.items():
        patch = run_git(root, ["diff", "--binary", args.base, "--", prefix])
        if not patch.strip():
            continue
        patch_path = output_dir / f"{repo_name}.patch"
        patch_path.write_text(strip_package_prefix(patch, prefix), encoding="utf-8")
        written.append(str(patch_path.relative_to(root)))

    generated = [
        path for path in changed_files(root, args.base)
        if path in GENERATED_REVIEW_FILES
        or any(path.startswith(prefix) for prefix in GENERATED_REVIEW_PREFIXES)
    ]
    if generated:
        review_path = output_dir / "REVIEW_GENERATED.md"
        review_path.write_text(
            "# Generated/Public-Surface Changes Requiring Source Review\n\n"
            "These files are generated or contract-facing. Apply the intent to the "
            "private source generator or private contract source, then rerun "
            "`flyto2-open-core-export`.\n\n"
            + "\n".join(f"- `{path}`" for path in generated)
            + "\n",
            encoding="utf-8",
        )
        written.append(str(review_path.relative_to(root)))

    if not written:
        print("no upstream patches generated")
        return 0
    for path in written:
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
