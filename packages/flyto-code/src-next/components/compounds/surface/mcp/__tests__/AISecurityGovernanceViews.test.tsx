import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactElement } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import {
  AIDLPView,
  AIGovernanceView,
  AISecurityCenterView,
  EvidenceReportsView,
  ShadowAIView,
} from '../AISecurityGovernanceViews'

const {
  mockApproveAIGovernanceUseCase,
  mockCanDoAction,
  mockCanUseProjectAction,
  mockCreateAIGovernanceUseCase,
  mockGetAIGovernanceScore,
  mockGetMcpEvidenceReport,
  mockGetMcpOverview,
  mockGetMcpPolicy,
  mockListAIGovernanceEvents,
  mockMcpEvidenceReportUrl,
  mockListAIGovernanceUseCases,
  mockRejectAIGovernanceUseCase,
  mockRequestAIGovernanceUseCaseApproval,
  mockUpdateAIGovernanceUseCase,
} = vi.hoisted(() => ({
  mockApproveAIGovernanceUseCase: vi.fn(),
  mockCanDoAction: vi.fn(),
  mockCanUseProjectAction: vi.fn(),
  mockCreateAIGovernanceUseCase: vi.fn(),
  mockGetAIGovernanceScore: vi.fn(),
  mockGetMcpEvidenceReport: vi.fn(),
  mockGetMcpOverview: vi.fn(),
  mockGetMcpPolicy: vi.fn(),
  mockListAIGovernanceEvents: vi.fn(),
  mockMcpEvidenceReportUrl: vi.fn(),
  mockListAIGovernanceUseCases: vi.fn(),
  mockRejectAIGovernanceUseCase: vi.fn(),
  mockRequestAIGovernanceUseCaseApproval: vi.fn(),
  mockUpdateAIGovernanceUseCase: vi.fn(),
}))

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1', name: 'Test Org' } }),
}))

vi.mock('@hooks/useCapabilities', () => ({
  useCapabilities: () => ({ canDoAction: mockCanDoAction }),
}))

vi.mock('@hooks/useProjectCapabilities', () => ({
  useProjectCapabilities: () => ({ canUseAction: mockCanUseProjectAction }),
}))

vi.mock('@lib/engine', () => ({
  approveAIGovernanceUseCase: (...args: unknown[]) => mockApproveAIGovernanceUseCase(...args),
  createAIGovernanceUseCase: (...args: unknown[]) => mockCreateAIGovernanceUseCase(...args),
  getAIGovernanceScore: (...args: unknown[]) => mockGetAIGovernanceScore(...args),
  getMcpEvidenceReport: (...args: unknown[]) => mockGetMcpEvidenceReport(...args),
  getMcpOverview: (...args: unknown[]) => mockGetMcpOverview(...args),
  getMcpPolicy: (...args: unknown[]) => mockGetMcpPolicy(...args),
  listAIGovernanceEvents: (...args: unknown[]) => mockListAIGovernanceEvents(...args),
  listAIGovernanceUseCases: (...args: unknown[]) => mockListAIGovernanceUseCases(...args),
  mcpEvidenceReportUrl: (...args: unknown[]) => mockMcpEvidenceReportUrl(...args),
  rejectAIGovernanceUseCase: (...args: unknown[]) => mockRejectAIGovernanceUseCase(...args),
  requestAIGovernanceUseCaseApproval: (...args: unknown[]) => mockRequestAIGovernanceUseCaseApproval(...args),
  updateAIGovernanceUseCase: (...args: unknown[]) => mockUpdateAIGovernanceUseCase(...args),
}))

function renderView(ui: ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={qc}>
      {ui}
    </QueryClientProvider>,
  )
  return qc
}

function renderGovernance() {
  return renderView(<AIGovernanceView />)
}

function getActionRow(label: string): HTMLElement {
  const row = screen.getAllByRole('row').find((candidate) => (
    within(candidate).queryByText(label) &&
    within(candidate).queryByRole('button', { name: 'Approve' })
  ))
  if (!row) throw new Error(`No approval action row found for ${label}`)
  return row
}

const registryRows = [
  {
    id: 'ai-use-1',
    orgId: 'org-1',
    name: 'Claude Code engineering pilot',
    department: 'Engineering',
    businessOwner: 'VP Engineering',
    technicalOwner: 'Platform Security',
    modelProvider: 'Anthropic',
    modelName: 'Claude',
    appName: 'Claude Code',
    appCategory: 'code_agent',
    purpose: 'Developer productivity with governed source-code access',
    dataClasses: ['source_code', 'secret'],
    frameworks: ['NIST AI RMF', 'ISO/IEC 42001'],
    riskLevel: 'high',
    status: 'pending_approval',
    policyMode: 'shadow',
    approvalStatus: 'pending',
    approvalRequestedBy: 'u-security',
    evidenceJson: '{}',
    notes: '',
    createdAt: '2026-06-12T00:00:00Z',
    updatedAt: '2026-06-12T00:00:00Z',
  },
  {
    id: 'ai-use-2',
    orgId: 'org-1',
    name: 'Internal claims assistant',
    department: 'Operations',
    businessOwner: 'Claims Lead',
    technicalOwner: 'AI Platform',
    modelProvider: 'Azure OpenAI',
    modelName: 'GPT private endpoint',
    appName: 'Claims Copilot',
    appCategory: 'internal_llm',
    purpose: 'Summarize internal claim notes without external egress',
    dataClasses: ['customer_data'],
    frameworks: ['NIST AI RMF'],
    riskLevel: 'medium',
    status: 'approved',
    policyMode: 'soft_enforce',
    approvalStatus: 'approved',
    approvedBy: 'u-ciso',
    approvedAt: '2026-06-12T01:00:00Z',
    evidenceJson: '{}',
    notes: '',
    createdAt: '2026-06-12T00:00:00Z',
    updatedAt: '2026-06-12T01:00:00Z',
  },
]

describe('AIGovernanceView', () => {
  beforeEach(() => {
    mockApproveAIGovernanceUseCase.mockReset()
    mockCanDoAction.mockReset()
    mockCanUseProjectAction.mockReset()
    mockCreateAIGovernanceUseCase.mockReset()
    mockGetAIGovernanceScore.mockReset()
    mockGetMcpEvidenceReport.mockReset()
    mockGetMcpOverview.mockReset()
    mockGetMcpPolicy.mockReset()
    mockListAIGovernanceEvents.mockReset()
    mockMcpEvidenceReportUrl.mockReset()
    mockListAIGovernanceUseCases.mockReset()
    mockRejectAIGovernanceUseCase.mockReset()
    mockRequestAIGovernanceUseCaseApproval.mockReset()
    mockUpdateAIGovernanceUseCase.mockReset()
    mockCanDoAction.mockImplementation((action: string) => action === 'mcp:configure')
    mockCanUseProjectAction.mockImplementation((action: string) => action === 'mcp:configure')

    mockGetMcpOverview.mockResolvedValue({
      configured: true,
      servers: [{
        id: 'srv-1',
        name: 'agent-firewall-prod',
        transport: 'mcp',
        deploymentKind: 'proxy',
        status: 'online',
        toolCount: 8,
        unclassifiedTools: 0,
        writeTools: 2,
      }],
      serverStatusCounts: { online: 1 },
      toolTotal: 8,
      unclassifiedTools: 0,
      recentDecisions: [
        { toolName: 'read_repo', verb: 'READ', verdict: 'allow', effective: 'proceed', stateChange: false, externalSideEffect: false },
        { toolName: 'send_to_webhook', verb: 'TRANSMIT', verdict: 'deny', effective: 'blocked', stateChange: false, externalSideEffect: true },
      ],
      decisionCounts: { proceed: 1, blocked: 1 },
    })
    mockGetMcpPolicy.mockResolvedValue({ defaultMode: 'shadow' })
    mockGetMcpEvidenceReport.mockResolvedValue({
      generatedAt: '2026-06-12T02:30:00Z',
      windowLimit: 500,
      summary: {
        totalEvents: 12,
        blockedOrHeld: 2,
        sensitiveEvents: 5,
        outboundSensitive: 3,
        stateChanging: 1,
        externalSideEffects: 2,
        tokenizationEligible: 4,
        identityAttributed: 9,
        appAttributed: 10,
        deviceAttributed: 8,
        byEffective: { proceed: 10, blocked: 2 },
        byDataClass: { customer_data: 4, source_code: 3 },
        byAppCategory: { code_agent: 8, public_ai_saas: 4 },
      },
      rows: [
        {
          eventId: 'evt-1',
          projectHash: 'project-1',
          sessionId: 'session-1',
          userId: 'security@company',
          agentId: 'agent-1',
          deviceId: 'device-1',
          appName: 'Claude Code',
          appCategory: 'code_agent',
          actionType: 'tool_call',
          serverId: 'srv-1',
          toolName: 'send_to_webhook',
          verb: 'TRANSMIT',
          dataClass: 'customer_data',
          contentClass: 'pii',
          dataDirection: 'outbound',
          targetTrust: 'public_external',
          permissionScope: 'repo_write',
          stateChange: false,
          externalSideEffect: true,
          requiresAuth: true,
          hasInputDigest: true,
          hasOutputDigest: false,
          verdict: 'deny',
          effective: 'blocked',
          rollout: 'shadow',
          transformSuggestion: 'tokenize',
          occurredAt: '2026-06-12T02:20:00Z',
        },
      ],
      privacy: { persisted: ['digest', 'policy', 'runtime_context'], neverPersisted: ['raw_prompt', 'raw_file'], exportSafe: true },
    })
    mockMcpEvidenceReportUrl.mockReturnValue('https://engine.test/api/v1/code/orgs/org-1/mcp/reports/evidence?format=csv')
    mockGetAIGovernanceScore.mockResolvedValue({
      orgId: 'org-1',
      generatedAt: '2026-06-12T02:00:00Z',
      overall: 83,
      grade: 'B',
      enterpriseOverall: 86,
      enterpriseGrade: 'B',
      dimensions: [
        {
          id: 'inventory_coverage',
          label: 'Inventory coverage',
          description: 'Known AI use cases, models, frameworks, and runtime surfaces are registered.',
          score: 90,
          weight: 14,
          status: 'strong',
          evidence: ['AI use-case registry has entries'],
          signals: { useCases: 2, modelMapped: 2 },
        },
        {
          id: 'approval_governance',
          label: 'Approval governance',
          description: 'Use cases move through request, approval, rejection, and review evidence.',
          score: 72,
          weight: 12,
          status: 'managed',
          evidence: ['pending approvals are visible'],
          signals: { approved: 1, pending: 1 },
        },
        {
          id: 'inference_context_leakage',
          label: 'Inference and context leakage',
          description: 'Detects when harmless-looking fragments can combine into sensitive conclusions across a session or project.',
          score: 80,
          weight: 11,
          status: 'managed',
          evidence: ['mosaic-risk sessions have block, hold, or tokenization-ready controls'],
          signals: { mosaicRiskSessions: 1, mosaicGuardedSessions: 1 },
        },
      ],
      enterpriseReadiness: [
        {
          id: 'ui_coverage',
          label: 'UI coverage',
          description: 'Management and engineering surfaces are broad enough to run discovery, governance, DLP, attack replay, activity review, and evidence export from one product area.',
          score: 88,
          weight: 33,
          status: 'strong',
          evidence: ['seven Agent Firewall / AI governance surfaces are declared in the frontend module registry'],
          signals: { declaredSurfaces: 7, events: 12 },
        },
        {
          id: 'backend_control_depth',
          label: 'Backend control depth',
          description: 'The backend owns the full control loop.',
          score: 84,
          weight: 34,
          status: 'managed',
          evidence: ['runtime ingest and decision replay have data'],
          signals: { events: 12, blockedOrHeld: 2 },
        },
        {
          id: 'database_evidence_durability',
          label: 'Database and evidence durability',
          description: 'The persistent layer is append-only, digest-safe, and indexed.',
          score: 86,
          weight: 33,
          status: 'strong',
          evidence: ['append-only event rows exist'],
          signals: { sessions: 2, projectScopedEvents: 9 },
        },
        {
          id: 'runtime_connector_coverage',
          label: 'Runtime connector coverage',
          description: 'Installable Agent Firewall connectors cover endpoint, browser, MCP proxy, and heartbeat paths.',
          score: 82,
          weight: 14,
          status: 'managed',
          evidence: ['connector suite declares cross-platform install templates'],
          signals: { declaredControls: 7, deviceAttributed: 12 },
        },
        {
          id: 'enterprise_deployment_packaging',
          label: 'Enterprise deployment packaging',
          description: 'Cloud, on-prem, restricted-egress, and air-gapped profiles are packaged.',
          score: 84,
          weight: 14,
          status: 'managed',
          evidence: ['deployment profiles are declared'],
          signals: { declaredProfiles: 4, projectScopedEvents: 9 },
        },
        {
          id: 'identity_directory_integration',
          label: 'Identity and directory integration',
          description: 'SSO, SCIM, RBAC, API keys, user, device, and app attribution are joined.',
          score: 81,
          weight: 13,
          status: 'managed',
          evidence: ['runtime events carry identity and device attribution'],
          signals: { declaredControls: 7, identityAttributed: 9 },
        },
        {
          id: 'validation_and_operations',
          label: 'Validation and operations',
          description: 'Attack Lab, replay, retention, legal hold, and route checks close the ops loop.',
          score: 85,
          weight: 13,
          status: 'strong',
          evidence: ['mosaic-risk sessions are detected for validation'],
          signals: { declaredControls: 7, mosaicRiskSessions: 1 },
        },
      ],
      summary: { dimensionModel: 'ai_governance_v2', enterpriseModel: 'agent_firewall_enterprise_v2', dimensionCount: 9, enterprisePillars: 7, lifecycleEvents: 3, openRuntimeGaps: 1, blockedByGovernance: 1 },
    })
    mockListAIGovernanceUseCases.mockResolvedValue(registryRows)
    mockListAIGovernanceEvents.mockResolvedValue([
      {
        id: 'aigov-1',
        orgId: 'org-1',
        useCaseId: 'ai-use-1',
        eventType: 'approval_requested',
        actorId: 'u-security',
        fromStatus: 'draft',
        toStatus: 'pending_approval',
        fromApprovalStatus: 'not_requested',
        toApprovalStatus: 'pending',
        fromPolicyMode: 'shadow',
        toPolicyMode: 'shadow',
        riskLevel: 'high',
        reason: 'approval_requested',
        metadataJson: '{}',
        createdAt: '2026-06-12T01:00:00Z',
      },
      {
        id: 'aigov-2',
        orgId: 'org-1',
        useCaseId: 'ai-use-1',
        runtimeEventId: 'mcp-evt-1',
        eventType: 'enforcement_block',
        toPolicyMode: 'enforce',
        riskLevel: 'high',
        reason: 'use_case_not_approved_or_expired',
        metadataJson: '{}',
        createdAt: '2026-06-12T02:00:00Z',
      },
    ])
    mockCreateAIGovernanceUseCase.mockResolvedValue({ ...registryRows[0], id: 'ai-use-new', name: 'New governed assistant', status: 'draft', approvalStatus: 'not_requested' })
    mockUpdateAIGovernanceUseCase.mockResolvedValue({ ...registryRows[0], department: 'Platform' })
    mockApproveAIGovernanceUseCase.mockResolvedValue({ ...registryRows[0], status: 'approved', approvalStatus: 'approved' })
    mockRejectAIGovernanceUseCase.mockResolvedValue({ ...registryRows[0], status: 'denied', approvalStatus: 'rejected' })
    mockRequestAIGovernanceUseCaseApproval.mockResolvedValue(registryRows[0])
  })

  it('renders registry-backed AI governance and approval queue', async () => {
    renderGovernance()

    expect(await screen.findByText('AI Usage & Risk Governance')).toBeTruthy()
    expect(screen.getByText('AI governance readiness')).toBeTruthy()
    expect(screen.getByText('Grade B')).toBeTruthy()
    expect(screen.getByText('Enterprise readiness')).toBeTruthy()
    expect(screen.getByText('UI coverage')).toBeTruthy()
    expect(screen.getByText('Backend control depth')).toBeTruthy()
    expect(screen.getByText('Database and evidence durability')).toBeTruthy()
    expect(screen.getByText('Runtime connector coverage')).toBeTruthy()
    expect(screen.getByText('Enterprise deployment packaging')).toBeTruthy()
    expect(screen.getByText('Identity and directory integration')).toBeTruthy()
    expect(screen.getByText('Validation and operations')).toBeTruthy()
    expect(screen.getByText('Governance dimension scorecard')).toBeTruthy()
    expect(screen.getByText('Inventory coverage')).toBeTruthy()
    expect(screen.getByText('Approval governance')).toBeTruthy()
    expect(screen.getByText('Inference and context leakage')).toBeTruthy()
    expect(screen.getByText('Lifecycle events')).toBeTruthy()
    expect(screen.getByText('Runtime gaps')).toBeTruthy()
    expect(screen.getByText('AI use case register')).toBeTruthy()
    expect(screen.getByText('AI use-case editor')).toBeTruthy()
    expect(screen.getByText('AI approval queue')).toBeTruthy()
    expect(screen.getByText('AI governance timeline')).toBeTruthy()
    expect(screen.getByText('enforcement_block')).toBeTruthy()
    expect(screen.getAllByText('Claude Code engineering pilot').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('Internal claims assistant').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('1 AI use cases are waiting for approval.')).toBeTruthy()
  })

  it('runs approval actions against the selected use case', async () => {
    renderGovernance()

    await screen.findByText('AI approval queue')
    const approvalRow = getActionRow('Claude Code engineering pilot')

    fireEvent.click(within(approvalRow).getByRole('button', { name: 'Approve' }))

    await waitFor(() => expect(mockApproveAIGovernanceUseCase).toHaveBeenCalledWith('ai-use-1', expect.objectContaining({
      expiresAt: expect.any(String),
      notes: expect.any(String),
    })))
  })

  it('creates AI governance use cases from the editor without protected approval fields', async () => {
    renderGovernance()

    fireEvent.click(await screen.findByRole('button', { name: 'New use case' }))
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'New governed assistant' } })
    fireEvent.change(screen.getByLabelText(/Department/), { target: { value: 'Security' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create use case' }))

    await waitFor(() => expect(mockCreateAIGovernanceUseCase).toHaveBeenCalledWith('org-1', expect.objectContaining({
      name: 'New governed assistant',
      department: 'Security',
    })))
    const payload = mockCreateAIGovernanceUseCase.mock.calls[0][1] as Record<string, unknown>
    expect(payload).not.toHaveProperty('approvalStatus')
    expect(payload).not.toHaveProperty('approvedBy')
    expect(payload).not.toHaveProperty('expiresAt')
  })

  it('gates AI use-case approval actions by workflow state', async () => {
    mockListAIGovernanceUseCases.mockResolvedValue([
      registryRows[0],
      registryRows[1],
      {
        ...registryRows[1],
        id: 'ai-use-3',
        name: 'Unreviewed analytics assistant',
        status: 'draft',
        approvalStatus: 'not_requested',
      },
    ])
    renderGovernance()

    await screen.findByText('AI approval queue')
    const pendingRow = getActionRow('Claude Code engineering pilot')
    expect((within(pendingRow).getByRole('button', { name: 'Request' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(pendingRow).getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(false)
    expect((within(pendingRow).getByRole('button', { name: 'Reject' }) as HTMLButtonElement).disabled).toBe(false)

    const approvedRow = getActionRow('Internal claims assistant')
    expect((within(approvedRow).getByRole('button', { name: 'Request' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(approvedRow).getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(approvedRow).getByRole('button', { name: 'Reject' }) as HTMLButtonElement).disabled).toBe(true)

    const draftRow = getActionRow('Unreviewed analytics assistant')
    expect((within(draftRow).getByRole('button', { name: 'Request' }) as HTMLButtonElement).disabled).toBe(false)
    expect((within(draftRow).getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(draftRow).getByRole('button', { name: 'Reject' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(within(draftRow).getByRole('button', { name: 'Request' }))
    await waitFor(() => expect(mockRequestAIGovernanceUseCaseApproval).toHaveBeenCalledWith('ai-use-3'))

    fireEvent.click(within(pendingRow).getByRole('button', { name: 'Reject' }))
    await waitFor(() => expect(mockRejectAIGovernanceUseCase).toHaveBeenCalledWith('ai-use-1'))
  })

  it('keeps AI governance write actions read-only without configure permission', async () => {
    mockCanDoAction.mockReturnValue(false)
    renderGovernance()

    expect((await screen.findByRole('button', { name: 'New use case' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('read-only')).toBeTruthy()

    await screen.findByText('AI approval queue')
    const pendingRow = getActionRow('Claude Code engineering pilot')
    expect((within(pendingRow).getByRole('button', { name: 'Request' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(pendingRow).getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(pendingRow).getByRole('button', { name: 'Reject' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('renders the AI security control center from runtime and governance evidence', async () => {
    renderView(<AISecurityCenterView />)

    expect(await screen.findByText('AI Security Control Center')).toBeTruthy()
    expect(screen.getByText('Six product capabilities')).toBeTruthy()
    expect(screen.getByText('Runtime events')).toBeTruthy()
    expect(screen.getByText('Registered use cases')).toBeTruthy()
    expect(screen.getByText('AI DLP and tokenization')).toBeTruthy()
    expect(screen.getByText('Enterprise integration checklist')).toBeTruthy()
  })

  it('renders shadow AI discovery and AI DLP controls as separate operational surfaces', async () => {
    renderView(<ShadowAIView />)

    expect((await screen.findAllByText('Shadow AI')).length).toBeGreaterThan(0)
    expect(screen.getByText('AI application inventory')).toBeTruthy()
    expect(screen.getByText('ChatGPT')).toBeTruthy()
    expect(screen.getByText('Claude Code / coding agents')).toBeTruthy()

    renderView(<AIDLPView />)

    expect((await screen.findAllByText('AI DLP')).length).toBeGreaterThan(0)
    expect(screen.getByText('DLP controls')).toBeTruthy()
    expect(screen.getByText('File upload')).toBeTruthy()
    expect(screen.getByText('Source code to AI')).toBeTruthy()
  })

  it('renders evidence reports with safe rows and export URL', async () => {
    renderView(<EvidenceReportsView />)

    expect(await screen.findByText('Evidence Reports')).toBeTruthy()
    expect(screen.getByText('Report list')).toBeTruthy()
    expect(screen.getByText('Recent safe evidence rows')).toBeTruthy()
    expect(screen.getByText('evt-1')).toBeTruthy()
    expect(screen.getByText('Claude Code')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Export' }))
    const exportLink = await screen.findByRole('link', { name: 'Download CSV' }) as HTMLAnchorElement
    expect(exportLink.getAttribute('href')).toBe('https://engine.test/api/v1/code/orgs/org-1/mcp/reports/evidence?format=csv')
    expect(mockMcpEvidenceReportUrl).toHaveBeenCalledWith('org-1', 'csv')
  })
})
