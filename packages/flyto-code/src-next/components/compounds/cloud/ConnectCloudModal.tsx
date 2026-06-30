import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  Typography, IconButton, InputAdornment, Alert,
} from '@mui/material'
import { RefreshCw } from 'lucide-react'
import { useSnackbar } from 'notistack'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { connectCloudAccount, getCloudConnectorStatus } from '@lib/engine'

// ConnectCloudModal — AWS AssumeRole connector (POST /cloud/connections).
// AWS only today. The external_id is the confused-deputy guard; we generate
// one for the operator to paste into their IAM role trust policy. The engine
// seals it at rest. GCP/Azure are backend PR-4C — not offered here yet.

function newExternalId(): string {
  // Browser crypto; fall back to a timestamped token if unavailable.
  try {
    return `flyto-${crypto.randomUUID()}`
  } catch {
    return `flyto-${Math.random().toString(36).slice(2)}`
  }
}

export function ConnectCloudModal({ orgId, open, onClose }: {
  orgId: string
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()
  const [roleArn, setRoleArn] = useState('')
  const [region, setRegion] = useState('us-east-1')
  const [externalId, setExternalId] = useState(newExternalId)

  const statusQuery = useQuery({
    queryKey: qk.cloud.connectorStatus(orgId),
    queryFn: () => getCloudConnectorStatus(orgId),
    enabled: open && !!orgId,
    staleTime: 5 * 60_000,
  })
  const awsStatus = statusQuery.data?.providers.find(p => p.provider === 'aws')
  const awsOnboardingReady = awsStatus?.onboarding_supported === true

  const mut = useMutation({
    mutationFn: () => connectCloudAccount(orgId, {
      provider: 'aws',
      role_arn: roleArn.trim(),
      external_id: externalId.trim(),
      region: region.trim(),
    }),
    onSuccess: () => {
      enqueueSnackbar(t('cloud.connect.success'), { variant: 'success' })
      qc.invalidateQueries({ queryKey: qk.cloud.posture(orgId) })
      onClose()
    },
    onError: e => enqueueSnackbar(`${t('cloud.connect.failed')}: ${(e as Error).message}`, { variant: 'error' }),
  })

  const arnValid = /^arn:aws:iam::\d{12}:role\/.+/.test(roleArn.trim())

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>
        {t('cloud.connect.title')}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('cloud.connect.help')}
        </Typography>

        <TextField
          fullWidth size="small" sx={{ mb: 2 }}
          label={t('cloud.connect.roleArn')}
          placeholder="arn:aws:iam::123456789012:role/WarroomReadOnly"
          value={roleArn}
          onChange={e => setRoleArn(e.target.value)}
          error={roleArn.length > 0 && !arnValid}
          helperText={roleArn.length > 0 && !arnValid ? t('cloud.connect.arnInvalid') : ' '}
        />

        <TextField
          fullWidth size="small" sx={{ mb: 2 }}
          label={t('cloud.connect.externalId')}
          value={externalId}
          InputProps={{
            readOnly: true,
            endAdornment: (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setExternalId(newExternalId())} title={t('cloud.connect.regen')}>
                  <RefreshCw size={14} />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />

        <TextField
          fullWidth size="small"
          label={t('cloud.connect.region')}
          placeholder="us-east-1"
          value={region}
          onChange={e => setRegion(e.target.value)}
        />

        <Alert
          severity={statusQuery.isError || awsStatus?.onboarding_supported === false ? 'warning' : 'info'}
          variant="outlined"
          sx={{ mt: 2 }}
        >
          {t('cloud.connect.awsOnly')}
          {awsStatus?.reason ? ` ${awsStatus.reason}` : ''}
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button
          variant="contained"
          disabled={!arnValid || !region.trim() || mut.isPending || statusQuery.isLoading || !awsOnboardingReady}
          onClick={() => mut.mutate()}
        >
          {mut.isPending ? t('cloud.connect.connecting') : t('cloud.connect.connect')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
