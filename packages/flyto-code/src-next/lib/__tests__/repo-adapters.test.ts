/**
 * Unit tests for the GitHub + GitLab → neutral Repository adapters.
 *
 * The adapters are the only place where provider-specific shapes touch
 * the rest of the app. Any drift (missing field, owner kind misclassified,
 * private/internal collapsed wrong) silently corrupts every downstream
 * view that reads Repository — repo picker, repo list, war-room cards.
 */
import { describe, it, expect } from 'vitest'
import { adaptGitHubRepo } from '../github'
import { adaptGitLabProject, type GitLabProject } from '../gitlab'

describe('adaptGitHubRepo', () => {
  it('maps a personal-account public repo with all fields populated', () => {
    const out = adaptGitHubRepo({
      id: 42,
      name: 'flyto-code',
      full_name: 'chester/flyto-code',
      description: 'Code intel war room',
      owner: { login: 'chester', avatar_url: 'https://avatar/c', type: 'User' },
      html_url: 'https://github.com/chester/flyto-code',
      default_branch: 'main',
      language: 'TypeScript',
      private: false,
    })
    expect(out).toEqual({
      provider: 'github',
      providerId: '42',
      name: 'flyto-code',
      fullName: 'chester/flyto-code',
      description: 'Code intel war room',
      owner: { login: 'chester', avatarUrl: 'https://avatar/c', kind: 'user' },
      htmlUrl: 'https://github.com/chester/flyto-code',
      // `homepage` added to the adapter to support auto-creating
      // pentest projects from a repo's marketing URL — see
      // correlate-engine homepage backfill. The raw fixture omits it
      // so the adapter falls back to null.
      homepage: null,
      defaultBranch: 'main',
      language: 'TypeScript',
      isPrivate: false,
    })
  })

  it('classifies an org-owned repo as kind=org', () => {
    const out = adaptGitHubRepo({
      id: 99, name: 'flyto-engine', full_name: 'flytohub/flyto-engine',
      description: null,
      owner: { login: 'flytohub', avatar_url: 'a', type: 'Organization' },
      html_url: 'https://github.com/flytohub/flyto-engine',
      default_branch: 'main', language: null, private: true,
    })
    expect(out.owner.kind).toBe('org')
    expect(out.isPrivate).toBe(true)
    expect(out.language).toBeNull()
    expect(out.description).toBeNull()
  })

  it('falls back to user kind when owner.type is missing', () => {
    const out = adaptGitHubRepo({
      id: 1, name: 'x', full_name: 'a/x', description: null,
      owner: { login: 'a', avatar_url: 'a' }, // no type
      html_url: 'h', default_branch: 'main', language: null, private: false,
    })
    expect(out.owner.kind).toBe('user')
  })

  it('coerces numeric id to string', () => {
    const out = adaptGitHubRepo({
      id: 9_999_999_999, name: 'x', full_name: 'a/x', description: null,
      owner: { login: 'a', avatar_url: 'a', type: 'User' },
      html_url: 'h', default_branch: 'main', language: null, private: false,
    })
    expect(out.providerId).toBe('9999999999')
    expect(typeof out.providerId).toBe('string')
  })
})

describe('adaptGitLabProject', () => {
  function makeProject(overrides: Partial<GitLabProject> = {}): GitLabProject {
    return {
      id: 7,
      name: 'flyto-runner',
      path: 'flyto-runner',
      path_with_namespace: 'flytohub/flyto-runner',
      description: 'Sandbox runner',
      default_branch: 'main',
      visibility: 'private',
      web_url: 'https://gitlab.com/flytohub/flyto-runner',
      namespace: {
        id: 11, name: 'flytohub', path: 'flytohub', kind: 'group',
        avatar_url: 'https://gitlab.com/flytohub.png',
        web_url: 'https://gitlab.com/flytohub',
      },
      ...overrides,
    }
  }

  it('maps a group project with avatar to kind=org', () => {
    const out = adaptGitLabProject(makeProject(), 'fallback.png')
    expect(out).toEqual({
      provider: 'gitlab',
      providerId: '7',
      name: 'flyto-runner',
      fullName: 'flytohub/flyto-runner',
      description: 'Sandbox runner',
      owner: {
        login: 'flytohub',
        avatarUrl: 'https://gitlab.com/flytohub.png',
        kind: 'org',
      },
      htmlUrl: 'https://gitlab.com/flytohub/flyto-runner',
      defaultBranch: 'main',
      language: null,
      isPrivate: true,
    })
  })

  it('maps a user project as kind=user', () => {
    const out = adaptGitLabProject(
      makeProject({
        namespace: {
          id: 1, name: 'chester', path: 'chester', kind: 'user',
          avatar_url: null, web_url: 'https://gitlab.com/chester',
        },
      }),
      'fallback.png',
    )
    expect(out.owner.kind).toBe('user')
    // Falls back to caller-supplied avatar when namespace has none
    expect(out.owner.avatarUrl).toBe('fallback.png')
  })

  it('treats internal visibility as private (only public is "not private")', () => {
    expect(adaptGitLabProject(makeProject({ visibility: 'public' }), 'a').isPrivate).toBe(false)
    expect(adaptGitLabProject(makeProject({ visibility: 'private' }), 'a').isPrivate).toBe(true)
    expect(adaptGitLabProject(makeProject({ visibility: 'internal' }), 'a').isPrivate).toBe(true)
  })

  it('falls back default_branch to "main" when GitLab returns null', () => {
    const out = adaptGitLabProject(makeProject({ default_branch: null }), 'a')
    expect(out.defaultBranch).toBe('main')
  })

  it('language is always null — GitLab API does not return it on the project shape', () => {
    expect(adaptGitLabProject(makeProject(), 'a').language).toBeNull()
  })
})
