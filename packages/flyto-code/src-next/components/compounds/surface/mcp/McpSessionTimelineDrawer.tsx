/**
 * McpSessionTimelineDrawer — the ordered sequence of tool calls in one
 * agent session, from GET /mcp/sessions/{id}/timeline. Opened from a
 * decision explanation so an operator can see "what else did this agent
 * do around the call I'm looking at". Read-only, digest-only data.
 */
import { useQuery } from '@tanstack/react-query'
import Drawer from '@mui/material/Drawer'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import { X, ListTree } from 'lucide-react'
import { getMcpSessionTimeline } from '@lib/engine'
import { qk } from '@lib/queryKeys'
import { t } from '@lib/i18n';
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'

const BRAND = '#7c3aed'

const EFFECT_TONE: Record<string, string> = {
  block: '#ef4444', hold: '#ef4444', deny: '#ef4444',
  allow: '#16a34a', proceed: '#16a34a', flag: '#f59e0b',
}
const tone = (v?: string) => EFFECT_TONE[(v ?? '').toLowerCase()] ?? 'text.secondary'

export function McpSessionTimelineDrawer({
  orgId, sessionId, highlightEventId, onClose,
}: { orgId: string; sessionId: string | null; highlightEventId?: string; onClose: () => void }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.mcp.sessionTimeline(orgId, sessionId),
    queryFn: () => getMcpSessionTimeline(orgId, sessionId!),
    enabled: !!orgId && !!sessionId,
  })

  return (
    <Drawer anchor="right" open={!!sessionId} onClose={onClose}
      slotProps={{ paper: { sx: { width: { xs: '100%', sm: 500 }, p: 0 } } }}>
      <Box sx={{ px: 2.5, py: 2, display: 'flex', alignItems: 'center', gap: 1, borderBottom: 1, borderColor: 'divider' }}>
        <ListTree size={18} style={{ color: BRAND }} />
        <Typography variant="subtitle1" fontWeight={800} sx={{ flex: 1 }}>
          {t('mcp.sessionTimeline')}
        </Typography>
        <IconButton
          size="small"
          onClick={onClose}
          aria-label={t('common.close')}
          title={t('common.close')}
        >
          <X size={18} />
        </IconButton>
      </Box>

      {isLoading && <LoadingState variant="spinner" py={6} />}
      {isError && <Box sx={{ p: 2.5 }}><QueryError error={error} onRetry={refetch} label={t('mcp.sessionTimeline')} compact /></Box>}

      {data && (
        <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5, overflowY: 'auto' }}>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Chip size="small" variant="outlined" label={`${t('mcp.agent')}: ${data.agentId || '—'}`} sx={{ height: 22 }} />
            <Chip size="small" variant="outlined" label={`${t('mcp.user')}: ${data.userId || '—'}`} sx={{ height: 22 }} />
            <Chip size="small" label={data.status || '—'} sx={{ height: 22, fontWeight: 700 }} />
            <Chip size="small" variant="outlined" label={`${data.calls.length} ${t('mcp.calls')}`} sx={{ height: 22 }} />
          </Box>

          {/* Ordered call list — a simple vertical timeline */}
          <Box sx={{ position: 'relative', pl: 2, mt: 1 }}>
            <Box sx={{ position: 'absolute', left: 5, top: 4, bottom: 4, width: 2, bgcolor: 'divider' }} />
            {data.calls.map((c) => {
              const hot = c.eventId === highlightEventId
              return (
                <Box key={c.eventId} sx={{ position: 'relative', pb: 1.75 }}>
                  <Box sx={{
                    position: 'absolute', left: -16, top: 4, width: 10, height: 10, borderRadius: '50%',
                    bgcolor: tone(c.effective || c.verdict), outline: hot ? `3px solid ${BRAND}55` : 'none',
                  }} />
                  <Box sx={{
                    p: 1.25, borderRadius: 2, border: 1,
                    borderColor: hot ? BRAND : 'divider', bgcolor: hot ? `${BRAND}10` : 'transparent',
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
                      <Typography sx={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>
                        {c.toolName}{c.verb ? ` · ${c.verb}` : ''}
                      </Typography>
                      {(c.effective || c.verdict) && (
                        <Typography sx={{ fontSize: 12, fontWeight: 800, color: tone(c.effective || c.verdict) }}>
                          {c.effective || c.verdict}
                        </Typography>
                      )}
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                        {c.occurredAt.replace('T', ' ').replace('Z', '')}
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {[
                        c.targetTrust,
                        c.dataDirection,
                        c.stateChange ? t('mcp.stateChange') : null,
                        c.externalSideEffect ? t('mcp.sideEffect') : null,
                      ].filter(Boolean).join(' · ') || '—'}
                    </Typography>
                  </Box>
                </Box>
              )
            })}
          </Box>
        </Box>
      )}
    </Drawer>
  )
}
