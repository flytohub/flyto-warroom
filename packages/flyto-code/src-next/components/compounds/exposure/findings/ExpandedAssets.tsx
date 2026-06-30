import { Box, Typography, Chip, Skeleton } from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { listFindingAssets, type AssetImportance, type FindingAsset } from '@lib/engine'
import { IMPORTANCE_TONE } from '@lib/tokens/severity'

// Multi-asset expansion rows shown under a Finding row. Extracted
// verbatim from FindingsView.tsx (behaviour-neutral split).

export function ExpandedAssets({ orgId, findingId }: { orgId: string; findingId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: qk.exposure.findingAssets(orgId, findingId),
    queryFn: () => listFindingAssets(orgId, findingId),
    staleTime: 60_000,
  })
  const assets = data?.assets ?? []

  return (
    <Box sx={{
      pl: 6, pr: 2, py: 1.5,
      bgcolor: 'action.hover',
      borderBottom: '1px solid', borderColor: 'divider',
    }}>
      <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', mb: 1, letterSpacing: '0.04em' }}>
        {t('findings.assetsAffected')} ({assets.length})
      </Typography>
      {isLoading && <Skeleton variant="text" height={20} />}
      {!isLoading && assets.length === 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          {t('findings.noChildAssets')}
        </Typography>
      )}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {assets.map(a => <AssetRow key={a.id} a={a} />)}
      </Box>
    </Box>
  )
}

function AssetRow({ a }: { a: FindingAsset }) {
  const impTone = (IMPORTANCE_TONE[(a.importance as AssetImportance) || ''] ?? IMPORTANCE_TONE['']).tone
  return (
    <Box sx={{
      display: 'grid', gridTemplateColumns: '1fr 90px 70px',
      gap: 1, alignItems: 'center',
      px: 1, py: 0.5,
      fontSize: 12,
    }}>
      <Typography sx={{ fontSize: 12, fontFamily: 'monospace' }}>{a.asset}</Typography>
      {a.importance ? (
        <Chip label={a.importance} size="small"
          sx={{ fontSize: 12, fontWeight: 600, bgcolor: `${impTone}1a`, color: impTone, textTransform: 'capitalize' }} />
      ) : <span />}
      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{a.country || '—'}</Typography>
    </Box>
  )
}
