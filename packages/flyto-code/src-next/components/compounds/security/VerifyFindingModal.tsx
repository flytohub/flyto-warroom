/**
 * VerifyFindingModal — closed-loop security verification.
 *
 * Two modes:
 *
 *   Static (default, always safe)
 *     Derives a verdict from the scan's static signal — no HTTP
 *     traffic leaves the engine. Returns `reachable` when the
 *     package is imported by the repo. Next iteration will call
 *     flyto-indexer's taint analysis to distinguish reachable
 *     callsites vs. dead imports.
 *
 *   Dynamic (opt-in, requires consent)
 *     Dispatches to flyto-runner which actually sends synthetic
 *     attack payloads to target_url. In the SaaS deployment this
 *     requires an explicit `acknowledged` flag; the enterprise /
 *     offline deployment accepts it without consent because the
 *     runner is inside the customer's network by design.
 *
 * UI flow:
 *   Step `input`    — pick mode; dynamic reveals URL + consent
 *   Step `running`  — runner live view (dynamic only; static is sync)
 *   Step `done`     — verdict badge
 */

import { useEffect, useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import TextField from '@mui/material/TextField'
import MuiButton from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import MuiCheckbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import MuiSelect from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Box from '@mui/material/Box'
import Alert from '@mui/material/Alert'
import { Play, RotateCw, AlertTriangle, ShieldCheck, Zap, Info, Check } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useLocale } from '@hooks/useLocale'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { queryFailed, querySucceeded, queryUnresolved, resolvedList } from '@lib/queryState'
import { verifyFinding, getWorkflowExecution, getVerifyTargets, getRepoProfile } from '@lib/engine'
import type { VerifyFindingResponse, WorkflowExecution, VerifyMode } from '@lib/engine'
import { BrowserLiveView } from '@compounds/_shared/BrowserLiveView'
import { StaticResultView } from './verify/StaticResultView'
import { DynamicResultView } from './verify/DynamicResultView'
import { VerifyProgress } from './verify/VerifyProgress'

interface Props {
  opened: boolean
  onClose: () => void
  fingerprint: string
  repoId: string
}

type Step = 'input' | 'running' | 'done'

const modeCardSx = (selected: boolean) => ({
  display: 'grid',
  gridTemplateColumns: '36px 1fr 22px',
  gap: '14px',
  alignItems: 'center',
  p: '14px 16px',
  borderRadius: '12px',
  border: '1px solid',
  borderColor: selected ? 'rgba(167, 139, 250, 0.55)' : 'divider',
  background: selected
    ? 'linear-gradient(135deg, rgba(167,139,250,0.08) 0%, rgba(167,139,250,0.02) 100%)'
    : 'transparent',
  cursor: 'pointer',
  textAlign: 'left',
  color: 'inherit',
  transition: 'border-color 150ms ease, background 150ms ease, box-shadow 180ms ease',
  boxShadow: selected
    ? '0 0 0 1px rgba(167, 139, 250, 0.3) inset, 0 8px 24px -12px rgba(167, 139, 250, 0.4)'
    : 'none',
  '&:hover': {
    borderColor: selected ? 'rgba(167, 139, 250, 0.55)' : 'divider',
    background: selected
      ? 'linear-gradient(135deg, rgba(167,139,250,0.08) 0%, rgba(167,139,250,0.02) 100%)'
      : 'action.hover',
  },
})

const modeIconSx = (accent: 'safe' | 'risky', selected: boolean) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 36,
  height: 36,
  borderRadius: '10px',
  background: selected
    ? accent === 'safe'
      ? 'rgba(52, 211, 153, 0.15)'
      : 'rgba(245, 158, 11, 0.15)'
    : 'action.selected',
  color: accent === 'safe' ? '#34d399' : '#f59e0b',
  flexShrink: 0,
  transition: 'background 150ms, color 150ms',
})

const modeCheckSx = (selected: boolean) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 20,
  height: 20,
  borderRadius: '50%',
  border: '1.5px solid',
  borderColor: selected ? '#a78bfa' : 'divider',
  bgcolor: selected ? '#a78bfa' : 'transparent',
  color: selected ? '#fff' : 'transparent',
  flexShrink: 0,
  transition: 'all 150ms ease',
  boxShadow: selected ? '0 0 10px rgba(167, 139, 250, 0.6)' : 'none',
})

const calloutSx = (variant: 'amber' | 'orange') => ({
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  gap: '12px',
  alignItems: 'flex-start',
  p: '13px 15px',
  borderRadius: '11px',
  fontSize: '12.5px',
  lineHeight: 1.55,
  color: 'text.primary',
  backdropFilter: 'blur(6px)',
  border: '1px solid',
  borderColor: variant === 'amber' ? 'rgba(251, 191, 36, 0.25)' : 'rgba(249, 115, 22, 0.28)',
  background: variant === 'amber'
    ? 'radial-gradient(circle at 0% 0%, rgba(251, 191, 36, 0.08) 0%, transparent 55%), rgba(255,255,255,0.03)'
    : 'radial-gradient(circle at 0% 0%, rgba(249, 115, 22, 0.08) 0%, transparent 55%), rgba(255,255,255,0.03)',
})

export function VerifyFindingModal({ opened, onClose, fingerprint, repoId }: Props) {
  useLocale()
  const storageKey = `flyto_verify_${fingerprint}`
  const [step, setStep] = useState<Step>('input')
  const [mode, setMode] = useState<VerifyMode>('static')
  const [targetUrl, setTargetUrl] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [execution, setExecution] = useState<VerifyFindingResponse | null>(null)
  const [staticResult, setStaticResult] = useState<VerifyFindingResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Restore persisted modal state on mount / when fingerprint changes.
  useEffect(() => {
    const saved = sessionStorage.getItem(storageKey)
    if (saved) {
      try {
        const s = JSON.parse(saved) as {
          step?: Step
          mode?: VerifyMode
          targetUrl?: string
          executionId?: string
        }
        if (s.step) setStep(s.step)
        if (s.mode) setMode(s.mode)
        if (s.targetUrl) setTargetUrl(s.targetUrl)
        if (s.executionId) setExecution({ execution_id: s.executionId } as VerifyFindingResponse)
      } catch { /* ignore corrupt data */ }
    }
  }, [storageKey])

  // Persist state changes so a page refresh can resume.
  useEffect(() => {
    if (step !== 'input') {
      sessionStorage.setItem(storageKey, JSON.stringify({
        step,
        mode,
        targetUrl,
        executionId: execution?.execution_id,
      }))
    }
  }, [step, mode, targetUrl, execution, storageKey])

  // Only poll for dynamic executions — static mode returns the
  // final verdict in the POST response itself.
  //
  // Belt-and-suspenders: the SSE handler (useOrgEvents:'verify.terminal')
  // invalidates this query as soon as the orchestrator poller sees
  // the runner go terminal. But that requires the SSE connection to
  // be alive AND the engine to fire the event. Polling every 2s on
  // top costs nothing extra (runner is a local HTTP call) and means
  // the UI unblocks within 2 seconds of the runner finishing even
  // when SSE is wedged or missed the event during a reconnect.
  const { data: executionData } = useQuery({
    queryKey: qk.security.workflowExecution(execution?.execution_id),
    queryFn: () => getWorkflowExecution(execution!.execution_id),
    enabled: step === 'running' && !!execution && mode === 'dynamic',
    refetchInterval: (q) => {
      const d = q.state.data as WorkflowExecution | undefined
      if (d && ['passed', 'failed', 'error'].includes(d.status)) return false
      return 2000
    },
  })

  // Per-repo allowlist for dynamic targets. Fetched on-demand so
  // static-only users don't pay the round-trip. Empty list means
  // "no restriction" — fall back to the free-text URL input.
  const targetsEnabled = opened && mode === 'dynamic'
  const targetsQ = useQuery({
    queryKey: qk.security.verifyTargets(repoId),
    queryFn: () => getVerifyTargets(repoId),
    enabled: targetsEnabled,
  })
  const targetsLoading = queryUnresolved(targetsQ, targetsEnabled)
  const targetsUnavailable = queryFailed(targetsQ, targetsEnabled)
  const allowedTargets = resolvedList(targetsQ.data?.targets, targetsQ, targetsEnabled)
  const hasAllowlist = querySucceeded(targetsQ, targetsEnabled) && allowedTargets.length > 0

  // Repo profile drives whether dynamic mode is even offered. Use the SAME
  // cache key (qk.repos.profile) every other getRepoProfile consumer uses —
  // the old qk.repos.repoProfile was a separate entry, so this modal missed
  // the rescan invalidations (RepoDetailView/ScanControlsCard) and could offer
  // dynamic mode off a stale project_type.
  const { data: profile } = useQuery({
    queryKey: qk.repos.profile(repoId),
    queryFn: () => getRepoProfile(repoId),
    enabled: opened,
  })
  const projectType = (profile?.project_type ?? '').toLowerCase()
  // `library` / `sdk` are scanner heuristics that get it wrong often
  // enough to make a hard block user-hostile — Jekyll sites, Vue SPAs
  // and FastAPI backends have all been mis-classified in testing.
  const isLibraryGuess = projectType === 'library' || projectType === 'sdk'

  useEffect(() => {
    if (step === 'running' && executionData && ['passed', 'failed', 'error'].includes(executionData.status)) {
      setStep('done')
      sessionStorage.removeItem(storageKey)
    }
  }, [step, executionData, storageKey])

  // Safety timeout — if the runner hasn't responded in 5 minutes, show an
  // error instead of leaving the user staring at a spinner forever.
  useEffect(() => {
    if (step !== 'running') return
    const timer = setTimeout(() => {
      setError(t('verify.timeout'))
      setStep('done')
      sessionStorage.removeItem(storageKey)
    }, 5 * 60 * 1000)
    return () => clearTimeout(timer)
  }, [step, storageKey])

  async function handleVerify() {
    setLoading(true)
    setError(null)
    try {
      const resp = await verifyFinding(repoId, fingerprint, {
        mode,
        targetUrl: mode === 'dynamic' ? targetUrl : undefined,
        acknowledged: mode === 'dynamic' ? acknowledged : undefined,
      })
      if (mode === 'static') {
        setStaticResult(resp)
        setStep('done')
        sessionStorage.removeItem(storageKey)
      } else {
        setExecution(resp)
        setStep('running')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message: t('hardcoded.unknown.error.e5fd9aa2'))
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    sessionStorage.removeItem(storageKey)
    setStep('input')
    setMode('static')
    setTargetUrl('')
    setAcknowledged(false)
    setExecution(null)
    setStaticResult(null)
    setError(null)
    onClose()
  }

  const isValidUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch { return false }
  }

  const canSubmit =
    mode === 'static' ||
    (mode === 'dynamic' && !targetsLoading && !targetsUnavailable && !!targetUrl && isValidUrl(targetUrl) && acknowledged)

  return (
    <Dialog open={opened} onClose={handleClose} maxWidth="lg" fullWidth>
      <DialogTitle>{t('warroom.verifyTitle')}</DialogTitle>
      <DialogContent>
      {step === 'input' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {isLibraryGuess && (
            <Box sx={calloutSx('amber')}>
              <Info size={16} style={{ marginTop: 2, flexShrink: 0, color: '#fbbf24' }} />
              <Box sx={{ minWidth: 0 }}>
                {t('warroom.verifyLibraryHint')}
              </Box>
            </Box>
          )}

          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.08em', mb: '10px' }}>
              {t('warroom.verifyModeLabel')}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box
                component="button"
                type="button"
                sx={modeCardSx(mode === 'static')}
                onClick={() => setMode('static')}
              >
                <Box sx={modeIconSx('safe', mode === 'static')}><ShieldCheck size={18} /></Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: '13.5px', fontWeight: 600, color: 'text.primary', mb: '3px', lineHeight: 1.3 }}>
                    {t('warroom.verifyStaticLabel')}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.5 }}>
                    {t('warroom.verifyStaticHint')}
                  </Typography>
                </Box>
                <Box sx={modeCheckSx(mode === 'static')}><Check size={12} strokeWidth={3} /></Box>
              </Box>

              <Box
                component="button"
                type="button"
                sx={modeCardSx(mode === 'dynamic')}
                onClick={() => setMode('dynamic')}
              >
                <Box sx={modeIconSx('risky', mode === 'dynamic')}><Zap size={18} /></Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: '13.5px', fontWeight: 600, color: 'text.primary', mb: '3px', lineHeight: 1.3 }}>
                    {t('warroom.verifyDynamicLabel')}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.5 }}>
                    {t('warroom.verifyDynamicHint')}
                  </Typography>
                </Box>
                <Box sx={modeCheckSx(mode === 'dynamic')}><Check size={12} strokeWidth={3} /></Box>
              </Box>
            </Box>
          </Box>

          {mode === 'dynamic' && (
            <>
              <Box sx={calloutSx('orange')}>
                <AlertTriangle size={16} style={{ marginTop: 2, flexShrink: 0, color: '#fb923c' }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 600, fontSize: 13, mb: '4px', color: 'text.primary' }}>
                    {t('warroom.verifyDynamicWarnTitle')}
                  </Typography>
                  {t('warroom.verifyDynamicWarnBody')}
                </Box>
              </Box>

              {targetsLoading ? (
                <Alert severity="info" sx={{ borderRadius: 1 }}>
                  {t('warroom.verifyTargetsLoading')}
                </Alert>
              ) : targetsUnavailable ? (
                <Alert severity="error" sx={{ borderRadius: 1 }}>
                  {t('warroom.verifyTargetsUnavailable')}
                </Alert>
              ) : hasAllowlist ? (
                <FormControl fullWidth size="small">
                  <InputLabel>{t('warroom.verifyTargetLabel')}</InputLabel>
                  <MuiSelect
                    label={t('warroom.verifyTargetLabel')}
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    displayEmpty
                  >
                    <MenuItem value="" disabled>
                      {t('warroom.verifyTargetAllowlistPlaceholder')}
                    </MenuItem>
                    {allowedTargets.map((u) => (
                      <MenuItem key={u} value={u}>{u}</MenuItem>
                    ))}
                  </MuiSelect>
                </FormControl>
              ) : (
                <TextField
                  label={t('warroom.verifyTargetLabel')}
                  placeholder={t('warroom.verifyTargetPlaceholder')}
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  error={!!(targetUrl && !isValidUrl(targetUrl))}
                  helperText={targetUrl && !isValidUrl(targetUrl)
                    ? t('warroom.verifyInvalidUrl')
                    : undefined}
                  fullWidth
                  size="small"
                />
              )}

              <FormControlLabel
                control={
                  <MuiCheckbox
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                  />
                }
                label={t('warroom.verifyAckLabel')}
              />
            </>
          )}

          {error && (
            <Alert
              severity="error"
              sx={{ borderRadius: 1, bgcolor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
              action={
                <MuiButton
                  size="small"
                  variant="text"
                  color="error"
                  startIcon={<RotateCw size={12} />}
                  onClick={handleVerify}
                  disabled={loading || !canSubmit}
                >
                  {t('warroom.verifyRetry')}
                </MuiButton>
              }
            >
              {error}
            </Alert>
          )}

          <MuiButton
            startIcon={<Play size={14} />}
            variant="contained"
            onClick={handleVerify}
            disabled={loading || !canSubmit}
            sx={{ background: 'linear-gradient(135deg, #7c3aed, #a78bfa)' }}
          >
            {mode === 'static'
              ? t('warroom.verifyStaticSubmit')
              : t('warroom.verifySubmit')}
          </MuiButton>
        </Box>
      )}

      {step === 'running' && execution && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>
            {t('warroom.verifyRunning')}
          </Typography>
          {execution.live_view_url
            ? <BrowserLiveView executionId={execution.execution_id} liveViewUrl={execution.live_view_url} />
            : <VerifyProgress />
          }
          {execution.yaml && (
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 12, opacity: 0.45 }}>
                {t('warroom.generatedYaml')}
              </summary>
              <Typography
                component="pre"
                sx={{ mt: 1, maxHeight: 200, overflow: 'auto', fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap', bgcolor: '#0f172a', color: '#e5e7eb', p: 1, borderRadius: 1 }}
              >
                {execution.yaml}
              </Typography>
            </details>
          )}
        </Box>
      )}

      {step === 'done' && staticResult && (
        <StaticResultView result={staticResult} />
      )}

      {step === 'done' && !staticResult && executionData && (
        <DynamicResultView execution={executionData} />
      )}
    </DialogContent></Dialog>
  )
}
