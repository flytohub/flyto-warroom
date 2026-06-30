import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import CircularProgress from '@mui/material/CircularProgress'
import Button from '@mui/material/Button'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { t } from '@lib/i18n';
import { connectGitHubAppInstallation } from '@lib/engine'

type Phase = 'working' | 'done' | 'error'

/**
 * GitHub App install callback. GitHub redirects here after the user
 * completes the install flow at github.com/apps/{slug}/installations/new.
 *
 * Query string contract (set by GitHub):
 *   installation_id — the numeric installation_id we'll bind to the org
 *   setup_action    — 'install' | 'update' | 'request'
 *   state           — the orgID we passed when redirecting the user
 *                     out (round-trips through GitHub unchanged)
 *
 * We POST {installation_id, setup_action} to
 * /api/v1/code/orgs/{state}/github/connect — the backend re-validates
 * the installation by minting a token and persists the org↔installation
 * mapping in github_app_installations. The user is then bounced back to
 * the repo picker or settings.
 */
export function GitHubAppCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('working')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const installationIDRaw = params.get('installation_id') ?? ''
    const setupAction = params.get('setup_action') ?? 'install'
    const orgID = params.get('state') ?? ''
    const oauthError = params.get('error')

    if (oauthError) {
      setErrorMessage(params.get('error_description') || oauthError)
      setPhase('error')
      return
    }
    if (!installationIDRaw || !orgID) {
      setErrorMessage(t('githubAppCallback.missingParams'))
      setPhase('error')
      return
    }
    const installationID = Number(installationIDRaw)
    if (!Number.isFinite(installationID) || installationID <= 0) {
      setErrorMessage(t('githubAppCallback.invalidInstallation'))
      setPhase('error')
      return
    }

    connectGitHubAppInstallation(orgID, installationID, setupAction)
      .then(() => {
        setPhase('done')
        // Give the success state a moment to flash, then bounce to settings.
        setTimeout(() => navigate('/flyto/workspace', { replace: true }), 700)
      })
      .catch((err: Error) => {
        setErrorMessage(err.message || t('githubAppCallback.bindFailed'))
        setPhase('error')
      })
  }, [params, navigate])

  if (phase === 'working') {
    return (
      <div style={pageSx}>
        <CircularProgress size={20} />
        <div style={dimTextSx}>
          {t('githubAppCallback.binding')}
        </div>
      </div>
    )
  }

  if (phase === 'done') {
    return (
      <div style={pageSx}>
        <CheckCircle2 size={28} color="#34d399" />
        <div style={titleSx}>
          {t('githubAppCallback.success')}
        </div>
        <div style={dimTextSx}>
          {t('githubAppCallback.successHint')}
        </div>
      </div>
    )
  }

  return (
    <div style={pageSx}>
      <AlertCircle size={28} color="#f87171" />
      <div style={titleSx}>
        {t('githubAppCallback.failed')}
      </div>
      <div style={{ ...dimTextSx, maxWidth: 480, textAlign: 'center' }}>
        {errorMessage}
      </div>
      <Button variant="contained" onClick={() => navigate('/flyto/workspace', { replace: true })}>
        {t('githubAppCallback.back')}
      </Button>
    </div>
  )
}

const pageSx: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 14,
  padding: 24,
}

const titleSx: React.CSSProperties = { fontSize: 16, fontWeight: 600 }
const dimTextSx: React.CSSProperties = { fontSize: 14, color: 'var(--color-text-tertiary)' }
