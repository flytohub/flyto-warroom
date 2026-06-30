# Architecture Map

## Core Areas

- `src-next/app`: app shell, route wiring, providers, and layout behavior.
- `src-next/pages` and feature views: product-surface experiences.
- `src-next/lib` and engine clients: typed data access and shared query keys.
- `docs/platform-loops`: route, loop, and smoke registry contracts.
- `scripts`: audit, release, evidence, and closure gates.

## Cross-Repo Edges

- `flyto-engine` provides API contracts, capability snapshots, and action gates.
- `flyto-core` validates browser and workflow smoke loops.
- `flyto-indexer` checks impact, closure, and repository intelligence.
- `flyto-admin` shares operator and revenue-loop expectations through product
  contracts, not direct UI coupling.
