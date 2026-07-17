# Flyto2 Code

**AI-powered war room for your codebase.** Full-spectrum application
security platform with a code-intelligence layer and a closed-loop
verification engine — converging the scan, test, and understanding
stacks into a single console.

---

## What it is

Connect your GitHub / GitLab repos and Flyto2 Code:

- Scans for dependencies, secrets, SAST findings, licenses, CVEs.
- Builds architecture maps, API graphs, and health scores.
- Generates a YAML pentest workflow for each finding and runs it
  against staging — real browser, live streaming frames, recorded
  verdict. You see evidence, not just alerts.

One-paragraph elevator: the same scanner that finds CVEs also produces
architecture maps; the same engine that stores findings also dispatches
the tests that prove them. Every number in the dashboard comes from the
server, scored on a unified Bitsight-style A-F grade so it stays
consistent across every page.

Full product description: [`docs/WHITEPAPER.md`](./docs/WHITEPAPER.md).

## Installation

The frontend expects sibling repositories to sit next to it in the
workspace:

```text
flytohub/
  flyto-code/
  flyto-engine/
  flyto-indexer/
  flyto-i18n/
  flyto-design-tokens/
```

Install from `flyto-code/`:

```bash
npm install
```

`flyto-i18n` and `flyto-design-tokens` are consumed through local file
links, so keep those sibling checkouts present before running build or CI
equivalent commands.

## Usage

Run the local app:

```bash
npm run dev
```

Run the product and AI-quality gates before handing off a branch:

```bash
npm run guard:branch
npm run lint -- --quiet
npm run build
```

For cross-repo closure checks, run flyto-indexer from `flyto-code/`:

```bash
PYTHONPATH=../flyto-indexer python3 -m src.cli verify-workspace .. \
  --project . \
  --project ../flyto-engine \
  --project ../flyto-indexer
```

## Repo layout

```
flyto-code/                    # this repo (React 19 + Vite 8 frontend)
  src/                         # app source
  docs/
    WHITEPAPER.md              # product overview, problem, solution, moat
    PRODUCT_ROADMAP.md         # feature matrix, phases, pricing sketch
    cloud-integration.md       # template sync contract with flyto-cloud
  CLAUDE.md                    # AI-agent context (tech stack, conventions)
```

Sibling services (separate repos in this monorepo):

- `flyto-engine` — Go + PostgreSQL backend, source of truth for data
- `flyto-indexer` — Python stdlib-only scanner + MCP server
- `flyto-cloud` — FastAPI + Vue worker that executes pentest YAML
- `flyto-ai` — PyPI package that generates pentest YAML from findings
- `flyto-core` — PyPI package that interprets pentest YAML

## Development

```bash
npm install
npm run dev        # Vite dev server on :5180
npm run build      # tsc -b && vite build
npm run lint
```

Environment (`.env`):

```
VITE_FIREBASE_API_KEY=…
VITE_FIREBASE_AUTH_DOMAIN=ticket-helper-dbc0e.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=ticket-helper-dbc0e
VITE_GITHUB_CLIENT_ID=…
VITE_GITLAB_CLIENT_ID=…
VITE_AUTOMATION_URL=https://cloud.flyto2.com
VITE_CORTEX_URL=https://cortex.flyto2.com
```

## Tech stack

- React 19 + TypeScript (strict mode)
- Vite 8 (build), Mantine v8 + Tailwind v4 (UI)
- `@tanstack/react-query` (data), `openapi-fetch` (typed client)
- `lucide-react` (icons — no emoji)
- `@flyto2/design-tokens` (shared design system with flyto-cloud, flyto-cortex)
- `flyto-i18n` (shared CDN-loaded translations, 17 languages)

## Design rules

- Dark mode only — no light tokens.
- Backend owns all data processing. The frontend reduces nothing, sums
  nothing, sorts nothing for aggregation. Every number on screen is a
  field from an API response.
- Unified A-F grade bands across engine and frontend (Bitsight-style).
- Cross-folder imports use path aliases (`@compounds/*`, `@hooks/*`,
  `@lib/*`); same-folder imports are relative.
- No emoji anywhere in UI.
