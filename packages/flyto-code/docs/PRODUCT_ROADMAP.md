# Flyto2 Code — Product Roadmap

Zero-config developer portal (war room) powered by AI.
Full-spectrum codebase intelligence with integrated security scanning.

---

## Feature Matrix

### 1. Scanners

| Feature | Aikido | Flyto2 | Module | Status |
|---------|--------|-------|--------|--------|
| Open Source Dependency Scanning (SCA) | All tiers | flyto-indexer | `dependency_scanner.py` | DONE |
| Secrets Detection (Git) | All tiers | flyto-indexer | `secret_scanner.py` | DONE |
| Static Code Analysis (SAST) | All tiers | flyto-indexer | `taint.py`, `quality.py` | DONE |
| Open Source License Scanning | All tiers | flyto-indexer | `license_scanner.py` | DONE |
| Infrastructure as Code (IaC) | All tiers | flyto-indexer | — | PLANNED |
| Dynamic Testing (DAST) | Pro+ | flyto-core | `workflows/pentests/*.yaml` | DONE (closed-loop verify) |
| Cloud Posture Management (CSPM) | Pro+ | flyto-engine | — | PLANNED |
| Container Image Scanning | Pro+ | flyto-engine | — | PLANNED |
| Malware Detection in Dependencies | Pro+ | flyto-indexer | — | PLANNED |
| Attack Surface Monitoring (ASM) | Pro+ | flyto-engine | discovery 12-pass | DONE |
| API Scanning | Advanced+ | flyto-core | pentest YAML | DONE (closed-loop verify) |
| Outdated Software Detection | All tiers | flyto-indexer | `dependency_scanner.py` | DONE |
| Hardened Container Images | Enterprise | — | — | FUTURE |

### 2. SCA Features

| Feature | Aikido | Flyto2 | Status |
|---------|--------|-------|--------|
| Reachability analysis | Pro+ | flyto-indexer `taint.py` | DONE |
| AutoFix (version bump PRs) | All tiers | flyto-engine + GitHub API | PLANNED |
| Vulnerability database | OSV | flyto-engine `cve/checker.go` + OSV API | DONE |
| Full language coverage | 8 ecosystems | 8 ecosystems (npm/pypi/go/cargo/maven/gem/composer/docker) | DONE |
| SBOM support | Pro+ | flyto-indexer `dependency_scanner.py` | DONE |
| Bulk AutoFix | Advanced+ | — | PLANNED |
| EPSS based prioritization | Advanced+ | — | PLANNED |
| License compliance | Pro+ | flyto-indexer `license_scanner.py` | DONE |

### 3. CSPM (Cloud Posture Management)

| Feature | Flyto2 Module | Status |
|---------|-------------|--------|
| AWS misconfiguration checks | flyto-engine `internal/cspm/aws.go` | PLANNED |
| GCP misconfiguration checks | flyto-engine `internal/cspm/gcp.go` | PLANNED |
| Azure misconfiguration checks | flyto-engine `internal/cspm/azure.go` | PLANNED |
| VM group scanning | flyto-engine | PLANNED |

Implementation: read-only API access to cloud accounts, check against CIS benchmarks.
Cloud credentials stored in `org_tokens` table (encrypted via `internal/secrets`).

### 4. Secrets Detection

| Feature | Flyto2 Module | Status |
|---------|-------------|--------|
| Secrets in code (Git) | flyto-indexer `secret_scanner.py` (18 patterns) | DONE |
| Secrets across SDLC (IDE/CI) | flyto-vscode + CI action | PLANNED |
| Secrets liveness detection | flyto-engine (validate if secret is active) | PLANNED |

### 5. SAST (Static Code Analysis)

| Feature | Flyto2 Module | Status |
|---------|-------------|--------|
| Full language coverage | Python, Go, TypeScript, Vue, Rust | DONE |
| IDE notifications | flyto-vscode | PLANNED |
| Custom SAST rules | `.flyto-rules.yaml` (grep_deny, glob_deny) | DONE |
| AI Code Quality Rules | flyto-indexer `quality.py` | DONE |
| AI SAST AutoFixes | flyto-engine + LLM | PLANNED |

### 6. DAST (Dynamic Testing)

| Feature | Flyto2 Module | Status |
|---------|-------------|--------|
| Self-built app scans | flyto-core `workflows/pentests/` | YAML READY |
| Authenticated DAST | pentest YAML with auth_token | YAML READY |
| API scanning | pentest YAML | YAML READY |
| Broker for internal apps | flyto-engine tunnel agent | PLANNED |

12 pentest categories defined:

| ID | Name | OWASP |
|----|------|-------|
| `access_control` | Access Control (BOLA/IDOR) | A01 |
| `business_logic` | Business Logic & Validation | A04 |
| `code_injection` | Code & Command Injection | A03 |
| `sql_injection` | SQL & Database Injection | A03 |
| `llm_injection` | LLM & Prompt Injection | LLM01 |
| `ssrf` | Server-Side Request Forgery | A10 |
| `auth_session` | Authentication & Session | A07 |
| `client_side` | Client-Side Attacks (XSS/CSRF) | A03/A07 |
| `deserialization` | Insecure Deserialization & SSTI | A08 |
| `file_misconfig` | Files & Misconfiguration | A05 |
| `secrets_crypto` | Secrets & Cryptography | A02 |
| `hardening` | Hardening (CORS/Headers/TLS) | A05 |

### 7. Productivity

| Feature | Flyto2 Module | Status |
|---------|-------------|--------|
| Slack/Teams notifications | flyto-engine webhook | PLANNED |
| IDE plugins | flyto-vscode | EXISTS (needs security features) |
| Task management integrations | flyto-engine + Jira/Linear API | PLANNED |
| Automatic task creation | flyto-engine | PLANNED |
| Bulk AutoFix | flyto-engine + GitHub API | PLANNED |
| CI gating & PR decorations | GitHub Actions + flyto-indexer | PLANNED |
| Release quality gating | flyto-engine health score threshold | PLANNED |
| Multibranch scanning | flyto-engine scanner (per-branch) | PLANNED |
| Monorepo splitting | flyto-indexer (project-aware) | DONE |

### 8. Management & Reporting

| Feature | Flyto2 Module | Status |
|---------|-------------|--------|
| Audit log | flyto-engine `internal/audit/chain.go` (hash-chained) | DONE |
| SBOM generation | flyto-indexer `dependency_scanner.py` | DONE |
| Access control checks | flyto-engine `internal/permission/` | DONE |
| SLA management | flyto-engine | PLANNED |
| Compliance reports (SOC2/ISO27001) | flyto-engine | PLANNED |
| Security audit reports (PDF) | flyto-engine + wkhtmltopdf | PLANNED |
| Data analytics & reporting | flyto-code dashboard | PARTIAL |
| Webhooks | flyto-engine | PLANNED |
| Public REST API | flyto-engine `/api/v1/code/*` | DONE |
| SSO (SAML) | flyto-engine `org_sso_configs` table | TABLE EXISTS |
| Multi-tenant portal | flyto-engine organizations | DONE |

### 9. Runtime Protection

| Feature | Flyto2 Module | Status |
|---------|-------------|--------|
| Node.js runtime agent | `flyto-runtime-node` (new package) | PLANNED |
| Python runtime agent | `flyto-runtime-python` (new package) | PLANNED |
| PHP runtime agent | `flyto-runtime-php` (new package) | FUTURE |
| .NET runtime agent | `flyto-runtime-dotnet` (new package) | FUTURE |
| Java runtime agent | `flyto-runtime-java` (new package) | FUTURE |
| Zero-day threat protection | Runtime agents + WAF rules | PLANNED |
| Rate limit APIs | Runtime agents | PLANNED |
| Auto-create OpenAPI specs | Runtime agents (request recording) | PLANNED |
| SQL injection protection | Runtime agents (query inspection) | PLANNED |
| Path traversal protection | Runtime agents | PLANNED |
| SSRF protection | Runtime agents (outbound filter) | PLANNED |
| Shell injection protection | Runtime agents | PLANNED |
| Monitor outbound traffic | Runtime agents | PLANNED |
| IP restriction & user blocking | Runtime agents | PLANNED |

Architecture: lightweight SDK injected into app process.
Intercepts HTTP requests, DB queries, file operations, outbound calls.
Reports to flyto-engine via async telemetry endpoint.

```
App Process
  └── flyto-runtime-{lang}
        ├── HTTP middleware (inbound filter)
        ├── DB query inspector (SQL injection)
        ├── File operation guard (path traversal)
        ├── Outbound request filter (SSRF)
        ├── Shell exec guard (command injection)
        └── Telemetry reporter → flyto-engine /api/v1/runtime/events
```

### 10. Endpoint Protection

| Feature | Flyto2 Module | Status |
|---------|-------------|--------|
| Block malware packages (npm/PyPI) | `flyto-guard` CLI | PLANNED |
| AI tools & models detection | flyto-indexer | PLANNED |
| Block malware package installation | npm/pip wrapper or git hook | PLANNED |
| IDE extension protection | flyto-vscode | PLANNED |
| Browser extension protection | — | FUTURE |

### 11. Compliance

| Standard | Flyto2 Coverage | Status |
|----------|---------------|--------|
| OWASP Top 10 (2021) | DAST pentest YAML mapping | YAML READY |
| OWASP LLM Top 10 (2025) | `llm_injection.yaml` | YAML READY |
| SOC 2 Type II | Audit log + access control + encryption | PARTIAL |
| ISO 27001 | Audit log + RBAC + secrets management | PARTIAL |
| PCI DSS | TLS + secrets + access control | PARTIAL |
| GDPR | Data handling policies | PLANNED |
| HIPAA | Encryption + audit + access control | PARTIAL |
| NIST CSF | Identify/Protect/Detect/Respond/Recover mapping | PLANNED |
| CIS Benchmarks | CSPM checks | PLANNED |
| NIS2 | EU compliance framework | PLANNED |

---

## Implementation Priority

### Phase 1 — Core Platform (Shipped)
War room, scanning, closed-loop verify, live events, AI fix plan.

- [x] Dependency scanning (8 ecosystems)
- [x] Secret detection (18 patterns)
- [x] Taint analysis (source→sink)
- [x] License scanning + copyleft warning
- [x] CVE checking via OSV API
- [x] Health scoring (A-F, BitSight-style integer)
- [x] Security issues feed
- [x] CTO dashboard with charts
- [x] Closed-loop verify (static + dynamic, confidence badge, honest verdicts)
- [x] Attack surface discovery (12-pass: DNS, SSL, WHOIS, WAF, tech stack)
- [x] SSE live events (org-scoped, zero polling)
- [x] AI Fix Plan (week-bucketed remediation roadmap, Markdown export)
- [x] Domain type auto-detection
- [x] Container / IaC / License / Malware / SBOM / Reachability views
- [x] CI Gate view (policy + checks)

### Phase 2 — CI/CD Integration
Connect scanning to developer workflow.

- [ ] GitHub Actions integration (`flyto-scan` action)
- [ ] PR decoration (comment with scan results)
- [ ] CI gating (block merge if critical issues)
- [ ] AutoFix (create PR with version bump)
- [ ] Multibranch scanning
- [ ] IDE security alerts (flyto-vscode)

### Phase 3 — DAST & Pentest (Partially Shipped)
Dynamic testing via flyto-core worker.

- [x] Execute pentest YAML workflows on Cloud Worker (closed-loop verify)
- [x] Pentest project management (per-domain, discovery 12-pass)
- [ ] Scheduled scans (cron)
- [ ] Authenticated DAST
- [ ] Pentest report generation (PDF)
- [ ] API endpoint discovery + fuzzing

### Phase 4 — Runtime Protection
Biggest competitive differentiator.

- [ ] `flyto-runtime-node` — Node.js middleware SDK
- [ ] `flyto-runtime-python` — Python WSGI/ASGI middleware
- [ ] Runtime telemetry endpoint in flyto-engine
- [ ] Real-time attack dashboard
- [ ] Auto-block rules (rate limit, IP, user)
- [ ] Zero-day protection via behavior analysis

### Phase 5 — Cloud & Infrastructure
Expand beyond code.

- [ ] CSPM — AWS/GCP/Azure config checks
- [ ] Container image scanning (Trivy integration)
- [ ] IaC scanning (Terraform, CloudFormation, Helm)
- [ ] Attack surface monitoring (subdomain, port, SSL)
- [ ] VM scanning

### Phase 6 — Compliance & Enterprise
Enterprise-grade features.

- [ ] Compliance report generator (SOC2, ISO27001, PCI DSS)
- [ ] Security audit PDF export
- [ ] SSO/SAML integration
- [ ] SLA management
- [ ] Webhook integrations
- [ ] Data analytics & trend reporting

### Phase 7 — Endpoint Protection
Protect developer workstations.

- [ ] `flyto-guard` CLI (npm/pip install hook)
- [ ] Malware package database
- [ ] AI model/tool detection
- [ ] IDE extension security audit

---

## Pricing Tiers (Planned)

| | Free | Pro | Business | Enterprise |
|---|---|---|---|---|
| Repos | 5 | 25 | Unlimited | Unlimited |
| SCA + Secrets + License | Yes | Yes | Yes | Yes |
| SAST | Yes | Yes | Yes | Yes |
| DAST | — | 5 scans/mo | Unlimited | Unlimited |
| CSPM | — | 1 cloud | 3 clouds | Unlimited |
| Runtime Protection | — | 250K req/mo | 10M req/mo | Custom |
| Container Scanning | — | Yes | Yes | Yes |
| CI Gating | — | Yes | Yes | Yes |
| AutoFix | 5/mo | 50/mo | 200/mo | Custom |
| Compliance Reports | — | — | Yes | Yes |
| SSO/SAML | — | — | — | Yes |
| SLA | — | — | 99.5% | Custom |
| Support | Community | Same day | Dedicated | SLA-based |

---

## Flyto2 Differentiators (vs Backstage / Port / Security Scanners)

What makes Flyto2 Code unique as a developer portal:

1. **Zero config** — connect GitHub/GitLab and scan. No `catalog-info.yaml`, no plugin setup, no self-hosted infra required.
2. **Code Intelligence** — architecture analysis, API classification, module relationship graph, pattern detection — from the same scanner that finds CVEs.
3. **Closed-loop verification** — security scanners report findings; Flyto2 proves them with real browser probes and honest verdicts (confidence + verification method).
4. **Bitsight-style Health Scoring** — A-F grade, project-type-aware dimensions, CVE penalty curve. Consistent across every page because the engine owns the math.
5. **CTO War Room** — 9-section dashboard (Architecture / Security / Resources / Cloud / Apps / CI-CD / Testing / Docs / Analytics), not just a list of issues.
6. **SSE Live Events** — zero-polling, org-scoped event stream drives all UI updates.
7. **AI Fix Plan** — week-bucketed remediation roadmap, Markdown export, server-side caching.
8. **MCP Server** — flyto-indexer as AI-native code intelligence (search, impact, audit, task, structure).
9. **Pentest-as-Code** — YAML-defined pentest workflows, extensible by user.
10. **Cross-Repo Analysis** — monorepo-aware scanning, shared dependency drift detection.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        flyto-code (React)                    │
│  Dashboard │ Issues │ Repos │ DAST │ Runtime │ Compliance    │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST API
┌──────────────────────────▼──────────────────────────────────┐
│                     flyto-engine (Go)                        │
│  Auth │ Orgs │ Scans │ CVE │ CSPM │ Runtime │ Audit │ API   │
│                                                              │
│  PostgreSQL ◄──── store ────► Cloud Tasks (scan queue)       │
└──────┬───────────────────────────────┬──────────────────────┘
       │ spawn                         │ execute
┌──────▼──────────┐          ┌────────▼─────────────────────┐
│  flyto-indexer  │          │     flyto-core (Worker)       │
│  (Python, MCP)  │          │  Playwright + pentest YAML    │
│                 │          │  + LLM analysis               │
│  SCA, SAST,     │          │                               │
│  Secrets, Taint,│          │  12 pentest workflows         │
│  License, SBOM  │          │  + security_audit.yaml        │
└─────────────────┘          └───────────────────────────────┘

┌───────────────────────┐    ┌───────────────────────────────┐
│  flyto-runtime-node   │    │  flyto-guard                  │
│  flyto-runtime-python │    │  CLI malware blocker          │
│  (App-embedded SDK)   │    │  npm/pip install hook          │
└───────────────────────┘    └───────────────────────────────┘

┌───────────────────────┐
│  flyto-vscode         │
│  IDE security alerts  │
│  + MCP integration    │
└───────────────────────┘
```
