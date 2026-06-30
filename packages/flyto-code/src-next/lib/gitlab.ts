import { env } from './env'
import type { Repository } from '@code/repository'

export interface GitLabUser {
  id: number
  username: string
  name: string
  avatar_url: string
}

export interface GitLabProject {
  id: number
  name: string
  path: string
  path_with_namespace: string
  description: string | null
  default_branch: string | null
  visibility: 'private' | 'internal' | 'public'
  web_url: string
  namespace: {
    id: number
    name: string
    path: string
    kind: 'user' | 'group'
    avatar_url: string | null
    web_url: string
  }
}

export async function fetchGitLabUser(token: string): Promise<GitLabUser> {
  const res = await fetch(`${env.gitlabBaseUrl}/api/v4/user`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to fetch GitLab user')
  return res.json()
}

export async function fetchGitLabProjects(
  token: string,
  page = 1,
  perPage = 100,
): Promise<GitLabProject[]> {
  const res = await fetch(
    `${env.gitlabBaseUrl}/api/v4/projects?membership=true&order_by=updated_at&per_page=${perPage}&page=${page}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) throw new Error('Failed to fetch GitLab projects')
  return res.json()
}

/** Convert a GitLab project into the neutral Repository shape. */
export function adaptGitLabProject(p: GitLabProject, fallbackAvatar: string): Repository {
  const isGroup = p.namespace.kind === 'group'
  return {
    provider: 'gitlab',
    providerId: String(p.id),
    name: p.name,
    fullName: p.path_with_namespace,
    description: p.description,
    owner: {
      login: p.namespace.path,
      avatarUrl: p.namespace.avatar_url || fallbackAvatar,
      kind: isGroup ? 'org' : 'user',
    },
    htmlUrl: p.web_url,
    defaultBranch: p.default_branch || 'main',
    language: null,
    isPrivate: p.visibility !== 'public',
  }
}

// ── Groups (GitHub "orgs" equivalent) ──

export interface GitLabGroup {
  id: number
  name: string
  path: string
  full_path: string
  avatar_url: string | null
  web_url: string
}

/** Fetch all groups the user belongs to. */
export async function fetchGitLabGroups(token: string): Promise<GitLabGroup[]> {
  const res = await fetch(
    `${env.gitlabBaseUrl}/api/v4/groups?min_access_level=10&per_page=100`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) throw new Error('Failed to fetch GitLab groups')
  return res.json()
}

export interface GitLabMember {
  id: number
  username: string
  name: string
  avatar_url: string
  access_level: number
  state: string
}

/** Fetch all members of a GitLab group (all pages). */
export async function fetchGitLabGroupMembers(token: string, groupPath: string): Promise<GitLabMember[]> {
  const all: GitLabMember[] = []
  let page = 1
  while (true) {
    const res = await fetch(
      `${env.gitlabBaseUrl}/api/v4/groups/${encodeURIComponent(groupPath)}/members/all?per_page=100&page=${page}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) break  // may not have permission — fail silently
    const batch: GitLabMember[] = await res.json()
    all.push(...batch)
    if (batch.length < 100) break
    page++
  }
  return all
}

/** Fetch projects a specific user contributes to. */
export async function fetchGitLabMemberProjects(token: string, userId: number | string): Promise<GitLabProject[]> {
  const res = await fetch(
    `${env.gitlabBaseUrl}/api/v4/users/${userId}/projects?per_page=100&order_by=updated_at`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) return []
  return res.json()
}

// ── Project detail ──

export interface GitLabProjectDetail {
  description: string | null
  star_count: number
  forks_count: number
  open_issues_count: number
  topics: string[]
  last_activity_at: string
  default_branch: string | null
}

/** Fetch detailed info for a single project (by numeric id or "group/name"). */
export async function fetchGitLabProjectDetail(token: string, projectId: number | string): Promise<GitLabProjectDetail | null> {
  const res = await fetch(
    `${env.gitlabBaseUrl}/api/v4/projects/${encodeURIComponent(String(projectId))}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) return null
  return res.json()
}

// ── Pipelines (CI equivalent to GitHub Actions) ──

export interface GitLabPipelineStatus {
  conclusion: 'success' | 'failed' | 'canceled' | 'running' | 'pending' | 'skipped' | string
  name: string
  updatedAt: string
  htmlUrl: string
}

/** Fetch the latest completed pipeline for a project. */
export async function fetchGitLabCIStatus(token: string, projectId: number | string): Promise<GitLabPipelineStatus | null> {
  const res = await fetch(
    `${env.gitlabBaseUrl}/api/v4/projects/${encodeURIComponent(String(projectId))}/pipelines?per_page=1`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) return null
  const data: Array<{
    id: number; ref: string; status: string; updated_at: string; web_url: string
  }> = await res.json()
  const run = data[0]
  if (!run) return null
  return {
    conclusion: run.status,
    name: run.ref,
    updatedAt: run.updated_at,
    htmlUrl: run.web_url,
  }
}

// ── Merge Requests (PR equivalent) ──

export interface GitLabMR {
  title: string
  web_url: string
  author: { username: string; avatar_url: string }
  created_at: string
  updated_at: string
  merged_at: string | null
  state: 'opened' | 'merged' | 'closed' | 'locked'
  draft: boolean
  labels: string[]
  references: { full: string }
}

/** Fetch open MRs across all group projects. */
export async function fetchGroupMRs(token: string, groupPath: string, limit = 30): Promise<{ items: GitLabMR[]; total_count: number }> {
  const res = await fetch(
    `${env.gitlabBaseUrl}/api/v4/groups/${encodeURIComponent(groupPath)}/merge_requests?state=opened&order_by=updated_at&per_page=${limit}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) return { items: [], total_count: 0 }
  const items = (await res.json()) as GitLabMR[]
  return { items, total_count: items.length }
}

/** Fetch MRs merged in the last 7 days across a group. */
export async function fetchGroupMergedMRs(token: string, groupPath: string): Promise<{ items: GitLabMR[]; total_count: number }> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const res = await fetch(
    `${env.gitlabBaseUrl}/api/v4/groups/${encodeURIComponent(groupPath)}/merge_requests?state=merged&updated_after=${weekAgo}&per_page=100`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) return { items: [], total_count: 0 }
  const items = (await res.json()) as GitLabMR[]
  return { items, total_count: items.length }
}

/** Fetch open MRs authored by a specific user in a group. */
export async function fetchUserMRs(token: string, groupPath: string, username: string): Promise<{ items: GitLabMR[] }> {
  const res = await fetch(
    `${env.gitlabBaseUrl}/api/v4/groups/${encodeURIComponent(groupPath)}/merge_requests?state=opened&author_username=${encodeURIComponent(username)}&per_page=20`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) return { items: [] }
  const items = (await res.json()) as GitLabMR[]
  return { items }
}
