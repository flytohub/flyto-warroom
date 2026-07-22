<p align="center">
  <img src="public/logo.png" alt="Flyto2 Code" width="96">
</p>

# Flyto2 Code

**Open-source application-security and code-intelligence war room.** Connect
repositories, inspect architecture and attack surface, prioritize findings,
run authorized verification workflows, and keep the resulting evidence in one
capability-aware workspace.

Flyto2 Code is the React frontend for the Flyto2 platform. Flyto2 Engine owns
data, authorization, scoring, and lifecycle; Flyto2 Cloud executes delegated
automation. The browser renders those contracts and never turns missing backend
state into a fake success.

## What You Can Inspect

- Code security: SAST, SCA, secrets, dependency/CVE, license, architecture, and
  scan findings supplied by the connected Engine.
- CTEM and exposure: assets, domains, findings, mitigations, attack paths,
  vendor risk, and risk matrices.
- Authorized verification: pentest, red-team, Product Verification, scheduler,
  replay, and evidence surfaces.
- Runtime governance: MCP/agent activity, AI governance, DLP, policy simulation,
  and evidence views when enabled.
- Cloud, container, and identity posture through edition/capability-gated
  modules.
- Threat intelligence, scoring, compliance, timelines, reports, operations,
  and workspace administration.
- Community/self-hosted onboarding with provider-neutral JWT auth, first-admin
  bootstrap, same-origin Engine proxy, locale selection, and light/dark/system
  appearance.

Static routes are not promises of backend availability. The engine's
capability and action contracts decide what is enabled, preview-locked, or
hidden. See the [feature guide](docs/FEATURES.md) and generated
[route/module inventory](docs/reference/routes-and-modules.md).

## Quick Start

Prerequisites: a current Node.js release compatible with the lockfile and npm.

```bash
git clone https://github.com/flytohub/flyto-code.git
cd flyto-code
npm ci --legacy-peer-deps
cp .env.example .env
npm run dev
```

The development server listens on `http://localhost:5181`. Configure the
selected auth mode and Flyto2 Engine endpoint in `.env`; never place secrets in
`VITE_*` variables because Vite embeds them in the browser bundle.

Build and preview the standalone frontend:

```bash
npm run build
npm run preview
```

The vendored `@flyto/design-tokens` package makes a standalone clone
buildable without a private sibling checkout. The production artifact is
`dist-next/`.

## Usage

Start with a connected Flyto2 Engine, sign in using the configured auth mode,
then select a workspace and repository. Navigation exposes only the modules
allowed by the Engine capability contract. Typical work moves from inventory
or findings to prioritization, an authorized action, and retained evidence;
unavailable data remains visibly unavailable instead of becoming a sample
success state.

For local UI development, use `npm run dev`. For a production-like check, use
`npm run build` followed by `npm run preview`. The [feature guide](docs/FEATURES.md)
maps user workflows to source, backend contracts, tests, and current status.

## API Contracts

The browser accesses Flyto2 Engine and Flyto2 Cloud through typed clients under
`src-next/lib/engine/` and `src-next/lib/cloud/`. Components must not call
backend URLs directly. Read [API clients](docs/API_CLIENTS.md) for ownership,
authentication, error, and capability rules; use the generated
[HTTP reference](docs/reference/http-and-environment.md) to locate each static
endpoint literal.

## Configuration

Copy `.env.example` for local development and set only the values required by
the selected deployment and authentication mode. `VITE_*` values are public
browser configuration, never secrets. The complete variable inventory and
deployment rules are in [Configuration](docs/CONFIGURATION.md).

## Architecture In One Minute

```text
src-next/app/                     route groups and thin pages
src-next/components/              product UI and shared primitives
src-next/hooks/                   query, mutation, and event composition
src-next/lib/engine/              typed Flyto2 Engine clients
src-next/lib/cloud/               Flyto2 Cloud automation clients
src-next/types/module-manifests/  route/capability/package source of truth
src-next/@fuse/                   template shell, not product feature code
scripts/                          release and architecture guards
docs/                             product, engineering, and generated reference
```

The active source root is `src-next/`, not `src/`. Read the
[architecture guide](docs/ARCHITECTURE.md), [frontend guide](docs/FRONTEND.md),
and [API client contracts](docs/API_CLIENTS.md) before changing shared
boundaries.

## Testing And Quality Gates

Run the full local release contract:

```bash
npm run release:gate
flyto-index scan . --full
flyto-index verify . --strict --json
```

The release gate covers generated documentation, brand/email policy, TypeScript,
the complete Vitest suite, route/API drift, capability and authorization
contracts, nine product loops, SSE correspondence, data readiness, visual
regression budgets, production dependency audit, build, bundle budget, static
smoke, deployment policy, GitHub Actions startup, and release evidence.

Useful focused commands:

```bash
npm run docs:generate       # regenerate source/route/API/env references
npm run docs:check          # ownership, freshness, and local-link checks
npm run brand:check         # Flyto2 and @flyto2.com identity policy
npm run guard:branch        # product and architecture closure
npx vitest run              # unit and component tests
npm run build               # strict typecheck and production bundle
```

## Documentation

- [Documentation hub](docs/README.md)
- [White paper](docs/WHITEPAPER.md)
- [Feature guide](docs/FEATURES.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Frontend](docs/FRONTEND.md)
- [API clients](docs/API_CLIENTS.md)
- [Configuration](docs/CONFIGURATION.md)
- [Testing](docs/TESTING.md)
- [Operations](docs/OPERATIONS.md)
- [Source API reference](docs/reference/source-api.md)
- [Routes and module surfaces](docs/reference/routes-and-modules.md)
- [HTTP and environment reference](docs/reference/http-and-environment.md)

`docs/documentation-manifest.json` assigns every source/configuration file to a
durable guide. CI fails when generated references are stale or local links are
broken.

## Related Projects

- [Flyto2](https://github.com/flytohub/flyto2): open-source project index
- [Flyto2 Engine](https://github.com/flytohub/flyto-engine): API, lifecycle,
  capability, policy, and evidence authority
- [Flyto2 Indexer](https://github.com/flytohub/flyto-indexer): local code graph,
  security, dependency, and documentation scanner
- [Flyto2 Cloud](https://github.com/flytohub/flyto-cloud): automation and
  verification execution surface
- [Flyto2 Core](https://github.com/flytohub/flyto-core): YAML workflow execution
  engine

## Contributing And Security

Read [SECURITY.md](SECURITY.md) before reporting a vulnerability and
[CONTRIBUTING.md](CONTRIBUTING.md) before opening a change. Security reports go
to `security@flyto2.com`.

## License

License and distribution boundaries are documented in the repository's
[edition boundary](docs/open-core/edition-boundary.md) and package manifests.
Confirm the applicable boundary before redistributing enterprise-only modules
or assets.
