import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listAttackSurface, type AttackSurfaceAsset } from '@lib/engine'
import { qk } from '@lib/queryKeys'
import { ComplianceScopePicker } from './ComplianceScopePicker'

// DomainComplianceScopePicker — wraps ComplianceScopePicker for
// callers that have only a domain string (DomainDetail, Domain
// Intel rows). Resolves the attack_surface row via the per-org
// cached `listAttackSurface` query and forwards. When no row
// exists yet, renders nothing (the parent already shows the
// "Discover to tag" hint via DomainAssetTierPicker).

export interface DomainComplianceScopePickerProps {
  orgId: string
  domain: string
  readonly?: boolean
  compact?: boolean
}

export function DomainComplianceScopePicker({
  orgId, domain, readonly, compact,
}: DomainComplianceScopePickerProps) {
  const surfaceQ = useQuery({
    queryKey: qk.attackSurface(orgId),
    queryFn: () => listAttackSurface(orgId),
    staleTime: 60_000,
  })

  const match = useMemo<AttackSurfaceAsset | null>(() => {
    const assets = surfaceQ.data?.assets ?? []
    const norm = (s: string) => s.trim().toLowerCase()
    const target = norm(domain)
    const m = assets.find(a =>
      (a.asset_type === 'domain' || a.asset_type === 'subdomain') &&
      norm(a.value) === target
    )
    return m ?? null
  }, [surfaceQ.data, domain])

  if (!match) return null

  return (
    <ComplianceScopePicker
      target="asset"
      orgId={orgId}
      id={match.id}
      value={match.compliance_scope}
      readonly={readonly}
      compact={compact}
    />
  )
}
