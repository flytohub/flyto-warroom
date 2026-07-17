#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]
EXPECTED = "FLYTO_CODE_ENGINE_URL:-__same_origin__"
EXPECTED_AUTOMATION = "FLYTO_AUTOMATION_URL:-https://cloud.flyto2.com"
EXPECTED_CORTEX = "FLYTO_CORTEX_URL:-https://cortex.flyto2.com"
EXPECTED_MODE = "FLYTO_CODE_AUTH_MODE:-local_jwt"
NEUTRAL_ARGS = (
    "FLYTO_PUBLIC_ENGINE_ORIGIN",
    "FLYTO_PUBLIC_MODE",
    "FLYTO_PUBLIC_AUTOMATION_ORIGIN",
    "FLYTO_PUBLIC_CORTEX_ORIGIN",
)


def main() -> int:
    checks = {
        "install/scripts/build-local-images.sh": 1,
        "install/scripts/publish-multiarch-images.sh": 2,
    }
    failures: list[str] = []
    for rel, expected_count in checks.items():
        text = (ROOT / rel).read_text(encoding="utf-8")
        count = text.count(EXPECTED)
        if count != expected_count:
            failures.append(f"{rel}: expected {expected_count} same-origin engine default(s), found {count}")
        for arg_name in NEUTRAL_ARGS:
            arg_count = text.count(arg_name)
            if arg_count != expected_count:
                failures.append(f"{rel}: expected {expected_count} {arg_name} build arg(s), found {arg_count}")
        if "FLYTO_CODE_ENGINE_URL:-http://localhost:8080" in text:
            failures.append(f"{rel}: localhost engine default would bypass the self-hosted /api proxy")
        if "--build-arg VITE_" in text or '--build-arg "VITE_' in text:
            failures.append(f"{rel}: VITE_* build args trigger Docker sensitive-name warnings; use FLYTO_PUBLIC_* args")
        if "FLYTO_AUTOMATION_URL:-http://localhost:8080" in text:
            failures.append(f"{rel}: localhost automation default would hide the CE/cloud boundary")
        if "FLYTO_CORTEX_URL:-http://localhost:8080" in text:
            failures.append(f"{rel}: localhost cortex default would hide the CE/cloud boundary")
        mode_count = text.count(EXPECTED_MODE)
        if mode_count != expected_count:
            failures.append(f"{rel}: expected {expected_count} local JWT mode default(s), found {mode_count}")
        automation_count = text.count(EXPECTED_AUTOMATION)
        if automation_count != expected_count:
            failures.append(
                f"{rel}: expected {expected_count} cloud automation default(s), found {automation_count}"
            )
        cortex_count = text.count(EXPECTED_CORTEX)
        if cortex_count != expected_count:
            failures.append(f"{rel}: expected {expected_count} cloud cortex default(s), found {cortex_count}")
    if failures:
        for failure in failures:
            print(f"FAIL {failure}", file=sys.stderr)
        return 1
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
