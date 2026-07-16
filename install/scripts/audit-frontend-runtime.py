#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]
EXPECTED = "FLYTO_CODE_ENGINE_URL:-__same_origin__"
EXPECTED_AUTOMATION = "FLYTO_AUTOMATION_URL:-https://cloud.flyto2.com"
EXPECTED_CORTEX = "FLYTO_CORTEX_URL:-https://cortex.flyto2.com"


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
        if "FLYTO_CODE_ENGINE_URL:-http://localhost:8080" in text:
            failures.append(f"{rel}: localhost engine default would bypass the self-hosted /api proxy")
        if "FLYTO_AUTOMATION_URL:-http://localhost:8080" in text:
            failures.append(f"{rel}: localhost automation default would hide the CE/cloud boundary")
        if "FLYTO_CORTEX_URL:-http://localhost:8080" in text:
            failures.append(f"{rel}: localhost cortex default would hide the CE/cloud boundary")
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
