/**
 * IntegrationHealthBanner — top-level banner that hits
 * /integrations/health on workspace mount + shows a Reconnect CTA
 * when ANY integration's token is expired.
 *
 * Triggered by user 2026-05-21: "you should check connections on
 * entry — if expired, prompt to reconnect, don't wait for the next
 * scan to fail." Live ping is cheap (1 GitHub /user call), banner
 * is dismissible per-session.
 */
import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, Stack, Button, IconButton, Typography, Box } from '@mui/material'
import { X, RefreshCw, AlertTriangle } from 'lucide-react'
import { request } from '@lib/engine/client'
import { qk } from '@lib/queryKeys'
import { useConnectedRepos } from '@hooks/useOrg'
import { t } from '@lib/i18n';

interface IntegrationStatus {
  provider: string
  mode: string
  status: 'ok' | 'expired' | 'no_credential'
  message?: string
  reconnect_url?: string
}

interface HealthResponse {
  integrations: IntegrationStatus[]
  any_expired: boolean
}

interface Props {
  orgId: string
}

export function IntegrationHealthBanner({ orgId }: Props) {
  const [dismissed, setDismissed] = useState(false)
  // A "reconnect" prompt only makes sense once something was connected.
  // A brand-new project (no connected repos) must NOT be told its GitHub
  // credential is "missing" — it never had one. Gate the whole banner on
  // having at least one connected repo; an expired token still surfaces
  // here because the connected_repos rows persist across the expiry.
  const { data: connectedRepos } = useConnectedRepos(orgId)
  const hasConnectedRepos = (connectedRepos?.length ?? 0) > 0
  const { data, refetch, isFetching } = useQuery({
    queryKey: qk.integrations.health(orgId),
    queryFn: () => request<HealthResponse>('GET', `/api/v1/code/orgs/${orgId}/integrations/health`),
    enabled: hasConnectedRepos,
    // Re-check on window focus so coming back from the OAuth
    // reconnect tab immediately reflects the fresh token.
    refetchOnWindowFocus: hasConnectedRepos,
    staleTime: 60_000,
  })

  // Confirm-before-alarm. A single failing health probe is frequently a
  // FALSE positive: it can race a fresh connect (linking repos and
  // saving the OAuth token are separate async steps — a probe that lands
  // in that gap sees `no_credential` even though the token arrives a
  // moment later) or catch a transient GitHub 401. So we require the
  // failure to PERSIST across two consecutive checks before showing the
  // banner: on the first failure we schedule ONE confirmation re-check
  // ~4s later (by which time a connect race has resolved) and only alarm
  // if it ALSO fails. A genuinely expired credential survives both
  // checks and still surfaces; a transient blip never does.
  const badCountRef = useRef(0)
  const [confirmedBad, setConfirmedBad] = useState(false)
  // Reset the confirm-before-alarm accumulator when the org changes.
  // badCountRef is mutable and survives re-renders, so without this a
  // partial bad-count from the previous org would carry over and could
  // raise a false alarm against a different org's health data.
  useEffect(() => {
    badCountRef.current = 0
    setConfirmedBad(false)
  }, [orgId])
  useEffect(() => {
    if (!data) return
    const bad = data.any_expired && data.integrations.some(
      i => i.status === 'expired' || i.status === 'no_credential',
    )
    if (!bad) {
      badCountRef.current = 0
      setConfirmedBad(false)
      return
    }
    badCountRef.current += 1
    if (badCountRef.current >= 2) {
      // Two consecutive failures — trustworthy. Alarm and stop the
      // confirmation loop (auto-clears on the next good check via
      // window-focus refetch or the manual Refresh button).
      setConfirmedBad(true)
      return
    }
    const t = window.setTimeout(() => { refetch() }, 4000)
    return () => window.clearTimeout(t)
  }, [data, refetch])

  if (dismissed) return null
  // Never connected anything → nothing to reconnect.
  if (!hasConnectedRepos) return null
  // Only after the failure is confirmed across two checks.
  if (!confirmedBad || !data) return null

  // Banner fires for either 'expired' (token was rejected) OR
  // 'no_credential' (token genuinely unresolvable). Both need action.
  const needsAttention = data.integrations.filter(
    i => i.status === 'expired' || i.status === 'no_credential',
  )
  if (needsAttention.length === 0) return null

  return (
    <Alert
      severity="warning"
      icon={<AlertTriangle size={18} />}
      sx={{
        mx: 2, my: 1, py: 1,
        '& .MuiAlert-message': { width: '100%' },
      }}
      action={
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Button
            size="small" variant="contained" color="warning"
            onClick={() => {
              // Open the integrations settings page in this tab; the
              // page itself handles the OAuth dance. Refetch on
              // window focus catches the result.
              window.location.href = `/projects/${orgId}/settings?tab=source-control`
            }}
            sx={{ fontSize: 13, fontWeight: 600 }}
          >
            {t('integrationHealth.reconnect')}
          </Button>
          <IconButton
            size="small"
            aria-label={t('common.refresh')}
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw size={14} />
          </IconButton>
          <IconButton
            size="small"
            aria-label={t('common.dismiss')}
            onClick={() => setDismissed(true)}
          >
            <X size={14} />
          </IconButton>
        </Stack>
      }
    >
      <Box>
        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
          {needsAttention[0].status === 'no_credential'
            ? t('integrationHealth.titleMissing')
            : t('integrationHealth.title')}
        </Typography>
        <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.25 }}>
          {needsAttention[0].message || t('integrationHealth.default')}
        </Typography>
      </Box>
    </Alert>
  )
}
