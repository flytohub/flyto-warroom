/**
 * Unit tests for the SSE event → React Query invalidation routing.
 *
 * The engine emits `verify.terminal` when a verify job finishes. The drawer
 * + recent-verifications list rely on that event to refresh without
 * polling. If `handleEvent` drifts from the engine's event taxonomy, the
 * UI silently goes stale.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { handleEvent, __resetDiscoveryThrottle } from '../useOrgEvents'
import { subscribePipelineEvents } from '@lib/cloud/pipelineEvents'

function makeClient() {
  const qc = new QueryClient()
  const spy = vi.spyOn(qc, 'invalidateQueries')
  return { qc, spy }
}

describe('useOrgEvents / handleEvent', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // The discovery heavy-surface invalidation is throttled via
    // module-level state; clear it so cases don't leak the window.
    __resetDiscoveryThrottle()
  })

  it('verify.terminal invalidates repo-verifications and the specific execution', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 1,
      workspaceId: 'org-1',
      type: 'verify.terminal',
      payload: { execution_id: 'exec-42' },
      timestamp: 't',
    })

    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['repo-verifications'])
    expect(keys).toContainEqual(['workflow-execution', 'exec-42'])
  })

  it('verify.dispatched also invalidates repo-verifications', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 2,
      workspaceId: 'org-1',
      type: 'verify.dispatched',
      payload: { execution_id: 'exec-99' },
      timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['repo-verifications'])
    expect(keys).toContainEqual(['workflow-execution', 'exec-99'])
  })

  it('verify.terminal with no payload still invalidates the list', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 3,
      workspaceId: 'org-1',
      type: 'verify.terminal',
      timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['repo-verifications'])
    // No execution_id → no second call.
    expect(keys.filter(k => Array.isArray(k) && k[0] === 'workflow-execution')).toHaveLength(0)
  })

  it('unknown event types are no-ops', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 4,
      workspaceId: 'org-1',
      type: 'some.future.event',
      timestamp: 't',
    })
    expect(spy).not.toHaveBeenCalled()
  })

  it('threatintel.refresh invalidates the full darkweb query loop', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 401,
      workspaceId: 'org-1',
      type: 'threatintel.refresh',
      payload: { catalog: 'ransomware', count: 12 },
      timestamp: 't',
    })

    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['threat-actors'])
    expect(keys).toContainEqual(['malware-families'])
    expect(keys).toContainEqual(['ransomware'])
    expect(keys).toContainEqual(['ioc-lookup'])
    expect(keys).toContainEqual(['sensor-map'])
    expect(keys).toContainEqual(['sensor-observations'])
    expect(keys).toContainEqual(['threat-intel-feed-status'])
    expect(keys).toContainEqual(['ioc-feed-status'])
    expect(keys).toContainEqual(['ioc-manager-stats'])
    expect(keys).toContainEqual(['threat-actors-manager'])
    expect(keys).toContainEqual(['malware-manager'])
    expect(keys).toContainEqual(['ransomware-manager'])
    expect(keys).toContainEqual(['footprint-threat-seed', 'org-1'])
  })

  it('scan.complete invalidates scan-related caches', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 5,
      workspaceId: 'org-1',
      type: 'scan.complete',
      payload: { repo_id: 'r-1' },
      timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    // At least one scan/health/profile invalidation should fire.
    expect(keys.some(k => Array.isArray(k) && ['health', 'profile', 'scans'].includes(k[0] as string)))
      .toBe(true)
    expect(keys).toContainEqual(['healthSummary', 'org-1'])
    expect(keys).toContainEqual(['computed-score', 'org-1'])
    expect(keys).toContainEqual(['score-events', 'org-1'])
    expect(keys).toContainEqual(['asset-evidence', 'org-1'])
    // GAP-ARCH-001: a finished code scan re-derives the arch map.
    expect(keys).toContainEqual(['arch-map', 'org-1'])
  })

  // GAP-ARCH-001: arch-map should only bust on scan.complete, not on the
  // other transitions in the shared scan.* block.
  it('scan.queued does NOT invalidate the arch map', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 22, workspaceId: 'org-1', type: 'scan.queued',
      payload: { repo_id: 'r-1' }, timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).not.toContainEqual(['arch-map', 'org-1'])
  })

  it('container.scan.complete invalidates container posture, findings, runs, and connections', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 40, workspaceId: 'org-1', type: 'container.scan.complete',
      payload: { org_id: 'org-1' }, timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['container-posture', 'org-1'])
    expect(keys).toContainEqual(['container-findings', 'org-1'])
    expect(keys).toContainEqual(['container-scan-runs', 'org-1'])
    expect(keys).toContainEqual(['container-connections', 'org-1'])
  })

  it('cloud.scan.complete invalidates cloud posture and CSPM findings', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 41, workspaceId: 'org-1', type: 'cloud.scan.complete',
      payload: { org_id: 'org-1' }, timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['cloud-posture', 'org-1'])
    expect(keys).toContainEqual(['cspm-findings', 'org-1'])
  })

  it('identity.scan.complete invalidates identity posture', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 42, workspaceId: 'org-1', type: 'identity.scan.complete',
      payload: { org_id: 'org-1' }, timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['identity-posture', 'org-1'])
  })

  it('remediation.changed invalidates remediation ledger, AutoFix, and Pulse', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 43,
      workspaceId: 'org-1',
      type: 'remediation.changed',
      payload: { plan_id: 'plan-1', run_id: 'run-1' },
      timestamp: 't',
    })

    const calls = spy.mock.calls.map(c => c[0] as { queryKey: unknown[]; exact?: boolean })
    const keys = calls.map(c => c.queryKey)
    expect(keys).toContainEqual(['remediation-targets', 'org-1'])
    expect(keys).toContainEqual(['remediation-plans', 'org-1'])
    expect(keys).toContainEqual(['remediation-runs', 'org-1'])
    expect(keys).toContainEqual(['remediation-artifacts', 'org-1'])
    expect(keys).toContainEqual(['autofix-findings', 'org-1'])
    expect(keys).toContainEqual(['pulse', 'org-1'])
    expect(calls.find(c => JSON.stringify(c.queryKey) === JSON.stringify(['remediation-plans', 'org-1']))?.exact)
      .toBe(false)
  })

  it('ai_patch.ready invalidates fix-plan and profile for the repo', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 6,
      workspaceId: 'org-1',
      type: 'ai_patch.ready',
      payload: { repo_id: 'r-42' },
      timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['fix-plan', 'r-42'])
    expect(keys).toContainEqual(['profile', 'r-42'])
  })

  it('mcp.event.ingested invalidates MCP overview, evidence, egress risk, and AI governance score', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 6,
      workspaceId: 'org-1',
      type: 'mcp.event.ingested',
      payload: { event_id: 'mcp-evt-1' },
      timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['mcp-overview', 'org-1'])
    expect(keys).toContainEqual(['mcp-egress', 'org-1'])
    expect(keys).toContainEqual(['mcp-evidence', 'org-1'])
    expect(keys).toContainEqual(['ai-governance-score', 'org-1'])
    expect(keys).toContainEqual(['ai-governance-events', 'org-1'])
    expect(keys).toContainEqual(['computed-score', 'org-1'])
    expect(keys).toContainEqual(['unified-score-history', 'org-1'])
    expect(keys).toContainEqual(['score-events', 'org-1'])
    expect(keys).toContainEqual(['pulse', 'org-1'])
  })

  it('ai_governance.changed invalidates AI governance register, timeline, score, and runtime evidence', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 63,
      workspaceId: 'org-1',
      type: 'ai_governance.changed',
      payload: { event_id: 'aigovevt-1', event_type: 'enforcement_block' },
      timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['ai-governance-score', 'org-1'])
    expect(keys).toContainEqual(['ai-governance-use-cases', 'org-1'])
    expect(keys).toContainEqual(['ai-governance-events', 'org-1'])
    expect(keys).toContainEqual(['mcp-overview', 'org-1'])
    expect(keys).toContainEqual(['mcp-evidence', 'org-1'])
    expect(keys).toContainEqual(['computed-score', 'org-1'])
    expect(keys).toContainEqual(['pulse', 'org-1'])
  })

  it('score.changed invalidates score, monitoring, posture, and pulse surfaces', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 61,
      workspaceId: 'org-1',
      type: 'score.changed',
      payload: { monitoring_event_id: 'me-1', from_score: 82, to_score: 65 },
      timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['monitoring-events', 'org-1', undefined])
    expect(keys).toContainEqual(['external-posture', 'org-1'])
    expect(keys).toContainEqual(['external-posture-kernel', 'org-1'])
    expect(keys).toContainEqual(['ctem-priorities', 'org-1'])
    expect(keys).toContainEqual(['pulse', 'org-1'])
    expect(keys).toContainEqual(['computed-score', 'org-1'])
    expect(keys).toContainEqual(['unified-score-history', 'org-1'])
    expect(keys).toContainEqual(['score-events', 'org-1'])
  })

  it('capabilities.changed invalidates capability-driven gates and settings caches', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 62,
      workspaceId: 'org-1',
      type: 'capabilities.changed',
      payload: { reason: 'member.role_changed' },
      timestamp: 't',
    })

    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['capabilities', 'org-1'])
    expect(keys).toContainEqual(['settings-manager', 'caps', 'org-1'])
    expect(keys).toContainEqual(['rbac-user-capabilities', 'org-1', undefined])
    expect(keys).toContainEqual(['orgs'])
  })

  it('ai_patch.ready with no repo_id is a safe no-op', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 7,
      workspaceId: 'org-1',
      type: 'ai_patch.ready',
      payload: {},
      timestamp: 't',
    })
    expect(spy).not.toHaveBeenCalled()
  })

  it('discovery.complete invalidates attack-surface and pentests', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 8,
      workspaceId: 'org-1',
      type: 'discovery.complete',
      timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['attack-surface', 'org-1'])
    expect(keys).toContainEqual(['external-posture', 'org-1'])
    expect(keys).toContainEqual(['external-posture-kernel', 'org-1'])
    expect(keys).toContainEqual(['external-issues', 'org-1'])
    expect(keys).toContainEqual(['brand-protection', 'org-1'])
    expect(keys).toContainEqual(['asset-map-kernel', 'org-1'])
    expect(keys).toContainEqual(['asset-coverage', 'org-1'])
    expect(keys).toContainEqual(['asset-evidence', 'org-1'])
    expect(keys).toContainEqual(['discoveries-active', 'org-1'])
    expect(keys).toContainEqual(['pentests', 'org-1'])
    expect(keys).toContainEqual(['computed-score', 'org-1'])
    expect(keys).toContainEqual(['score-events', 'org-1'])
    expect(keys).toContainEqual(['api-definitions', 'org-1'])
    expect(keys).toContainEqual(['arch-map', 'org-1'])
  })

  // ── scan lifecycle branches ──

  it('scan.queued invalidates healthSummary and issues', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 9, workspaceId: 'org-1', type: 'scan.queued',
      payload: { repo_id: 'r-1' }, timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['healthSummary', 'org-1'])
    expect(keys).toContainEqual(['issues', 'org-1'])
    expect(keys).toContainEqual(['asset-coverage', 'org-1'])
    expect(keys).toContainEqual(['repo-scans', 'r-1'])
  })

  it('scan.running invalidates per-repo caches', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 10, workspaceId: 'org-1', type: 'scan.running',
      payload: { repo_id: 'r-2' }, timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['repo-scans', 'r-2'])
    expect(keys).toContainEqual(['health', 'r-2'])
    expect(keys).toContainEqual(['profile', 'r-2'])
  })

  it('scan.failed invalidates the same caches as scan.complete', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 11, workspaceId: 'org-1', type: 'scan.failed',
      payload: { repo_id: 'r-3' }, timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['healthSummary', 'org-1'])
    expect(keys).toContainEqual(['repo-scans', 'r-3'])
  })

  // Pentest scans share the scan.* event topic but carry project_id
  // instead of repo_id. Without this branch the PentestView "Run
  // pentest" → "Running…" → "X findings" loop never closes; the
  // button stayed stuck on Running until staleTime fired.
  it('scan.complete with project_id refreshes pentest-scans for that project', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 20, workspaceId: 'org-1', type: 'scan.complete',
      payload: { project_id: 'pt-42', scan_type: 'dast' }, timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['pentest-scans', 'pt-42'])
    expect(keys).toContainEqual(['pentests', 'org-1'])
  })

  it('scan.queued with project_id flips the button to Running before the bg goroutine starts', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 21, workspaceId: 'org-1', type: 'scan.queued',
      payload: { project_id: 'pt-7', scan_type: 'dast' }, timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['pentest-scans', 'pt-7'])
  })

  it('scan.complete with no repo_id still invalidates org-level caches', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 12, workspaceId: 'org-1', type: 'scan.complete',
      timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['healthSummary', 'org-1'])
    expect(keys).toContainEqual(['issues', 'org-1'])
    // No repo-level invalidation without repo_id
    expect(keys.some(k => Array.isArray(k) && k[0] === 'repo-scans')).toBe(false)
  })

  // ── discovery branches ──

  it('discovery.started invalidates attack-surface', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 13, workspaceId: 'org-1', type: 'discovery.started',
      timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['attack-surface', 'org-1'])
    expect(keys).toContainEqual(['external-posture', 'org-1'])
    expect(keys).toContainEqual(['external-posture-kernel', 'org-1'])
    expect(keys).toContainEqual(['external-issues', 'org-1'])
    expect(keys).toContainEqual(['brand-protection', 'org-1'])
    expect(keys).toContainEqual(['asset-map-kernel', 'org-1'])
    expect(keys).toContainEqual(['asset-coverage', 'org-1'])
    expect(keys).toContainEqual(['asset-evidence', 'org-1'])
    expect(keys).toContainEqual(['discoveries-active', 'org-1'])
  })

  it('discovery.step invalidates attack-surface (first step of a window)', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 14, workspaceId: 'org-1', type: 'discovery.step',
      timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['attack-surface', 'org-1'])
    expect(keys).toContainEqual(['external-posture', 'org-1'])
    expect(keys).toContainEqual(['external-posture-kernel', 'org-1'])
    expect(keys).toContainEqual(['external-issues', 'org-1'])
    expect(keys).toContainEqual(['brand-protection', 'org-1'])
    expect(keys).toContainEqual(['asset-map-kernel', 'org-1'])
    expect(keys).toContainEqual(['asset-coverage', 'org-1'])
    expect(keys).toContainEqual(['asset-evidence', 'org-1'])
    expect(keys).toContainEqual(['discoveries-active', 'org-1'])
    expect(keys).toContainEqual(['pentests', 'org-1'])
  })

  it('discovery.step coalesces heavy refetches within the throttle window', () => {
    // A re-discovery sweep fires hundreds of steps in seconds. The heavy
    // 1.2 MB attack-surface refetch must fire at most once per window so
    // the Domains list doesn't flicker — but the cheap progress chip
    // (discoveries-active) must still refresh on every step.
    const { qc, spy } = makeClient()
    const fire = (id: number) => handleEvent(qc, 'org-1', {
      id, workspaceId: 'org-1', type: 'discovery.step', timestamp: 't',
    })
    fire(20); fire(21); fire(22); fire(23)

    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    const count = (k: unknown[]) =>
      keys.filter(x => JSON.stringify(x) === JSON.stringify(k)).length
    // Heavy surface: only the first step flushed it.
    expect(count(['attack-surface', 'org-1'])).toBe(1)
    expect(count(['external-posture-kernel', 'org-1'])).toBe(1)
    // Cheap progress surfaces: every step.
    expect(count(['discoveries-active', 'org-1'])).toBe(4)
  })

  it('discovery.complete force-flushes heavy surfaces even mid-window', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 30, workspaceId: 'org-1', type: 'discovery.step', timestamp: 't',
    })
    spy.mockClear()
    // A step immediately after would be throttled; complete must NOT be.
    handleEvent(qc, 'org-1', {
      id: 31, workspaceId: 'org-1', type: 'discovery.complete', timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['attack-surface', 'org-1'])
    expect(keys).toContainEqual(['external-posture-kernel', 'org-1'])
    expect(keys).toContainEqual(['brand-protection', 'org-1'])
    expect(keys).toContainEqual(['asset-coverage', 'org-1'])
  })

  // ── Footprint expansion branches ──

  it('footprint.entity.found invalidates live progress caches', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 30,
      workspaceId: 'org-1',
      type: 'footprint.entity.found',
      timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['footprint-latest-run', 'org-1'])
    expect(keys).toContainEqual(['footprint-graph', 'org-1'])
    expect(keys).toContainEqual(['footprint-timeseries', 'org-1'])
    expect(keys).toContainEqual(['footprint-actionable', 'org-1'])
  })

  it('footprint.run.finalized invalidates Footprint closure and downstream consumers', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 31,
      workspaceId: 'org-1',
      type: 'footprint.run.finalized',
      timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['footprint-candidate-paths', 'org-1'])
    expect(keys).toContainEqual(['boy-attack-path-candidates', 'org-1'])
    expect(keys).toContainEqual(['boy-attack-path-candidate-detail', 'org-1'])
    expect(keys).toContainEqual(['boy-validation-tasks', 'org-1'])
    expect(keys).toContainEqual(['footprint-surface', 'org-1'])
    expect(keys).toContainEqual(['footprint-surface-evidence', 'org-1'])
    expect(keys).toContainEqual(['footprint-threat-seed', 'org-1'])
    expect(keys).toContainEqual(['asset-evidence', 'org-1'])
    expect(keys).toContainEqual(['footprint-narrative', 'org-1'])
    expect(keys).toContainEqual(['posture-headline', 'org-1'])
    expect(keys).toContainEqual(['pentest-suggested-targets', 'org-1'])
    expect(keys).toContainEqual(['attack-surface', 'org-1'])
    expect(keys).toContainEqual(['asset-map-kernel', 'org-1'])
    expect(keys).toContainEqual(['asset-coverage', 'org-1'])
    expect(keys).toContainEqual(['brand-protection', 'org-1'])
    expect(keys).toContainEqual(['brand-manager-visual-sim', 'org-1'])
    expect(keys).toContainEqual(['visual-similarity', 'org-1'])
    expect(keys).toContainEqual(['ctem-priorities', 'org-1'])
  })

  it('footprint.breakthrough.updated invalidates BOY breakthrough closure', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 32,
      workspaceId: 'org-1',
      type: 'footprint.breakthrough.updated',
      timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['boy-attack-path-candidates', 'org-1'])
    expect(keys).toContainEqual(['boy-attack-path-candidate-detail', 'org-1'])
    expect(keys).toContainEqual(['boy-breakthrough-paths', 'org-1'])
    expect(keys).toContainEqual(['boy-breakthrough-path-detail', 'org-1'])
    expect(keys).toContainEqual(['research-footprint', 'org-1'])
    expect(keys).toContainEqual(['boy-validation-tasks', 'org-1'])
    expect(keys).toContainEqual(['footprint-graph', 'org-1'])
  })

  it('pipeline.progress refreshes the platform pipeline closure', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 32,
      workspaceId: 'org-1',
      type: 'pipeline.progress',
      payload: { phase: 'phase2.complete' },
      timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['footprint-candidate-paths', 'org-1'])
    expect(keys).toContainEqual(['footprint-surface', 'org-1'])
    expect(keys).toContainEqual(['footprint-company-scope', 'org-1'])
    expect(keys).toContainEqual(['footprint-threat-seed', 'org-1'])
    expect(keys).toContainEqual(['asset-evidence', 'org-1'])
    expect(keys).toContainEqual(['pentest-suggested-targets', 'org-1'])
    expect(keys).toContainEqual(['pentests', 'org-1'])
    expect(keys).toContainEqual(['api-definitions', 'org-1'])
    expect(keys).toContainEqual(['arch-map', 'org-1'])
    expect(keys).toContainEqual(['asset-coverage', 'org-1'])
    expect(keys).toContainEqual(['pulse', 'org-1'])
  })

  it('pipeline.failed refreshes the same platform pipeline closure', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 35,
      workspaceId: 'org-1',
      type: 'pipeline.failed',
      payload: { phase: 'phase2.footprint', error: 'timeout' },
      timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['footprint-candidate-paths', 'org-1'])
    expect(keys).toContainEqual(['pentests', 'org-1'])
    expect(keys).toContainEqual(['api-definitions', 'org-1'])
    expect(keys).toContainEqual(['arch-map', 'org-1'])
    expect(keys).toContainEqual(['code-timeline', 'org-1', '', '', '', '', ''])
  })

  it('campaign_execution.updated refreshes red-team execution and runner status live', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 37,
      workspaceId: 'org-1',
      type: 'campaign_execution.updated',
      payload: { campaign_execution_id: 'exec-red-1', status: 'running' },
      timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['campaign-executions', 'org-1'])
    expect(keys).toContainEqual(['runner-status', 'org-1'])
    expect(keys).toContainEqual(['warroom-verification-runs', 'org-1'])
    expect(keys).toContainEqual(['warroom-verification-evidence', 'org-1', 'exec-red-1'])
    expect(keys).toContainEqual(['workflow-execution', 'exec-red-1'])
    expect(keys).toContainEqual(['code-timeline', 'org-1', '', '', '', '', ''])
  })

  it('campaign_budget.breach refreshes red-team budget incidents and policies live', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 38,
      workspaceId: 'org-1',
      type: 'campaign_budget.breach',
      payload: { incident_id: 'inc-1', policy_id: 'pol-1', threshold_type: 'hard' },
      timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['campaign-budget-incidents', 'org-1'])
    expect(keys).toContainEqual(['campaign-budget-policies', 'org-1'])
  })

  it('pipeline_run.phase is forwarded to the campaign pipeline observer', () => {
    const { qc } = makeClient()
    const seen: unknown[] = []
    const unsubscribe = subscribePipelineEvents(e => seen.push(e))
    try {
      handleEvent(qc, 'org-1', {
        id: 39,
        workspaceId: 'org-1',
        type: 'pipeline_run.phase',
        payload: { run_id: 'run-1', phase: 'verify', status: 'running' },
        timestamp: 't',
      })
    } finally {
      unsubscribe()
    }
    expect(seen).toEqual([{
      type: 'pipeline_run.phase',
      orgId: 'org-1',
      payload: { run_id: 'run-1', phase: 'verify', status: 'running' },
    }])
  })

  it('alert.resolved refreshes alert-derived triage, score, and evidence surfaces', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 36,
      workspaceId: 'org-1',
      type: 'alert.resolved',
      payload: { alert_id: 'alert-1', fingerprint: 'fp-1' },
      timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['alerts', 'org-1'])
    expect(keys).toContainEqual(['alerts', 'org-1', 'enriched'])
    expect(keys).toContainEqual(['issues', 'org-1'])
    expect(keys).toContainEqual(['enriched-issues', 'org-1'])
    expect(keys).toContainEqual(['ctem-priorities', 'org-1'])
    expect(keys).toContainEqual(['pulse', 'org-1'])
    expect(keys).toContainEqual(['healthSummary', 'org-1'])
    expect(keys).toContainEqual(['computed-score', 'org-1'])
    expect(keys).toContainEqual(['unified-finding', 'org-1'])
    expect(keys).toContainEqual(['unified-finding', 'org-1', 'fp-1'])
    expect(keys).toContainEqual(['alert-blast-graph', 'alert-1'])
    expect(keys).toContainEqual(['code-timeline', 'org-1', '', '', '', '', ''])
  })

  it.each(['finding.lifecycle', 'external_issue.updated'])('%s refreshes the full CTEM findings closure', (type) => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 37,
      workspaceId: 'org-1',
      type,
      payload: { finding_id: 'finding-1', fingerprint: 'fp-1', action: 'reconfirmed' },
      timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    const hasPrefix = (prefix: unknown[]) =>
      keys.some(k => Array.isArray(k) && prefix.every((part, index) => k[index] === part))

    expect(hasPrefix(['findings', 'org-1'])).toBe(true)
    expect(hasPrefix(['findings-facets', 'org-1'])).toBe(true)
    expect(hasPrefix(['finding-history', 'org-1'])).toBe(true)
    expect(hasPrefix(['finding-assets', 'org-1'])).toBe(true)
    expect(keys).toContainEqual(['findings', 'org-1', 'manager-rollup'])
    expect(keys).toContainEqual(['findings', 'org-1', 'manager-history'])
    expect(keys).toContainEqual(['external-issues', 'org-1'])
    expect(keys).toContainEqual(['ctem-priorities', 'org-1'])
    expect(keys).toContainEqual(['asset-coverage', 'org-1'])
    expect(keys).toContainEqual(['findings-overlay', 'org-1'])
    expect(keys).toContainEqual(['report-sources', 'org-1'])
    expect(keys).toContainEqual(['code-risk-matrix', 'org-1'])
  })

  it('company_scope.updated refreshes Footprint, coverage, brand, CTEM and report closure', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 38,
      workspaceId: 'org-1',
      type: 'company_scope.updated',
      payload: { source: 'company_scope_kb', scope_mode: 'both' },
      timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    const hasPrefix = (prefix: unknown[]) =>
      keys.some(k => Array.isArray(k) && prefix.every((part, index) => k[index] === part))

    expect(keys).toContainEqual(['footprint-surface', 'org-1'])
    expect(keys).toContainEqual(['footprint-threat-seed', 'org-1'])
    expect(keys).toContainEqual(['asset-coverage', 'org-1'])
    expect(keys).toContainEqual(['brand-protection', 'org-1'])
    expect(keys).toContainEqual(['ctem-priorities', 'org-1'])
    expect(keys).toContainEqual(['report-sources', 'org-1'])
    expect(keys).toContainEqual(['computed-score', 'org-1'])
    expect(keys).toContainEqual(['code-risk-matrix', 'org-1'])
    expect(hasPrefix(['findings', 'org-1'])).toBe(true)
    expect(hasPrefix(['finding-history', 'org-1'])).toBe(true)
  })

  it('integration.expired refreshes the integration health banner immediately', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 33,
      workspaceId: 'org-1',
      type: 'integration.expired',
      timestamp: 't',
    })
    const keys = spy.mock.calls.map(c => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['integration-health', 'org-1'])
  })

  it('activity.logged is intentionally ignored by flyto-code pages', () => {
    const { qc, spy } = makeClient()
    handleEvent(qc, 'org-1', {
      id: 34,
      workspaceId: 'org-1',
      type: 'activity.logged',
      timestamp: 't',
    })
    expect(spy).not.toHaveBeenCalled()
  })
})
