from __future__ import annotations

import json
from pathlib import Path
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/audit-open-core-overlay.py"

MINIMAL_FILES = [
    "OPEN_CORE_MANIFEST.json",
    "install/edition-overlays.json",
    "services/flyto-engine-ce/SOURCE_BOUNDARY.json",
    "packages/flyto-code/OPEN_CORE.md",
    "packages/flyto-code/CE_SOURCE_BOUNDARY.md",
    "packages/flyto-code/src-next/types/module-manifests/packageManifest.ts",
    "install/docker-compose.ce.yml",
    "install/docker-compose.ee-sim.yml",
    "Makefile",
    "README.md",
    "docs/edition-profiles.md",
    "docs/upstream-feedback-loop.md",
    "scripts/audit-ce-boundary.py",
    "scripts/audit-open-core-overlay.py",
]


def run_audit(root: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), str(root)],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


def copy_minimal_tree(tmp_path: Path) -> Path:
    target = tmp_path / "repo"
    for rel in MINIMAL_FILES:
        source = ROOT / rel
        destination = target / rel
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
    return target


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def test_current_open_core_overlay_contract_passes() -> None:
    result = run_audit(ROOT)

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "ok"


def test_runtime_source_pull_is_blocked(tmp_path: Path) -> None:
    repo = copy_minimal_tree(tmp_path)
    overlay_path = repo / "install/edition-overlays.json"
    overlay = json.loads(overlay_path.read_text(encoding="utf-8"))
    overlay["runtime_source_pull_allowed"] = True
    write_json(overlay_path, overlay)

    result = run_audit(repo)

    assert result.returncode == 2
    assert "install/edition-overlays.json allows runtime source pull" in result.stderr


def test_private_engine_path_is_blocked(tmp_path: Path) -> None:
    repo = copy_minimal_tree(tmp_path)
    private_file = repo / "services/flyto-engine-ce/internal/billing/leak.go"
    private_file.parent.mkdir(parents=True)
    private_file.write_text("package billing\n", encoding="utf-8")

    result = run_audit(repo)

    assert result.returncode == 2
    assert "private engine path escaped into CE tree" in result.stderr


def test_ce_public_rating_authority_claim_is_blocked(tmp_path: Path) -> None:
    repo = copy_minimal_tree(tmp_path)
    manifest_path = repo / "OPEN_CORE_MANIFEST.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["upstream_contract"]["score_authority"]["ce_public_comparability"] = True
    write_json(manifest_path, manifest)

    result = run_audit(repo)

    assert result.returncode == 2
    assert "CE scores must not claim public comparability" in result.stderr
