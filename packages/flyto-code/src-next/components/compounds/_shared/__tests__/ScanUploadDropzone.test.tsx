import React from 'react'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const useOrgMock = vi.hoisted(() => vi.fn())
const useCapabilitiesMock = vi.hoisted(() => vi.fn())
const useProjectCapabilitiesMock = vi.hoisted(() => vi.fn())
const requestMock = vi.hoisted(() => vi.fn(async () => ({ ok: true })))
const connectRepoMock = vi.hoisted(() => vi.fn(async () => ({ id: 'repo-created' })))

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

vi.mock('@hooks/useOrg', () => ({
  useOrg: useOrgMock,
}))

vi.mock('@hooks/useCapabilities', () => ({
  useCapabilities: useCapabilitiesMock,
}))

vi.mock('@hooks/useProjectCapabilities', () => ({
  useProjectCapabilities: useProjectCapabilitiesMock,
}))

vi.mock('@lib/engine/client', () => ({
  request: requestMock,
}))

vi.mock('@lib/engine', () => ({
  connectRepo: connectRepoMock,
}))

import { ScanUploadDropzone } from '../ScanUploadDropzone'

function renderDropzone(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

function scanFile() {
  return new File([
    JSON.stringify({
      profile: {
        project_type: 'typescript',
        file_count: 12,
        dependency_count: 4,
        api_definition_count: 2,
      },
      index: { symbols: [] },
    }),
  ], 'scan.json', { type: 'application/json' })
}

function allowCaps(actions: string[]) {
  return {
    ready: true,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    canDoAction: vi.fn((action: string) => actions.includes(action)),
  }
}

function allowProjectCaps(actions: string[]) {
  return {
    ready: true,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    canUseAction: vi.fn((action: string) => actions.includes(action)),
    actionAccess: vi.fn(),
    canOpenPage: vi.fn(() => true),
  }
}

describe('ScanUploadDropzone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useOrgMock.mockReturnValue({ org: { id: 'org-1', name: 'Acme' } })
    useCapabilitiesMock.mockReturnValue(allowCaps(['scan:trigger_code', 'repo:connect']))
    useProjectCapabilitiesMock.mockReturnValue(allowProjectCaps(['scan:trigger_code', 'repo:connect']))
  })

  it('does not render upload controls while capabilities are loading', () => {
    useCapabilitiesMock.mockReturnValue({
      ready: false,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
      canDoAction: vi.fn(() => false),
    })
    useProjectCapabilitiesMock.mockReturnValue({
      ready: false,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
      canUseAction: vi.fn(() => false),
      actionAccess: vi.fn(),
      canOpenPage: vi.fn(() => false),
    })

    renderDropzone(<ScanUploadDropzone repoId="repo-1" />)

    expect(screen.getByRole('progressbar')).toBeTruthy()
    expect(screen.queryByText(/drag & drop/i)).toBeNull()
  })

  it('fails closed when code scan upload is not allowed', () => {
    useCapabilitiesMock.mockReturnValue(allowCaps([]))
    useProjectCapabilitiesMock.mockReturnValue(allowProjectCaps([]))

    renderDropzone(<ScanUploadDropzone repoId="repo-1" />)

    expect(screen.getByRole('alert').textContent).toContain('Scan upload is not available for your role or plan.')
    expect(screen.queryByText(/drag & drop/i)).toBeNull()
  })

  it('uploads a parsed scan file to the existing repo when allowed', async () => {
    const { container } = renderDropzone(<ScanUploadDropzone repoId="repo-1" />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(input, { target: { files: [scanFile()] } })

    expect(await screen.findByText('typescript')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /upload & analyze/i }))

    await waitFor(() => {
      expect(requestMock).toHaveBeenCalledWith(
        'POST',
        '/api/v1/code/repos/repo-1/scan-upload',
        expect.objectContaining({ source_mode: 'local_cli' }),
      )
    })
    expect(connectRepoMock).not.toHaveBeenCalled()
  })

  it('requires repo connection access before creating a local repo from upload', () => {
    useCapabilitiesMock.mockReturnValue(allowCaps(['scan:trigger_code']))
    useProjectCapabilitiesMock.mockReturnValue(allowProjectCaps(['scan:trigger_code']))

    renderDropzone(<ScanUploadDropzone />)

    expect(screen.getByRole('alert').textContent).toContain('Creating a local repository from an upload requires repository connection access.')
    expect(screen.queryByText(/drag & drop/i)).toBeNull()
  })

  it('creates a local repo before upload when no repo id is provided', async () => {
    const { container } = renderDropzone(<ScanUploadDropzone />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(input, { target: { files: [scanFile()] } })

    expect(await screen.findByText('typescript')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Repository name'), { target: { value: 'local-api' } })
    fireEvent.click(screen.getByRole('button', { name: /upload & analyze/i }))

    await waitFor(() => {
      expect(connectRepoMock).toHaveBeenCalledWith('org-1', expect.objectContaining({
        provider: 'local',
        repoName: 'local-api',
        fullName: 'Acme/local-api',
      }))
      expect(requestMock).toHaveBeenCalledWith(
        'POST',
        '/api/v1/code/repos/repo-created/scan-upload',
        expect.objectContaining({ source_mode: 'local_cli' }),
      )
    })
  })
})
