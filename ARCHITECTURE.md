# ARCHITECTURE.md

## Overview

Document the current architecture for `flyto-warroom` here. Include runtime boundaries, major modules, data flow, external integrations, and deployment surfaces.

## Frontend Surfaces

If this repo contains UI, every screen must follow the Flyto2 Frontend Quality Gate in `AGENTS.md`.

`packages/flyto-code` is generated from the upstream Flyto2 Code frontend. Its
CE/open-core route surface is split by the physical
`src-next/types/module-manifests/*.ts` files and merged through the exported
`@code/modules` helpers. Do not hand-maintain separate CE filters in this repo;
update upstream `flyto-code` and regenerate or sync the generated package.

## Update Rule

Update this file when module boundaries, storage, APIs, deployment, or frontend structure changes.
