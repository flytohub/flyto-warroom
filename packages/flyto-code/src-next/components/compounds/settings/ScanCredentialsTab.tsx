import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSnackbar } from 'notistack'
import {
  Box, Typography, Button, TextField, MenuItem, Alert, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton,
} from '@mui/material'
import { KeyRound, Plus, Trash2, ShieldCheck } from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { EmptyStateGuide } from '@components/atoms/EmptyStateGuide'
import { LoadingState } from '@components/atoms/LoadingState'
import { QueryError } from '@components/atoms/QueryError'
import {
  listScanCredentials, upsertScanCredential, deleteScanCredential,
  type ScanCredential, type CredentialKind,
} from '@lib/engine'

// ScanCredentialsTab — encrypted secrets for authenticated DAST.
// Plaintext goes ONE WAY: POST body → backend Seal → DB. Never
// returned on subsequent reads (backend strips envelope). Even
// the UI doesn't keep plaintext in component state past the
// submit — we clear it immediately.

const KIND_LABELS: Record<CredentialKind, string> = {
  cookie: 'Cookie header (e.g. sid=xxx; csrf=yyy)',
  bearer: 'Bearer token (Authorization header)',
  oauth_flow: 'OAuth client flow (future)',
}

export function ScanCredentialsTab() {
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()
  const { org } = useOrg()
  const orgId = org?.id
  const [addOpen, setAddOpen] = useState(false)
  const [assetID, setAssetID] = useState('')
  const [kind, setKind] = useState<CredentialKind>('cookie')
  const [plaintext, setPlaintext] = useState('')
  const [label, setLabel] = useState('')
  const [expires, setExpires] = useState<number>(168) // 1 week default

  const q = useQuery({
    queryKey: qk.pentest.scanCredentials(orgId),
    queryFn: () => listScanCredentials(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  })

  const upsertMut = useMutation({
    mutationFn: () => upsertScanCredential(orgId!, {
      asset_id: assetID.trim(),
      credential_kind: kind,
      plaintext,
      label: label.trim(),
      expires_in_hours: expires,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.pentest.scanCredentials(orgId) })
      enqueueSnackbar(t('cred.stored'), { variant: 'success' })
      // Clear plaintext IMMEDIATELY — never keep raw secret in
      // memory longer than the request.
      setPlaintext('')
      setAssetID('')
      setLabel('')
      setAddOpen(false)
    },
    onError: (e) => enqueueSnackbar(String(e as Error), { variant: 'error' }),
  })

  const deleteMut = useMutation({
    mutationFn: (vars: { assetID: string; scanType: string }) =>
      deleteScanCredential(orgId!, vars.assetID, vars.scanType),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.pentest.scanCredentials(orgId) })
      enqueueSnackbar(t('cred.deleted'), { variant: 'info' })
    },
  })

  return (
    <Box sx={{ p: 3, maxWidth: 900 }}>
      <Alert severity="warning" sx={{ mb: 2, fontSize: 13 }}>
        <strong>{t('cred.warnTitle')}:</strong>{' '}
        {t('cred.warnBody')}
      </Alert>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button size="small" variant="contained" startIcon={<Plus size={14} />}
          onClick={() => setAddOpen(true)}
          sx={{ textTransform: 'none', bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}>
          {t('cred.add')}
        </Button>
      </Box>

      {q.isLoading && <LoadingState variant="spinner" py={6} />}
      {q.isError && (
        <QueryError error={q.error} onRetry={q.refetch} label={t('cred.addTitle')} compact />
      )}
      {!q.isLoading && (q.data?.items?.length ?? 0) === 0 && (
        <EmptyStateGuide
          icon={<KeyRound size={28} />}
          title={t('cred.empty')}
          description={t('cred.emptyHint')}
          py={6}
        />
      )}

      {(q.data?.items ?? []).map(c => (
        <CredRow key={c.id} c={c}
          onDelete={() => deleteMut.mutate({ assetID: c.asset_id, scanType: c.scan_type })} />
      ))}

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('cred.addTitle')}</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2, fontSize: 12 }}>
            {t('cred.addInfo')}
          </Alert>
          <TextField label={t('cred.assetId')} size="small" fullWidth sx={{ mb: 2 }}
            value={assetID} onChange={e => setAssetID(e.target.value)}
            placeholder="asset_abc123" />
          <TextField select label={t('cred.kind')} size="small" fullWidth sx={{ mb: 2 }}
            value={kind} onChange={e => setKind(e.target.value as CredentialKind)}>
            {(Object.keys(KIND_LABELS) as CredentialKind[]).map(k => (
              <MenuItem key={k} value={k} disabled={k === 'oauth_flow'}>{KIND_LABELS[k]}</MenuItem>
            ))}
          </TextField>
          <TextField label={t('cred.plaintext')} size="small" fullWidth multiline
            minRows={3} type="password" sx={{ mb: 2 }}
            value={plaintext} onChange={e => setPlaintext(e.target.value)}
            placeholder={kind === 'cookie' ? 'sid=abc123; csrf=xyz789' : 'eyJhbGciOi...'}
            helperText={t('cred.plaintextHelp')} />
          <TextField label={t('cred.label')} size="small" fullWidth
            sx={{ mb: 2 }} value={label} onChange={e => setLabel(e.target.value)}
            placeholder="staging-test-account" />
          <TextField label={t('cred.expiresHours')} size="small"
            type="number" fullWidth value={expires}
            onChange={e => setExpires(parseInt(e.target.value, 10) || 0)} />
          {upsertMut.isError && (
            <Box sx={{ mt: 1 }}>
              <QueryError error={upsertMut.error} label={t('cred.addTitle')} compact />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setAddOpen(false); setPlaintext('') }}>{t('common.cancel')}</Button>
          <Button variant="contained"
            disabled={!assetID.trim() || !plaintext || upsertMut.isPending}
            onClick={() => upsertMut.mutate()}
            sx={{ bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}>
            {upsertMut.isPending ? t('cred.sealing') : t('cred.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

function CredRow({ c, onDelete }: { c: ScanCredential; onDelete: () => void }) {
  return (
    <Box sx={{
      display: 'grid', gridTemplateColumns: '1fr auto auto auto auto', gap: 1.5, alignItems: 'center',
      p: 1.5, mb: 0.5, border: '1px solid', borderColor: 'divider', borderRadius: 1,
    }}>
      <Box>
        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{c.asset_id}</Typography>
        <Typography variant="caption" color="text.secondary">
          {c.scan_type} · {c.label || 'unlabeled'}
        </Typography>
      </Box>
      <Chip size="small" label={c.credential_kind}
        sx={{ height: 20, fontSize: 12, bgcolor: 'rgba(124,58,237,0.15)', color: '#a78bfa' }} />
      <Chip size="small" icon={<ShieldCheck size={11} />} label="SEALED"
        sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(34,197,94,0.18)', color: '#22c55e' }} />
      <Typography variant="caption" color="text.secondary">
        {c.expires_at ? `expires ${new Date(c.expires_at).toLocaleDateString()}` : 'no expiry'}
      </Typography>
      <IconButton size="small" onClick={onDelete} title={t('cred.deleteTooltip')}>
        <Trash2 size={14} color="#ef4444" />
      </IconButton>
    </Box>
  )
}
