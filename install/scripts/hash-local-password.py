#!/usr/bin/env python3
import getpass
import hashlib
import sys


def main() -> int:
    password = getpass.getpass("Local admin password: ")
    confirm = getpass.getpass("Confirm password: ")
    if password != confirm:
        print("passwords do not match", file=sys.stderr)
        return 2
    if len(password) < 12:
        print("password must be at least 12 characters", file=sys.stderr)
        return 2
    print(hashlib.sha256(password.encode("utf-8")).hexdigest())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
