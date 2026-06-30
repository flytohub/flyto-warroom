/**
 * FusionSourcesSection — Settings ▸ Integrations: the Evidence Fusion
 * connector control plane.
 *
 * Lists the org's wired fusion sources with per-source health (status, drift,
 * freshness), lets an operator add/upsert a connector (provider + mapping +
 * credential ref), and opens a per-connector health detail with the engine's
 * explainable mapping-drift assessment.
 *
 * This is DISTINCT from the source-control (GitHub/GitLab) integrations above
 * it and from the org-level integrations/health banner — it hits the
 * fusion-scoped /fusion/integrations endpoints that had no FE caller.
 *
 * Direct-import client (decoupling). Loading / empty / error all handled;
 * mutations toast + invalidate.
 */

import { useState } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import { Plus, Boxes, Activity } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

import { useOrg } from '@hooks/useOrg'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import {
  listFusionIntegrations,
  getFusionIntegrationHealth,
  type FusionIntegration,
} from '@lib/engine/fusion/fusion'
import EmptyStateGuide from '@atoms/EmptyStateGuide'
import { InlineErrorNotice } from '@atoms/InlineErrorNotice'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'

const sectionTitleSx = {
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  mb: 1.5,
  mt: 0.5,
}

/** Org-custom providers are namespaced "custom:<orgId>:<name>" — show just the
 *  human name segment instead of leaking the full id twice in the row. */
function prettyProvider(providerId: string): string {
  if (providerId.startsWith('custom:')) {
    const seg = providerId.split(':')[2] ?? providerId
    return seg.replace(/_/g, ' ')
  }
  return providerId
}

type StatusTone = 'success' | 'warning' | 'error' | 'default'

function statusTone(status: string): StatusTone {
  switch ((status || '').toLowerCase()) {
    case 'healthy':
    case 'ok':
      return 'success'
    case 'degraded':
    case 'stale':
      return 'warning'
    case 'down':
    case 'error':
      return 'error'
    default:
      return 'default'
  }
}

export interface FusionSourcesSectionProps {
  /** Opens the AddSourceWizard (owned by the parent tab). */
  onAdd?: () => void
}

export function FusionSourcesSection({ onAdd }: FusionSourcesSectionProps) {
  const { org } = useOrg()
  const orgId = org?.id

  const [healthFor, setHealthFor] = useState<FusionIntegration | null>(null)

  const listQ = useQuery({
    queryKey: qk.fusion.integrations(orgId),
    queryFn: () => listFusionIntegrations(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  })

  const healthQ = useQuery({
    queryKey: qk.fusion.integrationHealth(orgId, healthFor?.integrationId),
    queryFn: () => getFusionIntegrationHealth(orgId!, healthFor!.integrationId),
    enabled: !!orgId && !!healthFor,
    staleTime: 15_000,
  })

  const integrations = listQ.data?.integrations ?? []

  return (
    <Box sx={{ mb: 4 }}>
      <Box sx={sectionTitleSx}>
        <Boxes size={15} style={{ color: '#34d399', opacity: 0.9 }} />
        <Typography
          variant="subtitle2"
          color="text.secondary"
          sx={{
            fontWeight: 700,
            letterSpacing: '0.03em',
            textTransform: 'uppercase',
            fontSize: 12,
          }}
        >
          Evidence Fusion Sources
        </Typography>
        <Button
          size="small"
          startIcon={<Plus size={14} />}
          onClick={onAdd}
          disabled={!orgId || !onAdd}
          sx={{ ml: 'auto', textTransform: 'none', fontWeight: 600 }}
        >
          {t('integrations.addExternalSource')}
        </Button>
      </Box>

      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mb: 2, lineHeight: 1.5 }}
      >
        External scanners and data sources whose findings are fused into the
        unified CAASM posture. A source is a provider + certified mapping; trust
        tier is derived by the engine from the mapping.
      </Typography>

      {listQ.isLoading ? (
        <LoadingState variant="spinner" py={4} />
      ) : listQ.isError ? (
        <QueryError error={listQ.error} onRetry={listQ.refetch} label={t('integrations.fusionSources')} compact />
      ) : integrations.length === 0 ? (
        <EmptyStateGuide
          icon={<Boxes size={28} />}
          title={t('integrations.noFusionSourcesTitle')}
          description={t('integrations.noFusionSourcesDesc')}
          py={4}
        />
      ) : (
        <Stack spacing={1.25}>
          {integrations.map((it) => (
            <Box
              key={it.integrationId}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 2,
                p: 2,
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Box
                  sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}
                >
                  <Typography
                    variant="body2"
                    fontWeight={700}
                    color="text.primary"
                    sx={{ fontSize: 14 }}
                  >
                    {it.alias || it.providerId}
                  </Typography>
                  <Chip
                    size="small"
                    label={it.status || 'unknown'}
                    color={statusTone(it.status)}
                    sx={{ height: 22, fontSize: 12, fontWeight: 600 }}
                  />
                  {!it.enabled && (
                    <Chip
                      size="small"
                      label="disabled"
                      sx={{ height: 22, fontSize: 12 }}
                    />
                  )}
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {prettyProvider(it.providerId)} · {it.sourceSystemType || it.mappingId}
                  {' · '}
                  {it.trustTier === 'certified'
                    ? t('integrations.certified')
                    : it.trustTier === 'org_custom'
                      ? t('integrations.custom')
                      : (it.trustTier || 'untrusted')}
                  {' · '}{it.claimsWritten} {t('integrations.claims')}
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                startIcon={<Activity size={14} />}
                onClick={() => setHealthFor(it)}
                sx={{ textTransform: 'none', fontWeight: 600, flexShrink: 0 }}
              >
                Health
              </Button>
            </Box>
          ))}
        </Stack>
      )}

      {/* Per-connector health dialog */}
      <Dialog
        open={!!healthFor}
        onClose={() => setHealthFor(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {healthFor?.alias || healthFor?.providerId} · health
        </DialogTitle>
        <DialogContent dividers>
          {healthQ.isLoading ? (
            <LoadingState variant="spinner" py={3} />
          ) : healthQ.isError ? (
            <QueryError error={healthQ.error} onRetry={healthQ.refetch} label={t('integrations.sourceHealth')} compact />
          ) : healthQ.data ? (
            <Stack spacing={1.25}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip
                  size="small"
                  label={healthQ.data.integration.status || 'unknown'}
                  color={statusTone(healthQ.data.integration.status)}
                />
                <Chip
                  size="small"
                  variant="outlined"
                  label={`drift: ${healthQ.data.drift.level}`}
                  color={
                    healthQ.data.drift.level === 'ok' ? 'success' : 'warning'
                  }
                />
              </Box>
              <Typography variant="body2" color="text.secondary">
                {healthQ.data.integration.recordsIngested} records ·{' '}
                {healthQ.data.integration.claimsWritten} claims written
                {healthQ.data.integration.lastSuccessAt
                  ? ` · last success ${new Date(
                      healthQ.data.integration.lastSuccessAt,
                    ).toLocaleString()}`
                  : ' · never succeeded'}
              </Typography>
              {healthQ.data.integration.lastErrorClass && (
                <InlineErrorNotice
                  error={healthQ.data.integration.lastErrorClass}
                  title={t('integrations.sourceHealth')}
                />
              )}
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Mapping drift — fields missing{' '}
                  {healthQ.data.drift.fieldsMissing} · severity fallback{' '}
                  {healthQ.data.drift.severityFallback} · key missing{' '}
                  {healthQ.data.drift.keyMissing}
                </Typography>
              </Box>
              {(healthQ.data.drift.reasons ?? []).map((rsn, i) => (
                <Typography key={i} variant="caption" color="warning.main">
                  {rsn}
                </Typography>
              ))}
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setHealthFor(null)}
            sx={{ textTransform: 'none' }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
