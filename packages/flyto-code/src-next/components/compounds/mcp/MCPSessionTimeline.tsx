import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Box, Typography, Alert, TextField, Button, Chip } from '@mui/material'
import {
  Timeline, TimelineItem, TimelineSeparator, TimelineConnector,
  TimelineContent, TimelineDot, TimelineOppositeContent,
} from '@mui/lab'
import { ListTree } from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { SeverityChip } from '@compounds/_shared'
import { SEVERITY_TONE } from '@lib/tokens/severity'
import { getMCPSessionTimeline } from '@lib/engine/code/mcp'
import { decisionSeverity } from './mcpTokens'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'

// MCPSessionTimeline — the ordered call sequence + guardian decisions for one
// agent session. The user pastes/loads a session id (surfaced from an event
// explanation's sessionId) and gets a vertical stepper of every tool call with
// its verdict, so a suspicious session can be reconstructed end-to-end.

export function MCPSessionTimeline({ orgId }: { orgId: string }) {
  const [input, setInput] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)

  const q = useQuery({
    queryKey: qk.mcp.sessionTimeline(orgId, sessionId),
    queryFn: () => getMCPSessionTimeline(orgId, sessionId!),
    enabled: !!orgId && !!sessionId,
  })

  const data = q.data

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <ListTree size={16} style={{ color: '#a78bfa' }} />
        <Typography variant="subtitle2" fontWeight={700}>{t('mcp.timeline.title')}</Typography>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        {t('mcp.timeline.hint')}
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
        <TextField
          size="small"
          label={t('mcp.timeline.sessionId')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && input.trim()) setSessionId(input.trim()) }}
          sx={{ minWidth: 280 }}
        />
        <Button
          size="small"
          variant="outlined"
          disabled={!input.trim()}
          onClick={() => setSessionId(input.trim())}
          sx={{ textTransform: 'none' }}
        >
          {t('mcp.timeline.load')}
        </Button>
      </Box>

      {q.isLoading && <LoadingState variant="spinner" py={3} />}
      {q.isError && <QueryError error={q.error} onRetry={q.refetch} label={t('mcp.timeline.title')} compact />}

      {data && (
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{data.sessionId}</Typography>
            <Chip size="small" label={data.status}
              sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(124,58,237,0.15)', color: '#a78bfa' }} />
            {data.agentId && (
              <Typography variant="caption" color="text.secondary">{t('mcp.timeline.agent')}: {data.agentId}</Typography>
            )}
            {data.userId && (
              <Typography variant="caption" color="text.secondary">{t('mcp.timeline.user')}: {data.userId}</Typography>
            )}
          </Box>

          {data.calls.length === 0 ? (
            <Alert severity="info" sx={{ fontSize: 12 }}>{t('mcp.timeline.empty')}</Alert>
          ) : (
            <Timeline sx={{ p: 0, m: 0 }} position="right">
              {data.calls.map((c, i) => {
                const sev = decisionSeverity(c.effective || c.verdict)
                const dotColor = (SEVERITY_TONE[sev] ?? SEVERITY_TONE['']).tone
                return (
                  <TimelineItem key={c.eventId}>
                    <TimelineOppositeContent sx={{ flex: 0.2, color: 'text.secondary' }} variant="caption">
                      {new Date(c.occurredAt).toLocaleTimeString()}
                    </TimelineOppositeContent>
                    <TimelineSeparator>
                      <TimelineDot sx={{ bgcolor: dotColor }} />
                      {i < data.calls.length - 1 && <TimelineConnector />}
                    </TimelineSeparator>
                    <TimelineContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography variant="body2" fontWeight={600}>{c.toolName}</Typography>
                        {c.verb && <Typography variant="caption" color="text.secondary">{c.verb}</Typography>}
                        {(c.effective || c.verdict) && (
                          <SeverityChip severity={sev} label={c.effective || c.verdict || ''} size="sm" />
                        )}
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        {t('mcp.timeline.target')}: {c.targetTrust}
                        {c.dataDirection ? ` · ${c.dataDirection}` : ''}
                        {c.stateChange ? ` · ${t('mcp.timeline.stateChange')}` : ''}
                        {c.externalSideEffect ? ` · ${t('mcp.timeline.sideEffect')}` : ''}
                      </Typography>
                    </TimelineContent>
                  </TimelineItem>
                )
              })}
            </Timeline>
          )}
        </Box>
      )}
    </Box>
  )
}
