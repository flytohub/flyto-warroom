/**
 * GitHub proxy — all GitHub API calls go through the engine.
 * Frontend no longer stores the GitHub token.
 *
 * The response shapes below cover the fields actually consumed by
 * the UI; passthrough fields from the GitHub REST API land in
 * `[k: string]: unknown` so untyped extras don't break compile.
 */

import { request } from './client'

export interface GitHubUser {
  login: string
  avatar_url?: string
  [k: string]: unknown
}

export interface GitHubLabel {
  name: string
  color: string
}

export interface GitHubPullRequest {
  title: string
  html_url: string
  user?: GitHubUser
  repository_url?: string
  created_at: string
  updated_at: string
  draft?: boolean
  labels?: GitHubLabel[]
  [k: string]: unknown
}

export interface GitHubWorkflowRun {
  id: number
  name?: string
  status?: string
  conclusion?: string | null
  html_url?: string
  created_at?: string
  [k: string]: unknown
}

export interface GitHubPRFile {
  filename: string
  status?: string
  additions?: number
  deletions?: number
  changes?: number
  [k: string]: unknown
}

export interface GitHubOrgMember {
  login: string
  id: number
  avatar_url?: string
  html_url?: string
  role?: string
  site_admin?: boolean
  [k: string]: unknown
}

export interface GitHubOrg {
  login: string
  id: number
  avatar_url?: string
  description?: string | null
  [k: string]: unknown
}

export interface GitHubRepoOwner {
  login: string
  avatar_url?: string
  type?: string
  [k: string]: unknown
}

export interface GitHubRepo {
  id: number
  name: string
  full_name: string
  private?: boolean
  description?: string | null
  html_url?: string
  default_branch?: string
  language?: string | null
  stargazers_count?: number
  forks_count?: number
  homepage?: string | null
  owner?: GitHubRepoOwner
  [k: string]: unknown
}

export function getGitHubStatus(orgId: string) {
  return request<{ connected: boolean; login: string }>('GET', `/api/v1/code/orgs/${orgId}/github/status`)
}

export function getGitHubRepoDetail(orgId: string, owner: string, repo: string) {
  return request<{
    stars: number; forks: number; openIssues: number;
    language: string; description: string; private: boolean;
    archived: boolean; updatedAt: string;
    ci: { conclusion: string; htmlUrl: string; name: string; createdAt: string } | null;
  }>('GET', `/api/v1/code/orgs/${orgId}/github/repos/${owner}/${repo}`)
}

export function getGitHubPRActivity(orgId: string, orgLogin: string) {
  return request<{
    open_count: number; merged_this_week: number;
    open_prs: GitHubPullRequest[]; stale_count: number; avg_age_days: number;
    analysis: { pr_velocity: number; stale_ratio: number; health: string };
  }>('GET', `/api/v1/code/orgs/${orgId}/github/pr-activity?org_login=${orgLogin}`)
}

export function getGitHubWorkflowRuns(orgId: string, owner: string, repo: string, perPage = 20) {
  return request<{
    total_count: number; workflow_runs: GitHubWorkflowRun[];
    analysis: { pass_rate: number; pass_count: number; fail_count: number; health: string };
  }>('GET', `/api/v1/code/orgs/${orgId}/github/repos/${owner}/${repo}/runs?per_page=${perPage}`)
}

export function getGitHubPRFiles(orgId: string, owner: string, repo: string, num: number) {
  return request<{ files: GitHubPRFile[]; count: number }>('GET', `/api/v1/code/orgs/${orgId}/github/repos/${owner}/${repo}/pulls/${num}/files`)
}

export function getGitHubOrgMembers(orgId: string, orgLogin: string) {
  return request<{ members: GitHubOrgMember[]; count: number }>('GET', `/api/v1/code/orgs/${orgId}/github/members?org_login=${orgLogin}`)
}

export function getGitHubUserOrgs(orgId: string) {
  return request<{ orgs: GitHubOrg[] }>('GET', `/api/v1/code/orgs/${orgId}/github/user-orgs`)
}

export function getGitHubUserRepos(orgId: string, perPage = 100, page = 1) {
  return request<{ repos: GitHubRepo[] }>('GET', `/api/v1/code/orgs/${orgId}/github/user-repos?per_page=${perPage}&page=${page}`)
}

export function getGitHubRepoPulls(orgId: string, owner: string, repo: string, state = 'all', perPage = 30) {
  return request<{ pulls: GitHubPullRequest[] }>('GET', `/api/v1/code/orgs/${orgId}/github/repos/${owner}/${repo}/pulls?state=${state}&per_page=${perPage}`)
}
