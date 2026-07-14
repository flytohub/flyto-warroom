# Flyto2 Warroom Enterprise Simulation

Enterprise simulation runs the same local stack with fail-closed enterprise
gates enabled: `enterprise_airgap` edition, enterprise JWT auth, internal runner
secrets, and sealed master-key requirements.

## Configure Local-Only Secrets

```sh
cp /tmp/flyto2-warroom-ce/install/.env.ee-sim.example /tmp/flyto2-warroom-ce/install/.env.ee-sim
```

Fill the blank values in `install/.env.ee-sim`. Use local-only values and do not
commit that file.

Required values:

- `FLYTO_ENTERPRISE_JWT_SECRET_KEY` must be at least 32 characters.
- `FLYTO_RUNNER_SECRET` enables signed engine-to-runner calls.
- `FLYTO_VERIFICATION_SECRET` enables signed verification callbacks.
- `FLYTO_MASTER_KEY` enables sealed runtime credentials.

## Start EE Simulation

```sh
make -C /tmp/flyto2-warroom-ce ee-sim-up
```

## Mint A Browser Token

```sh
export FLYTO_ENTERPRISE_JWT_SECRET_KEY=<same-local-secret>
TOKEN="$(python3 /tmp/flyto2-warroom-ce/install/scripts/mint-ee-sim-jwt.py)"
```

Paste this in the browser console on `http://localhost:8088`, then refresh:

```js
sessionStorage.setItem("jwt_access_token", JSON.stringify("<paste-token-here>"))
```

The engine verifies the HS256 token and rejects expired, unsigned, wrong-type,
or wrong-secret tokens.

## What This Simulates

- Enterprise auth boundary without Firebase.
- Airgap edition/capability gates.
- Runner and verification internal secret gates.
- Local AI-compatible endpoint wiring without making AI a gate authority.
- One database-backed stack for code, container, cloud/runtime, CTEM, evidence,
  reports, scheduler ledger, and audit surfaces.

## What This Does Not Pretend

This does not publish enterprise source code. Enterprise implementations remain
private images and private source; CE receives protocol contracts, install
composition, and the classified `services/flyto-engine-ce` kernel source slice.
