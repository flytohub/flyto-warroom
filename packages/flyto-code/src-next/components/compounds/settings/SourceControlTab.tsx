import { useState, useEffect, type MouseEvent } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import { Plus, Link2 } from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useAuth } from '@hooks/useAuth'
import { useOrg } from '@hooks/useOrg'
import { useCapabilities } from '@hooks/useCapabilities'
import { GitBranchPlus } from 'lucide-react'
import { getGitLabOAuthUrl, rememberGitLabReturnPath, getGitHubAppInstallURL } from '@lib/oauth'
import { saveOrgToken, getOrgTokenStatus } from '@lib/engine'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RepoPickerModal, type RepoProvider } from '@compounds/_shared/picker'
import { GitHubLogo, GitLabLogo, BitbucketLogo } from '@atoms/ProviderLogos'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'
import { sectionTitleSx, gradientBtnSx } from './shared'
import { ConnectorCard } from './ConnectorCard'

export function SourceControlTab() {
  const { gitlabToken, connectGitHub } = useAuth()
  const { org } = useOrg()
  const caps = useCapabilities(org?.id)
  const qc = useQueryClient()
  const [picker, setPicker] = useState<RepoProvider | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [gitlabUrl, setGitlabUrl] = useState<string>('')

  useEffect(() => {
    getGitLabOAuthUrl().then(setGitlabUrl).catch(() => {
      if (import.meta.env.DEV) console.error('Failed to get GitLab OAuth URL')
    })
  }, [])

  const { data: githubStatus } = useQuery({
    queryKey: qk.repos.tokenStatus(org?.id, 'github'),
    queryFn: () => getOrgTokenStatus(org!.id, 'github'),
    enabled: !!org,
    staleTime: 60_000,
  })
  const { data: gitlabStatus } = useQuery({
    queryKey: qk.repos.tokenStatus(org?.id, 'gitlab'),
    queryFn: () => getOrgTokenStatus(org!.id, 'gitlab'),
    enabled: !!org,
    staleTime: 60_000,
  })

  const githubConnected = !!githubStatus?.connected
  const gitlabConnected = !!gitlabStatus?.connected

  async function handleConnectGitHub() {
    if (githubConnected) {
      setPicker('github')
      return
    }
    // GitHub App path (preferred) — redirect to the App install page when
    // VITE_GITHUB_APP_SLUG is configured. Dormant today (slug unset → null),
    // so this is behaviour-neutral; activates the moment the slug is set.
    // Ported from the (now-removed) IntegrationsTab. GitHub bounces back to
    // /callback/github-app which POSTs the installation_id to the engine.
    if (org) {
      const appURL = getGitHubAppInstallURL(org.id)
      if (appURL) {
        window.location.assign(appURL)
        return
      }
    }
    // OAuth fallback — no App slug / dev / engine without App secrets.
    setConnecting(true)
    try {
      const token = await connectGitHub()
      if (token && org) {
        await saveOrgToken(org.id, token, 'github').catch((err) => {
          if (import.meta.env.DEV) console.error('Failed to save org token:', err)
        })
        await qc.invalidateQueries({ queryKey: qk.repos.tokenStatus(org.id, 'github') })
      }
      setPicker('github')
    } catch (err) {
      if (import.meta.env.DEV) console.error('GitHub connect failed:', err)
    } finally {
      setConnecting(false)
    }
  }

  async function handleGitLabClick(e: MouseEvent<HTMLAnchorElement>) {
    if (gitlabConnected) {
      e.preventDefault()
      setPicker('gitlab')
      return
    }
    if (gitlabToken && org) {
      e.preventDefault()
      try {
        await saveOrgToken(org.id, gitlabToken, 'gitlab')
        await qc.invalidateQueries({ queryKey: qk.repos.tokenStatus(org.id, 'gitlab') })
        setPicker('gitlab')
      } catch (err) {
        if (import.meta.env.DEV) console.error('GitLab rebind failed:', err)
      }
      return
    }
    rememberGitLabReturnPath(window.location.pathname + window.location.search)
  }

  // Source Control only applies to projects that include the Code surface.
  // A CTEM / cloud-only project has no repos to connect — and the engine's
  // GitHub endpoints (/github/user-repos, …) gate on the code surface, so
  // showing a connect flow there only leads to a 403. Gate on the
  // `code_audit` entitlement itself (the feature, not just the page) so a
  // project that lacks the Code module never even sees the connect UI.
  if (!caps.ready || caps.isLoading) {
    return <LoadingState variant="spinner" py={8} />
  }

  if (caps.isError) {
    return <QueryError error={caps.error} onRetry={caps.refetch} label={t('settings.scmCapsError')} compact />
  }

  if (caps.ready && !caps.hasFeature('code_audit')) {
    return (
      <Box sx={{ px: 1, py: 6, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ width: 56, height: 56, borderRadius: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover' }}>
          <GitBranchPlus size={26} style={{ opacity: 0.5 }} />
        </Box>
        <Typography variant="subtitle1" fontWeight={700}>
          {t('settings.scmNotInProject')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420, lineHeight: 1.5 }}>
          {t('settings.scmNotInProjectDesc')}
        </Typography>
      </Box>
    )
  }

  return (
    <>
      <Box sx={sectionTitleSx}>
        <Link2 size={15} style={{ color: '#a78bfa', opacity: 0.9 }} />
        <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', fontSize: 12 }}>
          {t('settings.sourceControl')}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3 }}>
        <ConnectorCard
          logo={<GitHubLogo size={24} />}
          logoBg="action.selected"
          title="GitHub"
          description={t('settings.githubDesc')}
          connected={githubConnected}
          scopes={[{ label: 'repos', color: '#34d399' }, { label: 'read:org', color: '#34d399' }, { label: 'read:user', color: '#34d399' }]}
          action={
            <Button
              size="small"
              variant={githubConnected ? 'outlined' : 'contained'}
              startIcon={<Plus size={14} />}
              onClick={handleConnectGitHub}
              disabled={connecting}
              sx={githubConnected
                ? { textTransform: 'none', fontWeight: 600, borderRadius: 2, px: 2, borderColor: 'rgba(167,139,250,0.3)', color: '#a78bfa', '&:hover': { borderColor: '#a78bfa', bgcolor: 'rgba(167,139,250,0.06)' } }
                : gradientBtnSx('#a78bfa', '#8b5cf6', '#8b5cf6', '#7c3aed')}
            >
              {githubConnected ? t('settings.addRepos') : t('settings.connect')}
            </Button>
          }
        />

        <ConnectorCard
          logo={<GitLabLogo size={24} />}
          logoBg="rgba(252,109,38,0.1)"
          title="GitLab"
          description={t('settings.gitlabDesc')}
          connected={gitlabConnected}
          scopes={[{ label: 'api', color: '#fc6d26' }, { label: 'read_repository', color: '#fc6d26' }]}
          action={
            <Button
              size="small"
              variant={gitlabConnected ? 'outlined' : 'contained'}
              component="a"
              href={gitlabConnected ? undefined : gitlabUrl}
              onClick={handleGitLabClick}
              startIcon={<Plus size={14} />}
              disabled={!gitlabConnected && !gitlabUrl}
              sx={gitlabConnected
                ? { textTransform: 'none', fontWeight: 600, borderRadius: 2, px: 2, borderColor: 'rgba(252,109,38,0.3)', color: '#fc6d26', '&:hover': { borderColor: '#fc6d26', bgcolor: 'rgba(252,109,38,0.06)' } }
                : gradientBtnSx('#fc6d26', '#e24329', '#e24329', '#c03d20')}
            >
              {gitlabConnected ? t('settings.addRepos') : t('settings.connect')}
            </Button>
          }
        />

        <ConnectorCard
          logo={<BitbucketLogo size={24} />}
          logoBg="rgba(38,132,255,0.1)"
          title="Bitbucket"
          description={t('settings.bitbucketDesc')}
          comingSoon
          comingSoonColor="#2684FF"
        />
      </Box>

      <RepoPickerModal
        opened={picker !== null}
        onClose={() => setPicker(null)}
        provider={picker ?? 'github'}
      />
    </>
  )
}
