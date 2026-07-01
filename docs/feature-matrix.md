# Flyto2 Warroom CE / Enterprise Feature Matrix

Flyto2 Warroom CE is the self-hosted open-core security war room. Enterprise
adds commercial intelligence, managed remediation, identity, support, and
deployment controls through explicit capability and evidence contracts.

This matrix is a product boundary, not a marketing hint. If a capability is not
available in CE, the UI should show a gated state with a reason instead of a
hidden fail-open path.

| Capability | CE | Enterprise Cloud Bridge | Enterprise Airgap |
| --- | --- | --- | --- |
| Local install | Docker Compose, local Postgres, local JWT auth | Same local Warroom plus entitled cloud jobs | Private images, offline license, customer-controlled update bundle |
| Unified cockpit | Code, container, cloud, external, evidence, score, reports surfaces when data exists | Same cockpit with signed premium results | Same cockpit with offline evidence packages |
| Code security | SAST, SCA, secrets, IaC, reachability, code score, deterministic remediation evidence | AI proposal gate, approval, promotion, rollback | Private proposal/review workflow without cloud egress |
| Container security | Dockerfile/image-definition posture and local evidence | Live registry/workload remediation and managed connector execution | Private registry/workload connector bundle |
| Cloud posture | Connector contracts, posture views, IAM evidence when configured | Live cloud remediation and commercial enrichment | Offline/cloud-private connector execution |
| External attack surface | Footprint, asset map, posture, issue lifecycle, verify fixed, reopen, false positive | Commercial enrichment and continuous monitoring | Customer-controlled enrichment bundle |
| Threat intelligence | Public/feed-backed lookups when configured | Darkweb, stealer logs, leak, phishing, actor, malware, ransomware datasets | Offline licensed datasets |
| Automated Security Testing | Local runner, authorization records, replay/evidence contract | Managed runner fleet and scale-out execution | Customer-controlled runner fleet |
| Red team workflows | Planning, authorization, findings, evidence timeline | Managed campaigns and signed operator approvals | Offline campaign pack and approvals |
| AutoFix | Deterministic fixes, preview, operator acceptance, verification evidence | AI proposals, live cloud/container/runtime remediation, rollback orchestration | Offline approval and private remediation runners |
| Evidence and reports | Timeline, evidence pack, report export contracts | Signed premium evidence and support attestations | Legal hold, retention, offline audit export |
| Identity | Local users, roles, capability-gated UI/actions | SSO/SAML/SCIM, advanced RBAC, billing entitlement | Offline identity and license controls |
| Compliance | Local evidence, audit timeline, exportable artifacts | Managed compliance mapping, support SLAs | Airgap compliance bundle and retention policy |

## Commercial Gates

Premium actions must fail closed when any gate fails:

- missing or expired license
- unsupported edition
- denied role or missing action permission
- missing connector
- cloud service unavailable
- unsigned or invalid evidence result
- tenant/org mismatch

## License Gate Contract

The edition and license contract is deliberately split so CE remains useful and
Enterprise remains sellable without becoming a separate product:

| Gate | CE behavior | Enterprise behavior | Failure mode |
| --- | --- | --- | --- |
| Edition | `community` / Apache-2.0 profile, local auth, local storage, rules-only AI fallback | `enterprise_cloud`, `self_hosted_online`, or `enterprise_airgap` profile | Block unsupported actions and return an explanatory gate reason |
| License | No commercial license is required for CE baseline workflows | Offline license or cloud entitlement is required for premium jobs | No job dispatch, no optimistic success, no unsigned evidence |
| Capability snapshot | Public pages/actions come from the CE capabilities contract | Same shape with Enterprise edition/provider fields and premium action states | UI shows disabled or locked state from backend snapshot |
| Project module | Module can be enabled/disabled independently in the local Warroom | Same module can attach to Enterprise Bridge or airgap runner packages | Module action fails closed when dependency, source, or connector is missing |
| Evidence | Local evidence packs and report exports remain local | Premium jobs return signed evidence into the local timeline | Reject result if org, signature, or replay contract does not match |

Do not market CE as "free Enterprise." The accurate promise is:

```text
CE is the self-hosted open-core Warroom. Enterprise unlocks premium execution,
commercial intelligence, identity, support, and deployment controls through
license-gated capability and evidence contracts.
```

## Contribution Boundary

CE changes should flow back upstream. Accepted community changes are reviewed as
patch bundles, applied to the private source workspace when appropriate, tested,
and exported again into this public mirror.
