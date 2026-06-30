# docs

Product, audit, and platform-loop documentation for Flyto Code.

Use this directory for durable handoffs and contracts that must survive across
AI-agent sessions: platform loop registries, API response maps, frontend audit
notes, smoke recipes, and implementation plans. Generated runtime evidence
belongs under `out/`, not here.

`DECISION_CHAIN_MOAT.md` is the durable product and engineering contract for
the Risk Decision evidence chain. Keep it aligned with `npm run
audit:decision-chain` and `npm run guard:branch`.
