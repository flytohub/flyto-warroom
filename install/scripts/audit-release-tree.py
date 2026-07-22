#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()

REQUIRED = [
    "OPEN_CORE_MANIFEST.json",
    ".flyto-rules.yaml",
    "Makefile",
    "packages/flyto-contracts/openapi/flyto-engine.openapi.yaml",
    "packages/flyto-contracts/capabilities/capabilities.yaml",
    "packages/flyto-contracts/schemas/evidence-event.schema.json",
    "services/flyto-engine-ce/README.md",
    "services/flyto-engine-ce/go.mod",
    "services/flyto-engine-ce/Dockerfile",
    "services/flyto-engine-ce/SOURCE_BOUNDARY.json",
    "services/flyto-engine-ce/ce/engine-ce/main.go",
    "services/flyto-engine-ce/ce/engine-ce/product_loop.go",
    "services/flyto-engine-ce/ce/engine-ce/server.go",
    "services/flyto-engine-ce/ce/engine-ce/server_test.go",
    "services/flyto-engine-ce/ce/worker-ce/main.go",
    "services/flyto-engine-ce/ce/worker-ce/server.go",
    "services/flyto-engine-ce/ce/worker-ce/server_test.go",
    "services/flyto-engine-ce/ce/worker-ce/README.md",
    "services/flyto-engine-ce/internal/canon/canon.go",
    "services/flyto-engine-ce/internal/ceproductloop/product_loop.go",
    "services/flyto-engine-ce/internal/ceproductloop/product_loop_test.go",
    "services/flyto-engine-ce/internal/permission/capabilities.go",
    "services/flyto-engine-ce/internal/safehttp/safehttp.go",
    "packages/flyto-code/package.json",
    "packages/flyto-code/src-next/lib/env.ts",
    "packages/flyto-code/src-next/lib/engine/platform/community.ts",
    "packages/flyto-code/src-next/app/(control-panel)/flyto/projects/components/ProjectsPage.tsx",
    "packages/flyto-code/src-next/app/(public)/(explore)/components/CommunityDemoView.tsx",
    "packages/flyto-code/src-next/app/(public)/(explore)/route.tsx",
    "packages/flyto-code/src-next/components/compounds/onboarding/CommunityProductLoopPanel.styles.ts",
    "packages/flyto-code/src-next/components/compounds/onboarding/CommunityProductLoopPanel.tsx",
    "packages/flyto-code/src-next/components/compounds/product-verification/AutomationTestPanel.tsx",
    "packages/flyto-code/src-next/components/compounds/product-verification/ProductVerificationEvidencePanel.tsx",
    "packages/flyto-code/src-next/components/compounds/product-verification/ProductVerificationOverview.tsx",
    "packages/flyto-code/src-next/components/compounds/product-verification/ProductVerificationView.tsx",
    "packages/flyto-code/src-next/components/compounds/product-verification/productVerificationModel.ts",
    "packages/flyto-code/src-next/components/compounds/product-verification/useProductVerificationController.ts",
    "packages/flyto-code/.env.example",
    "install/docker-compose.ce.yml",
    "install/docker-compose.source.yml",
    "install/edition-overlays.json",
    "install/docker-compose.ee-sim.yml",
    "install/.env.ce.example",
    "install/.env.ee-sim.example",
    "install/scripts/hash-local-password.py",
    "install/scripts/setup-ce.py",
    "install/scripts/preflight.py",
    "install/scripts/smoke-ce-stack.py",
    "install/scripts/smoke-source-stack.py",
    "install/scripts/verify-docker-images.py",
    "install/scripts/promote-release-images.py",
    "install/scripts/mint-ee-sim-jwt.py",
    "docs/local-install.md",
    "docs/source-build.md",
    "docs/enterprise-simulation.md",
    "docs/enterprise-cloud-bridge.md",
    "docs/code-protection.md",
    "docs/official-builds.md",
    "docs/github-hardening.md",
    "docs/account-security.md",
    "docs/docker-hub-overview.md",
    "docs/feature-matrix.md",
    "TRADEMARK.md",
    "SECURITY.md",
    "GOVERNANCE.md",
    "AGENTS.md",
    "CLAUDE.md",
    "PROJECT.md",
    "ARCHITECTURE.md",
    "STATE.md",
    "ROADMAP.md",
    "DECISIONS.md",
    "tasks.md",
    "CHANGELOG.md",
    "docs/README.md",
    "workflows/idea-capture.md",
    "workflows/planning.md",
    "workflows/implementation.md",
    "workflows/bugfix.md",
    "workflows/refactor.md",
    "workflows/investigation.md",
    "workflows/wrap-up.md",
    "handoffs/_registry.md",
    "handoffs/2026-07-16-ce-frontend-package-manifest-api.md",
    "handoffs/2026-07-17-generated-open-core-sync.md",
    "handoffs/2026-07-18-gitlab-style-open-core-contract.md",
    "handoffs/2026-07-19-ce-public-product-loop.md",
    "handoffs/2026-07-22-tag-driven-image-release.md",
    ".github/CODEOWNERS",
    ".github/pull_request_template.md",
    ".github/workflows/ci.yml",
    ".github/workflows/release-images.yml",
    ".github/workflows/cla.yml",
    "LICENSE",
    "CLA.md",
    "scripts/audit-github-protection.py",
    "scripts/audit-ce-boundary.py",
    "scripts/audit-provenance.py",
    "scripts/audit-open-core-overlay.py",
]

PRIVATE_GLOBS = [
    "packages/flyto-contracts/internal/**",
    "packages/flyto-contracts/cmd/**",
    "packages/flyto-contracts/api/handlers_*",
    "services/flyto-engine-ce/api/**",
    "services/flyto-engine-ce/cmd/**",
    "services/flyto-engine-ce/internal/ai/**",
    "services/flyto-engine-ce/internal/billing/**",
    "services/flyto-engine-ce/internal/cloudscan/**",
    "services/flyto-engine-ce/internal/containerlive/**",
    "services/flyto-engine-ce/internal/ghauth/**",
    "services/flyto-engine-ce/internal/githubapp/**",
    "services/flyto-engine-ce/internal/license/**",
    "services/flyto-engine-ce/internal/offlinelicense/**",
    "services/flyto-engine-ce/internal/saas/**",
    "services/flyto-engine-ce/internal/saml/**",
    "services/flyto-engine-ce/internal/stealerlogs/**",
    "services/flyto-engine-ce/internal/store/**",
    "services/flyto-engine-ce/internal/threatfeed/**",
    "services/flyto-engine-ce/internal/threatintel/**",
    "packages/flyto-code/.env",
    "packages/flyto-code/.env.local",
    "packages/flyto-code/.env.production",
    "packages/flyto-code/src-next/types/module-manifests/enterprise.ts",
    "packages/flyto-code/src-next/types/module-manifests/future.ts",
    "packages/flyto-code/src-next/app/(control-panel)/flyto/workspace/components/pages/EnterpriseControlPlanePage.tsx",
    "packages/flyto-code/src-next/components/compounds/system/EnterpriseControlPlaneView.tsx",
    "packages/flyto-code/src-next/components/compounds/system/__tests__/EnterpriseControlPlaneView.test.tsx",
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
    re.compile(r"firebase\.google\.com/go"),
    re.compile(r"github\.com/stripe/stripe-go"),
    re.compile(r"cloud\.google\.com/go"),
    re.compile(r"github\.com/aws/aws-sdk-go-v2"),
    re.compile(r"google\.golang\.org/api"),
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


def text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return ""


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def string_list(value) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if isinstance(item, str)]


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
    release_manifest = ROOT / "OPEN_CORE_MANIFEST.json"
    if release_manifest.exists():
        try:
            release_payload = load_json(release_manifest)
            release = release_payload.get("release", {})
            version = release.get("version") if isinstance(release, dict) else None
            github_tag = release.get("github_tag") if isinstance(release, dict) else None
            if not isinstance(version, str) or not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version):
                blockers.append("release version must use MAJOR.MINOR.PATCH")
            elif github_tag != f"v{version}":
                blockers.append("release github_tag must equal v plus the release version")
        except (OSError, json.JSONDecodeError) as exc:
            blockers.append(f"invalid JSON in OPEN_CORE_MANIFEST.json: {exc}")
    ce_compose = ROOT / "install/docker-compose.ce.yml"
    if ce_compose.exists():
        ce_text = text(ce_compose)
        frontend_port = '"127.0.0.1:${FLYTO_CODE_PORT:-8088}:8080"'
        if frontend_port not in ce_text:
            blockers.append(
                f"CE compose must target the unprivileged frontend image: {frontend_port}"
            )
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
    source_compose = ROOT / "install/docker-compose.source.yml"
    if source_compose.exists():
        source_text = text(source_compose)
        frontend_port = '"127.0.0.1:${FLYTO_SOURCE_CODE_PORT:-18088}:8080"'
        if frontend_port not in source_text:
            blockers.append(
                f"source compose must target the unprivileged frontend image: {frontend_port}"
            )
        for marker in [
            "../services/flyto-engine-ce",
            "../packages/flyto-code",
            "target: engine",
            "target: worker",
            "FLYTO_PUBLIC_MODE: community",
        ]:
            if marker not in source_text:
                blockers.append(f"source compose missing public build marker: {marker}")
        for denied in ("docker.io/chesterhsu", "ghcr.io", "enterprise_airgap", "../flyto-engine"):
            if denied in source_text:
                blockers.append(f"source compose contains private or published runtime marker: {denied}")
    ce_source_dockerfile = ROOT / "services/flyto-engine-ce/Dockerfile"
    if ce_source_dockerfile.exists():
        ce_image_text = text(ce_source_dockerfile)
        from_lines = re.findall(r"(?m)^FROM\s+.+$", ce_image_text)
        external_from_lines = [line for line in from_lines if "FROM runtime-base AS " not in line]
        if len(external_from_lines) != 2 or any(
            not re.search(r"@sha256:[0-9a-f]{64}(?:\s+AS\s+[\w-]+)?$", line, re.IGNORECASE)
            for line in external_from_lines
        ):
            blockers.append("every CE source image stage must use a sha256-pinned base image")
        for marker in (
            "FROM --platform=$BUILDPLATFORM",
            "ARG TARGETOS=linux",
            "ARG TARGETARCH",
            "USER 10001:10001",
        ):
            if marker not in ce_image_text:
                blockers.append(f"CE source image missing multi-architecture runtime marker: {marker}")
        if not re.search(r"adduser[^\n]*-u\s+10001\b", ce_image_text):
            blockers.append("CE source runtime must create fixed uid 10001")
        if ce_image_text.count("HEALTHCHECK") != 2:
            blockers.append("CE source engine and worker must each define a healthcheck")
    enterprise_compose = ROOT / "install/docker-compose.ee-sim.yml"
    enterprise_text = text(enterprise_compose) if enterprise_compose.exists() else ""
    for marker in (
        "FLYTO_DEPLOYMENT_ID",
        "FLYTO_ENTERPRISE_JWT_SECRET_KEY",
        "FLYTO_ENTERPRISE_JWT_PREVIOUS_SECRET_KEYS",
    ):
        if marker not in enterprise_text:
            blockers.append(f"enterprise sim compose missing deployment-bound JWT marker: {marker}")
    mint_script = ROOT / "install/scripts/mint-ee-sim-jwt.py"
    mint_text = text(mint_script) if mint_script.exists() else ""
    for marker in (
        '"iss": "urn:flyto:enterprise:" + deployment_id',
        '"aud": ["flyto-enterprise-backend", "flyto-engine"]',
        '"deployment_id": deployment_id',
        '"jti": str(uuid.uuid4())',
    ):
        if marker not in mint_text:
            blockers.append(f"enterprise sim JWT mint contract missing marker: {marker}")
    frontend_env = ROOT / "packages/flyto-code/.env.example"
    if frontend_env.exists():
        frontend_text = text(frontend_env)
        if "VITE_AUTH_MODE=local_jwt" not in frontend_text:
            blockers.append("frontend CE env must default VITE_AUTH_MODE=local_jwt")
        for denied in ("VITE_AUTH_MODE=enterprise", "VITE_AUTH_MODE=firebase"):
            if denied in frontend_text:
                blockers.append(f"frontend CE env contains denied auth mode: {denied}")
    frontend_dockerfile = ROOT / "packages/flyto-code/Dockerfile"
    frontend_docker_text = text(frontend_dockerfile) if frontend_dockerfile.exists() else ""
    for marker in (
        "FROM --platform=$BUILDPLATFORM node:22-alpine@sha256:",
        "FROM nginxinc/nginx-unprivileged:alpine@sha256:",
        'org.opencontainers.image.licenses="Apache-2.0"',
        "NGINX_ENVSUBST_FILTER=^FLYTO_",
        "FLYTO_NGINX_RESOLVER=127.0.0.11",
        "COPY --chown=101:0 ${NGINX_CONF} /etc/nginx/templates/default.conf.template",
        "USER 101:101",
        "EXPOSE 8080",
        "http://127.0.0.1:8080/healthz",
    ):
        if marker not in frontend_docker_text:
            blockers.append(f"CE frontend image contract missing marker: {marker}")
    overlay_path = ROOT / "install/edition-overlays.json"
    if overlay_path.exists():
        try:
            overlay = load_json(overlay_path)
        except (OSError, json.JSONDecodeError) as exc:
            blockers.append(f"invalid JSON in {overlay_path.relative_to(ROOT)}: {exc}")
            overlay = None
        if isinstance(overlay, dict):
            if overlay.get("schema") != "flyto.open-core-edition-overlays.v1":
                blockers.append("edition overlay manifest schema is invalid")
            if overlay.get("runtime_source_pull_allowed") is not False:
                blockers.append("edition overlay manifest allows runtime source pull")
            base = overlay.get("base")
            if not isinstance(base, dict):
                blockers.append("edition overlay manifest base must be an object")
            else:
                if base.get("pin_required") is not True:
                    blockers.append("edition overlay manifest base must require pinning")
                if "commit_sha" not in string_list(base.get("accepted_ref_kinds")):
                    blockers.append("edition overlay manifest base must include commit SHA pinning")
                if base.get("resolved_at_build_time_only") is not True:
                    blockers.append("edition overlay manifest base must resolve at build time only")
            profiles = overlay.get("profiles")
            if not isinstance(profiles, list) or not profiles:
                blockers.append("edition overlay manifest profiles must be a non-empty list")
                profiles = []
            profile_ids = set()
            for profile in profiles:
                if not isinstance(profile, dict):
                    blockers.append("edition overlay profile must be an object")
                    continue
                profile_id = str(profile.get("id", ""))
                profile_ids.add(profile_id)
                if profile.get("runtime_source_pull_allowed") is not False:
                    blockers.append(f"edition overlay profile {profile_id} allows runtime source pull")
                if profile.get("public_tree_contains_private_overlay") is not False:
                    blockers.append(f"edition overlay profile {profile_id} allows private overlay in public tree")
                private_overlays = string_list(profile.get("private_overlay_kinds"))
                if profile_id == "community" and private_overlays:
                    blockers.append("community edition overlay profile contains private overlays")
                if profile_id != "community" and not private_overlays:
                    blockers.append(f"paid edition overlay profile {profile_id} lacks private overlays")
            missing_profiles = {"community", "enterprise-onprem", "enterprise-airgap", "saas"} - profile_ids
            if missing_profiles:
                blockers.append("edition overlay manifest missing profiles: " + ", ".join(sorted(missing_profiles)))
            if not string_list(overlay.get("protected_overlay_kinds")):
                blockers.append("edition overlay manifest must list protected overlay kinds")
        elif overlay is not None:
            blockers.append("edition overlay manifest root must be an object")
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
