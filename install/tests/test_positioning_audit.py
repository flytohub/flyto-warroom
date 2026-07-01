from __future__ import annotations

from pathlib import Path
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/audit-positioning.py"
REQUIRED_DOCS = [
    "README.md",
    "docs/docker-hub-overview.md",
    "docs/feature-matrix.md",
    "docs/public-roadmap.md",
    "docs/autofix-whitepaper.md",
    "docs/benchmark-evidence.md",
    "docs/README.md",
]


def run_audit(root: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), str(root)],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


def copy_required_docs(tmp_path: Path) -> Path:
    target = tmp_path / "repo"
    for rel in REQUIRED_DOCS:
        source = ROOT / rel
        destination = target / rel
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
    return target


def test_current_public_positioning_passes() -> None:
    result = run_audit(ROOT)

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "ok"


def test_missing_positioning_marker_blocks_release(tmp_path: Path) -> None:
    repo = copy_required_docs(tmp_path)
    readme = repo / "README.md"
    readme.write_text(
        readme.read_text(encoding="utf-8").replace(
            "Bring your own tools",
            "Generic scanner dashboard",
        ),
        encoding="utf-8",
    )

    result = run_audit(repo)

    assert result.returncode == 2
    assert "missing positioning marker: Bring your own tools" in result.stderr


def test_unsafe_competitor_claim_blocks_release(tmp_path: Path) -> None:
    repo = copy_required_docs(tmp_path)
    readme = repo / "README.md"
    readme.write_text(
        readme.read_text(encoding="utf-8") + "\nFlyto2 fully replaces Aikido.\n",
        encoding="utf-8",
    )

    result = run_audit(repo)

    assert result.returncode == 2
    assert "Do not claim full replacement of Aikido" in result.stderr


def test_replacing_customer_stack_claim_blocks_release(tmp_path: Path) -> None:
    repo = copy_required_docs(tmp_path)
    readme = repo / "README.md"
    readme.write_text(
        readme.read_text(encoding="utf-8") + "\nFlyto2 replaces your existing security tools.\n",
        encoding="utf-8",
    )

    result = run_audit(repo)

    assert result.returncode == 2
    assert "Do not claim replacement of the customer's existing stack" in result.stderr
