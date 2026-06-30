/**
 * DataLeaksView — first-class "Data Leaks" surface (Cyble-parity). The
 * HIBP breach-exposure data already existed but was buried as a tab inside
 * Posture Overview; this promotes it to its own page so leaked-credential
 * exposure is discoverable on its own, like a dedicated data-leaks product.
 *
 * Backed by GET /orgs/{id}/leak-exposure (real HIBP data). Reuses the
 * existing DarkWebTab renderer so there's a single source of truth.
 */
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { KeyRound } from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { getLeakExposure } from '@lib/engine'
import { qk } from '@lib/queryKeys'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'
import { t } from '@lib/i18n';
import { DarkWebTab } from './posture/DarkWebTab'

const BRAND = '#7c3aed'

export function DataLeaksView() {
  const { org } = useOrg()
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.exposure.leakExposure(org?.id),
    queryFn: () => getLeakExposure(org!.id),
    enabled: !!org?.id,
    staleTime: 5 * 60_000,
  })

  return (
    <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2, height: '100%', overflowY: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <KeyRound size={22} style={{ color: BRAND }} />
        <Box>
          <Typography component="h1" variant="h5" fontWeight={800}>{t('dataLeaks.title')}</Typography>
          <Typography variant="caption" color="text.secondary">
            {t('dataLeaks.subtitle')}
          </Typography>
        </Box>
      </Box>
      {/* Error must win over loading — DarkWebTab treats undefined data as a
          spinner, which would hang forever on a failed fetch. */}
      {isError ? (
        <QueryError error={error} onRetry={refetch} />
      ) : isLoading ? (
        <LoadingState variant="spinner" py={10} />
      ) : (
        <DarkWebTab data={data} />
      )}
    </Box>
  )
}
