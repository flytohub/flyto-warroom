import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Box, Typography, Alert, Chip, TextField, MenuItem } from '@mui/material'
import { KeyRound } from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { listCredentialInventory } from '@lib/engine/system/credentials'
import EmptyStateGuide from '@atoms/EmptyStateGuide'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'

// CredentialInventoryTab — platform credential inventory (metadata only).
// Wires GET /api/v1/system/credentials. Platform-admin gated; a non-allowlisted
// operator sees the error inline. NO secret is ever shown — presence + health only.

function statusColor(status: string): string {
  if (status === 'ok' || status === 'verified' || status === 'active') return '#22c55e'
  if (status === 'expired' || status === 'invalid' || status === 'error') return '#ef4444'
  if (status === 'expiring' || status === 'unverified' || status === 'pending') return '#f59e0b'
  return '#94a3b8'
}

export function CredentialInventoryTab() {
  const [statusFilter, setStatusFilter] = useState('')
  const q = useQuery({
    queryKey: qk.platform.credentials(statusFilter),
    queryFn: () => listCredentialInventory(statusFilter ? { status: statusFilter } : undefined),
    staleTime: 30_000,
  })

  const creds = q.data?.credentials ?? []

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2, fontSize: 13 }}>
        {t('sys.creds.intro')}
      </Alert>

      <TextField select size="small" label={t('sys.creds.status')} value={statusFilter}
        onChange={e => setStatusFilter(e.target.value)} sx={{ mb: 2, minWidth: 200 }}>
        <MenuItem value="">{t('common.all')}</MenuItem>
        <MenuItem value="ok">ok</MenuItem>
        <MenuItem value="expired">expired</MenuItem>
        <MenuItem value="invalid">invalid</MenuItem>
      </TextField>

      {q.isLoading && <LoadingState variant="spinner" py={4} />}
      {q.isError && <QueryError error={q.error} onRetry={q.refetch} label={t('sys.creds.intro')} compact />}
      {!q.isLoading && !q.isError && creds.length === 0 && (
        <EmptyStateGuide icon={<KeyRound size={28} />} title={t('sys.creds.empty')} py={4} />
      )}

      {creds.map(c => (
        <Box key={c.id} sx={{
          display: 'grid', gridTemplateColumns: '1.2fr 1fr auto auto', gap: 1.5, alignItems: 'center',
          p: 1.5, mb: 0.5, border: '1px solid', borderColor: 'divider', borderRadius: 1,
        }}>
          <Box>
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{c.provider_id}</Typography>
            <Typography variant="caption" color="text.secondary">
              {c.credential_kind}{c.org_id ? ` · org ${c.org_id}` : ' · platform'}{c.key_prefix ? ` · ${c.key_prefix}` : ''}
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary">
            {c.last_used_at ? `used ${new Date(c.last_used_at).toLocaleDateString()}` : 'never used'}
            {c.expires_at ? ` · exp ${new Date(c.expires_at).toLocaleDateString()}` : ''}
          </Typography>
          <Chip size="small" label={c.status}
            sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: `${statusColor(c.status)}22`, color: statusColor(c.status) }} />
          <Typography variant="caption" color="text.secondary">{c.status_reason || ''}</Typography>
        </Box>
      ))}
    </Box>
  )
}
