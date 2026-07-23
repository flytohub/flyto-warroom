#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]
REQUIRED_NON_EMPTY = [
    "POSTGRES_PASSWORD",
    "FLYTO_LOCAL_AUTH_ALLOW_BOOTSTRAP",
    "FLYTO_LOCAL_AUTH_JWT_SECRET",
]
URL_SAFE_COMPONENT_RE = re.compile(r"^[A-Za-z0-9._~-]+$")


def parse_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        if not raw or raw.startswith("#") or "=" not in raw:
            continue
        key, value = raw.split("=", 1)
        values[key] = value
    return values


def compose_command() -> list[str] | None:
    if shutil.which("docker-compose"):
        return ["docker-compose"]
    if shutil.which("docker"):
        probe = subprocess.run(["docker", "compose", "version"], capture_output=True, text=True, check=False)
        if probe.returncode == 0:
            return ["docker", "compose"]
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Preflight a Flyto2 Warroom CE local install")
    parser.add_argument("--env", default=str(ROOT / "install/.env"))
    parser.add_argument("--skip-compose", action="store_true")
    args = parser.parse_args()

    env_path = Path(args.env)
    blockers: list[str] = []
    warnings: list[str] = []
    if not env_path.exists():
        blockers.append(f"missing env file: {env_path}; run python3 install/scripts/setup-ce.py")
    else:
        values = parse_env(env_path)
        for key in REQUIRED_NON_EMPTY:
            if not values.get(key):
                blockers.append(f"{key} is empty in {env_path}")
        if values.get("POSTGRES_PASSWORD") == "change-me-local-only":
            blockers.append("POSTGRES_PASSWORD still uses the example placeholder")
        postgres_password = values.get("POSTGRES_PASSWORD", "")
        if postgres_password and not URL_SAFE_COMPONENT_RE.fullmatch(postgres_password):
            blockers.append(
                "POSTGRES_PASSWORD must use URL-safe characters [A-Za-z0-9._~-]; "
                "run setup-ce.py again or replace characters like ':', '@', '/', '?', '#', '[', and ']'"
            )
        if values.get("FLYTO_LOCAL_AUTH_ALLOW_BOOTSTRAP") != "1":
            blockers.append("FLYTO_LOCAL_AUTH_ALLOW_BOOTSTRAP must be 1 for first-run web registration")
        mode = stat.S_IMODE(env_path.stat().st_mode)
        if mode & (stat.S_IRWXG | stat.S_IRWXO):
            blockers.append(f"{env_path} permissions must be 0600 or stricter")
    compose = None
    if not args.skip_compose:
        if shutil.which("docker") is None:
            blockers.append("docker is not installed or not on PATH")
        compose = compose_command()
        if compose is None:
            blockers.append("docker compose or docker-compose is not installed")
    if not blockers and not args.skip_compose and compose is not None:
        cmd = [
            *compose,
            "--env-file",
            str(env_path),
            "-f",
            str(ROOT / "install/docker-compose.ce.yml"),
            "config",
            "--images",
        ]
        result = subprocess.run(cmd, text=True, capture_output=True, check=False)
        if result.returncode != 0:
            blockers.append(result.stderr.strip() or result.stdout.strip() or "docker compose config failed")
    if warnings:
        for warning in warnings:
            print("WARN: " + warning, file=sys.stderr)
    if blockers:
        for blocker in blockers:
            print("BLOCKED: " + blocker, file=sys.stderr)
        return 2
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
