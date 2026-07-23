# Flyto2 Warroom Enterprise Simulation

This Compose overlay is a fail-closed boundary test. It deliberately keeps the
runtime in `community` edition and proves that adding Enterprise-shaped
environment values does not turn public CE images into an Enterprise build.

## Configure A Local Boundary Test

```sh
cp /tmp/flyto2-warroom-ce/install/.env.ee-sim.example /tmp/flyto2-warroom-ce/install/.env.ee-sim
```

Fill the blank values in `install/.env.ee-sim`. Use local-only values and do not
commit that file.

Required values:

- `FLYTO_DEPLOYMENT_ID` identifies this installation and binds tokens to it.
- `FLYTO_ENTERPRISE_JWT_SECRET_KEY` must be at least 32 characters.
- `FLYTO_ENTERPRISE_JWT_PREVIOUS_SECRET_KEYS` optionally retains old verification
  keys during a bounded signing-key rotation.

## Start EE Simulation

```sh
make -C /tmp/flyto2-warroom-ce ee-sim-up
```

## What This Simulates

- Public images remain Community Edition.
- Enterprise-shaped environment values do not unlock private implementation.
- Missing commercial overlays fail closed.

## What This Does Not Pretend

This does not publish enterprise source code. Enterprise implementations remain
private. CE receives public contracts, install composition, and the classified
`services/flyto-engine-ce` source slice only.
