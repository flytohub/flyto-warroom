import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Chip, Tooltip } from '@mui/material'
import { Network } from 'lucide-react'
import { listAttackSurface, type AttackSurfaceAsset } from '@lib/engine'
import { qk } from '@lib/queryKeys'
import { AssetTierPicker } from './AssetTierPicker'
import { colors, softBg } from '@/styles/designTokens'
import { t } from '@lib/i18n';

// DomainAssetTierPicker — wraps AssetTierPicker for callers that
// know a domain string but NOT the underlying attack_surface
// asset_id. Resolves the asset row via a cached `listAttackSurface`
// query and forwards the rest of the props.
//
// Why this wrapper exists: DomainDetail / DomainTable have
// `row.domain` but never plumbed `row.attackSurfaceId` through the
// enrichment pipeline. Rather than refactor buildDomainRows, we
// look up here — the query is cached per-org so all domain rows
// share one request, and ParaFlex-time loading just hides the
// chip (no flash of incorrect state).

export interface DomainAssetTierPickerProps {
  orgId: string
  domain: string
  readonly?: boolean
}

export function DomainAssetTierPicker({ orgId, domain, readonly }: DomainAssetTierPickerProps) {
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

  // No matching row yet — surface an informational chip explaining
  // WHY the picker is missing rather than silently rendering
  // nothing. The previous silent-fallback caused operators to
  // wonder why one domain had a tier control and another didn't;
  // this version says "needs discovery first, click Discover on
  // Domains page".
  if (!match) {
    if (surfaceQ.isLoading) {
      return (
        <Chip
          size="small"
          label={t('tier.loading')}
          sx={{
            height: 22, fontSize: 13, fontWeight: 600,
            bgcolor: softBg(colors.semantic.neutral, 0.16),
            color: colors.semantic.neutral,
          }}
        />
      )
    }
    return (
      <Tooltip title={t('tier.discoveryRequiredHint')}>
        <Chip
          size="small"
          icon={<Network size={11} />}
          label={t('tier.discoveryRequired')}
          sx={{
            height: 22, fontSize: 13, fontWeight: 600,
            bgcolor: softBg(colors.semantic.neutral, 0.14),
            color: colors.semantic.neutral,
            cursor: 'help',
            '& .MuiChip-icon': { ml: 0.5, color: colors.semantic.neutral },
          }}
        />
      </Tooltip>
    )
  }

  return (
    <AssetTierPicker
      target="asset"
      orgId={orgId}
      id={match.id}
      tier={match.asset_tier}
      readonly={readonly}
    />
  )
}
