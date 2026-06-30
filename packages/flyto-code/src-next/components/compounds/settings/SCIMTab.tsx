import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSnackbar } from 'notistack'
import {
  Box, Typography, Alert, Chip, Button, TextField, MenuItem, Divider, IconButton,
} from '@mui/material'
import { KeyRound, Plus, Ban, Users } from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { t as i18nT } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'
import {
  listSCIMTokens, createSCIMToken, revokeSCIMToken,
  listSCIMGroupMappings, upsertSCIMGroupMapping,
  type SCIMAssignableRole,
} from '@lib/engine/system/scim'

// SCIMTab — SCIM provisioning admin: bearer tokens + group→role mappings.
// Wires system/scim/{tokens,group-mappings}. Platform-admin gated. The plaintext
// token is shown EXACTLY ONCE on create and never persisted by the UI.

const ROLES: SCIMAssignableRole[] = ['viewer', 'member', 'admin']

export function SCIMTab() {
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()
  const { org } = useOrg()
  const orgId = org?.id

  const [tokenDesc, setTokenDesc] = useState('')
  const [newToken, setNewToken] = useState('') // plaintext shown ONCE
  const [scimGroup, setScimGroup] = useState('')
  const [mapRole, setMapRole] = useState<SCIMAssignableRole>('member')

  const tokensQ = useQuery({
    queryKey: qk.platform.scimTokens(orgId),
    queryFn: () => listSCIMTokens(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  })
  const mappingsQ = useQuery({
    queryKey: qk.platform.scimGroupMappings(orgId),
    queryFn: () => listSCIMGroupMappings(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  })

  const createTokenMut = useMutation({
    mutationFn: () => createSCIMToken({ org_id: orgId!, description: tokenDesc.trim() || undefined }),
    onSuccess: (res) => {
      setNewToken(res.token)
      setTokenDesc('')
      qc.invalidateQueries({ queryKey: qk.platform.scimTokens(orgId) })
      enqueueSnackbar(i18nT('sys.scim.tokenCreated'), { variant: 'success' })
    },
    onError: (e) => enqueueSnackbar(String(e as Error), { variant: 'error' }),
  })
  const revokeTokenMut = useMutation({
    mutationFn: (id: string) => revokeSCIMToken(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.platform.scimTokens(orgId) })
      enqueueSnackbar(i18nT('sys.scim.tokenRevoked'), { variant: 'info' })
    },
    onError: (e) => enqueueSnackbar(String(e as Error), { variant: 'error' }),
  })
  const upsertMapMut = useMutation({
    mutationFn: () => upsertSCIMGroupMapping({ org_id: orgId!, scim_group: scimGroup.trim(), role: mapRole }),
    onSuccess: () => {
      setScimGroup('')
      qc.invalidateQueries({ queryKey: qk.platform.scimGroupMappings(orgId) })
      enqueueSnackbar(i18nT('sys.scim.mapSaved'), { variant: 'success' })
    },
    onError: (e) => enqueueSnackbar(String(e as Error), { variant: 'error' }),
  })

  const tokens = tokensQ.data?.tokens ?? []
  const mappings = mappingsQ.data?.group_mappings ?? []

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2, fontSize: 13 }}>
        {i18nT('sys.scim.intro')}
      </Alert>

      {newToken && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setNewToken('')}>
          <Typography variant="caption" fontWeight={700}>{i18nT('sys.scim.copyNow')}</Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', mt: 0.5 }}>{newToken}</Typography>
        </Alert>
      )}

      {/* Tokens */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <KeyRound size={16} style={{ color: '#a78bfa' }} />
        <Typography variant="subtitle2" fontWeight={700}>{i18nT('sys.scim.tokens')}</Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 2 }}>
        <TextField size="small" label={i18nT('sys.scim.desc')} value={tokenDesc}
          onChange={e => setTokenDesc(e.target.value)} sx={{ flex: 1 }} placeholder="okta-prod" />
        <Button size="small" variant="contained" startIcon={<Plus size={14} />}
          disabled={!orgId || createTokenMut.isPending}
          onClick={() => createTokenMut.mutate()}
          sx={{ textTransform: 'none', bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}>
          {i18nT('sys.scim.createToken')}
        </Button>
      </Box>
      {tokensQ.isLoading && <LoadingState variant="spinner" py={3} />}
      {tokensQ.isError && <QueryError error={tokensQ.error} onRetry={tokensQ.refetch} label={i18nT('sys.scim.tokens')} compact />}
      {tokens.length === 0 && !tokensQ.isLoading && (
        <Typography variant="caption" color="text.secondary">{i18nT('sys.scim.noTokens')}</Typography>
      )}
      {tokens.map(t => (
        <Box key={t.id} sx={{
          display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 1.5, alignItems: 'center',
          p: 1.5, mb: 0.5, border: '1px solid', borderColor: 'divider', borderRadius: 1,
        }}>
          <Box>
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{t.token_prefix}…</Typography>
            <Typography variant="caption" color="text.secondary">{t.description || 'no description'}</Typography>
          </Box>
          <Chip size="small" label={t.enabled ? 'enabled' : 'revoked'}
            sx={{ height: 20, fontSize: 12, fontWeight: 700,
              bgcolor: t.enabled ? 'rgba(34,197,94,0.18)' : 'rgba(148,163,184,0.18)',
              color: t.enabled ? '#22c55e' : '#94a3b8' }} />
          <IconButton size="small" disabled={!t.enabled || revokeTokenMut.isPending}
            onClick={() => revokeTokenMut.mutate(t.id)} title={i18nT('sys.scim.revoke')}>
            <Ban size={14} color={t.enabled ? '#ef4444' : '#64748b'} />
          </IconButton>
        </Box>
      ))}

      <Divider sx={{ my: 2 }} />

      {/* Group mappings */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Users size={16} style={{ color: '#a78bfa' }} />
        <Typography variant="subtitle2" fontWeight={700}>{i18nT('sys.scim.groupMappings')}</Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 2 }}>
        <TextField size="small" label={i18nT('sys.scim.group')} value={scimGroup}
          onChange={e => setScimGroup(e.target.value)} sx={{ flex: 1 }} placeholder={i18nT('scim.groupPlaceholder')} />
        <TextField select size="small" label={i18nT('sys.scim.role')} value={mapRole}
          onChange={e => setMapRole(e.target.value as SCIMAssignableRole)} sx={{ minWidth: 130 }}>
          {ROLES.map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
        </TextField>
        <Button size="small" variant="outlined"
          disabled={!orgId || !scimGroup.trim() || upsertMapMut.isPending}
          onClick={() => upsertMapMut.mutate()} sx={{ textTransform: 'none' }}>
          {i18nT('common.save')}
        </Button>
      </Box>
      {mappingsQ.isLoading && <LoadingState variant="spinner" py={3} />}
      {mappingsQ.isError && <QueryError error={mappingsQ.error} onRetry={mappingsQ.refetch} label={i18nT('sys.scim.groupMappings')} compact />}
      {mappings.length === 0 && !mappingsQ.isLoading && (
        <Typography variant="caption" color="text.secondary">{i18nT('sys.scim.noMappings')}</Typography>
      )}
      {mappings.map(m => (
        <Box key={`${m.scim_group}-${m.role}`} sx={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          p: 1.5, mb: 0.5, border: '1px solid', borderColor: 'divider', borderRadius: 1,
        }}>
          <Typography variant="body2">{m.scim_group}</Typography>
          <Chip size="small" label={m.role}
            sx={{ height: 20, fontSize: 12, bgcolor: 'rgba(124,58,237,0.15)', color: '#a78bfa' }} />
        </Box>
      ))}
    </Box>
  )
}
