# Flyto2 Code API Client Contracts

## Authority Boundary

Flyto2 Engine is the source of truth for persisted product state, capability,
authorization, scoring, lifecycle, and evidence. Flyto2 Cloud is a delegated
automation/execution service. Flyto2 Code is a typed renderer and command
client; it must not simulate a successful backend result.

The generated [HTTP And Environment Reference](./reference/http-and-environment.md)
lists endpoint literals and their source locations. The generated
[Source API Reference](./reference/source-api.md) documents each client
function and TypeScript contract.

## Client Layout

| Path | Responsibility |
|---|---|
| `src-next/lib/engine/client.ts` | Shared request behavior, base URL, authentication, error normalization |
| `src-next/lib/engine/auth.ts` | Authentication and local first-admin contracts |
| `src-next/lib/engine/code/` | Code, scan, repository, pentest, report, and war-room contracts |
| `src-next/lib/engine/ctem/` | Exposure, asset, attack-path, mitigation, and lifecycle clients |
| `src-next/lib/engine/platform/` | Organization, capability, community, billing, and platform clients |
| `src-next/lib/engine/runtime/` | Runtime and operational product contracts |
| `src-next/lib/engine/history/` | Timeline and audit-history reads |
| `src-next/lib/cloud/` | Automation requests, playbooks, and execution phases |
| `src-next/lib/queryKeys.ts` | Shared cache-key factory |

Generated backend route and capability snapshots live under
`src-next/lib/engine/__generated__/`. Synchronization scripts compare these
snapshots with Flyto2 Engine and the route-drift gate rejects unmapped calls.

## Request Lifecycle

1. A view invokes a domain hook or mutation controller.
2. The hook calls one typed client function.
3. The shared client resolves the current identity token and base URL.
4. Non-success responses become structured request errors; they are not
   converted to empty success payloads.
5. The response is normalized only where the contract explicitly permits it.
6. React Query owns cache lifecycle and retries.
7. Mutations invalidate shared query-key families.

Do not add direct transport to page/view components. `guard:ai-code` and
frontend closure audits scan for direct `fetch`, ad hoc query keys, and
mutation loops without closure.

## Authentication Modes

- **Firebase SaaS:** shared resolver obtains the current Firebase ID token.
- **Local/community JWT:** Engine-issued JWT is read from the established
  session boundary.
- **Enterprise:** the adapter uses the configured Enterprise identity mode.
- **Development bypass:** deterministic unsigned JWT is available only in a
  Vite development build paired with Engine dev auth.

Cloud requests use the same optional token resolver instead of importing
Firebase directly. If a protected request has no usable token, it fails closed.

## Capability And Action Contracts

Navigation visibility is not permission. Organization/project capability
snapshots determine surface state, while action responses determine whether a
specific mutation can proceed. Protected buttons must use the action gate and
still expect the backend to reject unauthorized requests.

Missing capability data, stale snapshots, and unknown modules must not enable
paid or destructive actions. Capability and SaaS-contract audits compare the
frontend registry with Flyto2 Engine.

## SSE Correspondence

One organization-scoped event stream feeds cache invalidation. Event handlers
map server event types to query-key families. No-op event policy is explicit;
completion/change events cannot silently go unhandled. Reconnection refreshes
identity rather than keeping an expired token indefinitely.

## Adding An Endpoint

1. Confirm or add the Flyto2 Engine/OpenAPI contract.
2. Add request/response types in the relevant client domain.
3. Call the shared request wrapper and preserve structured failures.
4. Add a shared query key and hook/controller behavior.
5. Add success, denied, not-found, malformed, and server-error tests as
   appropriate.
6. Run `npm run check:backend-routes`, `npm run audit:engine-drift`, and
   `npm run docs:generate`.

## Security Rules

- Never put secrets in `VITE_*`; Vite embeds them in the browser bundle.
- Treat route parameters, engine data, imported evidence, AI output, Markdown,
  and connector results as untrusted.
- Do not expose raw server exception details as user-facing trusted content.
- Do not log identity tokens or authorization headers.
- Keep destructive/revenue/security mutations backend-authorized and
  evidence-producing where the product contract requires it.
