import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'

const mockState = vi.hoisted(() => ({
  pickerPropsHolder: { current: null as { opened: boolean; onClose: (info?: { connected: number }) => void } | null },
  connectGitHubMock: vi.fn(),
  saveOrgTokenMock: vi.fn(),
  ghConnected: false,
}))

vi.mock('@lib/i18n', () => ({
  t: (key: string) => {
    const map: Record<string, string> = {
      'onboarding.connectGithub': 'Connect GitHub',
      'onboarding.connectGithubDesc': 'Connect your GitHub account',
      'onboarding.selectRepos': 'Select Repos',
      'onboarding.selectReposDesc': 'Choose repositories to scan',
      'onboarding.firstScan': 'First Scan',
      'onboarding.firstScanDesc': 'Run your first security scan',
      'onboarding.connectBtn': 'Connect',
      'onboarding.selectBtn': 'Select',
    }
    const translated = globalThis.__flytoTestT?.(key)
    return translated && translated !== key ? translated : map[key] ?? key
  },
  tOr: (_key: string, fallback: string) => fallback,
}))

vi.mock('@hooks/useAuth', () => ({
  useAuth: () => ({
    connectGitHub: mockState.connectGitHubMock,
  }),
}))

vi.mock('@hooks/useGitHubConnection', () => ({
  useGitHubConnection: () => ({
    connected: mockState.ghConnected,
    login: '',
    loading: false,
    refresh: vi.fn(),
  }),
}))

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1', name: 'Test Org' } }),
}))

vi.mock('@lib/engine', () => ({
  saveOrgToken: mockState.saveOrgTokenMock,
}))

vi.mock('@lib/oauth', () => ({
  getGitLabOAuthUrl: vi.fn(),
  rememberGitLabReturnPath: vi.fn(),
}))

vi.mock('notistack', () => ({
  useSnackbar: () => ({ enqueueSnackbar: vi.fn() }),
}))

vi.mock('@compounds/_shared/picker', () => ({
  RepoPickerModal: (props: { opened: boolean; onClose: (info?: { connected: number }) => void }) => {
    mockState.pickerPropsHolder.current = props
    return props.opened
      ? React.createElement('div', { 'data-testid': 'picker-modal' }, 'picker')
      : null
  },
}))

vi.mock('@compounds/_shared/ScanUploadDropzone', () => ({
  ScanUploadDropzone: () => React.createElement('div', { 'data-testid': 'scan-upload-dropzone' }, 'upload'),
}))

import { OnboardingView } from '../OnboardingView'

describe('OnboardingView', () => {
  beforeEach(() => {
    mockState.ghConnected = false
    mockState.pickerPropsHolder.current = null

    mockState.connectGitHubMock.mockReset()
    mockState.connectGitHubMock.mockResolvedValue('test-github-token')

    mockState.saveOrgTokenMock.mockReset()
    mockState.saveOrgTokenMock.mockResolvedValue({ status: 'ok' })
  })

  it('renders provider selector cards (GitHub, GitLab, Bitbucket)', () => {
    render(<OnboardingView />)
    expect(screen.getByText('GitHub')).toBeDefined()
    expect(screen.getByText('GitLab')).toBeDefined()
    expect(screen.getByText('Bitbucket')).toBeDefined()
  })

  it('shows Connect GitHub button on step 1', () => {
    render(<OnboardingView />)
    // The button text comes from tOr('onboarding.connectGithub', 'Connect GitHub')
    // It appears in the card heading AND the button itself
    const buttons = screen.getAllByText('Connect GitHub')
    expect(buttons.length).toBeGreaterThanOrEqual(1)
  })

  it('walks through the full connect -> select -> done flow', async () => {
    render(<OnboardingView />)

    // Click the Connect GitHub button (last one is the actual button)
    const connectBtns = screen.getAllByText('Connect GitHub')
    fireEvent.click(connectBtns[connectBtns.length - 1])

    await waitFor(() => expect(mockState.connectGitHubMock).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(mockState.saveOrgTokenMock).toHaveBeenCalledWith('org-1', 'test-github-token'),
    )

    // Step 2: Select repos button
    await waitFor(() => expect(screen.getByRole('button', { name: /select repos/i })).toBeDefined())

    fireEvent.click(screen.getByRole('button', { name: /select repos/i }))

    await waitFor(() => expect(mockState.pickerPropsHolder.current?.opened).toBe(true))
    expect(screen.queryByTestId('picker-modal')).not.toBeNull()

    act(() => {
      mockState.pickerPropsHolder.current!.onClose({ connected: 2 })
    })

    // Step 3: Done / all set
    await waitFor(() => expect(screen.getByText('All set!')).toBeDefined())
  })

  it('starts at step 2 when GitHub is already connected', () => {
    mockState.ghConnected = true
    render(<OnboardingView />)

    expect(screen.getByRole('button', { name: /select repos/i })).toBeDefined()
    // No Connect GitHub button visible at step 2
    expect(screen.queryByText('Connect GitHub')).toBeNull()
  })
})
