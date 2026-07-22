#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MANIFEST = ROOT / "OPEN_CORE_MANIFEST.json"


def service_images(manifest_path: Path) -> list[tuple[str, str, str]]:
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    release = payload.get("release", {})
    images = release.get("public_images", {})
    tags = release.get("public_image_tags", {})
    digests = release.get("public_image_digests", {})
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
    result: list[tuple[str, str, str]] = []
    for service, default_tag in defaults.items():
        repo = images.get(service, default_repo)
        tag = tags.get(service, default_tag)
        result.append((service, f"{repo}:{tag}", digests.get(service, "")))
    return result


def run(cmd: list[str], *, timeout: int) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, text=True, capture_output=True, timeout=timeout, check=False)


def descriptor_digest(payload: object) -> str:
    if isinstance(payload, dict):
        manifest = payload.get("manifest")
        if isinstance(manifest, dict) and isinstance(manifest.get("digest"), str):
            return manifest["digest"]
        descriptor = payload.get("Descriptor")
        if isinstance(descriptor, dict) and isinstance(descriptor.get("digest"), str):
            return descriptor["digest"]
        if isinstance(payload.get("schemaVersion"), int):
            return ""
    if isinstance(payload, list) and len(payload) == 1:
        return descriptor_digest(payload[0])
    return ""


def manifest_platforms(payload: object) -> set[str]:
    if not isinstance(payload, dict):
        return set()
    manifest = payload.get("manifest")
    if not isinstance(manifest, dict):
        return set()
    descriptors = manifest.get("manifests")
    if not isinstance(descriptors, list):
        return set()
    platforms: set[str] = set()
    for descriptor in descriptors:
        if not isinstance(descriptor, dict):
            continue
        platform = descriptor.get("platform")
        if not isinstance(platform, dict):
            continue
        os_name = str(platform.get("os", ""))
        architecture = str(platform.get("architecture", ""))
        if os_name and architecture and architecture != "unknown":
            platforms.add(f"{os_name}/{architecture}")
    return platforms


def write_digests(manifest_path: Path, digests: dict[str, str]) -> None:
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    release = payload.setdefault("release", {})
    if not isinstance(release, dict):
        raise ValueError("manifest release must be an object")
    existing = release.setdefault("public_image_digests", {})
    if not isinstance(existing, dict):
        raise ValueError("manifest release.public_image_digests must be an object")
    existing.update(digests)
    manifest_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify Flyto2 Warroom CE Docker Hub image tags and digests")
    parser.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
    parser.add_argument("--pull", action="store_true", help="also docker pull every image")
    parser.add_argument("--dry-run", action="store_true", help="print images without contacting Docker Hub")
    parser.add_argument(
        "--write-digests",
        action="store_true",
        help="write inspected descriptor digests back to release.public_image_digests",
    )
    parser.add_argument("--timeout", type=int, default=120)
    args = parser.parse_args()

    if args.dry_run and args.write_digests:
        print("BLOCKED: --write-digests cannot be used with --dry-run", file=sys.stderr)
        return 2

    manifest = Path(args.manifest)
    blockers: list[str] = []
    actual_digests: dict[str, str] = {}
    for service, image, expected_digest in service_images(manifest):
        suffix = f" expected={expected_digest}" if expected_digest else ""
        print(f"{service} {image}{suffix}")
        if args.dry_run:
            continue
        inspected = run(
            ["docker", "buildx", "imagetools", "inspect", image, "--format", "{{json .}}"],
            timeout=args.timeout,
        )
        if inspected.returncode != 0:
            blockers.append(f"manifest inspect failed for {image}: {inspected.stderr.strip() or inspected.stdout.strip()}")
            continue
        try:
            parsed = json.loads(inspected.stdout)
        except json.JSONDecodeError:
            blockers.append(f"manifest inspect returned non-json output for {image}")
            continue
        actual_digest = descriptor_digest(parsed)
        platforms = manifest_platforms(parsed)
        missing_platforms = sorted({"linux/amd64", "linux/arm64"} - platforms)
        if missing_platforms:
            blockers.append(
                f"manifest platforms missing for {image}: {', '.join(missing_platforms)}"
            )
        if expected_digest and not args.write_digests:
            if actual_digest != expected_digest:
                blockers.append(
                    f"digest mismatch for {image}: expected {expected_digest}, got {actual_digest or 'missing'}"
                )
        elif not actual_digest:
            blockers.append(f"manifest descriptor digest missing for {image}")
        if actual_digest:
            actual_digests[service] = actual_digest
        if args.pull:
            pulled = run(["docker", "pull", image], timeout=args.timeout * 3)
            if pulled.returncode != 0:
                blockers.append(f"docker pull failed for {image}: {pulled.stderr.strip() or pulled.stdout.strip()}")
    if blockers:
        for blocker in blockers:
            print("BLOCKED: " + blocker, file=sys.stderr)
        return 2
    if args.write_digests:
        write_digests(manifest, actual_digests)
        print(f"wrote digests to {manifest}")
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
