import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSnackbar } from 'notistack'
import {
  Box, Typography, Alert, Chip, Button, TextField, FormControlLabel, Switch,
} from '@mui/material'
import { Lock } from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'
import { listSAMLConfigs, upsertSAMLConfig, type SAMLConfig } from '@lib/engine/system/sso'

// SSOTab — per-org SAML 2.0 SSO config. Wires system/sso/saml GET + POST.
// Platform-admin gated (system:sso:read/write). Stores only PUBLIC IdP metadata
// + the public signing cert (PEM); the backend rejects a private-key PEM.

export function SSOTab() {
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()
  const { org } = useOrg()
  const orgId = org?.id

  const q = useQuery({
    queryKey: qk.platform.samlConfig(orgId),
    queryFn: () => listSAMLConfigs(orgId),
    enabled: !!orgId,
    staleTime: 30_000,
  })

  const existing: SAMLConfig | undefined = q.data?.configs?.[0]

  const [enabled, setEnabled] = useState(false)
  const [idpEntityId, setIdpEntityId] = useState('')
  const [idpSsoUrl, setIdpSsoUrl] = useState('')
  const [idpCert, setIdpCert] = useState('')
  const [spEntityId, setSpEntityId] = useState('')
  const [spAcsUrl, setSpAcsUrl] = useState('')

  // Hydrate the form once the stored config loads.
  useEffect(() => {
    if (existing) {
      setEnabled(existing.enabled)
      setIdpEntityId(existing.idp_entity_id)
      setIdpSsoUrl(existing.idp_sso_url)
      setIdpCert(existing.idp_certificate)
      setSpEntityId(existing.sp_entity_id)
      setSpAcsUrl(existing.sp_acs_url)
    }
  }, [existing])

  const saveMut = useMutation({
    mutationFn: () => upsertSAMLConfig({
      org_id: orgId!,
      enabled,
      idp_entity_id: idpEntityId.trim(),
      idp_sso_url: idpSsoUrl.trim(),
      idp_certificate: idpCert.trim(),
      sp_entity_id: spEntityId.trim(),
      sp_acs_url: spAcsUrl.trim(),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.platform.samlConfig(orgId) })
      enqueueSnackbar(t('sys.sso.saved'), { variant: 'success' })
    },
    onError: (e) => enqueueSnackbar(String(e as Error), { variant: 'error' }),
  })

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2, fontSize: 13 }}>
        {t('sys.sso.intro')}
      </Alert>

      {q.isLoading && <LoadingState variant="spinner" py={4} />}
      {q.isError && <QueryError error={q.error} onRetry={q.refetch} label={t('sys.sso.title')} compact />}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Lock size={16} style={{ color: '#a78bfa' }} />
        <Typography variant="subtitle2" fontWeight={700}>{t('sys.sso.title')}</Typography>
        {existing && (
          <Chip size="small" label={existing.enabled ? 'enabled' : 'disabled'}
            sx={{ height: 20, fontSize: 12, fontWeight: 700,
              bgcolor: existing.enabled ? 'rgba(34,197,94,0.18)' : 'rgba(148,163,184,0.18)',
              color: existing.enabled ? '#22c55e' : '#94a3b8' }} />
        )}
      </Box>

      <FormControlLabel
        control={<Switch checked={enabled} onChange={(_e, v) => setEnabled(v)} />}
        label={t('sys.sso.enable')}
        sx={{ mb: 2, display: 'block' }} />

      <TextField size="small" fullWidth label={t('sys.sso.idpEntityId')} sx={{ mb: 2 }}
        value={idpEntityId} onChange={e => setIdpEntityId(e.target.value)} />
      <TextField size="small" fullWidth label={t('sys.sso.idpSsoUrl')} sx={{ mb: 2 }}
        value={idpSsoUrl} onChange={e => setIdpSsoUrl(e.target.value)} placeholder="https://idp.example.com/sso" />
      <TextField size="small" fullWidth multiline minRows={3} label={t('sys.sso.idpCert')} sx={{ mb: 2 }}
        value={idpCert} onChange={e => setIdpCert(e.target.value)} placeholder="-----BEGIN CERTIFICATE-----"
        helperText={t('sys.sso.certHelp')} />
      <TextField size="small" fullWidth label={t('sys.sso.spEntityId')} sx={{ mb: 2 }}
        value={spEntityId} onChange={e => setSpEntityId(e.target.value)} />
      <TextField size="small" fullWidth label={t('sys.sso.spAcsUrl')} sx={{ mb: 2 }}
        value={spAcsUrl} onChange={e => setSpAcsUrl(e.target.value)} />

      <Button size="small" variant="contained"
        disabled={!orgId || saveMut.isPending}
        onClick={() => saveMut.mutate()}
        sx={{ textTransform: 'none', bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}>
        {saveMut.isPending ? t('common.saving') : t('sys.sso.save')}
      </Button>
    </Box>
  )
}
