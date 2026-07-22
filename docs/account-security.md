# Account Security And 2FA

Flyto2 Warroom CE separates three different account/security concerns.

## Maintainer Accounts

Official publisher accounts must use 2FA:

- GitHub maintainers must enable 2FA and use protected branches.
- Docker Hub publishers must enable 2FA.
- Docker Hub pushes should use access tokens, not an account password.
- Tokens should be scoped to publishing and rotated after maintainer changes.

Do not store Docker Hub, GitHub, cloud, or customer credentials in this repo,
compose files, issue comments, screenshots, or release notes.

## Self-Hosted CE Initial Admin

CE local auth uses a one-time browser setup, similar to other self-hosted
developer platforms. First generate infrastructure secrets and start CE:

```sh
python3 install/scripts/setup-ce.py
```

The script generates local-only infrastructure secrets and does not ask for or
store account credentials. Open `http://localhost:8088` after startup and create
the first administrator. The Engine stores a bcrypt hash in Postgres and closes
the registration route atomically after that first account is created.

## 2FA Boundary

CE local JWT auth is password-based. It does not pretend to enforce TOTP/2FA.
For deployments that require 2FA, put Flyto2 behind an identity provider or use
an edition with enterprise SSO/MFA enforcement. This is intentional: a security
product should not advertise a second factor unless the backend gate actually
enforces it.
