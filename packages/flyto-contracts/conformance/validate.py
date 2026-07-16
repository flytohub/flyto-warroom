#!/usr/bin/env python3
import json
import sys
from pathlib import Path

REQUIRED = {
    "runner-callback": ["run_id", "scanner_id", "status", "artifacts"],
    "evidence-event": ["event_id", "org_id", "surface", "source", "artifacts"],
    "audit-event": ["event_id", "actor", "action", "resource", "occurred_at"],
    "run-ledger-event": ["run_id", "org_id", "surface", "scanner_id", "status", "occurred_at"],
    "artifact-signature": ["artifact_id", "digest", "algorithm", "signed_at"],
    "livefix-plan": ["surface", "mode", "status", "provider_execution", "evidence_requirements"],
}


def main() -> int:
    if len(sys.argv) != 3 or sys.argv[1] not in REQUIRED:
        print("usage: validate.py <runner-callback|evidence-event|audit-event|run-ledger-event|artifact-signature|livefix-plan> <file.json>", file=sys.stderr)
        return 2
    payload = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
    missing = [field for field in REQUIRED[sys.argv[1]] if field not in payload]
    if missing:
        print("missing required fields: " + ", ".join(missing), file=sys.stderr)
        return 1
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
