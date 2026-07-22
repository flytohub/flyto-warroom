# Flyto2 Warroom CE Project

Flyto2 Warroom CE is the self-hosted, source-available, noncommercial entry point
for Flyto2 Warroom.
It gives users a local security warroom for code, external exposure, cloud,
container, runtime, evidence, reporting, and deterministic remediation records.

The product loop is:

```text
Findings -> Attack Paths -> Safe Validation -> Evidence -> Remediation
```

Enterprise and SaaS editions are built from a pinned CE commit plus private
build-time overlays for governance, commercial intelligence, managed execution,
identity, support, and live remediation.

## Non-goals

- Do not publish private backend handlers, store internals, SaaS control-plane
  implementation, commercial datasets, customer connector credentials, or live
  remediation orchestration.
- Do not turn CE into a disconnected fork. Accepted CE patches must flow back
  into upstream Flyto2 source and be regenerated here.
