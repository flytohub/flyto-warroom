import { useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import { Users, Plus, Mail, Crown, Trash2, ShieldCheck } from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useOrg, useConnectedRepos } from '@hooks/useOrg'
import { useAuth } from '@hooks/useAuth'
import { useCapabilities } from '@hooks/useCapabilities'
import { useProjectCapabilities } from '@hooks/useProjectCapabilities'
import { useGitHubConnection } from '@hooks/useGitHubConnection'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getGitHubOrgMembers, createInvitation,
  listOrgMembers, updateOrgMemberRole, removeOrgMember, type OrgMemberProfile,
} from '@lib/engine'
import EmptyStateGuide from '@atoms/EmptyStateGuide'
import { GatedButton, GatedIconButton } from '@atoms/GatedButton'
import InlineErrorNotice from '@atoms/InlineErrorNotice'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'
import { fetchGitLabGroupMembers } from '@lib/gitlab'
import { sectionTitleSx, accentCardSx, rowSx } from './shared'

// Roles the engine's PATCH endpoint accepts (owner excluded — ownership
// transfer is a separate flow). Order = high→low privilege for the Select.
const ASSIGNABLE_ROLES = ['admin', 'member', 'viewer', 'guest'] as const

function titleCase(s: string): string {
  return s.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

interface NormalizedMember {
  login: string
  name?: string
  avatarUrl: string
  role?: string
  provider: 'github' | 'gitlab'
  isAdmin?: boolean
}

const GITLAB_ACCESS_LABELS: Record<number, string> = {
  50: 'Owner',
  40: 'Maintainer',
  30: 'Developer',
  20: 'Reporter',
  10: 'Guest',
}

export function MembersTab() {
  const { org } = useOrg()
  const { gitlabToken } = useAuth()
  const github = useGitHubConnection()
  const caps = useCapabilities(org?.id)
  const projectCaps = useProjectCapabilities(org?.id)
  const qc = useQueryClient()
  const { data: repos } = useConnectedRepos(org?.id)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [mgmtError, setMgmtError] = useState<string | null>(null)

  // Native Warroom members (org_members + identity) — the source of truth
  // for owner→admin→member→viewer→guest roles, with real management.
  const nativeQuery = useQuery({
    queryKey: qk.identity.membersNative(org?.id),
    queryFn: () => listOrgMembers(org!.id),
    enabled: !!org?.id,
    staleTime: 60_000,
  })
  const nativeMembers = nativeQuery.data?.members ?? []
  const canChangeRole = caps.canDoAction('member:role_change') && projectCaps.canUseAction('member:role_change')
  const canRemove = caps.canDoAction('member:remove') && projectCaps.canUseAction('member:remove')

  const invalidateNative = () => qc.invalidateQueries({ queryKey: qk.identity.membersNative(org?.id) })
  const roleMut = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) => updateOrgMemberRole(org!.id, userId, role),
    onSuccess: () => { setMgmtError(null); invalidateNative() },
    onError: (err: Error) => setMgmtError(err.message),
  })
  const removeMut = useMutation({
    mutationFn: (userId: string) => removeOrgMember(org!.id, userId),
    onSuccess: () => { setMgmtError(null); invalidateNative() },
    onError: (err: Error) => setMgmtError(err.message),
  })

  // Listing / revoking pending invitations is hidden 2026-06-04: the backend
  // exposes only POST /invitations (no GET list, no DELETE) — calling them
  // 404s. Inviting still works; the pending list + revoke return when those
  // routes ship (tracked in apiPathContract KNOWN_MISSING).
  const inviteMut = useMutation({
    mutationFn: () => createInvitation(org!.id, inviteEmail, inviteRole),
    onSuccess: () => { setInviteEmail(''); setInviteError(null); invalidateNative() },
    onError: (err: Error) => { setInviteError(err.message) },
  })

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim())

  // Detect which providers are connected
  const hasGitHub = (repos ?? []).some((r) => r.provider === 'github')
  const hasGitLab = (repos ?? []).some((r) => r.provider === 'gitlab')

  // Derive GitLab group path from the first connected GitLab repo's owner
  const gitlabGroupPath = (repos ?? []).find((r) => r.provider === 'gitlab')?.ownerName ?? null

  // GitHub org members (via engine proxy)
  const githubQuery = useQuery({
    queryKey: qk.identity.membersGitHub(org?.id),
    queryFn: async () => {
      try {
        return await getGitHubOrgMembers(org!.id, org!.slug)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/no github credentials/i.test(message)) return { members: [], count: 0 }
        throw error
      }
    },
    enabled: !!org && hasGitHub && github.connected,
    staleTime: 60_000,
  })

  // GitLab group members (direct API)
  const gitlabQuery = useQuery({
    queryKey: qk.identity.membersGitLab(gitlabGroupPath),
    queryFn: () => fetchGitLabGroupMembers(gitlabToken!, gitlabGroupPath!),
    enabled: !!gitlabToken && !!gitlabGroupPath && hasGitLab,
    staleTime: 60_000,
  })

  const isLoading = (hasGitHub && githubQuery.isLoading) || (hasGitLab && gitlabQuery.isLoading)
  const providerError = githubQuery.error ?? gitlabQuery.error

  // Normalize and merge members from both providers
  const members: NormalizedMember[] = []
  const seen = new Set<string>()

  for (const m of githubQuery.data?.members ?? []) {
    const key = `github:${m.login}`
    if (!seen.has(key)) {
      seen.add(key)
      members.push({
        login: m.login,
        avatarUrl: m.avatar_url ?? '',
        role: m.role,
        provider: 'github',
        isAdmin: m.site_admin,
      })
    }
  }

  for (const m of gitlabQuery.data ?? []) {
    const key = `gitlab:${m.username}`
    if (!seen.has(key)) {
      seen.add(key)
      members.push({
        login: m.username,
        name: m.name,
        avatarUrl: m.avatar_url,
        role: GITLAB_ACCESS_LABELS[m.access_level] ?? `Level ${m.access_level}`,
        provider: 'gitlab',
        isAdmin: m.access_level >= 40,
      })
    }
  }

  const hasAnyProvider = hasGitHub || hasGitLab

  return (
    <>
      {/* ── Warroom members (native roles + management) ── */}
      <Box sx={sectionTitleSx}>
        <ShieldCheck size={15} style={{ color: '#a78bfa', opacity: 0.9 }} />
        <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', fontSize: 12 }}>
          {t('settings.members.warroomTitle')}
        </Typography>
        {nativeMembers.length > 0 && (
          <Chip label={nativeMembers.length} size="small"
            sx={{ height: 20, fontSize: 13, fontWeight: 600, ml: 1, bgcolor: 'rgba(167,139,250,0.1)', color: '#a78bfa' }} />
        )}
      </Box>
      {mgmtError && (
        <Box sx={{ mb: 1 }}>
          <InlineErrorNotice error={mgmtError} />
        </Box>
      )}
      {nativeQuery.isLoading ? (
        <LoadingState variant="spinner" py={4} />
      ) : nativeQuery.isError ? (
        <QueryError error={nativeQuery.error} onRetry={nativeQuery.refetch} label={t('settings.members.warroomTitle')} compact />
      ) : nativeMembers.length === 0 ? (
        <EmptyStateGuide icon={<ShieldCheck size={28} />} title={t('settings.members.noNative')} py={4} />
      ) : (
        <Box sx={accentCardSx('#a78bfa')}>
          {nativeMembers.map((m: OrgMemberProfile) => {
            const isOwner = m.role === 'owner'
            const label = m.displayName || m.email || m.userId
            return (
              <Box key={m.id} sx={rowSx}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
                  {m.photoUrl
                    ? <Box component="img" src={m.photoUrl} alt={label} sx={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid', borderColor: 'divider' }} />
                    : <Box sx={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover', fontSize: 13, fontWeight: 700 }}>{label.slice(0, 1).toUpperCase()}</Box>}
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} color="text.primary" noWrap>{label}</Typography>
                    {m.email && m.displayName && (
                      <Typography variant="caption" color="text.secondary" noWrap>{m.email}</Typography>
                    )}
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {isOwner || !canChangeRole ? (
                    <Chip
                      size="small"
                      icon={isOwner ? <Crown size={13} /> : undefined}
                      label={titleCase(m.role)}
                      sx={{ height: 24, fontWeight: 700, fontSize: 12, bgcolor: 'rgba(167,139,250,0.12)', color: '#a78bfa' }}
                    />
                  ) : (
                    <FormControl size="small" sx={{ minWidth: 110 }}>
                      <Select
                        value={ASSIGNABLE_ROLES.includes(m.role as typeof ASSIGNABLE_ROLES[number]) ? m.role : 'member'}
                        disabled={roleMut.isPending}
                        onChange={(e) => roleMut.mutate({ userId: m.userId, role: e.target.value })}
                        sx={{ fontSize: 13, borderRadius: 2, height: 32 }}
                      >
                        {ASSIGNABLE_ROLES.map((r) => (
                          <MenuItem key={r} value={r}>{titleCase(r)}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                  {!isOwner && canRemove && (
                    <GatedIconButton action="member:remove" size="small" disabled={removeMut.isPending}
                      onClick={() => removeMut.mutate(m.userId)}
                      sx={{ color: 'text.secondary', '&:hover': { color: '#ef4444' } }}>
                      <Trash2 size={14} />
                    </GatedIconButton>
                  )}
                </Box>
              </Box>
            )
          })}
        </Box>
      )}

      {/* ── Members from connected providers (GitHub/GitLab — informational) ── */}
      <Box sx={{ ...sectionTitleSx, mt: 2.5 }}>
        <Users size={15} style={{ color: '#a78bfa', opacity: 0.9 }} />
        <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', fontSize: 12 }}>
          {t('settings.members.title')}
        </Typography>
        {members.length > 0 && (
          <Chip
            label={members.length}
            size="small"
            sx={{ height: 20, fontSize: 13, fontWeight: 600, ml: 1, bgcolor: 'rgba(167,139,250,0.1)', color: '#a78bfa' }}
          />
        )}
      </Box>

      {isLoading && (
        <LoadingState variant="spinner" py={6} />
      )}

      {!isLoading && providerError && (
        <QueryError error={providerError} onRetry={() => {
          void githubQuery.refetch()
          void gitlabQuery.refetch()
        }} label={t('settings.members.title')} compact />
      )}

      {!isLoading && !providerError && members.length === 0 && (
        <EmptyStateGuide
          icon={<Users size={28} />}
          title={hasAnyProvider ? t('settings.members.noMembers') : t('settings.members.empty')}
          py={4}
        />
      )}

      {members.length > 0 && (
        <Box sx={accentCardSx('#a78bfa')}>
          {members.map((member, _i) => (
            <Box key={`${member.provider}:${member.login}`} sx={rowSx}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box
                  component="img"
                  src={member.avatarUrl}
                  alt={member.login}
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                />
                <Box>
                  <Typography variant="body2" fontWeight={600} color="text.primary">
                    {member.name || member.login}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {member.name && (
                      <Typography variant="caption" color="text.secondary">
                        @{member.login}
                      </Typography>
                    )}
                    {member.role && (
                      <Typography variant="caption" color="text.secondary">
                        {member.name ? ' · ' : ''}{member.role}
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip
	                  label={member.provider === 'github' ? t('hardcoded.github.gitlab.8f476e8c') : t('hardcoded.gitlab.36d8b449')}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: 13,
                    fontWeight: 600,
                    bgcolor: member.provider === 'github'
                      ? 'rgba(110,118,129,0.1)'
                      : 'rgba(252,109,38,0.1)',
                    color: member.provider === 'github'
                      ? '#8b949e'
                      : '#fc6d26',
                  }}
                />
                {member.isAdmin && (
                  <Chip
                    label="Admin"
                    size="small"
                    sx={{
                      height: 22,
                      fontSize: 12,
                      fontWeight: 600,
                      bgcolor: 'rgba(167,139,250,0.1)',
                      color: '#a78bfa',
                    }}
                  />
                )}
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {/* ── Invite members ── */}
      <Box sx={sectionTitleSx}>
        <Mail size={15} style={{ color: '#22c55e', opacity: 0.9 }} />
        <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', fontSize: 12 }}>
          {t('settings.members.inviteTitle')}
        </Typography>
      </Box>
      <Box sx={accentCardSx('#22c55e')}>
        {/* Invite form */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, px: 2.5, py: 2, alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}>
          <TextField
            placeholder="colleague@company.com"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            size="small"
            sx={{ flex: 1, minWidth: 200, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(34,197,94,0.2)' } }}
            slotProps={{ input: { sx: { fontSize: 13, borderRadius: 2 } } }}
          />
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <Select value={inviteRole} onChange={e => setInviteRole(e.target.value)} size="small"
              sx={{ fontSize: 13, borderRadius: 2, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(34,197,94,0.2)' } }}>
              <MenuItem value="member">{t('settings.members.roleMember')}</MenuItem>
              <MenuItem value="admin">{t('settings.members.roleAdmin')}</MenuItem>
            </Select>
          </FormControl>
          <GatedButton
            action="member:invite"
            size="small" variant="contained" startIcon={<Plus size={14} />}
            onClick={() => inviteMut.mutate()}
            disabled={!isValidEmail || inviteMut.isPending}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, px: 2, background: 'linear-gradient(135deg, #22c55e, #16a34a)', boxShadow: 'none', '&:hover': { background: 'linear-gradient(135deg, #16a34a, #15803d)', boxShadow: 'none' } }}
          >
            {t('settings.members.invite')}
          </GatedButton>
        </Box>
        {inviteError && (
          <Box sx={{ px: 2.5, py: 1.5 }}>
            <InlineErrorNotice error={inviteError} />
          </Box>
        )}
        {/* Pending-invitation list hidden — backend has no GET/DELETE
            /invitations route yet (see header note). */}
      </Box>
    </>
  )
}
