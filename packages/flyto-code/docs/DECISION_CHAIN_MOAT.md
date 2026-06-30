# Decision Chain Moat Contract

Flyto Code's durable moat is the Risk Decision evidence chain. The product
must not regress into a collection of scanners, dashboards, AI summaries, and
security pages that can be copied independently.

The protected chain is:

```text
repo / file / package
  -> PR overlap
  -> CVE / SAST / dependency finding
  -> taint flow and runtime reachability
  -> DAST and pentest validation
  -> AutoFix eligibility
  -> agent tool call and Agent Firewall decision
  -> BYO vendor or customer evidence
  -> evidence report and Risk Decision priority
```

The answer we protect is not "there is a high-risk vulnerability." The answer
is "this issue is production reachable, overlaps an active PR, traces to a
login API, has a validated exploit path, is AutoFix eligible, has blast radius
75, and should be handled today by this owner."

## Protected Surfaces

Backend correlation lives in `../flyto-engine/internal/correlate/correlate.go`.
It must keep the decision context fields together: open PR overlap, taint
adjacency, AutoFix eligibility, pentest verdict, blast radius, and cross-surface
edges.

Issue and pulse APIs must expose enriched Risk Decision context through:

- `GET /api/v1/code/orgs/{id}/issues?enrich=true`
- `GET /api/v1/code/orgs/{id}/pulse`
- `GET /api/v1/code/orgs/{id}/findings/{fingerprint}`
- `GET /api/v1/code/alerts/{id}/blast-graph`
- `GET /api/v1/code/orgs/{id}/taint-flows`
- `GET /api/v1/code/orgs/{id}/autofix/findings`

BYO evidence must be materialized into the same decision kernel. It is not a
side table. Immediate materialization runs after import-map ingest, and the
worker fallback keeps historical BYO claims bridged into findings. Module
routing must preserve the source gate so customers can suppress Flyto-native
scans while keeping trusted external evidence active.

Pentest and DAST results must feed evidence, not only a pentest page.
Pentest-confirmed findings must be written through pipeline evidence so they
can participate in reports, prioritization, and audit history.

Agent Firewall outputs must remain audit-grade. Tool calls, denied actions,
DLP decisions, and evidence report exports must connect to the same reportable
chain without storing raw sensitive payloads unnecessarily.

Frontend consumers must keep canonical clients, query keys, views, and
registries aligned. A new signal is not complete until it has a stable client,
query key, UI surface, and platform-loop registry entry when it participates in
navigation or smoke coverage.

## Regression Rules

Do not add a standalone dashboard when the data belongs in Risk Decision
context.

Do not add BYO, DAST, pentest, vendor, or customer evidence as a passive table
without materializing it into findings or pipeline evidence.

Do not add Agent Firewall or AI governance data that cannot produce an evidence
report, audit trail, or defensible decision.

Do not export evidence without digest-safe provenance, timestamps, source type,
and organization scoping.

Do not add frontend routes without canonical engine clients, query keys, route
coverage, and platform loop coverage when the feature is user-facing.

## Guardrail

`npm run audit:decision-chain` is the static contract check for this moat. It
is part of `npm run guard:branch`.

When a new signal becomes part of the moat, update the backend writer or route,
frontend client/query key/view, evidence/reporting path, and this audit script
in the same change. If the signal is live or async, include SSE or cache
invalidation coverage. If the signal affects auditability, include report
provenance and retention behavior.
