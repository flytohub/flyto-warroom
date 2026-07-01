#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MANIFEST = ROOT / "OPEN_CORE_MANIFEST.json"
DEFAULT_PLATFORMS = ["linux/amd64", "linux/arm64"]
MANIFEST_ACCEPT = ", ".join(
    [
        "application/vnd.oci.image.index.v1+json",
        "application/vnd.docker.distribution.manifest.list.v2+json",
        "application/vnd.oci.image.manifest.v1+json",
        "application/vnd.docker.distribution.manifest.v2+json",
    ]
)


def service_images(manifest_path: Path) -> tuple[dict, list[tuple[str, str, str, list[str]]]]:
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    release = payload.get("release", {})
    images = release.get("public_images", {})
    tags = release.get("public_image_tags", {})
    digests = release.get("public_image_digests", {})
    platforms_config = release.get("public_image_platforms", DEFAULT_PLATFORMS)
    default_repo = release.get("public_image_repository", "docker.io/chesterhsu/flyto-warroom")
    defaults = {
        "engine": "engine-ce",
        "worker": "worker-ce",
        "frontend": "code-ce",
        "runner": "runner-ce",
        "verification": "verification-ce",
        "brand_vision": "brand-vision-ce",
        "pdf": "pdf-ce",
    }
    result: list[tuple[str, str, str, list[str]]] = []
    for service, default_tag in defaults.items():
        repo = images.get(service, default_repo)
        tag = tags.get(service, default_tag)
        result.append(
            (
                service,
                f"{repo}:{tag}",
                digests.get(service, ""),
                platforms_for_service(platforms_config, service),
            )
        )
    return payload, result


def platforms_for_service(config: object, service: str) -> list[str]:
    if isinstance(config, list):
        return [str(item) for item in config]
    if isinstance(config, dict):
        value = config.get(service, config.get("default", DEFAULT_PLATFORMS))
        if isinstance(value, list):
            return [str(item) for item in value]
    return list(DEFAULT_PLATFORMS)


def run(cmd: list[str], *, timeout: int) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, text=True, capture_output=True, timeout=timeout, check=False)


def descriptor_digest(payload: object) -> str:
    if isinstance(payload, dict):
        descriptor = payload.get("Descriptor")
        if isinstance(descriptor, dict) and isinstance(descriptor.get("digest"), str):
            return descriptor["digest"]
        if isinstance(payload.get("schemaVersion"), int):
            return ""
    if isinstance(payload, list) and len(payload) == 1:
        return descriptor_digest(payload[0])
    return ""


def platform_name(platform: object) -> str:
    if not isinstance(platform, dict):
        return ""
    os_name = platform.get("os")
    architecture = platform.get("architecture")
    if not isinstance(os_name, str) or not isinstance(architecture, str):
        return ""
    if os_name == "unknown" or architecture == "unknown":
        return ""
    variant = platform.get("variant")
    if isinstance(variant, str) and variant:
        return f"{os_name}/{architecture}/{variant}"
    return f"{os_name}/{architecture}"


def platforms_from_manifest(payload: object) -> set[str]:
    found: set[str] = set()
    if isinstance(payload, list):
        for item in payload:
            found.update(platforms_from_manifest(item))
        return found
    if not isinstance(payload, dict):
        return found
    descriptor = payload.get("Descriptor")
    if isinstance(descriptor, dict):
        name = platform_name(descriptor.get("platform"))
        if name:
            found.add(name)
    for key in ("OCIIndex", "SchemaV2List"):
        index = payload.get(key)
        if isinstance(index, dict):
            manifests = index.get("manifests")
            if isinstance(manifests, list):
                for item in manifests:
                    if isinstance(item, dict):
                        name = platform_name(item.get("platform"))
                        if name:
                            found.add(name)
    manifests = payload.get("manifests")
    if isinstance(manifests, list):
        for item in manifests:
            if isinstance(item, dict):
                name = platform_name(item.get("platform"))
                if name:
                    found.add(name)
    return found


def parse_image_ref(image: str) -> tuple[str, str, str]:
    if "@" in image:
        image, digest = image.split("@", 1)
        registry, repository, _tag = parse_image_ref(image)
        return registry, repository, digest
    registry = "registry-1.docker.io"
    remainder = image
    first = image.split("/", 1)[0]
    if "." in first or ":" in first or first == "localhost":
        registry, remainder = image.split("/", 1)
    if registry == "docker.io":
        registry = "registry-1.docker.io"
    if "/" not in remainder:
        remainder = "library/" + remainder
    repository = remainder
    tag = "latest"
    if ":" in remainder.rsplit("/", 1)[-1]:
        repository, tag = remainder.rsplit(":", 1)
    return registry, repository, tag


def auth_request_token(header: str, repository: str) -> str:
    if not header.lower().startswith("bearer "):
        return ""
    params: dict[str, str] = {}
    for part in header[len("Bearer ") :].split(","):
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        params[key.strip()] = value.strip().strip('"')
    realm = params.get("realm")
    service = params.get("service")
    scope = params.get("scope") or f"repository:{repository}:pull"
    if not realm:
        return ""
    query = []
    if service:
        query.append("service=" + quote(service, safe=""))
    if scope:
        query.append("scope=" + quote(scope, safe=":"))
    url = realm + ("?" + "&".join(query) if query else "")
    with urlopen(url, timeout=30) as response:  # nosec B310 - public registry metadata only
        payload = json.loads(response.read().decode("utf-8"))
    token = payload.get("token") or payload.get("access_token")
    return token if isinstance(token, str) else ""


def registry_manifest_digest(image: str) -> str:
    registry, repository, tag = parse_image_ref(image)
    url = f"https://{registry}/v2/{repository}/manifests/{tag}"
    headers = {"Accept": MANIFEST_ACCEPT}

    def request(method: str, token: str = ""):
        req_headers = dict(headers)
        if token:
            req_headers["Authorization"] = f"Bearer {token}"
        req = Request(url, headers=req_headers, method=method)
        return urlopen(req, timeout=30)  # nosec B310 - public registry metadata only

    token = ""
    try:
        with request("HEAD") as response:
            digest = response.headers.get("Docker-Content-Digest", "")
            if digest:
                return digest
    except HTTPError as exc:
        if exc.code == 401:
            token = auth_request_token(exc.headers.get("WWW-Authenticate", ""), repository)
            if not token:
                raise
        elif exc.code not in (405,):
            raise
    except URLError:
        return ""
    if token:
        try:
            with request("HEAD", token) as response:
                digest = response.headers.get("Docker-Content-Digest", "")
                if digest:
                    return digest
        except HTTPError as exc:
            if exc.code not in (405,):
                raise
    try:
        with request("GET", token) as response:
            return response.headers.get("Docker-Content-Digest", "")
    except URLError:
        return ""


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify Flyto2 Warroom CE Docker Hub image tags and digests")
    parser.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
    parser.add_argument("--pull", action="store_true", help="also docker pull every image")
    parser.add_argument("--dry-run", action="store_true", help="print images without contacting Docker Hub")
    parser.add_argument("--write-digests", action="store_true", help="write current registry manifest-list digests back to the manifest")
    parser.add_argument("--timeout", type=int, default=120)
    args = parser.parse_args()

    manifest = Path(args.manifest)
    blockers: list[str] = []
    payload, images = service_images(manifest)
    updated_digests: dict[str, str] = {}
    for service, image, expected_digest, required_platforms in images:
        suffix = f" expected={expected_digest}" if expected_digest else ""
        print(f"{service} {image} platforms={','.join(required_platforms)}{suffix}")
        if args.dry_run:
            continue
        inspected = run(["docker", "manifest", "inspect", "--verbose", image], timeout=args.timeout)
        if inspected.returncode != 0:
            blockers.append(f"manifest inspect failed for {image}: {inspected.stderr.strip() or inspected.stdout.strip()}")
            continue
        try:
            parsed = json.loads(inspected.stdout)
        except json.JSONDecodeError:
            blockers.append(f"manifest inspect returned non-json output for {image}")
            continue
        actual_digest = registry_manifest_digest(image) or descriptor_digest(parsed)
        actual_platforms = platforms_from_manifest(parsed)
        missing_platforms = sorted(set(required_platforms) - actual_platforms)
        if missing_platforms:
            blockers.append(
                f"platform mismatch for {image}: missing {', '.join(missing_platforms)}; "
                f"found {', '.join(sorted(actual_platforms)) or 'none'}"
            )
        if expected_digest and not args.write_digests:
            if actual_digest != expected_digest:
                blockers.append(
                    f"digest mismatch for {image}: expected {expected_digest}, got {actual_digest or 'missing'}"
                )
        elif not actual_digest:
            blockers.append(f"manifest descriptor digest missing for {image}")
        if actual_digest:
            updated_digests[service] = actual_digest
        if args.pull:
            pulled = run(["docker", "pull", image], timeout=args.timeout * 3)
            if pulled.returncode != 0:
                blockers.append(f"docker pull failed for {image}: {pulled.stderr.strip() or pulled.stdout.strip()}")
    if blockers:
        for blocker in blockers:
            print("BLOCKED: " + blocker, file=sys.stderr)
        return 2
    if args.write_digests:
        release = payload.setdefault("release", {})
        release["public_image_digests"] = {
            **release.get("public_image_digests", {}),
            **updated_digests,
        }
        manifest.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        print(f"updated {manifest}")
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
