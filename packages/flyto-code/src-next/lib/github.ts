/**
 * GitHub types + adapters.
 *
 * All GitHub API calls now go through the engine proxy (lib/engine/github.ts).
 * This file only contains type definitions and the repo adapter function
 * used by the repo picker.
 */

import type { Repository } from '@code/repository'
import type { GitHubRepo } from '@lib/engine/github'

/** Convert a GitHub repo payload into the neutral Repository shape.
 *  Accepts the loose GitHubRepo shape from the engine proxy; missing
 *  optional fields fall back to safe defaults. */
export function adaptGitHubRepo(raw: GitHubRepo): Repository {
  return {
    provider: 'github',
    providerId: String(raw.id),
    name: raw.name,
    fullName: raw.full_name,
    description: raw.description ?? null,
    owner: {
      login: raw.owner?.login ?? '',
      avatarUrl: raw.owner?.avatar_url ?? '',
      kind: raw.owner?.type === 'Organization' ? 'org' : 'user',
    },
    htmlUrl: raw.html_url ?? '',
    homepage: raw.homepage ?? null,
    defaultBranch: raw.default_branch ?? 'main',
    language: raw.language ?? null,
    isPrivate: raw.private ?? false,
  }
}

// ── Types used by CI/CD views (data comes from engine proxy) ──

export interface RepoPullRequest {
  number: number
  title: string
  html_url: string
  state: 'open' | 'closed'
  draft: boolean
  user: { login: string; avatar_url: string } | null
  created_at: string
  updated_at: string
  closed_at: string | null
  merged_at: string | null
  head: { ref: string }
  base: { ref: string }
  labels: Array<{ name: string; color: string }>
  comments: number
  additions?: number
  deletions?: number
  changed_files?: number
}

export interface WorkflowRun {
  id: number
  name: string
  display_title: string
  status: 'queued' | 'in_progress' | 'completed' | 'waiting' | 'requested'
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | 'neutral' | null
  workflow_id: number
  head_branch: string
  head_sha: string
  event: string
  created_at: string
  updated_at: string
  run_started_at: string
  html_url: string
  actor: { login: string; avatar_url: string }
  run_attempt: number
}

export interface PRFile {
  filename: string
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged'
  additions: number
  deletions: number
  changes: number
  patch?: string
}
