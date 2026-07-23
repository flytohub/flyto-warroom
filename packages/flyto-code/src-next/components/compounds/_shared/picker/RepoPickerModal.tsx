import { useState, useEffect, useMemo } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import TextField from '@mui/material/TextField'
import Alert from '@mui/material/Alert'
import { AlertTriangle, RefreshCw, Link2 } from 'lucide-react'
import { useAuth } from '@hooks/useAuth'
import { useOrg, useConnectedRepos } from '@hooks/useOrg'
import { adaptGitHubRepo } from '@lib/github'
import { qk } from '@lib/queryKeys'
import { getGitHubStatus, getGitHubUserRepos, saveOrgToken } from '@lib/engine'
import { getGitHubAppInstallURL } from '@lib/oauth'
import { fetchGitLabProjects, fetchGitLabUser, adaptGitLabProject } from '@lib/gitlab'
import { connectRepo, disconnectRepo } from '@lib/engine'
import { GatedButton } from '@atoms/GatedButton'
import { useQueryClient } from '@tanstack/react-query'
import { t, tOr } from '@lib/i18n';
import { env } from '@lib/env'
import { queryResolved, resolvedList } from '@lib/queryState'
import type { Repository, RepoProvider } from '@code/repository'
import { OwnerList } from './OwnerList'
import { RepoList } from './RepoList'

export type { RepoProvider } from '@code/repository'

export interface OwnerGroup {
  login: string
  avatarUrl: string
  isOrg: boolean
  repos: Repository[]
}

export interface RepoPickerCloseInfo {
  /** Number of repos connected after save (0 when user cancelled / dismissed). */
  connected: number
}

interface RepoPickerModalProps {
  opened: boolean
  onClose: (info?: RepoPickerCloseInfo) => void
  provider?: RepoProvider
}

export function RepoPickerModal({ opened, onClose, provider = 'github' }: RepoPickerModalProps) {
  const { gitlabToken, connectGitHub } = useAuth()
  const { org } = useOrg()
  const localEngineAuth = env.authMode === 'local' || env.authMode === 'local_jwt' || env.authMode === 'community'
  // Bumped after a successful reconnect to force the repo list to reload
  // (the load effect keys on it). Lets the empty-state "Reconnect" button
  // re-authorize and refresh in place instead of bouncing to settings.
  const [reloadNonce, setReloadNonce] = useState(0)
  const [reconnecting, setReconnecting] = useState(false)
  const [reconnectError, setReconnectError] = useState<string | null>(null)
  // True when the engine reports GitHub was never connected (or was
  // disconnected) for this org — distinct from "connected but the list
  // came back empty". A first-time user must see a plain "Connect GitHub"
  // prompt, NOT the "authorization expired / reconnect" narrative.
  const [notConnected, setNotConnected] = useState(false)
  // Currently-connected repos (engine side). Used to:
  //   (1) pre-check the picker rows that are already connected, so
  //       the UI reads as "current state" rather than "blank list",
  //   (2) compute a diff on save: unchecked-but-connected rows get
  //       disconnectRepo() called on them. Without this the picker
  //       was additive only — users who unchecked a repo expecting
  //       it to be removed saw the repo stay connected.
  const connectedRepos = useConnectedRepos(org?.id)
  const qc = useQueryClient()
  // GitHub: no longer needs token (engine proxy). GitLab: still uses browser token.
  const hasConnection = localEngineAuth ? !!org?.id : provider === 'github' ? !!org?.id : !!gitlabToken
  const connectedReposReady = queryResolved(connectedRepos, !!org?.id)
  const [allRepos, setAllRepos] = useState<Repository[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState<string[]>([])
  const [selectedOwner, setSelectedOwner] = useState<string | null>(null)
  const [publicRepoURL, setPublicRepoURL] = useState('')
  const [publicRepoError, setPublicRepoError] = useState<string | null>(null)

  // Map providerId → backend repo ID so the save step can disconnect
  // by repo UUID (what the engine's DELETE endpoint expects) instead
  // of by providerId (which is GitHub's numeric ID).
  const connectedByProviderId = useMemo(() => {
    const map = new Map<string, { id: string; provider: string }>()
    for (const r of resolvedList(connectedRepos.data, connectedRepos, !!org?.id)) {
      if (r.providerId && r.provider === provider) {
        map.set(r.providerId, { id: r.id, provider: r.provider })
      }
    }
    return map
  }, [connectedRepos.data, provider])

  useEffect(() => {
    if (!opened) return
    if (localEngineAuth) return
    if (!hasConnection) {
      setLoading(false)
      return
    }
    if (!connectedReposReady) {
      setLoading(true)
      return
    }
    setLoading(true)
    // Seed selection from what's currently connected — user opens
    // picker and sees their real state, not an empty list.
    setSelected(new Set(connectedByProviderId.keys()))
    setSearch('')
    setSelectedOwner(null)
    setConfirmDisconnect([])
    setReconnectError(null)
    setNotConnected(false)

    async function loadGitHub(): Promise<Repository[]> {
      if (!org?.id) return []
      const status = await getGitHubStatus(org.id).catch(() => ({ connected: false, login: '' }))
      if (!status.connected) {
        setNotConnected(true)
        return []
      }
      const all: Repository[] = []
      let page = 1
      while (true) {
        const data = await getGitHubUserRepos(org.id, 100, page)
        const batch = (data.repos ?? []).map(adaptGitHubRepo)
        all.push(...batch)
        if (batch.length < 100) break
        page++
      }
      return all
    }

    async function loadGitLab(): Promise<Repository[]> {
      const glToken = gitlabToken
      if (!glToken) return []
      const user = await fetchGitLabUser(glToken).catch(() => null)
      const fallbackAvatar = user?.avatar_url ?? ''
      const all: Repository[] = []
      let page = 1
      while (true) {
        const batch = await fetchGitLabProjects(glToken, page, 100)
        all.push(...batch.map((p) => adaptGitLabProject(p, fallbackAvatar)))
        if (batch.length < 100) break
        page++
      }
      return all
    }

    const loader = provider === 'github' ? loadGitHub : loadGitLab
    loader()
      .then((repos) => {
        setAllRepos(repos)
        setLoading(false)
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err)
        if (provider === 'github' && /github_not_connected|409|conflict/i.test(message)) {
          setNotConnected(true)
        } else if (import.meta.env.DEV) {
          console.error(`Failed to load ${provider} repos:`, err)
        }
        setAllRepos([])
        setLoading(false)
      })
  }, [opened, hasConnection, connectedReposReady, connectedByProviderId, provider, org?.id, gitlabToken, reloadNonce, localEngineAuth])

  async function handleConnectPublicRepository() {
    if (!org?.id) return
    setPublicRepoError(null)

    let parsed: URL
    try {
      parsed = new URL(publicRepoURL.trim())
    } catch {
      setPublicRepoError(t('repoPicker.publicUrlInvalid'))
      return
    }

    const allowedHosts = new Set(['github.com', 'gitlab.com', 'codeberg.org', 'bitbucket.org'])
    const host = parsed.hostname.toLowerCase()
    const pathParts = parsed.pathname.replace(/\.git$/, '').split('/').filter(Boolean)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !allowedHosts.has(host) || pathParts.length < 2) {
      setPublicRepoError(t('repoPicker.publicUrlInvalid'))
      return
    }

    const fullName = pathParts.join('/')
    const repoName = pathParts.at(-1)!
    const ownerName = pathParts.slice(0, -1).join('/')
    const providerByHost: Record<string, string> = {
      'github.com': 'github',
      'gitlab.com': 'gitlab',
      'codeberg.org': 'codeberg',
      'bitbucket.org': 'bitbucket',
    }

    setSaving(true)
    try {
      await connectRepo(org.id, {
        provider: providerByHost[host],
        providerId: fullName,
        ownerName,
        repoName,
        fullName,
        defaultBranch: 'main',
        isPrivate: false,
        htmlUrl: `${parsed.origin}/${fullName}`,
      })
      await qc.invalidateQueries({ queryKey: qk.repos.connected(org.id) })
      await qc.invalidateQueries({ queryKey: qk.repos.scansAll() })
      setPublicRepoURL('')
      onClose({ connected: resolvedList(connectedRepos.data, connectedRepos, true).length + 1 })
    } catch {
      setPublicRepoError(t('repoPicker.publicConnectFailed'))
    } finally {
      setSaving(false)
    }
  }

  // Force a fresh GitHub authorization, then reload the repo list in place.
  // Prefers the GitHub App install (durable installation tokens that don't
  // expire like the Firebase OAuth token); falls back to OAuth re-auth when
  // the App slug isn't configured.
  async function handleReconnectGitHub() {
    if (!org?.id) return
    const appURL = getGitHubAppInstallURL(org.id)
    if (appURL) { window.location.assign(appURL); return }
    setReconnecting(true)
    setReconnectError(null)
    try {
      const token = await connectGitHub()
      if (!token) {
        // Firebase can complete an already-linked re-auth WITHOUT handing
        // back a fresh GitHub access token. Surface it instead of silently
        // staying empty — the durable fix is the GitHub App.
        setReconnectError(t('repoPicker.noTokenErr'))
        return
      }
      try {
        await saveOrgToken(org.id, token, 'github')
      } catch (saveErr) {
        // SaveOrgToken is admin-gated — a non-admin re-auth gets the token
        // but can't persist it for the org. Say so rather than show empty.
        const msg = saveErr instanceof Error ? saveErr.message : ''
        setReconnectError(
          /403|forbidden|admin/i.test(msg)
            ? t('repoPicker.saveForbidden')
            : t('repoPicker.saveFailed'),
        )
        return
      }
      await qc.invalidateQueries({ queryKey: qk.repos.tokenStatus(org.id, 'github') })
      setReloadNonce((n) => n + 1)
    } catch (err) {
      if (import.meta.env.DEV) console.error('GitHub reconnect failed:', err)
      setReconnectError(t('repoPicker.reauthFailed'))
    } finally {
      setReconnecting(false)
    }
  }

  const owners = useMemo<OwnerGroup[]>(() => {
    const map = new Map<string, OwnerGroup>()
    for (const repo of allRepos) {
      const key = repo.owner.login
      if (!map.has(key)) {
        map.set(key, {
          login: key,
          avatarUrl: repo.owner.avatarUrl,
          isOrg: repo.owner.kind === 'org',
          repos: [],
        })
      }
      map.get(key)!.repos.push(repo)
    }
    return [...map.values()].sort((a, b) => {
      if (a.isOrg !== b.isOrg) return a.isOrg ? -1 : 1
      return a.login.localeCompare(b.login)
    })
  }, [allRepos])

  const ownerRepos = useMemo(() => {
    if (!selectedOwner) return []
    const group = owners.find((o) => o.login === selectedOwner)
    if (!group) return []
    if (!search) return group.repos
    return group.repos.filter((r) =>
      r.name.toLowerCase().includes(search.toLowerCase()),
    )
  }, [selectedOwner, owners, search])

  function toggleRepo(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllOwnerRepos() {
    const ids = ownerRepos.map((r) => r.providerId)
    setSelected((prev) => {
      const next = new Set(prev)
      const allSelected = ids.every((id) => next.has(id))
      if (allSelected) {
        ids.forEach((id) => next.delete(id))
      } else {
        ids.forEach((id) => next.add(id))
      }
      return next
    })
  }

  async function handleSave() {
    if (!org) return
    setSaving(true)
    try {
      // Token is already saved to engine via IntegrationsTab/Onboarding.
      // No need to re-save here.

      // Compute the diff between what's selected NOW and what was
      // connected BEFORE the picker opened. Three buckets:
      //   toConnect     — selected but not yet connected
      //   toDisconnect  — was connected but user unchecked it
      //   unchanged     — already connected and still selected
      //                   (skip, avoids unique-constraint violation)
      const toConnect = allRepos.filter(
        (r) => selected.has(r.providerId) && !connectedByProviderId.has(r.providerId),
      )
      const toDisconnect = Array.from(connectedByProviderId.entries())
        .filter(([providerId]) => !selected.has(providerId))
        .map(([, info]) => info.id)

      // Disconnecting repos is destructive — confirm before proceeding.
      if (toDisconnect.length > 0 && confirmDisconnect.length === 0) {
        setConfirmDisconnect(toDisconnect)
        setSaving(false)
        return
      }

      for (const repo of toConnect) {
        await connectRepo(org.id, {
          provider: repo.provider,
          providerId: repo.providerId,
          ownerName: repo.owner.login,
          repoName: repo.name,
          fullName: repo.fullName,
          defaultBranch: repo.defaultBranch,
          language: repo.language ?? undefined,
          isPrivate: repo.isPrivate,
          avatarUrl: repo.owner.avatarUrl,
          htmlUrl: repo.htmlUrl,
          // Forward the provider's declared homepage so the engine
          // can auto-create a pentest project on the same domain.
          // Null when absent — the engine skips silently.
          homepage: repo.homepage ?? null,
        })
      }

      for (const repoID of toDisconnect) {
        await disconnectRepo(repoID).catch((err) => {
          if (import.meta.env.DEV) console.error('Failed to disconnect repo:', repoID, err)
        })
      }

      qc.invalidateQueries({ queryKey: qk.repos.connectedAll() })
      qc.invalidateQueries({ queryKey: qk.repos.connected(org.id) })
      qc.invalidateQueries({ queryKey: qk.repos.scansAll() })

      onClose({ connected: selected.size })
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to connect repos:', err)
    } finally {
      setSaving(false)
    }
  }

  const totalSelected = selected.size

  return (
    <Dialog
      open={opened}
      onClose={() => onClose()}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        {localEngineAuth
          ? t('repoPicker.publicDialogTitle')
          : selectedOwner ? t('repoPicker.selectRepos') : t('repoPicker.title')}
      </DialogTitle>
      <DialogContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <CircularProgress size={24} />
          </div>
        ) : (
          <>
            {confirmDisconnect.length > 0 && (
              <Box sx={{ p: 2, mb: 2, borderRadius: 2, bgcolor: 'error.main', color: '#fff' }}>
                <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
                  {tOr('repoPicker.disconnectTitle', `Disconnect ${confirmDisconnect.length} repo(s)?`)}
                </Typography>
                <Typography variant="caption" sx={{ display: 'block', mb: 2, opacity: 0.9 }}>
                  {t('repoPicker.disconnectDesc')}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button size="small" variant="contained" color="inherit" sx={{ color: 'error.main', bgcolor: '#fff', textTransform: 'none' }}
                    onClick={() => { setConfirmDisconnect([]); handleSave() }}>
                    {t('common.confirm')}
                  </Button>
                  <Button size="small" variant="outlined" sx={{ color: 'text.primary', borderColor: 'divider', textTransform: 'none' }}
                    onClick={() => setConfirmDisconnect([])}>
                    {t('common.cancel')}
                  </Button>
                </Box>
              </Box>
            )}
            {localEngineAuth ? (
              <Stack
                component="form"
                onSubmit={(event) => {
                  event.preventDefault()
                  void handleConnectPublicRepository()
                }}
                spacing={2}
                py={2}
              >
                <Box>
                  <Typography variant="subtitle1" fontWeight={700}>
                    {t('repoPicker.publicTitle')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" mt={0.5}>
                    {t('repoPicker.publicDescription')}
                  </Typography>
                </Box>
                <TextField
                  fullWidth
                  autoFocus
                  type="url"
                  label={t('repoPicker.publicUrlLabel')}
                  placeholder="https://github.com/owner/repository"
                  value={publicRepoURL}
                  onChange={(event) => setPublicRepoURL(event.target.value)}
                  disabled={saving}
                  slotProps={{ htmlInput: { 'aria-describedby': 'public-repository-help' } }}
                />
                <Typography id="public-repository-help" variant="caption" color="text.secondary">
                  {t('repoPicker.publicHosts')}
                </Typography>
                {publicRepoError && <Alert severity="error">{publicRepoError}</Alert>}
                <DialogActions>
                  <Button variant="text" onClick={() => onClose()} disabled={saving}>
                    {t('repoPicker.cancel')}
                  </Button>
                  <GatedButton
                    action="repo:connect"
                    type="submit"
                    variant="contained"
                    disabled={saving || !publicRepoURL.trim()}
                    startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <Link2 size={15} />}
                  >
                    {saving ? t('repoPicker.saving') : t('repoPicker.publicConnectAction')}
                  </GatedButton>
                </DialogActions>
              </Stack>
            ) : owners.length === 0 ? (
              // Empty list has two very different causes:
              //   (a) GitHub was never connected for this org (first-time /
              //       disconnected) — status.connected === false. Show a plain
              //       "Connect GitHub" prompt; a warning about expired auth is
              //       misleading when nothing was ever authorized.
              //   (b) GitHub IS connected but the proxy returned no repos — the
              //       dominant cause is an expired / auto-cleared authorization.
              //       Say so + offer reconnect.
              <Box sx={{ textAlign: 'center', py: 6, px: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ width: 52, height: 52, borderRadius: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: notConnected ? 'rgba(139,92,246,0.12)' : 'rgba(245,158,11,0.12)' }}>
                  {notConnected
                    ? <Link2 size={24} style={{ color: '#a78bfa' }} />
                    : <AlertTriangle size={24} style={{ color: '#f59e0b' }} />}
                </Box>
                <Typography variant="subtitle1" fontWeight={700}>
                  {notConnected ? t('onboarding.connectGithub') : t('repoPicker.emptyTitle')}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420, lineHeight: 1.5 }}>
                  {notConnected ? t('repoPicker.notConnected') : t('repoPicker.emptyDesc')}
                </Typography>
                <Button
                  variant="contained"
                  disabled={reconnecting}
                  startIcon={reconnecting ? <CircularProgress size={14} color="inherit" /> : (notConnected ? <Link2 size={15} /> : <RefreshCw size={15} />)}
                  onClick={() => {
                    if (provider === 'github') handleReconnectGitHub()
                    else if (org?.id) window.location.href = `/projects/${org.id}/settings?tab=integrations`
                  }}
                  sx={{ mt: 1, textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
                >
                  {notConnected ? t('onboarding.connectGithub') : t('repoPicker.reconnect')}
                </Button>
                {reconnectError && (
                  <Typography variant="caption" sx={{ color: 'error.main', maxWidth: 440, mt: 0.5 }}>
                    {reconnectError}
                  </Typography>
                )}
              </Box>
            ) : selectedOwner ? (
              <RepoList
                selectedOwner={selectedOwner}
                owners={owners}
                ownerRepos={ownerRepos}
                selected={selected}
                search={search}
                onSearchChange={setSearch}
                onToggleRepo={toggleRepo}
                onSelectAll={selectAllOwnerRepos}
                onBack={() => setSelectedOwner(null)}
              />
            ) : (
              <OwnerList
                owners={owners}
                selected={selected}
                onSelectOwner={(login) => {
                  setSelectedOwner(login)
                  setSearch('')
                }}
              />
            )}

            {totalSelected > 0 && (
              <DialogActions sx={{ px: 0, pt: 3 }}>
                <Button variant="text" onClick={() => onClose()}>
                  {t('repoPicker.cancel')}
                </Button>
                <GatedButton
                  action="repo:connect"
                  variant="contained"
                  disabled={saving}
                  onClick={handleSave}
                >
                  {saving ? t('repoPicker.saving') : t('repoPicker.connect', { count: totalSelected })}
                </GatedButton>
              </DialogActions>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
