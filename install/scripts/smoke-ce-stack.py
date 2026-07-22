#!/usr/bin/env python3
from __future__ import annotations

import argparse
import http.client
import json
from pathlib import Path
import sys
import time
from urllib import error, request


ROOT = Path(__file__).resolve().parents[2]
REQUIRED_SURFACES = {"code", "container", "cloud", "runtime", "external"}


def parse_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        if not raw or raw.startswith("#") or "=" not in raw:
            continue
        key, value = raw.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def env_int(values: dict[str, str], key: str, default: int) -> int:
    raw = values.get(key, "")
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise SystemExit(f"{key} must be an integer, got {raw!r}") from exc


def fetch(url: str) -> tuple[int, str]:
    req = request.Request(url, headers={"Accept": "application/json"})
    try:
        with request.urlopen(req, timeout=5) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")
    except error.URLError as exc:
        raise RuntimeError(str(exc.reason)) from exc
    except (http.client.HTTPException, OSError) as exc:
        raise RuntimeError(str(exc) or exc.__class__.__name__) from exc


def validate_product_loop(payload: dict[str, object]) -> list[str]:
    blockers: list[str] = []
    if payload.get("schema") != "flyto.engine-ce-product-loop.v1":
        blockers.append("schema is not flyto.engine-ce-product-loop.v1")
    if payload.get("provider_execution") != "none":
        blockers.append("provider_execution must be none for CE smoke")
    if payload.get("data_mode") != "deterministic_demo_seed":
        blockers.append("data_mode must be deterministic_demo_seed")
    assets = payload.get("assets")
    if not isinstance(assets, list) or not assets:
        blockers.append("assets must be a non-empty list")
    else:
        surfaces = {asset.get("surface") for asset in assets if isinstance(asset, dict)}
        missing = sorted(REQUIRED_SURFACES - surfaces)
        if missing:
            blockers.append("missing product-loop surfaces: " + ", ".join(missing))
    for key in ("findings", "attack_paths", "evidence", "remediation", "validation"):
        value = payload.get(key)
        if not isinstance(value, list) or not value:
            blockers.append(f"{key} must be a non-empty list")
    return blockers


def check(name: str, url: str, *, expect_json: bool = False, product_loop: bool = False) -> dict[str, object]:
    row: dict[str, object] = {"name": name, "url": url, "ok": False}
    try:
        status, body = fetch(url)
    except RuntimeError as exc:
        row["error"] = str(exc)
        return row
    row["status"] = status
    if status < 200 or status >= 300:
        row["error"] = body[:500]
        return row
    if expect_json or product_loop:
        try:
            payload = json.loads(body)
        except json.JSONDecodeError as exc:
            row["error"] = f"invalid JSON: {exc}"
            return row
        if product_loop:
            blockers = validate_product_loop(payload)
            if blockers:
                row["error"] = "; ".join(blockers)
                return row
    row["ok"] = True
    return row


def run_checks(values: dict[str, str]) -> list[dict[str, object]]:
    engine = f"http://127.0.0.1:{env_int(values, 'FLYTO_ENGINE_PORT', 8080)}"
    frontend = f"http://127.0.0.1:{env_int(values, 'FLYTO_CODE_PORT', 8088)}"
    runner = f"http://127.0.0.1:{env_int(values, 'FLYTO_RUNNER_PORT', 8090)}"
    verification = f"http://127.0.0.1:{env_int(values, 'FLYTO_VERIFICATION_PORT', 8344)}"
    brand_vision = f"http://127.0.0.1:{env_int(values, 'FLYTO_BRAND_VISION_PORT', 8095)}"
    return [
        check("engine health", engine + "/health", expect_json=True),
        check("engine CE product-loop", engine + "/api/v1/ce/product-loop", product_loop=True),
        check("frontend root", frontend + "/"),
        check("frontend API proxy CE product-loop", frontend + "/api/v1/ce/product-loop", product_loop=True),
        check("runner health", runner + "/health", expect_json=True),
        check("verification health", verification + "/health", expect_json=True),
        check("brand vision health", brand_vision + "/health", expect_json=True),
    ]


def print_text(rows: list[dict[str, object]]) -> None:
    for row in rows:
        prefix = "ok" if row.get("ok") else "BLOCKED"
        line = f"{prefix}: {row['name']} {row['url']}"
        if "status" in row:
            line += f" status={row['status']}"
        if row.get("error"):
            line += f" error={row['error']}"
        stream = sys.stdout if row.get("ok") else sys.stderr
        print(line, file=stream)


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke test a running Flyto2 Warroom CE Docker Compose stack")
    parser.add_argument("--env", default=str(ROOT / "install/.env"))
    parser.add_argument("--timeout", type=int, default=90)
    parser.add_argument("--interval", type=float, default=3.0)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    values = parse_env(Path(args.env))
    deadline = time.time() + max(args.timeout, 1)
    last_rows: list[dict[str, object]] = []
    while True:
        last_rows = run_checks(values)
        if all(row.get("ok") for row in last_rows):
            if args.json:
                print(json.dumps({"ok": True, "checks": last_rows}, indent=2, sort_keys=True))
            else:
                print_text(last_rows)
            return 0
        if time.time() >= deadline:
            break
        time.sleep(max(args.interval, 0.5))

    if args.json:
        print(json.dumps({"ok": False, "checks": last_rows}, indent=2, sort_keys=True))
    else:
        print_text(last_rows)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
