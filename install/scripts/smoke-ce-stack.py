#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]


def parse_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        if not raw or raw.startswith("#") or "=" not in raw:
            continue
        key, value = raw.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def env_port(values: dict[str, str], key: str, default: int) -> int:
    raw = values.get(key, str(default))
    try:
        port = int(raw)
    except ValueError as exc:
        raise SystemExit(f"{key} must be an integer, got {raw!r}") from exc
    if not 1 <= port <= 65535:
        raise SystemExit(f"{key} must be between 1 and 65535")
    return port


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run the complete first-install product smoke against official CE images"
    )
    parser.add_argument("--env", default=str(ROOT / "install/.env"))
    args = parser.parse_args()

    env_path = Path(args.env)
    if not env_path.exists():
        raise SystemExit(f"missing env file: {env_path}; run make setup-ce first")
    values = parse_env(env_path)
    command = [
        sys.executable,
        str(ROOT / "install/scripts/smoke-source-stack.py"),
        "--engine",
        f"http://127.0.0.1:{env_port(values, 'FLYTO_ENGINE_PORT', 8080)}",
        "--worker",
        f"http://127.0.0.1:{env_port(values, 'FLYTO_WORKER_PORT', 8081)}",
        "--frontend",
        f"http://127.0.0.1:{env_port(values, 'FLYTO_CODE_PORT', 8088)}",
    ]
    return subprocess.run(command, check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())
