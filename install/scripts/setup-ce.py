#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
from pathlib import Path
import secrets
import stat


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_EXAMPLE = ROOT / "install/.env.ce.example"
DEFAULT_OUTPUT = ROOT / "install/.env"
SECRET_KEYS = {
    "POSTGRES_PASSWORD": lambda: secrets.token_urlsafe(32),
    "FLYTO_LOCAL_AUTH_JWT_SECRET": lambda: secrets.token_urlsafe(48),
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


def main() -> int:
    parser = argparse.ArgumentParser(description="Create Flyto2 Warroom CE infrastructure secrets")
    parser.add_argument("--example", default=str(DEFAULT_EXAMPLE))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    example = Path(args.example)
    output = Path(args.output)
    if not example.exists():
        raise SystemExit(f"missing example env: {example}")
    if output.exists() and not args.force:
        raise SystemExit(f"{output} already exists; pass --force to replace it")

    updates = {key: factory() for key, factory in SECRET_KEYS.items()}
    updates["FLYTO_LOCAL_AUTH_ALLOW_BOOTSTRAP"] = "1"

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(render_env(parse_env(example), updates), encoding="utf-8")
    os.chmod(output, stat.S_IRUSR | stat.S_IWUSR)
    print(f"wrote {output}")
    print("next: make preflight && make ce-up")
    print("then open http://localhost:8088 to create the first administrator")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
