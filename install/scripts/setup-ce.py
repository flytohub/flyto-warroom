#!/usr/bin/env python3
from __future__ import annotations

import argparse
import getpass
import hashlib
import os
from pathlib import Path
import re
import secrets
import stat
import sys


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_EXAMPLE = ROOT / "install/.env.ce.example"
DEFAULT_OUTPUT = ROOT / "install/.env"
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

SECRET_KEYS = {
    "POSTGRES_PASSWORD": lambda: secrets.token_urlsafe(32),
    "FLYTO_LOCAL_AUTH_JWT_SECRET": lambda: secrets.token_urlsafe(48),
    "FLYTO_RUNNER_SECRET": lambda: secrets.token_urlsafe(48),
    "FLYTO_VERIFICATION_SECRET": lambda: secrets.token_urlsafe(48),
    "FLYTO_MASTER_KEY": lambda: secrets.token_urlsafe(48),
}


def parse_env(path: Path) -> list[tuple[str, str | None]]:
    entries: list[tuple[str, str | None]] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        if not raw or raw.startswith("#") or "=" not in raw:
            entries.append((raw, None))
            continue
        key, value = raw.split("=", 1)
        entries.append((key, value))
    return entries


def render_env(entries: list[tuple[str, str | None]], updates: dict[str, str]) -> str:
    lines: list[str] = []
    seen: set[str] = set()
    for key, value in entries:
        if value is None:
            lines.append(key)
            continue
        seen.add(key)
        lines.append(f"{key}={updates.get(key, value)}")
    for key, value in updates.items():
        if key not in seen:
            lines.append(f"{key}={value}")
    return "\n".join(lines).rstrip() + "\n"


def read_password(args: argparse.Namespace) -> str:
    if args.password_stdin:
        password = sys.stdin.readline().rstrip("\n")
        if not password:
            raise SystemExit("password from stdin is empty")
        return password
    password = getpass.getpass("Initial admin password: ")
    confirm = getpass.getpass("Confirm initial admin password: ")
    if password != confirm:
        raise SystemExit("passwords do not match")
    return password


def validate_password(password: str) -> None:
    problems: list[str] = []
    if len(password) < 14:
        problems.append("at least 14 characters")
    if password.lower() == password or password.upper() == password:
        problems.append("mixed case")
    if not any(ch.isdigit() for ch in password):
        problems.append("a digit")
    if not any(not ch.isalnum() for ch in password):
        problems.append("a symbol")
    if problems:
        raise SystemExit("password must include " + ", ".join(problems))


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a secure Flyto2 Warroom CE install/.env")
    parser.add_argument("--example", default=str(DEFAULT_EXAMPLE))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--email", default="")
    parser.add_argument("--display-name", default="Local Admin")
    parser.add_argument("--password-stdin", action="store_true")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    example = Path(args.example)
    output = Path(args.output)
    if not example.exists():
        raise SystemExit(f"missing example env: {example}")
    if output.exists() and not args.force:
        raise SystemExit(f"{output} already exists; pass --force to replace it")

    email = args.email.strip() or input("Initial admin email: ").strip()
    if not EMAIL_RE.match(email):
        raise SystemExit("initial admin email is invalid")
    password = read_password(args)
    validate_password(password)

    updates = {key: factory() for key, factory in SECRET_KEYS.items()}
    updates.update({
        "FLYTO_LOCAL_AUTH_EMAIL": email,
        "FLYTO_LOCAL_AUTH_DISPLAY_NAME": args.display_name,
        "FLYTO_LOCAL_AUTH_PASSWORD_SHA256": hashlib.sha256(password.encode("utf-8")).hexdigest(),
    })

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(render_env(parse_env(example), updates), encoding="utf-8")
    os.chmod(output, stat.S_IRUSR | stat.S_IWUSR)
    print(f"wrote {output}")
    print(f"initial admin email: {email}")
    print("initial admin password was not stored; only SHA-256 hash was written")
    print("next: make preflight && make ce-up")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
