#!/usr/bin/env python3
"""Enforce Flyto2 naming and the public @flyto2.com email policy."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TEXT_SUFFIXES = {
    ".conf",
    ".css",
    ".env",
    ".example",
    ".html",
    ".js",
    ".json",
    ".md",
    ".mjs",
    ".production",
    ".py",
    ".scss",
    ".sh",
    ".toml",
    ".ts",
    ".tsx",
    ".txt",
    ".yaml",
    ".yml",
}
SKIP_NAMES = {"package-lock.json"}
SKIP_PREFIXES = ("docs/reference/",)
APPROVED_PUBLIC_EMAILS = {
    "admin@flyto2.com",
    "alerts@flyto2.com",
    "conduct@flyto2.com",
    "dev@flyto2.com",
    "dmarc@flyto2.com",
    "hello@flyto2.com",
    "info@flyto2.com",
    "noreply@flyto2.com",
    "oncall@flyto2.com",
    "pentest@flyto2.com",
    "privacy@flyto2.com",
    "reports@flyto2.com",
    "sales@flyto2.com",
    "security@flyto2.com",
    "support@flyto2.com",
    "team@flyto2.com",
}
EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
LEGACY_DOMAIN_RE = re.compile(
    r"(?<![A-Z0-9])flyto\.(?:ai|com|io)(?![A-Z0-9])",
    re.IGNORECASE,
)
BARE_BRAND_RE = re.compile(r"\bFlyto\b")


def repository_files() -> list[str]:
    """Return tracked and pending files while respecting Git ignores."""
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


def is_public_document(path: str) -> bool:
    """Return whether a file publishes project contact policy."""
    return path.endswith(".md") and not path.startswith(("handoffs/", "workflows/"))


def is_non_email_syntax(line: str, match: re.Match[str]) -> bool:
    """Allow Git SSH and infrastructure service-account identities."""
    email = match.group(0).lower()
    if email == "git@github.com" and line[match.end():].startswith(":"):
        return True
    if email.endswith(".iam.gserviceaccount.com"):
        return True
    scheme = line.rfind("://", 0, match.start())
    if scheme >= 0:
        authority_end = line.find("/", scheme + 3)
        if authority_end < 0 or match.start() < authority_end:
            return True
    return "@2x." in email


def check_line(path: str, number: int, line: str) -> list[str]:
    """Return identity violations found in one line."""
    violations = []
    if LEGACY_DOMAIN_RE.search(line):
        violations.append("legacy Flyto domain")
    if BARE_BRAND_RE.search(line):
        violations.append("bare Flyto product name")
    for match in EMAIL_RE.finditer(line):
        email = match.group(0).lower()
        if email.endswith("@flyto2.com"):
            if is_public_document(path) and email not in APPROVED_PUBLIC_EMAILS:
                violations.append(f"unregistered public Flyto2 address: {email}")
            continue
        if is_non_email_syntax(line, match):
            continue
        violations.append(f"non-Flyto2 email literal: {match.group(0)}")
    return [f"{path}:{number}: {message}" for message in violations]


def main() -> int:
    """Scan repository-owned text and fail on identity drift."""
    violations = []
    checked = 0
    for relative in repository_files():
        if relative == "scripts/check_brand_identity.py":
            continue
        path = Path(relative)
        if path.name in SKIP_NAMES or relative.startswith(SKIP_PREFIXES):
            continue
        if path.suffix.lower() not in TEXT_SUFFIXES and ".env" not in path.name:
            continue
        try:
            content = (ROOT / path).read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        checked += 1
        for number, line in enumerate(content.splitlines(), start=1):
            violations.extend(check_line(relative, number, line))
    if violations:
        raise RuntimeError("brand identity violations:\n" + "\n".join(violations))
    print(
        "brand identity passed: "
        f"{checked} files, Flyto2 naming, @flyto2.com public email policy"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
