# Security Policy

## Supported Versions

Security fixes are accepted for the current `main` branch of Flyto2 Warroom CE.
Enterprise-only fixes are handled in the private Flyto2 workspace and are not
published from this repository unless the affected CE contract or installer also
needs an update.

## Reporting A Vulnerability

Use GitHub private vulnerability reporting or contact the maintainers through
the official Flyto security channel. Do not file public issues for exploitable
vulnerabilities, secrets, customer data exposure, auth bypasses, supply-chain
tampering, or runner escape findings.

Include:

- affected component and version or commit;
- reproduction steps;
- expected impact;
- whether the issue affects CE, EE, or both;
- any suggested patch or mitigation.

## Secret Handling

Never submit credentials, customer data, private image coordinates, production
tokens, private keys, or enterprise-only implementation details. The release
audit is intentionally fail-closed for secret-like values and private paths.
