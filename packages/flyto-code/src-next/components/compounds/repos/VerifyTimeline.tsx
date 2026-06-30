/**
 * VerifyTimeline — engineer-mode closed-loop verification Before/After.
 *
 * Coverage for:
 *   GET /repos/{repoId}/verify-history?cve=&package=  → listVerifyHistory
 *   GET /repos/{repoId}/workflow-executions           → listRepoWorkflowExecutions
 *
 * The verify-history endpoint is keyed by (cve, package), so the panel
 * lets the engineer pick a CVE/package pair (sourced from the repo
 * profile's cve_vulnerabilities) and renders the chronological verdict
 * events as a Before→After reachability timeline. The recent
 * workflow-executions list gives an at-a-glance "what's been verified"
 * roll-up above it.
 *
 * Self-contained, additive to the existing RepoDetailView.
 */

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Chip from '@mui/material/Chip'
import { ArrowRight, ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react'

import {
  getRepoProfile,
  listRepoWorkflowExecutions,
} from '@lib/engine/code/repos'
import {
  listVerifyHistory,
  type VerifyHistoryEvent,
} from '@lib/engine/code/scanResults'
import { type Severity } from '@lib/tokens/severity'
import { qk } from '@lib/queryKeys'
import { LoadingState } from '@atoms/LoadingState'
import { SeverityChip } from '@compounds/_shared'

function verdictSeverity(verdict: string): Severity {
  switch (verdict) {
    case 'exploitable':
    case 'suspected_exploitable':
    case 'reachable':
      return 'critical'
    case 'sanitized':
    case 'likely_sanitized':
    case 'unreachable':
      return 'low'
    case 'inconclusive':
      return 'medium'
    default:
      return ''
  }
}

function VerdictIcon({ verdict }: { verdict: string }) {
  const sev = verdictSeverity(verdict)
  if (sev === 'critical') return <ShieldAlert size={16} />
  if (sev === 'low') return <ShieldCheck size={16} />
  return <ShieldQuestion size={16} />
}

export function VerifyTimeline({ repoId }: { repoId: string }) {
  const profileQ = useQuery({
    queryKey: qk.repos.profile(repoId),
    queryFn: () => getRepoProfile(repoId),
    staleTime: 5 * 60_000,
    retry: false,
  })

  const execQ = useQuery({
    queryKey: qk.security.repoVerifyExecutions(repoId),
    queryFn: () => listRepoWorkflowExecutions(repoId, 15),
    staleTime: 60_000,
    retry: false,
  })

  // CVE/package pairs the user can inspect history for.
  const cvePairs = useMemo(() => {
    const vulns = profileQ.data?.cve_vulnerabilities ?? []
    const seen = new Set<string>()
    const out: Array<{ cve: string; pkg: string; severity: string }> = []
    for (const v of vulns) {
      const key = `${v.id}::${v.package}`
      if (seen.has(key) || !v.id || !v.package) continue
      seen.add(key)
      out.push({ cve: v.id, pkg: v.package, severity: v.severity })
    }
    return out
  }, [profileQ.data])

  const [selected, setSelected] = useState<string>('')
  const sel = cvePairs.find((p) => `${p.cve}::${p.pkg}` === selected) ?? cvePairs[0]

  const historyQ = useQuery({
    queryKey: qk.security.verifyHistory(repoId, sel?.cve, sel?.pkg),
    queryFn: () => listVerifyHistory(repoId, sel!.cve, sel!.pkg, 100),
    enabled: !!sel,
    staleTime: 60_000,
    retry: false,
  })

  const events: VerifyHistoryEvent[] = useMemo(
    () =>
      [...(historyQ.data?.events ?? [])].sort(
        (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
      ),
    [historyQ.data],
  )

  const execs = execQ.data?.executions ?? []

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
        Closed-Loop Verify
      </Typography>

      {/* Recent executions roll-up */}
      {execs.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {execs.slice(0, 12).map((e) => (
            <Chip
              key={e.id}
              size="small"
              label={e.verdict ?? e.status}
              sx={{ height: 22, fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}
            />
          ))}
        </Box>
      )}

      {/* CVE/package selector */}
      {cvePairs.length > 0 ? (
        <Select
          size="small"
          value={selected || (sel ? `${sel.cve}::${sel.pkg}` : '')}
          onChange={(e) => setSelected(e.target.value)}
          displayEmpty
          sx={{ maxWidth: 460 }}
        >
          {cvePairs.map((p) => (
            <MenuItem key={`${p.cve}::${p.pkg}`} value={`${p.cve}::${p.pkg}`}>
              {p.cve} — {p.pkg}
            </MenuItem>
          ))}
        </Select>
      ) : (
        <Typography variant="body2" color="text.secondary">
          No CVEs with verification history on this repo yet.
        </Typography>
      )}

      {/* Before/After verdict timeline */}
      {sel && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {historyQ.isLoading && (
            <LoadingState variant="spinner" py={2} />
          )}
          {!historyQ.isLoading && events.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No verification events recorded for {sel.cve} yet. Run a verify from the findings table to populate the timeline.
            </Typography>
          )}
          {events.map((ev, i) => (
            <Box key={ev.id} sx={{ display: 'flex', gap: 1.5 }}>
              {/* rail */}
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Box
                  sx={{
                    width: 28, height: 28, borderRadius: '50%',
                    display: 'grid', placeItems: 'center',
                    bgcolor: 'action.hover', color: 'text.primary',
                  }}
                >
                  <VerdictIcon verdict={ev.verdict} />
                </Box>
                {i < events.length - 1 && (
                  <Box sx={{ width: 2, flex: 1, minHeight: 24, bgcolor: 'divider' }} />
                )}
              </Box>
              {/* body */}
              <Box sx={{ pb: 2, flex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <SeverityChip
                    severity={verdictSeverity(ev.verdict)}
                    label={ev.verdict}
                    size="sm"
                  />
                  {i > 0 && (
                    <>
                      <Typography variant="caption" color="text.secondary">
                        {events[i - 1].verdict}
                      </Typography>
                      <ArrowRight size={12} style={{ opacity: 0.5 }} />
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>
                        {ev.verdict}
                      </Typography>
                    </>
                  )}
                  <Typography variant="caption" color="text.secondary">
                    · {new Date(ev.recordedAt).toLocaleString()}
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                  {ev.method}
                  {ev.confidence ? ` · confidence ${Math.round(ev.confidence * 100)}%` : ''}
                </Typography>
                {ev.evidence && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mt: 0.25, fontFamily: 'monospace', opacity: 0.85 }}
                  >
                    {ev.evidence.slice(0, 200)}
                  </Typography>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Paper>
  )
}
