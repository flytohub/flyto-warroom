/**
 * Neutral repository shape used across the picker and engine.
 * GitHub repos and GitLab projects are adapted into this form — no leaky
 * provider-specific field names (snake_case, "private", "path_with_namespace", etc).
 */

export type RepoProvider = 'github' | 'gitlab' | 'bitbucket'

export interface Repository {
  provider: RepoProvider
  /** Stringified numeric ID from the provider; what flyto-engine stores as `providerId`. */
  providerId: string
  name: string
  fullName: string
  description: string | null
  owner: {
    login: string
    avatarUrl: string
    kind: 'user' | 'org'
  }
  htmlUrl: string
  /** Optional deployment URL declared on the provider (GitHub `homepage`,
   *  GitLab `web_url`). Threaded through to the engine so it can
   *  auto-create a pentest project on the same domain — connecting
   *  one repo wires up code-side scans AND attack-surface discovery
   *  in a single click. */
  homepage?: string | null
  defaultBranch: string
  language: string | null
  isPrivate: boolean
}
