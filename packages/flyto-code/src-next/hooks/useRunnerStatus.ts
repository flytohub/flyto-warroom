/**
 * useRunnerStatus — polls /api/v1/code/orgs/{id}/runner-status during
 * an active campaign so the war room can show "N in flight" + token
 * headroom without parsing Prometheus metrics on the client.
 *
 * Intentionally opt-in via `enabled` so idle tabs don't generate
 * background traffic. Default polling cadence is 5 s (≈1× per round
 * on a balanced stealth profile).
 */

import { useQuery } from '@tanstack/react-query'
import { qk } from '@lib/queryKeys'
import { env } from '@lib/env'
import { authHeader } from '@lib/engine/client'

export interface RunnerStatus {
  reachable: boolean
  in_flight: number
  tokens: number
  bucket: number
  max_concurrent: number
  auth_on_runner: boolean
}

async function fetchRunnerStatus(orgId: string): Promise<RunnerStatus> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const bearer = await authHeader()
  if (bearer) headers['Authorization'] = bearer
  const res = await fetch(
    `${env.engineUrl}/api/v1/code/orgs/${orgId}/runner-status`,
    { method: 'GET', headers },
  )
  if (!res.ok) {
    // Engine degrades to 200+{reachable:false} on its own; any non-2xx
    // is a real auth/routing issue worth surfacing.
    throw new Error(`${res.status}`)
  }
  return res.json()
}

export function useRunnerStatus(orgId: string | null, enabled: boolean) {
  return useQuery<RunnerStatus>({
    queryKey: qk.pentest.runnerStatus(orgId),
    queryFn: () => fetchRunnerStatus(orgId!),
    enabled: !!orgId && enabled,
    refetchInterval: enabled ? 5000 : false,
    staleTime: 4000,
    retry: 1,
  })
}
