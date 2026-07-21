#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.request


def get(url: str) -> tuple[int, bytes, str]:
    request = urllib.request.Request(url, headers={"User-Agent": "flyto2-ce-source-smoke/1"})
    with urllib.request.urlopen(request, timeout=5) as response:
        return response.status, response.read(), response.headers.get("Content-Type", "")


def wait_for(url: str, timeout: int) -> tuple[int, bytes, str]:
    deadline = time.monotonic() + timeout
    last_error = "not attempted"
    while time.monotonic() < deadline:
        try:
            status, body, content_type = get(url)
            if status == 200:
                return status, body, content_type
            last_error = f"HTTP {status}"
        except (OSError, urllib.error.URLError) as exc:
            last_error = str(exc)
        time.sleep(1)
    raise SystemExit(f"timed out waiting for {url}: {last_error}")


def expect_json(url: str, schema: str | None = None) -> dict[str, object]:
    _, body, _ = wait_for(url, 60)
    payload = json.loads(body)
    if schema and payload.get("schema") != schema:
        raise SystemExit(f"{url} returned schema {payload.get('schema')!r}, expected {schema!r}")
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke the source-built Flyto2 Warroom CE profile")
    parser.add_argument("--engine", default="http://127.0.0.1:18080")
    parser.add_argument("--worker", default="http://127.0.0.1:18081")
    parser.add_argument("--frontend", default="http://127.0.0.1:18088")
    args = parser.parse_args()

    engine_health = expect_json(f"{args.engine}/healthz")
    if engine_health.get("source_mode") != "ce_runtime_kernel_source_and_images":
        raise SystemExit("engine health does not identify the public CE source runtime")

    loop = expect_json(
        f"{args.engine}/api/v1/ce/product-loop",
        "flyto.engine-ce-product-loop.v1",
    )
    if loop.get("provider_execution") != "none":
        raise SystemExit("source product loop must remain provider-free")
    if set(loop.get("scope", {}).get("surfaces", [])) != {"code", "container", "cloud", "runtime", "external"}:
        raise SystemExit("source product loop does not cover all declared CE surfaces")

    worker = expect_json(
        f"{args.worker}/api/v1/ce/worker/self-test",
        "flyto.worker-ce-self-test.v1",
    )
    if worker.get("status") != "pass":
        raise SystemExit("source worker deterministic self-test failed")

    _, html, content_type = wait_for(f"{args.frontend}/community", 60)
    if b"index-next" not in html and b'id="root"' not in html:
        raise SystemExit("frontend /community did not return the SPA shell")
    if "text/html" not in content_type:
        raise SystemExit(f"frontend /community returned unexpected content type: {content_type}")

    proxied = expect_json(
        f"{args.frontend}/api/v1/ce/product-loop",
        "flyto.engine-ce-product-loop.v1",
    )
    if proxied.get("summary") != loop.get("summary"):
        raise SystemExit("frontend proxy product-loop payload differs from direct engine payload")

    print("Flyto2 Warroom CE source stack smoke: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
