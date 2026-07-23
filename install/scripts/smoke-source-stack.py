#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import secrets
import time
import urllib.error
import urllib.request


def get(url: str) -> tuple[int, bytes, str]:
    request = urllib.request.Request(url, headers={"User-Agent": "flyto2-ce-source-smoke/1"})
    with urllib.request.urlopen(request, timeout=5) as response:
        return response.status, response.read(), response.headers.get("Content-Type", "")


def request_json(
    url: str,
    *,
    method: str = "GET",
    body: dict[str, object] | None = None,
    token: str = "",
) -> dict[str, object]:
    headers = {"User-Agent": "flyto2-ce-source-smoke/1", "Accept": "application/json"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read())


def request_bytes(url: str, *, body: dict[str, object], token: str) -> tuple[bytes, str]:
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={
            "User-Agent": "flyto2-ce-source-smoke/1",
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return response.read(), response.headers.get("Content-Type", "")


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
    if engine_health.get("source_mode") != "complete_ce_source_runtime":
        raise SystemExit("engine health does not identify the complete public CE source runtime")

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

    bootstrap_status = request_json(f"{args.engine}/api/v1/auth/local/bootstrap")
    if not bootstrap_status.get("required") or not bootstrap_status.get("registrationOpen"):
        raise SystemExit("source smoke requires a fresh CE database with bootstrap open")
    nonce = secrets.token_hex(6)
    session = request_json(
        f"{args.engine}/api/v1/auth/local/bootstrap",
        method="POST",
        body={
            "email": f"source-smoke-{nonce}@example.test",
            "password": f"Warroom-{nonce}-Secure9!",
            "displayName": "CE Source Smoke",
        },
    )
    token = str(session.get("accessToken", ""))
    if not token:
        raise SystemExit("one-time CE administrator bootstrap did not return a session")
    me = request_json(f"{args.engine}/api/v1/me", token=token)
    if not me.get("id"):
        raise SystemExit("authenticated CE identity lookup failed")
    projects = request_json(f"{args.engine}/api/v1/code/orgs", token=token)
    organizations = projects.get("organizations", [])
    if not isinstance(organizations, list) or not organizations:
        raise SystemExit("CE bootstrap did not create the owner workspace")
    org_id = str(organizations[0]["id"])
    repo = request_json(
        f"{args.engine}/api/v1/code/orgs/{org_id}/repos",
        method="POST",
        token=token,
        body={
            "provider": "github",
            "providerId": "octocat/Hello-World",
            "ownerName": "octocat",
            "repoName": "Hello-World",
            "fullName": "octocat/Hello-World",
            "defaultBranch": "master",
            "isPrivate": False,
            "htmlUrl": "https://github.com/octocat/Hello-World.git",
        },
    )
    repo_id = str(repo.get("id", ""))
    if not repo_id:
        raise SystemExit("CE repository connection failed")
    scan_deadline = time.monotonic() + 60
    scan_status = "queued"
    while time.monotonic() < scan_deadline:
        scans = request_json(f"{args.engine}/api/v1/code/repos/{repo_id}/scans?limit=1", token=token)
        rows = scans.get("scans", [])
        if isinstance(rows, list) and rows:
            scan_status = str(rows[0].get("status", ""))
        if scan_status in {"complete", "failed"}:
            break
        time.sleep(0.5)
    if scan_status != "complete":
        raise SystemExit(f"source-built CE worker scan ended with {scan_status!r}")
    findings = request_json(f"{args.engine}/api/v1/code/repos/{repo_id}/findings", token=token)
    if "secrets" not in findings or "sast_findings" not in findings:
        raise SystemExit("CE finding response is incomplete")
    report, report_type = request_bytes(
        f"{args.engine}/api/v1/code/orgs/{org_id}/reports/build",
        token=token,
        body={"template_id": "code_audit", "format": "html"},
    )
    if b"Flyto2 Warroom CE Security Report" not in report or "text/html" not in report_type:
        raise SystemExit("CE source report delivery failed")

    _, html, content_type = wait_for(f"{args.frontend}/sign-in", 60)
    if b"index-next" not in html and b'id="root"' not in html:
        raise SystemExit("frontend /sign-in did not return the SPA shell")
    if "text/html" not in content_type:
        raise SystemExit(f"frontend /community returned unexpected content type: {content_type}")

    proxied = expect_json(
        f"{args.frontend}/api/v1/ce/product-loop",
        "flyto.engine-ce-product-loop.v1",
    )
    if proxied.get("summary") != loop.get("summary"):
        raise SystemExit("frontend proxy product-loop payload differs from direct engine payload")

    print("Flyto2 Warroom CE complete source stack smoke: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
