#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()

REQUIRED = [
    "OPEN_CORE_MANIFEST.json",
    "Makefile",
    ".env.example",
    "CHANGELOG.md",
    "packages/flyto-contracts/openapi/flyto-engine.openapi.yaml",
    "packages/flyto-contracts/capabilities/capabilities.yaml",
    "packages/flyto-contracts/schemas/evidence-event.schema.json",
    "packages/flyto-code/package.json",
    "packages/flyto-code/src-next/lib/env.ts",
    "packages/flyto-code/.env.example",
    "install/docker-compose.ce.yml",
    "install/docker-compose.ee-sim.yml",
    "install/.env.ce.example",
    "install/.env.ee-sim.example",
    "install/scripts/hash-local-password.py",
    "install/scripts/setup-ce.py",
    "install/scripts/preflight.py",
    "install/scripts/verify-docker-images.py",
    "install/scripts/mint-ee-sim-jwt.py",
    "install/scripts/seed-demo-workspace.py",
    "install/demo-workspace.json",
    "docs/local-install.md",
    "docs/README.md",
    "docs/enterprise-simulation.md",
    "docs/enterprise-cloud-bridge.md",
    "docs/feature-matrix.md",
    "docs/public-roadmap.md",
    "docs/autofix-whitepaper.md",
    "docs/benchmark-evidence.md",
    "docs/demo-seed-workspace.md",
    "docs/code-protection.md",
    "docs/official-builds.md",
    "docs/github-hardening.md",
    "docs/account-security.md",
    "docs/docker-hub-overview.md",
    "TRADEMARK.md",
    "SECURITY.md",
    "GOVERNANCE.md",
    "AGENTS.md",
    ".github/CODEOWNERS",
    ".github/pull_request_template.md",
    ".github/workflows/ci.yml",
    "scripts/audit-github-protection.py",
    "scripts/audit-ce-boundary.py",
    "install/README.md",
    "scripts/README.md",
    "packages/README.md",
]

PRIVATE_GLOBS = [
    "packages/flyto-contracts/internal/**",
    "packages/flyto-contracts/cmd/**",
    "packages/flyto-contracts/api/handlers_*",
    "packages/flyto-code/.env",
    "packages/flyto-code/.env.local",
    "packages/flyto-code/.env.production",
]

LOCAL_ARTIFACT_PARTS = {
    "node_modules",
    "dist",
    "dist-next",
    "reports",
    "test-results",
}

DENIED_ANYWHERE = [
    re.compile(r"FLYTO_RUNNER_SECRET[ \t]*=[ \t]*[^\s$<]+"),
    re.compile(r"FLYTO_VERIFICATION_SECRET[ \t]*=[ \t]*[^\s$<]+"),
    re.compile(r"FLYTO_ENTERPRISE_JWT_SECRET_KEY[ \t]*=[ \t]*[^\s$<]+"),
    re.compile(r"BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY"),
    re.compile(r"ghcr\.io/.+-ee"),
    re.compile(r"flyto2-warroom-[a-z-]+-ee"),
    re.compile("aa0909286667" + r"@gmail\.com"),
    re.compile("g3KyCLkH7" + "IZwXILPXHS3fbo4VnB2"),
]

DENIED_CE_COMPOSE = [
    re.compile(r"ghcr\.io/.+-ee"),
    re.compile(r"enterprise_airgap"),
    re.compile("FLYTO_AUTH_MODE:\\s*[\"']?(enterprise|enterprise_airgap|firebase)"),
    re.compile("FLYTO_DEV_AUTH:\\s*[\"']?1"),
    re.compile("FLYTO_RUNNER_DEV_OPEN:\\s*[\"']?1"),
    re.compile(r"FLYTO_ENTERPRISE_JWT_SECRET_KEY"),
]

REQUIRED_MARKERS = {
    "README.md": [
        "Self-hosted open-core security war room",
        "10-Minute Local Loop",
        "## Usage",
        "Aikido alternative",
        "Product Closure Docs",
    ],
    "docs/feature-matrix.md": [
        "Flyto2 Warroom CE / Enterprise Feature Matrix",
        "Premium actions must fail closed",
        "Contribution Boundary",
    ],
    "docs/public-roadmap.md": [
        "Shipped In CE",
        "Enterprise Cloud Bridge",
        "Non-Claims",
    ],
    "docs/autofix-whitepaper.md": [
        "evidence-backed remediation",
        "AI may propose",
        "False positives are not noise to hide",
    ],
    "docs/benchmark-evidence.md": [
        "false-positive handling policy",
        "Verification Loop",
        "fabricated percentage",
    ],
    "docs/demo-seed-workspace.md": [
        "code",
        "container",
        "cloud",
        "external",
        "autofix",
    ],
}

REQUIRED_DEMO_SURFACES = {"code", "container", "cloud", "external", "evidence", "autofix"}


def text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return ""


def is_local_artifact(path: Path) -> bool:
    try:
        rel = path.relative_to(ROOT)
    except ValueError:
        return False
    return any(part in LOCAL_ARTIFACT_PARTS for part in rel.parts)


def main() -> int:
    blockers: list[str] = []
    for rel in REQUIRED:
        if not (ROOT / rel).exists():
            blockers.append(f"missing required release file: {rel}")
    for pattern in PRIVATE_GLOBS:
        for match in ROOT.glob(pattern):
            if match.is_file() and not is_local_artifact(match):
                blockers.append(f"private path escaped release tree: {match.relative_to(ROOT)}")
    ce_compose = ROOT / "install/docker-compose.ce.yml"
    if ce_compose.exists():
        ce_text = text(ce_compose)
        for regex in DENIED_CE_COMPOSE:
            if regex.search(ce_text):
                blockers.append(f"CE compose contains denied marker: {regex.pattern}")
        for marker in [
            'FLYTO_EDITION: "community"',
            'FLYTO_AUTH_MODE: "local_jwt"',
            "FLYTO_LOCAL_AUTH_JWT_SECRET",
            "FLYTO_LOCAL_AUTH_PASSWORD_SHA256",
        ]:
            if marker not in ce_text:
                blockers.append(f"CE compose missing required marker: {marker}")
    frontend_env = ROOT / "packages/flyto-code/.env.example"
    if frontend_env.exists():
        frontend_text = text(frontend_env)
        if "VITE_AUTH_MODE=local_jwt" not in frontend_text:
            blockers.append("frontend CE env must default VITE_AUTH_MODE=local_jwt")
        for denied in ("VITE_AUTH_MODE=enterprise", "VITE_AUTH_MODE=firebase"):
            if denied in frontend_text:
                blockers.append(f"frontend CE env contains denied auth mode: {denied}")
    for rel, markers in REQUIRED_MARKERS.items():
        path = ROOT / rel
        if not path.exists():
            continue
        body = text(path)
        for marker in markers:
            if marker not in body:
                blockers.append(f"{rel} missing release marker: {marker}")
    demo_path = ROOT / "install/demo-workspace.json"
    if demo_path.exists():
        try:
            demo = json.loads(text(demo_path))
        except json.JSONDecodeError as exc:
            blockers.append(f"install/demo-workspace.json invalid JSON: {exc}")
        else:
            surfaces = {item.get("id") for item in demo.get("surfaces", [])}
            missing = sorted(REQUIRED_DEMO_SURFACES - surfaces)
            if missing:
                blockers.append("demo workspace missing surfaces: " + ", ".join(missing))
            if len(demo.get("evidence_pack", [])) < 5:
                blockers.append("demo workspace evidence_pack must include at least 5 entries")
    for path in ROOT.rglob("*"):
        if not path.is_file() or path.stat().st_size > 2_000_000:
            continue
        if is_local_artifact(path):
            continue
        body = text(path)
        for regex in DENIED_ANYWHERE:
            if regex.search(body):
                blockers.append(f"secret-like value in {path.relative_to(ROOT)}: {regex.pattern}")
    if blockers:
        for item in blockers:
            print("BLOCKED: " + item, file=sys.stderr)
        return 2
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
