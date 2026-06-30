import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSnackbar } from 'notistack'
import {
  Box, Typography, Alert, Chip, Button, TextField, Divider, IconButton, Collapse,
} from '@mui/material'
import { ShieldCheck, Plus, X, ChevronDown, ChevronRight, UserPlus, UserMinus } from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { useCapabilities } from '@hooks/useCapabilities'
import { useProjectCapabilities } from '@hooks/useProjectCapabilities'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import EmptyStateGuide from '@atoms/EmptyStateGuide'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'
import {
  listRBACRoles, createRBACRole, addRBACRoleCapability, removeRBACRoleCapability,
  assignRBACUserRole, revokeRBACUserRole, getRBACUserCapabilities, type RBACRole,
} from '@lib/engine/system/rbac'

// RBACTab — roles & permissions admin. Wires system/rbac/{roles,capabilities,
// user-role}. Platform-admin gated (system:rbac:read/write). Capability add/remove
// + user-role assign/revoke all invalidate the roles query and toast.

export function RBACTab() {
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()
  const { org } = useOrg()
  const orgId = org?.id
  const caps = useCapabilities(orgId)
  const projectCaps = useProjectCapabilities(orgId)
  const capsPending = !!orgId && ((!caps.ready && !caps.isError) || (!projectCaps.ready && !projectCaps.isError))
  const canReadRBAC = caps.canDoAction('system:rbac:read') && projectCaps.canUseAction('system:rbac:read')
  const canWriteRBAC = caps.canDoAction('system:rbac:write') && projectCaps.canUseAction('system:rbac:write')

  const [newRoleName, setNewRoleName] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [capDraft, setCapDraft] = useState<Record<string, string>>({})
  const [assignUser, setAssignUser] = useState('')
  const [assignRoleId, setAssignRoleId] = useState('')
  const inspectedUser = assignUser.trim()

  const q = useQuery({
    queryKey: qk.platform.rbacRoles(),
    queryFn: listRBACRoles,
    enabled: canReadRBAC,
    staleTime: 30_000,
  })
  const roles: RBACRole[] = q.data?.roles ?? []
  const roleNameById = new Map(roles.map(r => [r.id, r.name]))

  const userCapsQ = useQuery({
    queryKey: qk.platform.rbacUserCapabilities(orgId, inspectedUser),
    queryFn: () => getRBACUserCapabilities(orgId!, inspectedUser),
    enabled: canReadRBAC && !!orgId && !!inspectedUser,
    staleTime: 10_000,
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: qk.platform.rbacRoles() })
  const invalidateUserCapabilities = (userId: string) => {
    qc.invalidateQueries({ queryKey: qk.platform.rbacUserCapabilities(orgId, userId) })
  }
  const onErr = (e: unknown) => enqueueSnackbar(String(e as Error), { variant: 'error' })

  const createMut = useMutation({
    mutationFn: () => createRBACRole({ name: newRoleName.trim(), org_id: orgId }),
    onSuccess: () => { setNewRoleName(''); invalidate(); enqueueSnackbar(t('sys.rbac.roleCreated'), { variant: 'success' }) },
    onError: onErr,
  })
  const addCapMut = useMutation({
    mutationFn: (vars: { roleId: string; cap: string }) => addRBACRoleCapability(vars.roleId, vars.cap),
    onSuccess: (_d, vars) => { setCapDraft(d => ({ ...d, [vars.roleId]: '' })); invalidate(); enqueueSnackbar(t('sys.rbac.capAdded'), { variant: 'success' }) },
    onError: onErr,
  })
  const removeCapMut = useMutation({
    mutationFn: (vars: { roleId: string; cap: string }) => removeRBACRoleCapability(vars.roleId, vars.cap),
    onSuccess: () => { invalidate(); enqueueSnackbar(t('sys.rbac.capRemoved'), { variant: 'info' }) },
    onError: onErr,
  })
  const assignMut = useMutation({
    mutationFn: (vars: { userId: string; roleId: string }) => assignRBACUserRole(orgId!, vars.userId, vars.roleId),
    onSuccess: (_d, vars) => {
      invalidate()
      invalidateUserCapabilities(vars.userId)
      enqueueSnackbar(t('sys.rbac.assigned'), { variant: 'success' })
    },
    onError: onErr,
  })
  const revokeMut = useMutation({
    mutationFn: (vars: { userId: string; roleId: string }) => revokeRBACUserRole(orgId!, vars.userId, vars.roleId),
    onSuccess: (_d, vars) => {
      invalidate()
      invalidateUserCapabilities(vars.userId)
      enqueueSnackbar(t('sys.rbac.revoked'), { variant: 'info' })
    },
    onError: onErr,
  })

  if (!orgId) {
    return (
      <Alert severity="warning" variant="outlined">
        {t('sys.rbac.noOrg')}
      </Alert>
    )
  }

  if (capsPending) {
    return <LoadingState variant="spinner" py={4} />
  }

  if (caps.isError) {
    return (
      <QueryError
        error={new Error(t('sys.rbac.permissionsUnavailable'))}
        onRetry={caps.refetch}
        label={t('sys.rbac.inspectAccess')}
        compact
      />
    )
  }

  if (!canReadRBAC) {
    return (
      <Alert severity="warning" variant="outlined">
        {t('sys.rbac.readDenied')}
      </Alert>
    )
  }

  return (
    <Box>
      {canWriteRBAC ? (
        <Alert severity="info" sx={{ mb: 2, fontSize: 13 }}>
          {t('sys.rbac.intro')}
        </Alert>
      ) : (
        <Alert severity="info" sx={{ mb: 2, fontSize: 13 }}>
          {t('sys.rbac.readOnlyIntro')}
        </Alert>
      )}

      {/* Create role */}
      {canWriteRBAC && (
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 2 }}>
          <TextField size="small" label={t('sys.rbac.roleName')} value={newRoleName}
            onChange={e => setNewRoleName(e.target.value)} sx={{ flex: 1 }} placeholder="security-analyst" />
          <Button size="small" variant="contained" startIcon={<Plus size={14} />}
            disabled={!newRoleName.trim() || createMut.isPending}
            onClick={() => createMut.mutate()}
            sx={{ textTransform: 'none', bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}>
            {t('sys.rbac.createRole')}
          </Button>
        </Box>
      )}

      {q.isLoading && <LoadingState variant="spinner" py={4} />}
      {q.isError && <QueryError error={q.error} onRetry={q.refetch} label={t('sys.rbac.inspectAccess')} compact />}
      {!q.isLoading && !q.isError && roles.length === 0 && (
        <EmptyStateGuide icon={<ShieldCheck size={28} />} title={t('sys.rbac.noRoles')} py={4} />
      )}

      {roles.map(role => {
        const isOpen = expanded === role.id
        return (
          <Box key={role.id} sx={{ mb: 0.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, cursor: 'pointer' }}
              onClick={() => setExpanded(isOpen ? null : role.id)}>
              {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <Typography variant="body2" fontWeight={600}>{role.name}</Typography>
              {role.is_system && (
                <Chip size="small" label="system" sx={{ height: 18, fontSize: 12, bgcolor: 'rgba(148,163,184,0.18)', color: '#94a3b8' }} />
              )}
              <Box sx={{ flex: 1 }} />
              <Typography variant="caption" color="text.secondary">{role.capabilities.length} caps</Typography>
            </Box>
            <Collapse in={isOpen}>
              <Box sx={{ px: 2, pb: 2 }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.5 }}>
                  {role.capabilities.map(cap => (
                    <Chip key={cap} size="small" label={cap}
                      onDelete={role.is_system || !canWriteRBAC ? undefined : () => removeCapMut.mutate({ roleId: role.id, cap })}
                      deleteIcon={<X size={12} />}
                      sx={{ height: 22, fontSize: 12, bgcolor: 'rgba(124,58,237,0.15)', color: '#a78bfa' }} />
                  ))}
                  {role.capabilities.length === 0 && (
                    <Typography variant="caption" color="text.secondary">{t('sys.rbac.noCaps')}</Typography>
                  )}
                </Box>
                {!role.is_system && canWriteRBAC && (
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <TextField size="small" label={t('sys.rbac.addCap')}
                      value={capDraft[role.id] ?? ''}
                      onChange={e => setCapDraft(d => ({ ...d, [role.id]: e.target.value }))}
                      sx={{ flex: 1 }} placeholder="ctem:read" />
                    <IconButton size="small" disabled={!(capDraft[role.id] ?? '').trim() || addCapMut.isPending}
                      onClick={() => addCapMut.mutate({ roleId: role.id, cap: (capDraft[role.id] ?? '').trim() })}
                      title={t('sys.rbac.addCap')}>
                      <Plus size={16} color="#a78bfa" />
                    </IconButton>
                  </Box>
                )}
              </Box>
            </Collapse>
          </Box>
        )
      })}

      <Divider sx={{ my: 2 }} />

      {/* Assign role to user */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <UserPlus size={16} style={{ color: '#a78bfa' }} />
        <Typography variant="subtitle2" fontWeight={700}>
          {canWriteRBAC ? t('sys.rbac.assignRole') : t('sys.rbac.inspectAccess')}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 1 }}>
        <TextField size="small" label={t('sys.rbac.userId')} value={assignUser}
          onChange={e => setAssignUser(e.target.value)} sx={{ flex: 1 }} placeholder="user_abc123" />
        {canWriteRBAC && (
          <>
            <TextField select size="small" label={t('sys.rbac.role')} value={assignRoleId}
              onChange={e => setAssignRoleId(e.target.value)} sx={{ minWidth: 160 }}
              SelectProps={{ native: true }}>
              <option value="" />
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </TextField>
            <Button size="small" variant="outlined"
              disabled={!orgId || !inspectedUser || !assignRoleId || assignMut.isPending}
              onClick={() => assignMut.mutate({ userId: inspectedUser, roleId: assignRoleId })} sx={{ textTransform: 'none' }} startIcon={<UserPlus size={14} />}>
              {t('sys.rbac.assign')}
            </Button>
            <Button size="small" variant="text" color="error"
              disabled={!orgId || !inspectedUser || !assignRoleId || revokeMut.isPending}
              onClick={() => revokeMut.mutate({ userId: inspectedUser, roleId: assignRoleId })}
              sx={{ textTransform: 'none' }} startIcon={<UserMinus size={14} />}>
              {t('sys.rbac.revoke')}
            </Button>
          </>
        )}
      </Box>
      {inspectedUser && (
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 700, textTransform: 'uppercase' }}>
            {t('sys.rbac.resolvedFor')} · {inspectedUser}
          </Typography>
          {userCapsQ.isLoading ? (
            <LoadingState variant="spinner" py={2} />
          ) : userCapsQ.isError ? (
            <QueryError error={userCapsQ.error} onRetry={userCapsQ.refetch} label={t('sys.rbac.inspectAccess')} compact />
          ) : userCapsQ.data ? (
            <>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                {(userCapsQ.data.role_ids.length ? userCapsQ.data.role_ids : ['unassigned']).map(roleId => (
                  <Chip
                    key={roleId}
                    size="small"
                    label={roleId === 'unassigned' ? t('sys.rbac.noAssignedRoles') : (roleNameById.get(roleId) ?? roleId)}
                    sx={{ height: 22, fontSize: 12 }}
                  />
                ))}
                {userCapsQ.data.is_platform_admin && (
                  <Chip size="small" label={t('sys.rbac.platformAdmin')} sx={{ height: 22, fontSize: 12, bgcolor: 'rgba(34,197,94,0.14)', color: '#22c55e' }} />
                )}
              </Box>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {userCapsQ.data.capabilities.slice(0, 18).map(cap => (
                  <Chip key={cap} size="small" label={cap} sx={{ height: 22, fontSize: 12, bgcolor: 'rgba(124,58,237,0.12)', color: '#a78bfa' }} />
                ))}
                {userCapsQ.data.capabilities.length > 18 && (
                  <Chip size="small" label={`+${userCapsQ.data.capabilities.length - 18}`} sx={{ height: 22, fontSize: 12 }} />
                )}
                {userCapsQ.data.capabilities.length === 0 && (
                  <Typography variant="body2" color="text.secondary">{t('sys.rbac.noResolvedCaps')}</Typography>
                )}
              </Box>
            </>
          ) : null}
        </Box>
      )}
    </Box>
  )
}
