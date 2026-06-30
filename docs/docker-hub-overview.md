# Docker Hub Repository Overview

```markdown
# Flyto2 Warroom CE

Flyto2 Warroom CE is the self-hosted community edition of Flyto2 Warroom, an
open-core security operations platform for code, cloud, container, runtime,
external attack surface, evidence, and compliance workflows.

## Links

- Website: https://flyto2.com
- GitHub: https://github.com/flytohub/flyto-warroom

## Images

This repository publishes Flyto2 Warroom CE services as separate tags:

- `engine-ce`
- `worker-ce`
- `code-ce`
- `runner-ce`
- `verification-ce`
- `brand-vision-ce`
- `pdf-ce`

## Verify

```sh
git clone https://github.com/flytohub/flyto-warroom.git
python flyto-warroom/install/scripts/verify-docker-images.py --manifest flyto-warroom/OPEN_CORE_MANIFEST.json
```

## Install

Use the Docker Compose files and setup helper in the GitHub repository:

```sh
python3 install/scripts/setup-ce.py
make verify-images
make preflight
make ce-up
```

## Security

CE local auth is password-based. Official publisher accounts use 2FA and access
tokens. Forks and modified builds must not imply official Flyto2 endorsement.
```
