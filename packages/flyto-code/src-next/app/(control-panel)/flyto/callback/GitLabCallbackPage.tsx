import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import CircularProgress from '@mui/material/CircularProgress'
import Button from '@mui/material/Button'
import { AlertCircle } from 'lucide-react'
import { useAuth } from '@hooks/useAuth'
import {
  validateGitLabState,
  getGitLabCodeVerifier,
  exchangeGitLabCode,
  consumeGitLabReturnPath,
} from '@lib/oauth'
import { t } from '@lib/i18n'

type Phase = 'working' | 'error'

export function GitLabCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { setGitLabToken } = useAuth()
  const [phase, setPhase] = useState<Phase>('working')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const code = params.get('code')
    const state = params.get('state')
    const oauthError = params.get('error')

    if (oauthError) {
      setErrorMessage(params.get('error_description') || oauthError)
      setPhase('error')
      return
    }
    if (!code || !state) {
      setErrorMessage(t('gitlabCallback.missingParams'))
      setPhase('error')
      return
    }
    if (!validateGitLabState(state)) {
      setErrorMessage(t('gitlabCallback.invalidState'))
      setPhase('error')
      return
    }
    const verifier = getGitLabCodeVerifier()
    if (!verifier) {
      setErrorMessage(t('gitlabCallback.missingVerifier'))
      setPhase('error')
      return
    }

    exchangeGitLabCode(code, verifier)
      .then(({ accessToken }) => {
        setGitLabToken(accessToken)
        const returnPath = consumeGitLabReturnPath()
        navigate(returnPath, { replace: true })
      })
      .catch((err: Error) => {
        setErrorMessage(err.message || t('gitlabCallback.exchangeFailed'))
        setPhase('error')
      })
  }, [params, navigate, setGitLabToken])

  if (phase === 'working') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <CircularProgress size={20} />
        <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)' }}>
          {t('gitlabCallback.connecting')}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
      <AlertCircle size={28} color="#f87171" />
      <div style={{ fontSize: 16, fontWeight: 600 }}>{t('gitlabCallback.failed')}</div>
      <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', maxWidth: 480, textAlign: 'center' }}>
        {errorMessage}
      </div>
      <Button variant="contained" onClick={() => navigate('/', { replace: true })}>
        {t('gitlabCallback.backHome')}
      </Button>
    </div>
  )
}
