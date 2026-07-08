import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ProductVerificationView } from '../ProductVerificationView'

const engineMocks = vi.hoisted(() => ({
  listWarroomVerificationRuns: vi.fn(),
  createWarroomVerificationRun: vi.fn(),
  getWarroomVerificationEvidence: vi.fn(),
  getEventScope: vi.fn(),
  listProductVerificationScanner: vi.fn(),
  patchProductVerificationScanner: vi.fn(),
  runProductVerificationScannerNow: vi.fn(),
}))

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1', name: 'Flyto2', isAdmin: true } }),
}))

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

vi.mock('@atoms/FlytoPageHeader', () => ({
  FlytoPageHeader: ({ title, subtitle }: { title: string; subtitle: string }) => (
    <header>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  ),
}))

vi.mock('@lib/engine', () => ({
  listWarroomVerificationRuns: engineMocks.listWarroomVerificationRuns,
  createWarroomVerificationRun: engineMocks.createWarroomVerificationRun,
  getWarroomVerificationEvidence: engineMocks.getWarroomVerificationEvidence,
  getEventScope: engineMocks.getEventScope,
  listProductVerificationScanner: engineMocks.listProductVerificationScanner,
  patchProductVerificationScanner: engineMocks.patchProductVerificationScanner,
  runProductVerificationScannerNow: engineMocks.runProductVerificationScannerNow,
}))

function renderView() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={qc}>
      <ProductVerificationView />
    </QueryClientProvider>,
  )
}

describe('ProductVerificationView', () => {
  beforeEach(() => {
    engineMocks.listWarroomVerificationRuns.mockResolvedValue({
      ok: true,
      graph_contract: 'warroom.product_verification.v1',
      runs: [{
        id: 'run-1',
        orgId: 'org-1',
        repoId: 'repo-customer-shop',
        targetUrl: 'https://checkout.customer.example',
        playbookId: 'warroom-deterministic-audit',
        allowedTargets: 'https://checkout.customer.example\nhttps://api.customer.example',
        dryRun: true,
        status: 'failed',
        verdict: 'blocked',
        findingsCount: 1,
        criticalCount: 1,
        errorMessage: 'scope is empty',
        evidenceSig: 'sha256:evidence',
        runnerExecutionId: 'exec-1',
        createdAt: '2026-06-23T10:00:00Z',
        updatedAt: '2026-06-23T10:01:00Z',
      }],
    })
    engineMocks.createWarroomVerificationRun.mockResolvedValue({
      ok: true,
      graph_contract: 'warroom.product_verification.v1',
      scope_source: 'repo',
      target_host: 'checkout.customer.example',
      workflow: { playbook_id: 'warroom-deterministic-audit', campaign_id: 'campaign-1' },
      run: { id: 'run-2' },
    })
    engineMocks.getWarroomVerificationEvidence.mockResolvedValue({
      ok: true,
      graphContract: 'warroom.product_verification.v1',
      runId: 'run-1',
      runnerExecutionId: 'exec-1',
      evidenceSig: 'sha256:evidence',
      gateVerdict: 'blocked',
      gateScore: 72.5,
      scoreBreakdown: {
        route_reachable_coverage: { points: 14.5, max: 20, value: 0.73, threshold: 0.85 },
        replay_reliability: { points: 20, max: 20, value: 1, threshold: 0.95 },
        live_operation_loop: { points: 0, max: 15, complete: false },
      },
      artifactCompleteness: {
        required: ['screenshot', 'dom_snapshot', 'network_log'],
        present: ['screenshot', 'network_log'],
        missing: ['dom_snapshot'],
        complete: false,
        score: 0.67,
      },
      gateBlockers: ['reachable_coverage_below_85:73%', 'missing_artifacts:dom_snapshot'],
      evidencePack: {
        verdict: 'fail',
        automation_test_model: {
          schema_version: 'flyto.core.deterministic_verification.v1',
          legacy_schema_version: 'warroom.automation_test_model.v1',
          product_contract: 'flyto2.automated_product_testing.v1',
          product_surface: 'warroom',
          capability: 'automated_product_testing',
          engine_mode: {
            name: 'Deterministic Verification Runtime',
            execution_mode: 'deterministic_evidence_first',
            llm_required: false,
            llm_role: 'optional_evidence_reviewer',
            fact_source: 'browser_dom_network_screenshot_sse',
            gate_authority: 'deterministic_evidence_gate',
            human_editable_yaml: true,
          },
          deterministic_contract: {
            inputs: ['site_graph', 'intent_graph', 'state_graph', 'api_graph', 'yaml_replay', 'browser_artifacts', 'event_stream'],
            outputs: ['evidence_pack', 'gate_verdict', 'readiness_score', 'state_contradictions', 'ghost_api_findings', 'replay_evidence'],
            llm_can_create_facts: false,
            llm_can_gate: false,
          },
          readiness_score: 86,
          coverage: {
            observed_paths: ['/'],
            reachable_paths: ['/', '/settings/sso'],
            expected_paths: ['/', '/settings/sso', '/billing'],
            blocked_paths: ['/settings/sso', '/billing'],
            observed_coverage: 1,
            reachable_coverage: 0.5,
            expected_coverage: 0.333,
          },
          intent_graph: {
            count: 1,
            intents: [{ id: 'run_verification', verb: 'run', object: 'verification' }],
          },
          scenario_synthesis: {
            schema_version: 'warroom.scenarios.v1',
            name: 'Customer checkout deterministic verification',
            step_count: 2,
            replayable_steps: 2,
            generated_from: 'warroom.site_graph.v1',
          },
          replay: {
            ok: true,
            total: 2,
            passed: 2,
            failed: 0,
            reliability: 1,
            steps: [
              {
                id: 'page_1_goto',
                module: 'browser.goto',
                status: 'passed',
                severity: 'P1',
                duration_ms: 42,
              },
              {
                id: 'page_1_dom_assert',
                module: 'browser.evaluate',
                status: 'passed',
                severity: 'P0',
                duration_ms: 12,
                assertions: [{ path: 'result.text_chars', passed: true, severity: 'P0' }],
              },
            ],
          },
          ghost_api: {
            type_a_count: 1,
            type_b_count: 1,
            type_c_count: 0,
            type_a: [{ id: 'api_1', method: 'POST', url: 'https://checkout.customer.example/api/run', status: 200 }],
            type_b: [{ id: 'api_2', method: 'POST', url: 'https://checkout.customer.example/api/invite', status: 200 }],
            type_c: [],
            has_findings: true,
          },
          deterministic_rules: {
            required: ['false_empty', 'false_locked', 'hidden_error', 'ghost_api_type_a', 'ghost_api_type_b', 'ghost_api_type_c', 'state_contradiction', 'rbac_fail_open'],
            counts: {
              false_empty: 1,
              false_locked: 0,
              hidden_error: 1,
              ghost_api_type_a: 1,
              ghost_api_type_b: 1,
              ghost_api_type_c: 0,
              state_contradiction: 1,
              rbac_fail_open: 0,
            },
            samples: {},
            has_blockers: true,
          },
          business_invariants: {
            state_contradictions: 1,
            p0: 1,
            p1: 2,
            findings: [{
              type: 'state_contradiction',
              severity: 'P0',
              message: 'API credits=0 but Run is enabled',
            }],
          },
          rbac_matrix: {
            status: 'engine_authorization_gate',
            authority: 'flyto-engine',
            source: 'flyto-engine.requireOrgAccess+requireCommercialAction+verified_scope',
            action: 'scan:trigger',
            roles_required: ['owner', 'admin', 'member', 'viewer'],
            role_expectations: {
              owner: 'allow',
              admin: 'allow',
              member: 'allow',
              viewer: 'deny',
            },
            roles_tested: ['owner', 'admin', 'member', 'viewer'],
            tenant_pairs_tested: 1,
            tenant_isolation: 'org_a_cannot_read_org_b',
            fail_closed: true,
            fail_open_disallowed: true,
            frontend_authority: false,
            violations: [],
          },
          authorization_gate: {
            status: 'server_enforced',
            authority: 'flyto-engine',
            org_gate: 'requireOrgAccess',
            commercial_gate: 'requireCommercialAction',
            scope_gate: 'verified_repo_or_domain',
            capability_gate: 'automated_product_testing',
            frontend_authority: false,
            fail_closed: true,
          },
          event_stream: {
            status: 'contract',
            transport: 'text/event-stream',
            endpoint: '/api/v1/code/orgs/org-1/events',
            expected_events: ['campaign_execution.updated'],
            expected_payload_fields: ['runner_execution_id', 'evidence_sig', 'status', 'artifacts'],
            observed_events: [],
            observed_count: 0,
            fail_closed: true,
            source: 'engine.runner_callback',
          },
          scheduler_loop: {
            status: 'contract',
            scanner_id: 'product_verification',
            authority: 'flyto-engine',
            enabled: false,
            dispatch_source: 'manual_or_scheduler',
            manual_run_endpoint: '/api/v1/code/orgs/org-1/warroom-verification/runs',
            scheduler_control_endpoint: '/api/v1/system/scheduler/configs',
            durable_job: true,
            run_count: 2,
            fail_count: 0,
          },
          evidence_chain: {
            artifact_completeness: {
              required: ['screenshot', 'dom_snapshot', 'network_log'],
              present: ['screenshot', 'network_log'],
              missing: ['dom_snapshot'],
              complete: false,
              score: 0.67,
            },
            has_screenshot: true,
            has_dom_snapshot: false,
            has_network_log: true,
            evidence_signature_expected: true,
          },
          gate: {
            verdict: 'blocked',
            score: 72.5,
            blockers: ['reachable_coverage_below_85:73%'],
          },
        },
        run: {
          total: 2,
          passed: 2,
          failed: 0,
          replay_ok: true,
          results: [
            {
              id: 'page_1_goto',
              module: 'browser.goto',
              status: 'passed',
              severity: 'P1',
              duration_ms: 42,
            },
            {
              id: 'page_1_dom_assert',
              module: 'browser.evaluate',
              status: 'passed',
              severity: 'P0',
              duration_ms: 12,
              assertions: [{ path: 'result.text_chars', passed: true, severity: 'P0' }],
            },
          ],
          evaluation: {
            passed: true,
            summary: { replay_reliability: 1, p0: 0, p1: 0 },
          },
        },
        scenarios: {
          name: 'Customer checkout deterministic verification',
          schema_version: 'warroom.scenarios.v1',
          generated_from: 'warroom.site_graph.v1',
          target: 'https://checkout.customer.example',
          steps: [
            { id: 'page_1_goto', module: 'browser.goto', params: { url: 'https://checkout.customer.example' } },
            {
              id: 'page_1_dom_assert',
              module: 'browser.evaluate',
              params: { script: '(async () => ({ text_chars: 1 }))' },
              assertions: [{ path: 'result.text_chars', operator: '>', expected: 0, severity: 'P0' }],
            },
          ],
        },
        gate_verdict: 'blocked',
        gate_score: 72.5,
        score_breakdown: {
          route_reachable_coverage: { points: 14.5, max: 20, value: 0.73, threshold: 0.85 },
          replay_reliability: { points: 20, max: 20, value: 1, threshold: 0.95 },
          live_operation_loop: { points: 0, max: 15, complete: false },
        },
        artifact_completeness: {
          required: ['screenshot', 'dom_snapshot', 'network_log'],
          present: ['screenshot', 'network_log'],
          missing: ['dom_snapshot'],
          complete: false,
          score: 0.67,
        },
        gate_blockers: ['reachable_coverage_below_85:73%', 'missing_artifacts:dom_snapshot'],
        scores: { observed_coverage: 0.91, reachable_coverage: 0.73 },
        site_graph: {
          intents: [{ id: 'run_verification', verb: 'run', object: 'verification', source: 'control' }],
          actions: [{ id: 'action_1', label: 'Run verification', selector: '[data-testid="run-verification"]', expected_state: 'actionable', intent_id: 'run_verification' }],
          pages: [{ id: 'page_1', url: 'https://checkout.customer.example', body_chars: 1024, states: ['resolved_data', 'stale'], control_count: 1, api_count: 1 }],
          apis: [{ id: 'api_1', method: 'POST', url: 'https://checkout.customer.example/api/verification/run', status: 200, trigger: 'run-verification', ghost_api_type: 'type_a_ui_api_no_effect' }],
          reachable_paths: ['/', '/settings/sso'],
          observed_paths: ['/'],
          state_graph: { allowed_states: ['loading', 'error', 'resolved_data', 'stale'] },
        },
        findings: [{
          type: 'state_contradiction',
          severity: 'P0',
          message: 'API credits=0 but Run is enabled',
        }],
      },
      artifacts: [{
        id: 'artifact-1',
        kind: 'screenshot',
        name: 'desktop.png',
        mimeType: 'image/png',
        sizeBytes: 68,
        previewDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        createdAt: '2026-06-23T10:01:00Z',
      }, {
        id: 'artifact-2',
        kind: 'dom_snapshot',
        name: 'dom-snapshot.json',
        mimeType: 'application/json',
        sizeBytes: 128,
        json: { count: 1 },
        createdAt: '2026-06-23T10:01:00Z',
      }, {
        id: 'artifact-3',
        kind: 'network_log',
        name: 'network-log.json',
        mimeType: 'application/json',
        sizeBytes: 128,
        json: { count: 3, requests: [{ method: 'POST', url: 'https://checkout.customer.example/api/verification/run', status: 200 }] },
        createdAt: '2026-06-23T10:01:00Z',
      }],
    })
    engineMocks.getEventScope.mockResolvedValue({ is_platform_admin: true })
    engineMocks.listProductVerificationScanner.mockResolvedValue({
      scanners: [],
      scanner: {
        id: 'product_verification',
        name: 'Automated Security Testing',
        description: 'Bounded recurring deterministic verification for customer-owned targets.',
        category: 'scanning',
        scope: 'all_orgs',
        asset_types: ['campaign_executions', 'warroom_evidence_pack'],
        env_keys: ['FLYTO_VERIFICATION_URL', 'FLYTO_PRODUCT_VERIFICATION_EXECUTE'],
        critical_for_platform: false,
        enabled: false,
        interval: '6h0m0s',
        run_count: 2,
        fail_count: 0,
        last_run_end: '2026-06-23T11:00:00Z',
        currently_running: false,
      },
    })
    engineMocks.patchProductVerificationScanner.mockResolvedValue({ ok: true })
    engineMocks.runProductVerificationScannerNow.mockResolvedValue({ ok: true, scanner: 'product_verification' })
  })

  it('uses a fixed shell with product-verification cockpit and testing matrix tabs', async () => {
    renderView()

    expect(await screen.findByText('Automated Security Testing')).toBeTruthy()
    expect(screen.getAllByText('Start with a target').length).toBeGreaterThan(0)
    expect(screen.getAllByText('No target selected').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Gate score').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Evidence').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Runner execution').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Repo scope').length).toBeGreaterThan(0)
    expect(screen.getByText('Preview only')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Start scan/ })).toBeTruthy()
    expect(screen.getByText('Next action')).toBeTruthy()
    expect(screen.getByText('Recent runs')).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Overview/ })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Testing Matrix/ })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Scheduler Runs/ })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Evidence Pack/ })).toBeTruthy()
    expect(screen.queryByRole('tab', { name: /Discovery/ })).toBeNull()
    expect(screen.getByRole('tabpanel').getAttribute('id')).toBe('product-verification-panel-overview')

    fireEvent.click(screen.getByRole('tab', { name: /Testing Matrix/ }))
    expect(screen.getByRole('tabpanel').getAttribute('id')).toBe('product-verification-panel-testing')
    expect(await screen.findByText('Security testing matrix')).toBeTruthy()
    expect(screen.getByText('Backend authority')).toBeTruthy()
    expect(screen.getByText('API gate result')).toBeTruthy()
    expect(screen.getByText('UI interaction coverage')).toBeTruthy()
    expect(screen.getAllByText('Browser replay').length).toBeGreaterThan(0)
    expect(screen.getByText('Evidence artifacts')).toBeTruthy()
    expect(screen.getByText('RBAC and tenant isolation')).toBeTruthy()
    expect(screen.getByText('Live refresh loop')).toBeTruthy()
    expect(screen.getAllByText('Scheduler loop').length).toBeGreaterThan(0)
    expect(screen.getByText('UI copy and i18n')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /Scheduler Runs/ }))
    expect(screen.getByRole('tabpanel').getAttribute('id')).toBe('product-verification-panel-scheduler')
    expect(await screen.findByText('Scheduled Automated Security Testing')).toBeTruthy()
    expect(await screen.findByText('product_verification')).toBeTruthy()
    expect(screen.getByText('disabled')).toBeTruthy()
    expect(screen.getByText('Run scheduler now')).toBeTruthy()
    expect(screen.getByText('Next run')).toBeTruthy()
    expect(screen.getByText(/run run-1 -> sha256:evidence/)).toBeTruthy()
    expect(screen.getByText('disabled in scanners.yaml; dry-run unless FLYTO_PRODUCT_VERIFICATION_EXECUTE=true')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /Evidence Pack/ }))
    expect(screen.getByRole('tabpanel').getAttribute('id')).toBe('product-verification-panel-evidence')
    expect(screen.getByRole('tab', { name: /Discovery/ })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Intent Graph/ })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /YAML Scenarios/ })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Replay Timeline/ })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Screenshots/ })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Network \/ API/ })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /State Contradictions/ })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Ghost APIs/ })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /RBAC \/ Entitlement/ })).toBeTruthy()
    expect(screen.getAllByText('Intent Graph').length).toBeGreaterThan(0)
    expect(screen.getByText('sha256:evidence')).toBeTruthy()
    expect(screen.getAllByText('Gate verdict').length).toBeGreaterThan(0)
    expect(screen.getAllByText('blocked').length).toBeGreaterThan(0)
    expect(screen.getAllByText('72.5 / 100').length).toBeGreaterThan(0)
    expect(screen.getByText('Score breakdown')).toBeTruthy()
    expect(screen.getByText('Route Reachable Coverage')).toBeTruthy()
    expect(screen.getByText('2/3 missing')).toBeTruthy()
    expect(screen.getAllByText(/reachable_coverage_below_85/).length).toBeGreaterThan(0)
    expect(await screen.findByText('Network requests')).toBeTruthy()
    expect(screen.getAllByText('Evidence Pack').length).toBeGreaterThan(0)
    expect(screen.getByText(/"schema_version": "flyto.core.deterministic_verification.v1"/)).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /YAML Scenarios/ }))
    expect(screen.getByRole('tabpanel').getAttribute('id')).toBe('product-verification-panel-yaml')
    expect(screen.getAllByText('YAML Scenarios').length).toBeGreaterThan(0)
    expect(screen.getByText('warroom.scenarios.v1')).toBeTruthy()
    expect(screen.getByText('browser.goto · 0 assertions')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /Replay Timeline/ }))
    expect(screen.getByRole('tabpanel').getAttribute('id')).toBe('product-verification-panel-replay')
    expect(screen.getAllByText('Replay Timeline').length).toBeGreaterThan(0)
    expect(screen.getByText('page_1_dom_assert')).toBeTruthy()
    expect(screen.getByText('browser.evaluate · 1/1 assertions')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /Screenshots/ }))
    expect(screen.getByRole('tabpanel').getAttribute('id')).toBe('product-verification-panel-screenshots')
    expect(await screen.findByAltText('desktop.png')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /Discovery/ }))
    expect(screen.getByRole('tabpanel').getAttribute('id')).toBe('product-verification-panel-discovery')
    expect(screen.getAllByText('Discovery').length).toBeGreaterThan(0)
    expect(screen.getByText('Action candidates')).toBeTruthy()
    expect(screen.getByText('[data-testid="run-verification"] · actionable · run_verification')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /Intent Graph/ }))
    expect(screen.getByRole('tabpanel').getAttribute('id')).toBe('product-verification-panel-intent')
    expect(screen.getByText('run')).toBeTruthy()
    expect(screen.getByText('verification · control')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /Network \/ API/ }))
    expect(screen.getByRole('tabpanel').getAttribute('id')).toBe('product-verification-panel-network')
    expect(screen.getByText('Network/API')).toBeTruthy()
    expect(screen.getByText('POST 200')).toBeTruthy()
    expect(screen.getByText('https://checkout.customer.example/api/verification/run · trigger run-verification · type_a_ui_api_no_effect')).toBeTruthy()
    expect(screen.getByText('Network log artifact')).toBeTruthy()
    expect(screen.getByText(/"requests"/)).toBeTruthy()
    expect(screen.getByText('DOM snapshot')).toBeTruthy()
    expect(screen.getByText('dom-snapshot.json')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /State Contradictions/ }))
    expect(screen.getByRole('tabpanel').getAttribute('id')).toBe('product-verification-panel-contradictions')
    expect(screen.getByText(['Rbac', 'Fail', 'Open'].join(' '))).toBeTruthy()
    expect(screen.getByText('state_contradiction')).toBeTruthy()
    expect(screen.getByText('API credits=0 but Run is enabled')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /Ghost APIs/ }))
    expect(screen.getByRole('tabpanel').getAttribute('id')).toBe('product-verification-panel-ghost')
    expect(screen.getByText('Type A UI -> API no effect')).toBeTruthy()
    expect(screen.getByText('POST https://checkout.customer.example/api/run (200)')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /RBAC \/ Entitlement/ }))
    expect(screen.getByRole('tabpanel').getAttribute('id')).toBe('product-verification-panel-rbac')
    expect(screen.getAllByText('RBAC / Entitlement').length).toBeGreaterThan(0)
    expect(screen.getByText('Verifier authorization evidence')).toBeTruthy()
    expect(screen.getAllByText('Target under verification').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Verifier provenance').length).toBeGreaterThan(0)
    expect(screen.getByText('Verifier authority')).toBeTruthy()
    expect(screen.getAllByText('owner, admin, member, viewer').length).toBeGreaterThan(0)
    expect(screen.getByText('scan:trigger')).toBeTruthy()
    expect(screen.getByText('org_a_cannot_read_org_b')).toBeTruthy()
    expect(screen.getByText('captured · expected deny')).toBeTruthy()
    expect(screen.getByText('Open gate')).toBeTruthy()
    expect(screen.getByText('disallowed')).toBeTruthy()
    expect(screen.getByText('Org A -> Org B read')).toBeTruthy()
  })

  it('keeps scheduler closure visible when the scanner registry is missing', async () => {
    engineMocks.listProductVerificationScanner.mockResolvedValue({
      scanners: [],
      scanner: null,
    })

    renderView()
    expect(await screen.findByText('Automated Security Testing')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /Scheduler Runs/ }))
    expect(await screen.findByText('The product_verification scanner is not registered in the verifier scheduler yet.')).toBeTruthy()
    expect(screen.getByText('Scanner ID')).toBeTruthy()
    expect(screen.getByText('not registered in API scanner registry')).toBeTruthy()
    expect(screen.getByText('/api/v1/code/orgs/{org_id}/warroom-verification/runs')).toBeTruthy()
    expect(screen.getByText(/run run-1 -> sha256:evidence/)).toBeTruthy()
  })
})
