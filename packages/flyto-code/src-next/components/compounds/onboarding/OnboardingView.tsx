import { useState, type ComponentType } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import { useSnackbar } from 'notistack'
import { GitBranch, Radar, Check, Upload, ArrowRight, Shield, Code2, Bug, Database, Globe2, Settings2 } from 'lucide-react'
import { useAuth } from '@hooks/useAuth'
import { useGitHubConnection } from '@hooks/useGitHubConnection'
import { useOrg } from '@hooks/useOrg'
import { saveOrgToken } from '@lib/engine'
import { getGitLabOAuthUrl, rememberGitLabReturnPath } from '@lib/oauth'
import { t } from '@lib/i18n';
import { RepoPickerModal, type RepoPickerCloseInfo, type RepoProvider } from '@compounds/_shared/picker'
import { ScanUploadDropzone } from '@compounds/_shared/ScanUploadDropzone'

type StepNum = 1 | 2 | 3
type ProviderConfig = {
  id: RepoProvider
  name: string
  Logo: ComponentType<{ size?: number }>
  color: string
  bgLight: string
  bgDark: string
  desc: () => string
  btnLabel: () => string
}

/* ── Provider SVG logos ── */
function GitHubLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  )
}

function GitLabLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 22.167L16.583 8.5H7.417L12 22.167z" fill="#E24329"/>
      <path d="M12 22.167L7.417 8.5H1.167L12 22.167z" fill="#FC6D26"/>
      <path d="M1.167 8.5L.05 11.95a.76.76 0 00.276.852L12 22.167 1.167 8.5z" fill="#FCA326"/>
      <path d="M1.167 8.5H7.417L4.698.613c-.148-.456-.788-.456-.936 0L1.167 8.5z" fill="#E24329"/>
      <path d="M12 22.167L16.583 8.5h6.25L12 22.167z" fill="#FC6D26"/>
      <path d="M22.833 8.5l1.117 3.45a.76.76 0 01-.276.852L12 22.167 22.833 8.5z" fill="#FCA326"/>
      <path d="M22.833 8.5h-6.25l2.72-7.887c.147-.456.787-.456.935 0L22.833 8.5z" fill="#E24329"/>
    </svg>
  )
}

function BitbucketLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M1.714 2a.476.476 0 00-.476.548l2.857 17.4a.648.648 0 00.634.538h14.667a.476.476 0 00.476-.4L22.73 2.548A.476.476 0 0022.253 2H1.714zm12.476 12.857h-4.38L8.81 9.143h6.286l-1.006 5.714z" fill="#2684FF"/>
      <path d="M21.206 9.143h-6.11l-1.006 5.714h-4.38L4.096 20.4a.648.648 0 00.448.176h14.667a.476.476 0 00.476-.4l1.519-11.033z" fill="url(#bb_grad)"/>
      <defs><linearGradient id="bb_grad" x1="22.7" y1="10.8" x2="11.4" y2="18.1" gradientUnits="userSpaceOnUse"><stop stopColor="#0052CC"/><stop offset="1" stopColor="#2684FF"/></linearGradient></defs>
    </svg>
  )
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: 'github',
    name: 'GitHub',
    Logo: GitHubLogo,
    color: '#ffffff',
    bgLight: '#e8ecf1',
    bgDark: 'linear-gradient(135deg, #24292e, #40464e)',
    desc: () => t('onboarding.githubDesc'),
    btnLabel: () => t('onboarding.connectGithub'),
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    Logo: GitLabLogo,
    color: '#FC6D26',
    bgLight: '#f5ede6',
    bgDark: 'linear-gradient(135deg, #292038, #3d2854)',
    desc: () => t('onboarding.gitlabDesc'),
    btnLabel: () => t('onboarding.connectGitlab'),
  },
  {
    id: 'bitbucket',
    name: 'Bitbucket',
    Logo: BitbucketLogo,
    color: '#2684FF',
    bgLight: '#e6ecf8',
    bgDark: 'linear-gradient(135deg, #1a2540, #1e3a5f)',
    desc: () => t('onboarding.bitbucketDesc'),
    btnLabel: () => t('onboarding.connectBitbucket'),
  },
]

function IntakeAction({
  icon: Icon,
  title,
  desc,
  action,
  disabled,
  onClick,
}: {
  icon: typeof GitBranch
  title: string
  desc: string
  action: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.75,
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
        minWidth: 0,
      }}
    >
      <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start', minWidth: 0 }}>
        <Box sx={{ width: 34, height: 34, borderRadius: 1.5, display: 'grid', placeItems: 'center', bgcolor: 'action.hover', flexShrink: 0 }}>
          <Icon size={17} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" fontWeight={800}>{title}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.35 }}>{desc}</Typography>
        </Box>
      </Box>
      <Button
        size="small"
        variant="outlined"
        disabled={disabled}
        onClick={onClick}
        endIcon={<ArrowRight size={14} />}
        sx={{ alignSelf: 'flex-start', textTransform: 'none', fontWeight: 700, borderRadius: 1.5 }}
      >
        {action}
      </Button>
    </Paper>
  )
}

export function OnboardingView() {
  const { connectGitHub, gitlabToken } = useAuth()
  const { org } = useOrg()
  const ghConn = useGitHubConnection()
  const { enqueueSnackbar } = useSnackbar()
  const [step, setStep] = useState<StepNum>(ghConn.connected ? 2 : 1)
  const [connecting, setConnecting] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [repoProvider, setRepoProvider] = useState<RepoProvider>('github')
  const [noReposHint, setNoReposHint] = useState(false)
  const [providerIdx, setProviderIdx] = useState(0)

  const provider = PROVIDERS[providerIdx]

  const goWorkspace = (suffix: string) => {
    if (!org) return
    window.location.href = `/projects/${org.id}${suffix}`
  }

  async function handleConnect(targetProvider = provider) {
    setConnecting(true)
    try {
      setRepoProvider(targetProvider.id)
      if (targetProvider.id === 'github') {
        const token = await connectGitHub()
        if (token && org) {
          await saveOrgToken(org.id, token)
          ghConn.refresh()
        }
      } else if (targetProvider.id === 'gitlab') {
        if (gitlabToken && org) {
          await saveOrgToken(org.id, gitlabToken, 'gitlab')
          setStep(2)
          return
        }
        rememberGitLabReturnPath(window.location.pathname)
        const url = await getGitLabOAuthUrl()
        window.location.href = url
        return
      } else {
        enqueueSnackbar(t('onboarding.comingSoon'), { variant: 'info' })
        return
      }
      setStep(2)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('popup-closed') || msg.includes('cancelled')) return
      enqueueSnackbar(t('onboarding.connectFailed'), { variant: 'error' })
    } finally {
      setConnecting(false)
    }
  }

  function handlePickerClose(info?: RepoPickerCloseInfo) {
    setPickerOpen(false)
    setNoReposHint(false)
    const hasRepos = (info?.connected ?? 0) > 0
    if (hasRepos) {
      setStep(3)
    } else {
      setNoReposHint(true)
    }
  }


  const features = [
    { icon: Shield, label: t('onboarding.feat1') },
    { icon: Code2, label: t('onboarding.feat2') },
    { icon: Bug, label: t('onboarding.feat3') },
    { icon: Radar, label: t('onboarding.feat4') },
  ]

  return (
    <Box className="flex flex-col items-center mx-auto py-8 px-4" sx={{ width: '100%', maxWidth: 1120 }}>

      {/* Step 1: Evidence intake workbench */}
      {step === 1 && (
        <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            <Typography variant="h5" fontWeight={800}>
              {t('onboarding.intakeTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 780 }}>
              {t('onboarding.intakeDesc')}
            </Typography>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.25fr 1fr' }, gap: 2 }}>
            <Paper elevation={0} sx={{ p: { xs: 2, sm: 2.5 }, border: 1, borderColor: 'divider', borderRadius: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 2 }}>
                <Box sx={{ width: 34, height: 34, borderRadius: 1.5, display: 'grid', placeItems: 'center', bgcolor: 'action.hover' }}>
                  <GitBranch size={18} />
                </Box>
                <Box>
                  <Typography variant="body1" fontWeight={800}>
                    {t('onboarding.codeLaneTitle')}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t('onboarding.codeLaneDesc')}
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.25 }}>
            {PROVIDERS.map((p, i) => {
              const isActive = i === providerIdx
              return (
                <Paper
                  key={p.id}
                      elevation={0}
                  onClick={() => setProviderIdx(i)}
                  sx={{
                        p: 1.5,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                        borderRadius: 2,
                        border: 1,
                        borderColor: isActive ? 'primary.main' : 'divider',
                        bgcolor: isActive ? 'action.selected' : 'background.paper',
                        transition: 'border-color 0.15s, background-color 0.15s',
                        '&:hover': { borderColor: 'primary.main' },
                  }}
                >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <p.Logo size={24} />
                        <Typography variant="body2" fontWeight={800} color={isActive ? 'text.primary' : 'text.secondary'}>
                          {p.name}
                        </Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.35, minHeight: 34 }}>
                        {p.desc()}
                      </Typography>
                      <Button
                        size="small"
                        variant={isActive ? 'contained' : 'outlined'}
                        disabled={connecting || p.id === 'bitbucket'}
                        onClick={(event) => {
                          event.stopPropagation()
                          setProviderIdx(i)
                          if (p.id !== 'bitbucket') void handleConnect(p)
                        }}
                        endIcon={connecting && p.id === provider.id ? <CircularProgress size={13} color="inherit" /> : <ArrowRight size={14} />}
                        sx={{ mt: 'auto', textTransform: 'none', fontWeight: 700, borderRadius: 1.5 }}
                      >
                        {p.btnLabel()}
                      </Button>
                      {p.id === 'bitbucket' && (
                        <Typography variant="caption" color="text.secondary">
                          {t('onboarding.comingSoon')}
                        </Typography>
                      )}
                </Paper>
              )
            })}
              </Box>
            </Paper>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 1.25 }}>
              <IntakeAction
                icon={Database}
                title={t('onboarding.byoTitle')}
                desc={t('onboarding.byoDesc')}
                action={t('onboarding.openDataSources')}
                disabled={!org}
                onClick={() => goWorkspace('/settings?mode=engineer&tab=data-sources')}
              />
              <IntakeAction
                icon={Globe2}
                title={t('onboarding.externalSeedTitle')}
                desc={t('onboarding.externalSeedDesc')}
                action={t('onboarding.openDomains')}
                disabled={!org}
                onClick={() => goWorkspace('/domains?mode=engineer')}
              />
              <IntakeAction
                icon={Settings2}
                title={t('onboarding.adminControlsTitle')}
                desc={t('onboarding.adminControlsDesc')}
                action={t('onboarding.openSettings')}
                disabled={!org}
                onClick={() => goWorkspace('/settings?mode=engineer')}
              />
            </Box>
          </Box>

          <Paper elevation={0} sx={{ p: { xs: 2, sm: 2.5 }, border: 1, borderColor: 'divider', borderRadius: 2 }}>
            <Typography variant="body2" color="text.secondary" fontWeight={700} sx={{ mb: 1.5, textTransform: 'uppercase', letterSpacing: 0 }}>
              {t('onboarding.whatWeAnalyze')}
            </Typography>
            <Box className="grid grid-cols-2 gap-2">
                {features.map((f) => {
                  const Icon = f.icon
                  return (
                  <Box key={f.label} className="flex items-center gap-2" sx={{ p: 1.25, borderRadius: 1.5, bgcolor: 'action.hover', minWidth: 0 }}>
                      <Icon size={15} style={{ opacity: 0.5, flexShrink: 0 }} />
                    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 0 }}>{f.label}</Typography>
                    </Box>
                  )
                })}
              </Box>
          </Paper>
        </Box>
      )}

      {/* Step 2: Select repos */}
      {step === 2 && (
        <Paper elevation={0} className="rounded-2xl w-full" sx={{ p: 5, border: 1, borderColor: 'divider', textAlign: 'center' }}>
          <Box sx={{
            width: 64, height: 64, borderRadius: 3, mx: 'auto', mb: 3,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #7c3aed, #3b82f6)',
          }}>
            <GitBranch size={30} color="#fff" />
          </Box>
          <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>{t('onboarding.selectRepos')}</Typography>
          <Typography color="text.secondary" sx={{ mb: 4, maxWidth: 380, mx: 'auto' }}>{t('onboarding.selectReposDesc')}</Typography>
          <Button
            variant="contained" size="large"
            onClick={() => setPickerOpen(true)}
            endIcon={<ArrowRight size={16} />}
            sx={{
              textTransform: 'none', fontWeight: 600, borderRadius: 2, px: 5, py: 1.5, fontSize: '1rem',
              background: 'linear-gradient(135deg, #7c3aed 0%, #3b82f6 100%)', boxShadow: 'none',
            }}
          >
            {t('onboarding.selectBtn')}
          </Button>
          {noReposHint && (
            <Typography variant="body2" color="warning.main" sx={{ mt: 2 }}>
              {t('onboarding.noReposHint')}
            </Typography>
          )}
        </Paper>
      )}

      {/* Step 3: Done — guide user to dashboard */}
      {step === 3 && (
        <Paper elevation={0} className="rounded-2xl w-full" sx={{ p: 5, border: 1, borderColor: 'divider', textAlign: 'center' }}>
          <Box sx={{
            width: 64, height: 64, borderRadius: 3, mx: 'auto', mb: 3,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: 'success.main',
          }}>
            <Check size={30} color="#fff" />
          </Box>
          <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
            {t('onboarding.scanDone')}
          </Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 380, mx: 'auto', mb: 1 }}>
            {t('onboarding.scanQueuedDesc')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 380, mx: 'auto' }}>
            {t('onboarding.scanNextHint')}
          </Typography>
        </Paper>
      )}

      <RepoPickerModal opened={pickerOpen} onClose={handlePickerClose} provider={repoProvider} />

      {/* Upload */}
      <Divider sx={{ width: '100%', my: 4 }}>
        <Typography variant="caption" color="text.secondary" sx={{ px: 2 }}>
          {t('onboarding.or')}
        </Typography>
      </Divider>

      <Paper elevation={0} className="rounded-2xl w-full" sx={{ p: 4, border: 1, borderColor: 'divider' }}>
        <Box className="flex items-center gap-3 mb-3">
          <Box sx={{
            width: 40, height: 40, borderRadius: 2, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: 'action.hover',
          }}>
            <Upload size={18} />
          </Box>
          <Box>
            <Typography variant="body1" fontWeight={600}>
              {t('onboarding.uploadTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('onboarding.uploadDesc')}
            </Typography>
          </Box>
        </Box>
        <ScanUploadDropzone />
      </Paper>
    </Box>
  )
}
