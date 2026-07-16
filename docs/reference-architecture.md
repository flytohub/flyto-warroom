# Flyto2 Warroom Reference Architecture

Flyto2 Warroom CE is a self-hosted open-core security war room. Its core job is
not to replace every scanner. Its job is to turn findings from existing tools
into attack paths, safe validation, evidence, reports, and remediation records.

```text
Bring your own tools
-> normalize findings and assets
-> build attack-path hypotheses
-> validate safely
-> preserve replayable evidence
-> remediate and re-test
```

## What CE Should Feel Like

CE should be useful without talking to Flyto2 Cloud:

- run locally with Docker Compose;
- sign in with local auth;
- import demo seed or BYO scanner output;
- inspect assets, findings, evidence, reports, and AutoFix records;
- use deterministic checks and local evidence packs;
- contribute templates, connector examples, UI fixes, docs, and kernel patches.

CE is not intended to be a private SaaS control plane, commercial threat data
bundle, or managed runner service.

## What Enterprise Adds

Enterprise exists for organizations that need governance, scale, commercial
data, managed execution, or controlled deployment:

- SSO/SAML/SCIM, advanced RBAC, audit export, legal hold, retention, and data
  residency;
- managed connectors for commercial security tools and feeds;
- managed runner fleets, red-team campaigns, and signed premium evidence;
- live cloud, container, runtime, VM, and identity remediation;
- Enterprise Cloud Bridge, self-hosted online, and airgap packaging;
- support SLAs, private image provenance, backup/restore, and update bundles.

Premium actions fail closed when license, edition, connector, authorization, or
evidence-signature gates are missing.

## Design References

Flyto2 borrows product-shape lessons from mature open security projects:

| Reference | Lesson applied to Flyto2 |
| --- | --- |
| [GitLab](https://handbook.gitlab.com/handbook/company/stewardship/) | Open-core should keep CE useful while paid editions add governance and scale. |
| [DefectDojo](https://github.com/DefectDojo/django-DefectDojo) | Findings need lifecycle, dedupe, remediation, re-test, and reports. |
| [OpenCTI](https://github.com/OpenCTI-Platform/opencti) | Connectors and graph relationships make threat and asset data composable. |
| [OpenAEV](https://github.com/OpenAEV-Platform/openaev) | Offensive validation should be campaign-based, scoped, and evidenced. |
| [Wazuh](https://github.com/wazuh/wazuh) | Runtime and environment coverage need explicit agent/server/dashboard boundaries. |
| [Nuclei](https://github.com/projectdiscovery/nuclei) | Templates should be reviewable, deterministic, and safe to run. |
| [Trivy](https://github.com/aquasecurity/trivy) | Scanner output should be normalized instead of hard-coupled to the platform. |

## Contribution Loop

Flyto2 Warroom CE is generated from the private Flyto2 source workspace. Public
CE changes should flow back upstream:

```text
public patch
-> maintainer review
-> private source workspace update
-> verification
-> regenerated Warroom CE export
```

This keeps CE and Enterprise aligned instead of becoming two unrelated
projects.
