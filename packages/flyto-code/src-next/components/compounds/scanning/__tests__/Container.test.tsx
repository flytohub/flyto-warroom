import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../../../../test/i18nTestSetup'

const engine = vi.hoisted(() => ({
  falsePositiveContainerFinding: vi.fn(),
  getContainerScanRunEvidence: vi.fn(),
  listContainerConnections: vi.fn(),
  listContainerFindings: vi.fn(),
  listContainerScanRuns: vi.fn(),
  reopenContainerFinding: vi.fn(),
  runContainerConnectionScan: vi.fn(),
  upsertContainerConnection: vi.fn(),
  verifyContainerFinding: vi.fn(),
}))

const posture = vi.hoisted(() => ({
  getContainerPosture: vi.fn(),
}))

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1', name: 'Test Org' } }),
  useConnectedRepos: () => ({
    data: [
      { id: 'repo-1', fullName: 'acme/api', repoName: 'api' },
      { id: 'repo-2', fullName: 'acme/worker', repoName: 'worker' },
    ],
  }),
}))

vi.mock('@lib/engine', () => engine)
vi.mock('@lib/engine/code/posture', () => posture)

vi.mock('notistack', () => ({
  useSnackbar: () => ({ enqueueSnackbar: vi.fn() }),
}))

import { ContainerScanView } from '../Container'

function renderView() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={client}>
      <ContainerScanView />
    </QueryClientProvider>,
  )
}

function openChecksTab(view: ReturnType<typeof renderView>) {
  const tab = view.container.querySelector('#container-tab-checks')
  expect(tab).toBeTruthy()
  fireEvent.click(tab as HTMLElement)
}

describe('ContainerScanView closed loop', () => {
  beforeEach(() => {
    posture.getContainerPosture.mockResolvedValue({ image_count: 0, scored_count: 0, images: [] })
    engine.listContainerFindings.mockResolvedValue({ findings: [] })
    engine.listContainerConnections.mockResolvedValue({ connections: [], count: 0 })
    engine.listContainerScanRuns.mockResolvedValue({ runs: [], count: 0 })
    engine.getContainerScanRunEvidence.mockResolvedValue({
      run_id: 'run-1',
      evidence_json: '{"status":"complete"}',
      evidence_signature: 'sha256:test',
    })
    engine.upsertContainerConnection.mockResolvedValue({ id: 'conn-1' })
    engine.runContainerConnectionScan.mockResolvedValue({ run: { id: 'run-1' } })
    engine.verifyContainerFinding.mockResolvedValue({ run: { id: 'run-1' }, still_present: false, status: 'resolved' })
    engine.falsePositiveContainerFinding.mockResolvedValue({ id: 'finding-1', status: 'false_positive' })
    engine.reopenContainerFinding.mockResolvedValue({ id: 'finding-1', status: 'open' })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('mounts with the live container control plane visible', async () => {
    renderView()

    expect(await screen.findByText('Container live control plane')).toBeTruthy()
    expect(await screen.findByText('No container connections yet.')).toBeTruthy()
    expect(await screen.findByText('No container scan runs yet.')).toBeTruthy()
  })

  it('saves a registry connection with parsed image refs', async () => {
    renderView()

    fireEvent.change(await screen.findByLabelText('Connection name'), {
      target: { value: 'prod registry' },
    })
    fireEvent.change(screen.getByLabelText('Image refs'), {
      target: { value: 'ghcr.io/acme/api:1.0\nnginx:1.27' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save connection' }))

    await waitFor(() => {
      expect(engine.upsertContainerConnection).toHaveBeenCalledWith('org-1', expect.objectContaining({
        kind: 'registry',
        name: 'prod registry',
        image_refs: ['ghcr.io/acme/api:1.0', 'nginx:1.27'],
        credential_kind: 'registry_credential',
        status: 'active',
      }))
    })
  })

  it('runs a saved connection scan', async () => {
    engine.listContainerConnections.mockResolvedValue({
      connections: [{
        id: 'conn-1',
        org_id: 'org-1',
        kind: 'registry',
        provider: 'registry',
        name: 'prod registry',
        image_refs: ['nginx:1.27'],
        has_credential: false,
        status: 'active',
        created_at: '2026-06-24T00:00:00Z',
        updated_at: '2026-06-24T00:00:00Z',
      }],
      count: 1,
    })

    renderView()

    fireEvent.click(await screen.findByRole('button', { name: 'Run scan' }))

    await waitFor(() => {
      expect(engine.runContainerConnectionScan).toHaveBeenCalledWith('org-1', 'conn-1')
    })
  })

  it('dispatches verify fixed from the finding action row', async () => {
    engine.listContainerFindings.mockResolvedValue({
      findings: [{
        id: 'finding-1',
        repo_id: 'repo-1',
        image_ref: 'nginx:1.27',
        package_name: 'openssl',
        installed_version: '1.0',
        fixed_version: '1.1',
        severity: 'high',
        cve_id: 'CVE-2026-0001',
        title: 'CVE-2026-0001',
        status: 'open',
        scanned_at: '2026-06-24T00:00:00Z',
      }],
    })

    const view = renderView()
    openChecksTab(view)

    fireEvent.click(await screen.findByRole('button', { name: 'Verify fixed' }))
    await waitFor(() => expect(engine.verifyContainerFinding).toHaveBeenCalledWith('org-1', 'finding-1'))
  })

  it('dispatches false positive from the finding action row', async () => {
    engine.listContainerFindings.mockResolvedValue({
      findings: [{
        id: 'finding-1',
        repo_id: 'repo-1',
        image_ref: 'nginx:1.27',
        package_name: 'openssl',
        installed_version: '1.0',
        fixed_version: '1.1',
        severity: 'high',
        cve_id: 'CVE-2026-0001',
        title: 'CVE-2026-0001',
        status: 'open',
        scanned_at: '2026-06-24T00:00:00Z',
      }],
    })

    const view = renderView()
    openChecksTab(view)

    fireEvent.click(await screen.findByRole('button', { name: 'Mark false positive' }))
    await waitFor(() => expect(engine.falsePositiveContainerFinding).toHaveBeenCalledWith('org-1', 'finding-1'))
  })

  it('separates repo Dockerfile findings from live Kubernetes connection findings', async () => {
    engine.listContainerConnections.mockResolvedValue({
      connections: [{
        id: 'conn-1',
        org_id: 'org-1',
        kind: 'kubernetes',
        provider: 'eks',
        name: 'prod-cluster',
        endpoint: 'https://cluster.example',
        region: 'us-east-1',
        image_refs: [],
        has_credential: true,
        status: 'active',
        created_at: '2026-06-24T00:00:00Z',
        updated_at: '2026-06-24T00:00:00Z',
      }],
      count: 1,
    })
    engine.listContainerFindings.mockResolvedValue({
      findings: [
        {
          id: 'finding-repo',
          repo_id: 'repo-1',
          source_type: 'repo_scan',
          source_ref: 'repo-1',
          image_ref: 'nginx:1.27',
          package_name: 'openssl',
          installed_version: '1.0',
          fixed_version: '1.1',
          severity: 'high',
          cve_id: 'CVE-2026-0001',
          title: 'Repo CVE',
          status: 'open',
          scanned_at: '2026-06-24T00:00:00Z',
        },
        {
          id: 'finding-live',
          source_type: 'container_connection',
          source_ref: 'conn-1',
          image_ref: 'nginx:1.27',
          package_name: 'glibc',
          installed_version: '2.0',
          fixed_version: '2.1',
          severity: 'critical',
          cve_id: 'CVE-2026-0002',
          title: 'Runtime CVE',
          status: 'open',
          scanned_at: '2026-06-24T00:00:00Z',
        },
      ],
    })

    const view = renderView()
    openChecksTab(view)

    expect(await screen.findByText('Live Kubernetes')).toBeTruthy()
    expect(await screen.findByText('Repo Dockerfile')).toBeTruthy()
    expect(screen.getByText('Connection: prod-cluster')).toBeTruthy()
    expect(screen.getByText('Project: acme/api')).toBeTruthy()
  })
})
