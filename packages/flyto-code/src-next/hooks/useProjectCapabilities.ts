import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getProjectCapabilities, type ProjectCapabilitiesResponse } from '@lib/engine'
import { qk } from '@lib/queryKeys'

type ProjectActionAccess = NonNullable<ProjectCapabilitiesResponse['actions']>[string]

const BLOCKED_ACTION: ProjectActionAccess = {
  state: 'blocked',
  billing_behavior: 'blocked',
  reason: 'project_capability_required',
}

export interface ProjectCapabilityHelpers {
  data?: ProjectCapabilitiesResponse
  ready: boolean
  isLoading: boolean
  isError: boolean
  refetch: () => void
  canOpenPage: (page: string) => boolean
  canUseAction: (action: string) => boolean
  actionAccess: (action: string) => ProjectActionAccess | undefined
}

export function useProjectCapabilities(
  orgId: string | undefined,
  projectId: string | undefined = orgId,
): ProjectCapabilityHelpers {
  const enabled = !!orgId && !!projectId
  const q = useQuery({
    queryKey: qk.platform.projectCapabilities(orgId, projectId),
    queryFn: () => getProjectCapabilities(orgId!, projectId!),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
  const { data, isError, isFetching, isLoading, isSuccess, refetch } = q

  return useMemo<ProjectCapabilityHelpers>(() => {
    const ready = !enabled || isSuccess || isError
    const pages = data?.pages ?? {}
    const capabilities = data?.capabilities ?? {}
    const actions = data?.actions ?? {}
    return {
      data,
      ready,
      isLoading: isLoading || (isFetching && !data),
      isError,
      refetch: () => { void refetch() },
      canOpenPage: (page: string) => {
        if (!enabled || !page) return true
        if (!ready || isError) return false
        return pages[page] === true
      },
      canUseAction: (action: string) => {
        if (!enabled || !action) return true
        if (!ready || isError) return false
        const commercial = actions[action]
        if (commercial) return commercial.state === 'allowed'
        return capabilities[action] === true
      },
      actionAccess: (action: string) => {
        if (!enabled || !action) return undefined
        if (!ready || isError) return BLOCKED_ACTION
        if (actions[action]) return actions[action]
        if (capabilities[action] === true) return { state: 'allowed', billing_behavior: 'included' }
        return BLOCKED_ACTION
      },
    }
  }, [data, enabled, isError, isFetching, isLoading, isSuccess, refetch])
}
