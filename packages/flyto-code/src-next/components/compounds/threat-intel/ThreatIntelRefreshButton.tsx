/**
 * ThreatIntelRefreshButton — operator-triggered force-refresh.
 *
 * Fixes the user complaint 「資料超少 / 根本沒資料」 (2026-05-22):
 * the underlying scheduler boot-jitter + 168h MITRE cadence /
 * 1h ransomware cadence means a freshly-deployed worker has
 * nothing populated. This button bypasses the loop and runs
 * the Ingest synchronously, returning live row counts.
 *
 * Platform admin only (backend gates via FLYTO_PLATFORM_ADMIN_UIDS).
 * Renders nothing for non-admins so org members don't see a
 * button they can't use.
 */
import { useState } from 'react'
import { Button, Tooltip, Stack, Alert, Box, Typography } from '@mui/material'
import { RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { request } from '@lib/engine/client'
import { qk } from '@lib/queryKeys'
import { t } from '@lib/i18n';
import { invalidateThreatIntelQueries } from '@lib/threatIntelLoop'
import { useOrg } from '@hooks/useOrg'

interface RefreshResult {
  source: string
  ok: boolean
  error?: string
  actors?: number
  families?: number
  incidents?: number
  sensors?: number
  observations?: number
  iocs?: number
  duration_ms: number
}

interface RefreshResponse {
  results: RefreshResult[]
}

interface Props {
  /**
   * Restrict refresh to one source. Omitted = refresh all
   * (used by Sensor Map / IoC Lookup which span multiple feeds).
   */
  source?: 'mitre' | 'ransomware' | 'sensors' | 'all'
  /** Optional label override; defaults to the action verb. */
  label?: string
}

export function ThreatIntelRefreshButton({ source = 'all', label }: Props) {
  const qc = useQueryClient()
  const { org } = useOrg()
  const [feedback, setFeedback] = useState<RefreshResult[] | null>(null)

  // Scope check — non-admins don't see the button at all.
  const { data: scope } = useQuery({
    queryKey: qk.threatIntel.eventScope(),
    queryFn: () => request<{ is_platform_admin: boolean }>('GET', '/api/v1/events/scope'),
    staleTime: 5 * 60_000,
  })
  const isAdmin = !!scope?.is_platform_admin

  const mut = useMutation({
    mutationFn: () => request<RefreshResponse>(
      'POST',
      `/api/v1/system/threat-intel/refresh?source=${source}`,
    ),
    onSuccess: (resp) => {
      setFeedback(resp.results)
      // Keep manual refresh and SSE refresh on the same darkweb loop fan-out:
      // catalog pages, feed status, IoC lookup, sensor map, manager cards,
      // and Footprint threat-seed suggestions.
      invalidateThreatIntelQueries(qc, org?.id)
      // Auto-clear after 8s
      setTimeout(() => setFeedback(null), 8_000)
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      setFeedback([{ source, ok: false, error: msg, duration_ms: 0 }])
      setTimeout(() => setFeedback(null), 12_000)
    },
  })

  if (!isAdmin) return null

  const buttonLabel = label ?? t('threatIntel.refreshNow')

  return (
    <Stack direction="column" spacing={1} sx={{ alignItems: 'flex-end' }}>
      <Tooltip title={t('threatIntel.refreshTip')}>
        <Button
          size="small" variant="outlined"
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
          startIcon={
            <RefreshCw
              size={14}
              className={mut.isPending ? 'animate-spin' : undefined}
            />
          }
          sx={{ minHeight: 32, fontSize: 13 }}
        >
          {mut.isPending ? t('threatIntel.refreshing') : buttonLabel}
        </Button>
      </Tooltip>
      {feedback && feedback.length > 0 && (
        <Box sx={{ width: '100%', minWidth: 280 }}>
          {feedback.map((r, i) => (
            <Alert
              key={i}
              severity={r.ok ? 'success' : 'error'}
              icon={r.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              sx={{ mb: 0.5, fontSize: 12, py: 0.5 }}
            >
              <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{r.source}</Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                {r.ok
                  ? formatCounts(r) + ` · ${r.duration_ms}ms`
                  : (r.error ?? t('threatIntel.refreshFailed'))}
              </Typography>
            </Alert>
          ))}
        </Box>
      )}
    </Stack>
  )
}

function formatCounts(r: RefreshResult): string {
  const parts: string[] = []
  if (typeof r.actors === 'number') parts.push(`actors ${r.actors}`)
  if (typeof r.families === 'number') parts.push(`families ${r.families}`)
  if (typeof r.incidents === 'number') parts.push(`incidents ${r.incidents}`)
  const observations = typeof r.observations === 'number' ? r.observations : r.sensors
  if (typeof observations === 'number') parts.push(`observations ${observations}`)
  if (typeof r.iocs === 'number') parts.push(`iocs ${r.iocs}`)
  return parts.join(' · ') || 'ok'
}
