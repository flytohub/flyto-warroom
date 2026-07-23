import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  connectRepo: vi.fn(),
  invalidateQueries: vi.fn(),
  onClose: vi.fn(),
}))

vi.mock('@lib/env', () => ({ env: { authMode: 'community' } }))
vi.mock('@lib/i18n', () => ({
  t: (key: string) => key,
  tOr: (key: string) => key,
}))
vi.mock('@hooks/useAuth', () => ({
  useAuth: () => ({ gitlabToken: null, connectGitHub: vi.fn() }),
}))
vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1', name: 'workspace' } }),
  useConnectedRepos: () => ({ data: [], isSuccess: true, isLoading: false, isError: false }),
}))
vi.mock('@lib/engine', () => ({
  connectRepo: mocks.connectRepo,
  disconnectRepo: vi.fn(),
  getGitHubStatus: vi.fn(),
  getGitHubUserRepos: vi.fn(),
  saveOrgToken: vi.fn(),
}))
vi.mock('@lib/queryState', () => ({
  queryResolved: () => true,
  resolvedList: (data: unknown) => Array.isArray(data) ? data : [],
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}))
vi.mock('@atoms/GatedButton', () => ({
  GatedButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { action?: string }) => {
    const { action: _action, ...buttonProps } = props
    return <button {...buttonProps}>{children}</button>
  },
}))

import { RepoPickerModal } from './RepoPickerModal'

describe('RepoPickerModal community source flow', () => {
  beforeEach(() => {
    mocks.connectRepo.mockReset()
    mocks.connectRepo.mockResolvedValue({ id: 'repo-1' })
    mocks.invalidateQueries.mockReset()
    mocks.invalidateQueries.mockResolvedValue(undefined)
    mocks.onClose.mockReset()
  })

  it('connects a credential-free public repository without provider OAuth', async () => {
    render(<RepoPickerModal opened onClose={mocks.onClose} />)

    fireEvent.change(screen.getByLabelText('repoPicker.publicUrlLabel'), {
      target: { value: 'https://github.com/octocat/Hello-World.git' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'repoPicker.publicConnectAction' }))

    await waitFor(() => expect(mocks.connectRepo).toHaveBeenCalledWith('org-1', {
      provider: 'github',
      providerId: 'octocat/Hello-World',
      ownerName: 'octocat',
      repoName: 'Hello-World',
      fullName: 'octocat/Hello-World',
      defaultBranch: 'main',
      isPrivate: false,
      htmlUrl: 'https://github.com/octocat/Hello-World',
    }))
    await waitFor(() => expect(mocks.onClose).toHaveBeenCalledWith({ connected: 1 }))
  })

  it('rejects credential-bearing or unsupported repository URLs before mutation', async () => {
    render(<RepoPickerModal opened onClose={mocks.onClose} />)

    fireEvent.change(screen.getByLabelText('repoPicker.publicUrlLabel'), {
      target: { value: 'https://user:secret@example.com/org/repo' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'repoPicker.publicConnectAction' }))

    expect((await screen.findByRole('alert')).textContent).toContain('repoPicker.publicUrlInvalid')
    expect(mocks.connectRepo).not.toHaveBeenCalled()
  })
})
