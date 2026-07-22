# One-Time CE Administrator Setup

Date: 2026-07-22

## Outcome

Warroom CE now starts like a self-hosted developer platform: run
`python3 install/scripts/setup-ce.py`, start Docker Compose, and open
`http://localhost:8088`. A fresh database redirects to a browser form that
creates the first administrator and signs that user in.

The installer generates Postgres, JWT, runner, verification, and encryption
secrets only. It does not request, print, or write account credentials.

## Security Boundary

- `FLYTO_LOCAL_AUTH_ALLOW_BOOTSTRAP=1` is required explicitly.
- Passwords must meet the local policy and are stored as bcrypt hashes.
- The first user, owner organization, workspace, default schedules, and setup
  completion marker commit in one transaction.
- A singleton row lock guarantees concurrent requests cannot create two first
  owners.
- Existing databases with any user are marked complete and fail closed.
- Legacy environment-preseed login remains compatible for older deployments.

## Verification

```text
python3 install/scripts/setup-ce.py
make preflight
make ce-up
make ce-smoke
```

Then verify in the browser: first-run form, account creation, authenticated
projects page, sign-out/sign-in, and a closed setup route.
