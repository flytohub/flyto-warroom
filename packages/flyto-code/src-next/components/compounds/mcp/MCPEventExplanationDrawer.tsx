import { useQuery } from '@tanstack/react-query'
import { Box, Typography, Alert, LinearProgress } from '@mui/material'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { EvidenceDrawer, SeverityChip, type EvidenceSection } from '@compounds/_shared'
import { getMCPEventExplanation, type MCPEventExplanation } from '@lib/engine/code/mcp'
import { decisionSeverity } from './mcpTokens'
import { QueryError } from '@atoms/QueryError'

// MCPEventExplanationDrawer — "why was this flagged" drilldown. Replays the
// decision engine over a stored event under the current policy and renders the
// faithful reason: floor rule, evidence lines, lens scores, and a diff against
// the verdict recorded at ingest.

function Kv({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.5 }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Box sx={{ textAlign: 'right' }}>{value}</Box>
    </Box>
  )
}

function bool(v: boolean): string {
  return v ? '✓' : '—'
}

function sections(e: MCPEventExplanation): EvidenceSection[] {
  const out: EvidenceSection[] = []

  out.push({
    title: t('mcp.explain.decision'),
    content: (
      <Box>
        <Kv label={t('mcp.explain.verdict')}
          value={<SeverityChip severity={decisionSeverity(e.verdict)} label={e.verdict} size="sm" />} />
        <Kv label={t('mcp.explain.effective')}
          value={<SeverityChip severity={decisionSeverity(e.effective)} label={e.effective} size="sm" />} />
        <Kv label={t('mcp.explain.rollout')} value={<Typography variant="body2">{e.rollout}</Typography>} />
        <Kv label={t('mcp.explain.source')} value={<Typography variant="body2">{e.source}</Typography>} />
        {e.floorRule && (
          <Kv label={t('mcp.explain.floorRule')}
            value={<Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{e.floorRule}</Typography>} />
        )}
      </Box>
    ),
  })

  out.push({
    title: t('mcp.explain.call'),
    content: (
      <Box>
        <Kv label={t('mcp.explain.tool')} value={<Typography variant="body2">{e.toolName}</Typography>} />
        <Kv label={t('mcp.explain.verb')} value={<Typography variant="body2">{e.verb || '—'}</Typography>} />
        <Kv label={t('mcp.explain.target')} value={<Typography variant="body2">{e.targetTrust}</Typography>} />
        {e.dataClass && <Kv label={t('mcp.explain.dataClass')} value={<Typography variant="body2">{e.dataClass}</Typography>} />}
        {e.dataDirection && <Kv label={t('mcp.explain.dataDir')} value={<Typography variant="body2">{e.dataDirection}</Typography>} />}
        <Kv label={t('mcp.explain.stateChange')} value={<Typography variant="body2">{bool(e.stateChange)}</Typography>} />
        <Kv label={t('mcp.explain.sideEffect')} value={<Typography variant="body2">{bool(e.externalSideEffect)}</Typography>} />
      </Box>
    ),
  })

  if (e.evidence && e.evidence.length > 0) {
    out.push({
      title: t('mcp.explain.evidence'),
      content: (
        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
          {e.evidence.map((line, i) => (
            <Typography key={i} component="li" variant="body2" color="text.secondary" sx={{ mb: 0.25 }}>{line}</Typography>
          ))}
        </Box>
      ),
    })
  }

  const lensRows = Object.entries(e.lenses ?? {})
  if (lensRows.length > 0) {
    out.push({
      title: t('mcp.explain.lenses'),
      content: (
        <Box>
          {lensRows.map(([name, score]) => (
            <Box key={name} sx={{ mb: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption">{name}</Typography>
                <Typography variant="caption" color="text.secondary">{score.toFixed(2)}</Typography>
              </Box>
              <LinearProgress variant="determinate" value={Math.max(0, Math.min(100, score * 100))} sx={{ height: 6, borderRadius: 3 }} />
            </Box>
          ))}
        </Box>
      ),
    })
  }

  out.push({
    title: t('mcp.explain.recorded'),
    content: (
      <Box>
        <Kv label={t('mcp.explain.verdict')}
          value={<SeverityChip severity={decisionSeverity(e.recordedAtIngest.verdict)} label={e.recordedAtIngest.verdict || '—'} size="sm" />} />
        <Kv label={t('mcp.explain.effective')}
          value={<SeverityChip severity={decisionSeverity(e.recordedAtIngest.effective)} label={e.recordedAtIngest.effective || '—'} size="sm" />} />
        <Kv label={t('mcp.explain.rollout')} value={<Typography variant="body2">{e.recordedAtIngest.rollout || '—'}</Typography>} />
        {e.recordedAtIngest.effective && e.effective && e.recordedAtIngest.effective !== e.effective && (
          <Alert severity="warning" sx={{ mt: 1, fontSize: 12 }}>
            {t('mcp.explain.drift')}
          </Alert>
        )}
      </Box>
    ),
  })

  return out
}

export function MCPEventExplanationDrawer({
  orgId, eventId, onClose,
}: {
  orgId: string
  eventId: string | null
  onClose: () => void
}) {
  const q = useQuery({
    queryKey: qk.mcp.eventExplanation(orgId, eventId),
    queryFn: () => getMCPEventExplanation(orgId, eventId!),
    enabled: !!orgId && !!eventId,
  })

  const e = q.data

  return (
    <EvidenceDrawer
      open={!!eventId}
      onClose={onClose}
      title={t('mcp.explain.title')}
      subtitle={e ? e.toolName : undefined}
      sections={e ? sections(e) : undefined}
    >
      {q.isLoading && <LinearProgress />}
      {q.isError && <QueryError error={q.error} onRetry={q.refetch} label={t('mcp.explain.title')} compact />}
    </EvidenceDrawer>
  )
}
