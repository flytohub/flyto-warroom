import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import { PackageCheck, Play, ShieldCheck, BellRing, FileText, KeyRound, Plug, Boxes } from 'lucide-react'
import { useSnackbar } from 'notistack'

import { useOrg } from '@hooks/useOrg'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'
import {
  applyLaunchpadPack,
  dryRunLaunchpadPack,
  listLaunchpadPacks,
  type LaunchpadAction,
  type LaunchpadPack,
} from '@lib/engine/platform/launchpad'

const ACTION_ICON: Record<string, typeof ShieldCheck> = {
  role: ShieldCheck,
  notification_rule: BellRing,
  report_template: FileText,
  report_component: FileText,
  api_key_preset: KeyRound,
  connector_hint: Plug,
  org_module: Boxes,
}

function stateTone(state: string): 'success' | 'info' | 'warning' | 'default' {
  if (state === 'exists' || state === 'documented' || state === 'template') return 'info'
  if (state === 'update' || state === 'create_or_update') return 'warning'
  if (state === 'create') return 'success'
  return 'default'
}

export function AdminLaunchpadTab() {
  const { org } = useOrg()
  const orgId = org?.id
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()
  const [selectedPackId, setSelectedPackId] = useState<string>('')

  const packsQ = useQuery({
    queryKey: qk.platform.launchpadPacks(orgId),
    queryFn: () => listLaunchpadPacks(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const packs = packsQ.data?.packs ?? []
  const selectedPack = useMemo(
    () => packs.find((p) => p.id === selectedPackId) ?? packs[0],
    [packs, selectedPackId],
  )
  const packId = selectedPack?.id

  const planQ = useQuery({
    queryKey: qk.platform.launchpadPlan(orgId, packId),
    queryFn: () => dryRunLaunchpadPack(orgId!, packId!),
    enabled: !!orgId && !!packId,
    staleTime: 20_000,
  })

  const applyMut = useMutation({
    mutationFn: () => applyLaunchpadPack(orgId!, packId!),
    onSuccess: () => {
      enqueueSnackbar(t('launchpad.applied'), { variant: 'success' })
      qc.invalidateQueries({ queryKey: qk.platform.launchpadPlan(orgId, packId) })
      qc.invalidateQueries({ queryKey: qk.platform.rbacRoles() })
      qc.invalidateQueries({ queryKey: qk.platform.notificationRules() })
    },
    onError: (err) => enqueueSnackbar(String(err), { variant: 'error' }),
  })

  if (!orgId) {
    return <Alert severity="info">{t('launchpad.noOrg')}</Alert>
  }

  if (packsQ.isLoading) {
    return <LoadingState variant="spinner" py={6} />
  }

  if (packsQ.isError) {
    return <QueryError error={packsQ.error} onRetry={packsQ.refetch} label={t('launchpad.title')} compact />
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
          <PackageCheck size={17} style={{ color: '#22c55e' }} />
          <Typography variant="subtitle2" fontWeight={800}>
            {t('launchpad.title')}
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55, maxWidth: 920 }}>
          {t('launchpad.desc')}
        </Typography>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '320px 1fr' }, gap: 2 }}>
        <Stack spacing={1}>
          {packs.map((pack) => (
            <PackButton
              key={pack.id}
              pack={pack}
              active={pack.id === selectedPack?.id}
              onClick={() => setSelectedPackId(pack.id)}
            />
          ))}
        </Stack>

        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          {selectedPack ? (
            <>
              <Box sx={{ p: 2.25, display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle1" fontWeight={800}>{selectedPack.name}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.5 }}>
                    {selectedPack.description}
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.5 }}>
                    <Chip size="small" label={selectedPack.category} />
                    <Chip size="small" label={`${selectedPack.rolePresets.length} roles`} />
                    <Chip size="small" label={`${selectedPack.notificationRules.length} rules`} />
                    <Chip size="small" label={`${selectedPack.reportComponents.length} report widgets`} />
                  </Box>
                </Box>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<Play size={14} />}
                  disabled={applyMut.isPending || planQ.isLoading}
                  onClick={() => applyMut.mutate()}
                  sx={{ textTransform: 'none', fontWeight: 700, bgcolor: '#16a34a', '&:hover': { bgcolor: '#15803d' } }}
                >
                  {applyMut.isPending ? t('common.saving') : t('launchpad.apply')}
                </Button>
              </Box>
              <Divider />
              {planQ.isLoading ? (
                <LoadingState variant="spinner" py={4} />
              ) : planQ.isError ? (
                <Box sx={{ m: 2 }}>
                  <QueryError error={planQ.error} onRetry={planQ.refetch} label={t('launchpad.title')} compact />
                </Box>
              ) : (
                <ActionList actions={planQ.data?.actions ?? []} />
              )}
            </>
          ) : (
            <Box sx={{ p: 3 }}>
              <Typography variant="body2" color="text.secondary">{t('launchpad.empty')}</Typography>
            </Box>
          )}
        </Paper>
      </Box>
    </Box>
  )
}

function PackButton({ pack, active, onClick }: { pack: LaunchpadPack; active: boolean; onClick: () => void }) {
  return (
    <Button
      onClick={onClick}
      variant={active ? 'contained' : 'outlined'}
      fullWidth
      sx={{
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
        textAlign: 'left',
        textTransform: 'none',
        p: 1.5,
        borderRadius: 1.5,
        bgcolor: active ? '#0f766e' : 'transparent',
        '&:hover': { bgcolor: active ? '#115e59' : 'action.hover' },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={800}>{pack.name}</Typography>
        <Typography variant="caption" sx={{ display: 'block', mt: 0.25, opacity: active ? 0.88 : 0.7, lineHeight: 1.35 }}>
          {pack.description}
        </Typography>
      </Box>
    </Button>
  )
}

function ActionList({ actions }: { actions: LaunchpadAction[] }) {
  if (!actions.length) {
    return <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>{t('launchpad.noActions')}</Typography>
  }
  return (
    <Stack spacing={0} divider={<Divider flexItem />}>
      {actions.map((action, idx) => {
        const Icon = ACTION_ICON[action.kind] ?? PackageCheck
        return (
          <Box key={`${action.kind}-${action.target}-${idx}`} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', p: 1.5 }}>
            <Box sx={{ width: 28, height: 28, borderRadius: 1.25, display: 'grid', placeItems: 'center', bgcolor: 'action.hover', flexShrink: 0 }}>
              <Icon size={15} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="body2" fontWeight={700}>{action.target}</Typography>
                <Chip size="small" color={stateTone(action.state)} label={action.state.replace(/_/g, ' ')} sx={{ height: 21, fontSize: 12 }} />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, lineHeight: 1.4 }}>
                {action.kind.replace(/_/g, ' ')} · {action.summary}
              </Typography>
            </Box>
          </Box>
        )
      })}
    </Stack>
  )
}
