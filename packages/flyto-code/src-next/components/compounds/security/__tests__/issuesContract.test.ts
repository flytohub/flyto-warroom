/**
 * issues.ts ↔ engine contract guard (P2-10)
 * ------------------------------------------------------------------
 * IssuesView renders directly off the field shape declared in
 * `lib/engine/code/issues.ts`. If the engine renames / drops a field
 * the UI reads (e.g. `repo_name`, `fingerprint`, an enriched signal,
 * or a `counts` bucket), nothing throws — the cell just renders blank
 * and the regression ships silently.
 *
 * This is a TYPE-LEVEL pin: it lists every field the IssuesView UI
 * depends on and asserts the engine types still carry it. A future
 * shape change (field renamed/removed, or its type narrowed) fails
 * `tsc` / `vitest` here instead of rendering an empty table.
 *
 * Uses `import type` only — the module is never executed, so this
 * stays free of the engine client's firebase/env runtime deps and
 * needs no alias mocks.
 */
import { describe, it, expect, expectTypeOf } from 'vitest'
import type {
  SecurityIssue,
  EnrichedSecurityIssue,
  EnrichedIssuesResponse,
  PRRef,
  TaintRef,
  PentestRef,
} from '@lib/engine/code/issues'

// ── Helper: a value satisfying T means every required key is present
//    with an assignable type. Drop/rename a field upstream → this
//    object stops satisfying the type → compile error. ──

describe('issues.ts engine contract', () => {
  it('SecurityIssue keeps the base fields IssuesView renders', () => {
    // Every field the table cells + enrichment chips read off a row.
    const row = {
      id: 'i-1',
      type: 'cve',
      severity: 'CRITICAL',
      title: 'CVE-2024-1',
      description: 'desc',
      fingerprint: 'fp-1',
      repo_id: 'r-1',
      repo_name: 'org/repo',
      status: 'open',
      source: 'osv',
      // optional CVE + enrichment fields the row conditionally renders
      package: 'lodash',
      version: '4.17.20',
      fixed_in: '4.17.21',
      cve_id: 'CVE-2024-1',
      references: ['https://example.test'],
      published_at: '2024-01-01T00:00:00Z',
      epss: 0.42,
      in_kev: true,
      external_exposed: true,
      risk_score: 88,
    } satisfies Partial<SecurityIssue>
    expect(row.repo_name).toBe('org/repo')

    // Pin the exact keys the UI reads as required (compile-time).
    expectTypeOf<SecurityIssue>().toHaveProperty('id').toBeString()
    expectTypeOf<SecurityIssue>().toHaveProperty('type').toBeString()
    expectTypeOf<SecurityIssue>().toHaveProperty('severity').toBeString()
    expectTypeOf<SecurityIssue>().toHaveProperty('title').toBeString()
    expectTypeOf<SecurityIssue>().toHaveProperty('description').toBeString()
    expectTypeOf<SecurityIssue>().toHaveProperty('fingerprint').toBeString()
    expectTypeOf<SecurityIssue>().toHaveProperty('repo_id').toBeString()
    expectTypeOf<SecurityIssue>().toHaveProperty('repo_name').toBeString()
    expectTypeOf<SecurityIssue>().toHaveProperty('status').toBeString()
  })

  it('EnrichedSecurityIssue keeps the cross-dim signals ContextStrip reads', () => {
    const enriched = {
      id: 'i-1', type: 'cve', severity: 'HIGH', title: 't', description: 'd',
      fingerprint: 'fp', repo_id: 'r', repo_name: 'org/r', status: 'open', source: 'osv',
      blast_radius: 75,
      open_prs_touching: [{ number: 128 }] as PRRef[],
      taint_adjacency: { categories: ['sqli'] } as TaintRef,
      autofix_eligible: true,
      pentest_verdict: { project_id: 'p-1' } as PentestRef,
    } satisfies Partial<EnrichedSecurityIssue>
    expect(enriched.blast_radius).toBe(75)

    expectTypeOf<EnrichedSecurityIssue>().toHaveProperty('blast_radius')
    expectTypeOf<EnrichedSecurityIssue>().toHaveProperty('open_prs_touching')
    expectTypeOf<EnrichedSecurityIssue>().toHaveProperty('taint_adjacency')
    expectTypeOf<EnrichedSecurityIssue>().toHaveProperty('autofix_eligible')
    expectTypeOf<EnrichedSecurityIssue>().toHaveProperty('pentest_verdict')
  })

  it('counts carries every lifecycle bucket the tab badges show', () => {
    // IssuesView reads counts.open / snoozed / ignored / solved / total
    // straight onto the tab chips. The engine computes these over ALL
    // issues (ignoring severity/type/repo filters) — handlers_issues.go
    // #applyIssueFilters — so the badges stay stable when the table is
    // server-narrowed. Pin all five buckets so a dropped one fails here.
    const counts = {
      open: 1, snoozed: 2, ignored: 3, solved: 4, total: 10,
    } satisfies EnrichedIssuesResponse['counts']
    expect(counts.open + counts.snoozed + counts.ignored + counts.solved).toBe(10)

    expectTypeOf<EnrichedIssuesResponse['counts']>().toHaveProperty('open').toBeNumber()
    expectTypeOf<EnrichedIssuesResponse['counts']>().toHaveProperty('snoozed').toBeNumber()
    expectTypeOf<EnrichedIssuesResponse['counts']>().toHaveProperty('ignored').toBeNumber()
    expectTypeOf<EnrichedIssuesResponse['counts']>().toHaveProperty('solved').toBeNumber()
    expectTypeOf<EnrichedIssuesResponse['counts']>().toHaveProperty('total').toBeNumber()
  })
})
