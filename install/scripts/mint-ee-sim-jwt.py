#!/usr/bin/env python3
import argparse
import base64
import hashlib
import hmac
import json
import os
import time
import uuid


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def main() -> int:
    parser = argparse.ArgumentParser(description="Mint a local Flyto2 Warroom enterprise-sim JWT.")
    parser.add_argument("--secret", default=os.environ.get("FLYTO_ENTERPRISE_JWT_SECRET_KEY", ""))
    parser.add_argument("--deployment-id", default=os.environ.get("FLYTO_DEPLOYMENT_ID", "local-ee-sim"))
    parser.add_argument("--sub", default="local-admin")
    parser.add_argument("--email", default="admin@flyto2.com")
    parser.add_argument("--name", default="Local Admin")
    parser.add_argument("--ttl-seconds", type=int, default=8 * 60 * 60)
    args = parser.parse_args()
    if len(args.secret) < 32:
        raise SystemExit("secret must be at least 32 characters")
    deployment_id = args.deployment_id.strip()
    if not deployment_id:
        raise SystemExit("deployment id must not be empty")
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "type": "access",
        "sub": args.sub,
        "email": args.email,
        "name": args.name,
        "iat": now,
        "exp": now + args.ttl_seconds,
        "iss": "urn:flyto:enterprise:" + deployment_id,
        "aud": ["flyto-enterprise-backend", "flyto-engine"],
        "deployment_id": deployment_id,
        "jti": str(uuid.uuid4()),
    }
    signing_input = ".".join([
        b64url(json.dumps(header, separators=(",", ":")).encode("utf-8")),
        b64url(json.dumps(payload, separators=(",", ":")).encode("utf-8")),
    ])
    sig = hmac.new(args.secret.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256)
    print(signing_input + "." + b64url(sig.digest()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
