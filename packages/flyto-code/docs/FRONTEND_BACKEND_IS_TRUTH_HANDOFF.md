# Frontend Claude Handoff: Backend-Is-Truth Rules

## Core Contract

Backend response is the source of truth. The frontend renders what the backend returns. The frontend must not recompute product logic.

- Do not join "this domain has finding X" in the frontend. Use backend-provided `resource_id` joins.
- Do not compute `health_score`, `blast_radius`, or `tier` in the frontend. Backend is source of truth.
- Do not decide "actionable vs info" in the frontend. Backend provides `current_tier`.
- Do not calculate SLA breach or MTTR aggregation in the frontend.
- Do not cross-table join by comparing domain/value strings.
- Do not deduplicate observations to decide whether something should be shown. Backend gating already made that decision.

## Prefer Kernel-Backed Endpoints

Legacy endpoints may be read in parallel temporarily while parity is not 100%, but any cross-surface view must use kernel-backed endpoints.

| Page | Use | Do Not Use |
| --- | --- | --- |
| Asset Map | `GET /asset-map/kernel` | `attack-surface`, `pentests` single-table reads |
| External Posture | `GET /external-posture/kernel` | legacy `external-posture` |
| Footprint full universe | `GET /footprint/surface` | `footprint/graph`, which only sees the footprint table |
| Cancel scan | `POST /discoveries/{projectID}/cancel` | frontend timeouts |
| Active scans | `GET /discoveries/active` | local component state guesses |

## Frontend Responsibilities

- Render backend responses into UI.
- Locale translation through `flyto-i18n`.
- Interactions: click, hover, focus mode.
- Visual presentation: color mapping, animation, layout.
- Loading and error states.
- Routing and form validation for input format only, not business rules.

## When Data Does Not Match

File a backend bug instead of adding frontend compensation logic.

- Page needs a 3-source join but backend does not provide it: backend adds an endpoint.
- Missing badges: backend response adds fields.
- Weird sort order: backend changes `ORDER BY` or adds a query param.

## Backend Fields To Trust

Do not derive these in the frontend:

- `resource_id`: cross-surface unique ID. Never join by domain string.
- `current_tier`: `confirmed`, `candidate`, `weak`, `rejected`, `unranked`.
- `current_status`: backend-owned lifecycle/status.
- `score`, `grade`, `risk`, `blast_radius`: backend canonical values.
- `sources`, `relationships`, `findings`, `owners`, `evidence`: backend-prejoined view data.

## Pull These Client-Side Patterns Into Backend

### 1. Cross-Table Join

Current pattern to remove:

```ts
const rows = useMemo(
  () => buildDomainRows(surfaceData?.assets, pentestData?.projects, postureData?.domains),
  [surfaceData, pentestData, postureData],
)
```

Replacement:

```ts
const { data } = useQuery({
  queryKey: ['external-posture-kernel', org?.id],
  queryFn: () => getExternalPostureKernel(org!.id),
})
```

`data.assets` should already be joined:

```ts
[{ resource_id, type, sources, score }]
```

Expected result: remove two fetches and delete `buildDomainRows.ts`.

### 2. Score, Grade, Risk Derivation

Remove all frontend derivations:

```ts
const score = calculate(metrics)
const grade = score >= 80 ? 'A' : ...
```

Use backend fields directly:

```ts
backend.score
backend.grade
backend.current_tier
```

### 3. Filter, Sort, Aggregate

Remove frontend business filtering/sorting/aggregation:

```ts
data.filter(d => d.severity === 'high').sort(...)
```

Use backend query params:

```ts
getX({ severity: 'high', sort: 'priority_desc' })
```

## Pages To Switch Now

Backend kernel endpoints are already live enough. Frontend does not need to wait for R5.

| Page | Current Client Logic | Switch To |
| --- | --- | --- |
| `/domains` | `attack-surface` + `pentests` + `posture`, three fetches plus `buildDomainRows` | `/external-posture/kernel` |
| `/asset-map` | Confirm current reader, likely legacy/mixed | `/asset-map/kernel` |
| `/footprint` 3D | `/footprint/graph`, only footprint table | `/footprint/surface`, union across tables |
| Scanning chip | local state guess | `/discoveries/active` |
| External Posture | legacy `/external-posture` | `/external-posture/kernel` |

Each page should be one PR.

Each PR must:

- Delete client-side join, compute, filter, and aggregate logic.
- Switch to the kernel-backed endpoint.
- File backend bugs for missing fields. Do not patch over missing data in the frontend.
- Reduce net code and fetch count. Expected shape is one backend fetch instead of two or three.

## Pages Not Ready Yet

Do not switch these until backend endpoints exist. Switching now will produce empty or incomplete UI.

| Page | Reason |
| --- | --- |
| `/attack-paths` | No kernel endpoint yet. R2 pending. |
| `/findings` / `/issues` | Still on legacy `external_issue_tracker` reader. |
| `/pentests` list | No kernel endpoint yet. |
| `/dashboard` widgets | Individual queries, no unified summary endpoint yet. |
| `/score-trends` | Time-series data, no kernel timeseries endpoint yet. |

## Recommended First PR

Start with `/domains`.

Reason: operators open it constantly, and it currently pays the highest complexity cost with `buildDomainRows`. Switching it to `/external-posture/kernel` should remove the most client-side glue and give the most visible performance and correctness improvement.

## Relationship Graph Direction

The moat is not a single table. It is shared kernel identity across four surfaces plus a relationship graph and blast-radius impact analysis.

Relationship examples:

- `repo` references `domain`
- `subdomain` belongs to `domain`
- `domain` has_finding `external_finding`
- `repo` has_finding `code_finding`
- `cloud_resource` has_finding `cloud_finding`
- `repo` builds `container_image`
- `container_image` contains `package`
- `container_image` has_finding `cve_instance`
- `container_image` deployed_as `container_workload`
- `container_workload` runs_on `cloud_resource`
- `container_workload` exposes `subdomain`

## R5 Blast Radius / Impact Engine

Goal: move from "we have a graph" to "we can calculate impact."

Core engine:

- Input: any `resource_id`.
- Walk relationships up to configurable depth.
- Classify impact paths:
  - `external_exposure`
  - `code_origin`
  - `cloud_runtime`
  - `data_access`
  - `identity_access`
  - `customer_facing`
- Output:
  - affected resources
  - owners
  - findings
  - severity amplification
  - recommended fix order

Examples:

- domain -> cloud workload -> container image -> repo -> package CVE
- secret finding -> repo -> image -> workload -> public domain
- public bucket -> IAM role -> workload -> exposed service
- vulnerable package -> image -> workload -> customer-facing domain

## UI Roadmap

R5 backend alone is not the product. UI must ship with it.

Asset Map v2:

- Every node shows surface badges:
  - External
  - Code
  - Cloud
  - Container
- Selecting one resource shows a 1-hop blast preview.
- Right-side panel includes:
  - identity
  - evidence
  - findings
  - relationships
  - owners
  - last seen
- Do not force the entire graph into 3D. Start with grouped 2D/3D hybrid:
  - center selected entity
  - ring 1: direct relations
  - ring 2: impacted systems
  - filters by surface, risk, confidence

## Commercial Validation

R5 complete means backend can be sold.

R5 plus UI plus one paid or pilot customer means product.

For Nan Shan / first customer, validate:

1. They actually care about a cross-surface asset map.
2. They are willing to use this graph to prioritize remediation.
3. They are willing to pay for blast radius and owner mapping.

## Priority Order

P0:

- Complete External R1 cleanup deploy and parity.
- Do not break production.

P1:

- R1 Code: `connected_repos` -> `WriteEntity`.
- Add repo references domain relationship.

P2:

- Cloud R0/R1 schema:
  - `cloud_accounts`
  - `cloud_resources`
  - `cloud_findings`
  - `cloud_observations`

P3:

- Container R0/R1 schema:
  - `container_images`
  - `container_workloads`
  - `container_findings`

P4:

- R2 Asset Map reader convergence.

P5:

- R4 relationship writers.

P6:

- R5 blast radius engine plus UI.

## Decision

First finish External R1 cleanly, then connect Code R1 `connected_repos`.

Cloud and Container do not need feature work immediately, but their schema boundaries should be defined early.

The frontend should immediately start the five page migrations above. Begin with `/domains`.
