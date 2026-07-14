# Flyto2 Enterprise Cloud Bridge

Flyto2 Warroom CE is designed to be useful on its own, while higher-value
commercial capabilities can be delivered by Flyto2 Cloud without publishing the
private implementation code.

The bridge model is simple:

1. Run Warroom CE on your own host.
2. Add an Enterprise license or cloud entitlement token.
3. CE asks Flyto2 Cloud only for explicitly enabled premium jobs.
4. Flyto2 Cloud returns signed results, evidence, and status events.
5. The local Warroom stores the outcome in its own timeline, evidence pack, and
   audit trail.

CE must keep working when the bridge is not configured. Premium actions must fail closed.
When the bridge, entitlement, role, connector, or evidence-signature checks do
not pass, they should stay visible as gated capabilities, not hidden fail-open
paths.

## What Stays Local

- Projects, local users, local JWT auth, local database, and local evidence.
- Code intelligence through `flyto-indexer`.
- YAML workflows and deterministic verification through `flyto-core`.
- Self-hosted UI, reports, score views, asset views, scheduler ledger, and
  evidence timeline.
- User-provided API keys and connector credentials unless the user explicitly
  chooses a cloud-executed premium job.

## What Can Be Cloud-Backed

| Capability | CE baseline | Enterprise Cloud Bridge |
| --- | --- | --- |
| Code security | Local SAST/SCA/secrets/IaC/reachability and deterministic AutoFix rules | AI-assisted proposals, approval bundles, promotion/rollback orchestration |
| CTEM and external attack surface | Local inventory, posture, evidence, issue lifecycle | Commercial enrichment, external correlation, managed continuous monitoring |
| Darkweb and threat intelligence | Public/feed-backed lookups where configured | Stealer logs, leak datasets, phishing feeds, actor/malware/ransomware intelligence |
| DAST and automated security testing | Local runner and authorized scans | Managed runner fleet, scale-out browser execution, enterprise-safe dispatch |
| Red team workflows | Local planning, authorization records, evidence timeline | Managed campaigns, advanced replay, signed operator approvals |
| Cloud/container/runtime/VM | Posture views, local definitions, local evidence | Live remediation, managed connector execution, runtime and cloud fix orchestration |
| AI governance | Deterministic fallback, local audit events, provider visibility | Quota, provider routing, commercial model workflows, proposal review gates |
| Enterprise controls | Local roles, capabilities, release audit | SSO/SAML/SCIM, offline license, legal hold, airgap packages, support SLAs |

## Request Lifecycle

Premium requests should follow the same contract across modules:

1. The UI asks the local engine for a capability snapshot.
2. The local engine checks org, role, edition, license, and action permission.
3. If the action is premium, the engine creates a signed bridge request with the
   minimum required metadata.
4. Flyto2 Cloud validates entitlement and executes the premium job.
5. Results return as signed evidence events, artifacts, and status updates.
6. The local engine records the evidence and refreshes the UI through the normal
   SSE/cache invalidation path.

If entitlement validation, network access, signing, or result verification fails,
the action must fail closed with a clear reason. The local product should show
which gate failed: missing license, unsupported edition, denied role, expired
token, connector error, cloud service unavailable, or evidence signature failure.

## Product Boundary

Do not market CE as fully open-source Enterprise. The correct promise is:

> CE is the self-hosted open-core Warroom. Enterprise unlocks cloud-backed
> intelligence, managed remediation, fleet execution, enterprise identity,
> governance, and support.

This keeps the public project useful, encourages community contributions, and
protects the commercial moat.

## Airgap Alternative

Customers that cannot call Flyto2 Cloud need an Enterprise offline or airgap
edition. That path should use signed offline licenses, private enterprise
images, private update bundles, and customer-controlled deployment evidence
instead of the cloud bridge.
