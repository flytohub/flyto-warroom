import { useState, useEffect } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Switch from '@mui/material/Switch'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import { ShieldCheck, Ban, AlertTriangle, FileWarning, Lock, Save } from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCIPolicy, updateCIPolicy } from '@lib/engine'
import { LoadingState } from '@atoms/LoadingState'
import InlineErrorNotice from '@atoms/InlineErrorNotice'
import { QueryError } from '@atoms/QueryError'
import { sectionTitleSx, accentCardSx, rowSx, iconBoxSx, selectSx, switchSx } from './shared'

type CIBlockOn = 'none' | 'block_critical' | 'block_high' | 'block_medium'

function normalizeBlockOn(value?: string): CIBlockOn {
  switch (value) {
    case 'critical':
    case 'block_critical':
      return 'block_critical'
    case 'high':
    case 'block_high':
      return 'block_high'
    case 'medium':
    case 'block_medium':
      return 'block_medium'
    case 'none':
    default:
      return 'none'
  }
}

export function CIGateTab() {
  const { org } = useOrg()
  const qc = useQueryClient()

  const { data: policy, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.platform.ciPolicy(org?.id),
    queryFn: () => getCIPolicy(org!.id),
    enabled: !!org,
    staleTime: 60_000,
  })

  const [blockOn, setBlockOn] = useState<CIBlockOn>('none')
  const [failOnLicense, setFailOnLicense] = useState(false)
  const [failOnSecret, setFailOnSecret] = useState(false)
  const [failOnIac, setFailOnIac] = useState(false)
  const [requireScan, setRequireScan] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (policy) {
      setBlockOn(normalizeBlockOn(policy.block_on))
      setFailOnLicense(policy.fail_on_license)
      setFailOnSecret(policy.fail_on_secret)
      setFailOnIac(policy.fail_on_iac_critical)
      setRequireScan(policy.require_scan)
    }
  }, [policy])

  const mutation = useMutation({
    mutationFn: () => updateCIPolicy(org!.id, {
      block_on: blockOn,
      fail_on_license: failOnLicense,
      fail_on_secret: failOnSecret,
      fail_on_iac_critical: failOnIac,
      require_scan: requireScan,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.platform.ciPolicy(org?.id) })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  if (isLoading) {
    return <LoadingState variant="spinner" py={6} />
  }

  if (isError) {
    return <QueryError error={error} onRetry={refetch} label={t('settings.ciGate.title')} compact />
  }

  return (
    <>
      <Box sx={sectionTitleSx}>
        <ShieldCheck size={15} style={{ color: '#a78bfa', opacity: 0.9 }} />
        <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', fontSize: 12 }}>
          {t('settings.ciGate.title')}
        </Typography>
      </Box>

      <Box sx={accentCardSx('#ef4444')}>
        {/* Block on severity */}
        <Box sx={rowSx}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
            <Box sx={iconBoxSx('#ef4444')}>
              <Ban size={15} style={{ color: '#ef4444' }} />
            </Box>
            <Box>
              <Typography variant="body2" fontWeight={600} color="text.primary">
                {t('settings.ciGate.blockOn')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.25, lineHeight: 1.4 }}>
                {t('settings.ciGate.blockOnDesc')}
              </Typography>
            </Box>
          </Box>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <Select value={blockOn} onChange={e => setBlockOn(normalizeBlockOn(String(e.target.value)))} size="small" sx={selectSx}>
              <MenuItem value="none">{t('settings.ciGate.none')}</MenuItem>
              <MenuItem value="block_critical">{t('settings.ciGate.critical')}</MenuItem>
              <MenuItem value="block_high">{t('settings.ciGate.high')}</MenuItem>
              <MenuItem value="block_medium">{t('settings.ciGate.medium')}</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {/* Fail on license */}
        <Box sx={rowSx}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
            <Box sx={iconBoxSx('#fb923c')}>
              <FileWarning size={15} style={{ color: '#fb923c' }} />
            </Box>
            <Box>
              <Typography variant="body2" fontWeight={600} color="text.primary">
                {t('settings.ciGate.failOnLicense')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.25, lineHeight: 1.4 }}>
                {t('settings.ciGate.failOnLicenseDesc')}
              </Typography>
            </Box>
          </Box>
          <Switch size="small" checked={failOnLicense} onChange={e => setFailOnLicense(e.target.checked)} sx={switchSx} />
        </Box>

        {/* Fail on secrets */}
        <Box sx={rowSx}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
            <Box sx={iconBoxSx('#ef4444')}>
              <Lock size={15} style={{ color: '#ef4444' }} />
            </Box>
            <Box>
              <Typography variant="body2" fontWeight={600} color="text.primary">
                {t('settings.ciGate.failOnSecret')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.25, lineHeight: 1.4 }}>
                {t('settings.ciGate.failOnSecretDesc')}
              </Typography>
            </Box>
          </Box>
          <Switch size="small" checked={failOnSecret} onChange={e => setFailOnSecret(e.target.checked)} sx={switchSx} />
        </Box>

        {/* Fail on IaC critical */}
        <Box sx={rowSx}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
            <Box sx={iconBoxSx('#38bdf8')}>
              <AlertTriangle size={15} style={{ color: '#38bdf8' }} />
            </Box>
            <Box>
              <Typography variant="body2" fontWeight={600} color="text.primary">
                {t('settings.ciGate.failOnIac')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.25, lineHeight: 1.4 }}>
                {t('settings.ciGate.failOnIacDesc')}
              </Typography>
            </Box>
          </Box>
          <Switch size="small" checked={failOnIac} onChange={e => setFailOnIac(e.target.checked)} sx={switchSx} />
        </Box>

        {/* Require scan */}
        <Box sx={rowSx}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
            <Box sx={iconBoxSx('#34d399')}>
              <ShieldCheck size={15} style={{ color: '#34d399' }} />
            </Box>
            <Box>
              <Typography variant="body2" fontWeight={600} color="text.primary">
                {t('settings.ciGate.requireScan')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.25, lineHeight: 1.4 }}>
                {t('settings.ciGate.requireScanDesc')}
              </Typography>
            </Box>
          </Box>
          <Switch size="small" checked={requireScan} onChange={e => setRequireScan(e.target.checked)} sx={switchSx} />
        </Box>
      </Box>

      {/* Save */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, alignItems: 'center' }}>
        {saved && (
          <Alert severity="success" sx={{ py: 0, borderRadius: 2 }}>
            {t('settings.ciGate.saved')}
          </Alert>
        )}
        {mutation.isError && (
          <InlineErrorNotice error={mutation.error} title={t('settings.ciGate.error')} />
        )}
        <Button
          variant="contained"
          size="small"
          startIcon={<Save size={14} />}
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          sx={{
            textTransform: 'none',
            fontWeight: 700,
            borderRadius: 2,
            px: 3,
            background: 'linear-gradient(135deg, #a78bfa, #8b5cf6)', boxShadow: 'none',
            '&:hover': { background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', boxShadow: 'none' },
          }}
        >
          {mutation.isPending ? t('settings.ciGate.saving') : t('settings.ciGate.save')}
        </Button>
      </Box>
    </>
  )
}
