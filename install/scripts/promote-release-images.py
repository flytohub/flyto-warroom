#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MANIFEST = ROOT / "OPEN_CORE_MANIFEST.json"
SEMVER_TAG_RE = re.compile(r"^v([0-9]+\.[0-9]+\.[0-9]+)$")
EXPECTED_PLATFORMS = {"linux/amd64", "linux/arm64"}
DEFAULT_TAGS = {
    "engine": "engine-ce",
    "worker": "worker-ce",
    "frontend": "code-ce",
}


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
    result: set[str] = set()
    for descriptor in descriptors:
        if not isinstance(descriptor, dict):
            continue
        platform = descriptor.get("platform")
        if not isinstance(platform, dict):
            continue
        os_name = str(platform.get("os", ""))
        architecture = str(platform.get("architecture", ""))
        if os_name and architecture and architecture != "unknown":
            result.add(f"{os_name}/{architecture}")
    return result


def inspect_image(image: str, *, timeout: int) -> tuple[str, set[str]]:
    inspected = run(
        ["docker", "buildx", "imagetools", "inspect", image, "--format", "{{json .}}"],
        timeout=timeout,
    )
    if inspected.returncode != 0:
        raise RuntimeError(
            f"manifest inspect failed for {image}: "
            f"{inspected.stderr.strip() or inspected.stdout.strip()}"
        )
    try:
        payload = json.loads(inspected.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"manifest inspect returned non-json output for {image}") from exc
    return descriptor_digest(payload), manifest_platforms(payload)


def release_targets(manifest_path: Path, github_tag: str) -> tuple[str, list[dict[str, str]]]:
    match = SEMVER_TAG_RE.fullmatch(github_tag)
    if match is None:
        raise ValueError("release tag must use stable semantic version form vMAJOR.MINOR.PATCH")
    version = match.group(1)
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    release = payload.get("release", {})
    if not isinstance(release, dict):
        raise ValueError("manifest release must be an object")
    if release.get("version") != version:
        raise ValueError(
            f"release tag {github_tag} does not match manifest version {release.get('version')!r}"
        )
    if release.get("github_tag") != github_tag:
        raise ValueError(
            f"release tag {github_tag} does not match manifest github_tag {release.get('github_tag')!r}"
        )
    images = release.get("public_images", {})
    tags = release.get("public_image_tags", {})
    digests = release.get("public_image_digests", {})
    if not isinstance(images, dict) or not isinstance(tags, dict) or not isinstance(digests, dict):
        raise ValueError("manifest image, tag, and digest maps must be objects")
    default_repo = str(release.get("public_image_repository", "docker.io/flyto2/warroom"))
    targets: list[dict[str, str]] = []
    for service, default_tag in DEFAULT_TAGS.items():
        repository = str(images.get(service, default_repo))
        base_tag = str(tags.get(service, default_tag))
        digest = str(digests.get(service, ""))
        if not re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
            raise ValueError(f"missing or invalid immutable digest for {service}")
        targets.append({
            "service": service,
            "source": f"{repository}@{digest}",
            "target": f"{repository}:{base_tag}-{version}",
            "digest": digest,
        })
    return version, targets


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Promote verified Flyto2 Warroom CE image digests to semantic-version tags"
    )
    parser.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
    parser.add_argument("--tag", default=os.environ.get("GITHUB_REF_NAME", ""))
    parser.add_argument("--push", action="store_true")
    parser.add_argument("--evidence", default="")
    parser.add_argument("--timeout", type=int, default=180)
    args = parser.parse_args()

    if not args.tag:
        print("BLOCKED: --tag or GITHUB_REF_NAME is required", file=sys.stderr)
        return 2
    try:
        version, targets = release_targets(Path(args.manifest), args.tag)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print("BLOCKED: " + str(exc), file=sys.stderr)
        return 2

    blockers: list[str] = []
    published: list[dict[str, object]] = []
    for target in targets:
        print(f"{target['service']} {target['source']} -> {target['target']}")
        if not args.push:
            published.append({**target, "verified_platforms": sorted(EXPECTED_PLATFORMS)})
            continue
        try:
            source_digest, source_platforms = inspect_image(target["source"], timeout=args.timeout)
        except RuntimeError as exc:
            blockers.append(str(exc))
            continue
        missing_source = sorted(EXPECTED_PLATFORMS - source_platforms)
        if source_digest != target["digest"]:
            blockers.append(
                f"source digest mismatch for {target['service']}: "
                f"expected {target['digest']}, got {source_digest or 'missing'}"
            )
            continue
        if missing_source:
            blockers.append(
                f"source platforms missing for {target['service']}: {', '.join(missing_source)}"
            )
            continue
        promoted = run(
            ["docker", "buildx", "imagetools", "create", "--tag", target["target"], target["source"]],
            timeout=args.timeout,
        )
        if promoted.returncode != 0:
            blockers.append(
                f"promotion failed for {target['target']}: "
                f"{promoted.stderr.strip() or promoted.stdout.strip()}"
            )
            continue
        try:
            target_digest, target_platforms = inspect_image(target["target"], timeout=args.timeout)
        except RuntimeError as exc:
            blockers.append(str(exc))
            continue
        missing_target = sorted(EXPECTED_PLATFORMS - target_platforms)
        if target_digest != target["digest"]:
            blockers.append(
                f"promoted digest mismatch for {target['target']}: "
                f"expected {target['digest']}, got {target_digest or 'missing'}"
            )
            continue
        if missing_target:
            blockers.append(
                f"promoted platforms missing for {target['target']}: {', '.join(missing_target)}"
            )
            continue
        published.append({**target, "verified_platforms": sorted(target_platforms)})

    evidence = {
        "schema": "flyto.warroom-ce-image-release.v1",
        "version": version,
        "github_tag": args.tag,
        "source_commit": os.environ.get("GITHUB_SHA", ""),
        "published": args.push and not blockers,
        "images": published,
    }
    if args.evidence:
        Path(args.evidence).write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if blockers:
        for blocker in blockers:
            print("BLOCKED: " + blocker, file=sys.stderr)
        return 2
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
