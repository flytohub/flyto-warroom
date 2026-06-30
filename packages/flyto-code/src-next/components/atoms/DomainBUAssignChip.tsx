import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listAttackSurface, type AttackSurfaceAsset } from '@lib/engine'
import { qk } from '@lib/queryKeys'
import { querySucceeded, resolvedList } from '@lib/queryState'
import { BUAssignChip } from './BUAssignChip'

// DomainBUAssignChip — wraps BUAssignChip for domain-anchored
// callers that know a hostname but not the underlying
// attack_surface asset_id. Same lookup pattern as
// DomainAssetTierPicker. Hidden until the attack_surface row
// exists (operator hasn't run discovery yet) — same posture as
// the tier picker.

export interface DomainBUAssignChipProps {
  orgId: string
  domain: string
}

export function DomainBUAssignChip({ orgId, domain }: DomainBUAssignChipProps) {
  const surfaceQ = useQuery({
    queryKey: qk.attackSurface(orgId),
    queryFn: () => listAttackSurface(orgId),
    staleTime: 60_000,
  })

  const match = useMemo<AttackSurfaceAsset | null>(() => {
    const assets = resolvedList(surfaceQ.data?.assets, surfaceQ, !!orgId)
    const norm = (s: string) => s.trim().toLowerCase()
    const target = norm(domain)
    return assets.find(a =>
      (a.asset_type === 'domain' || a.asset_type === 'subdomain') &&
      norm(a.value) === target
    ) ?? null
  }, [surfaceQ.data?.assets, surfaceQ, orgId, domain])

  if (!querySucceeded(surfaceQ, !!orgId) || !match) return null

  return (
    <BUAssignChip
      orgId={orgId}
      assetId={match.id}
      assetKind="attack_surface"
      currentBUID={(match as AttackSurfaceAsset & { business_unit_id?: string }).business_unit_id}
      invalidateOnChange={qk.attackSurface(orgId)}
    />
  )
}
