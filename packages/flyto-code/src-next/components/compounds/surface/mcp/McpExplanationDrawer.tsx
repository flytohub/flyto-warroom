/**
 * McpExplanationDrawer — "why was this allowed/blocked?". Opens on a
 * decision (by eventId) and renders the guardian's reasoning from
 * GET /mcp/events/{id}/explanation: the floor rule that fired, the
 * evidence behind it, the per-lens scores, and what was actually
 * recorded at ingest time (rollout mode can make the effective verdict
 * differ from the raw verdict).
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Drawer from '@mui/material/Drawer'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import { X, ShieldAlert, Scale, ListTree } from 'lucide-react'
import { getMcpEventExplanation } from '@lib/engine'
import { qk } from '@lib/queryKeys'
import { t } from '@lib/i18n';
import { McpSessionTimelineDrawer } from './McpSessionTimelineDrawer'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'

const BRAND = '#7c3aed'

const VERDICT_TONE: Record<string, string> = {
  allow: '#16a34a', proceed: '#16a34a',
  block: '#ef4444', deny: '#ef4444', hold: '#ef4444',
  flag: '#f59e0b', warn: '#f59e0b',
}
const tone = (v?: string) => VERDICT_TONE[(v ?? '').toLowerCase()] ?? 'text.primary'

function Field({ label, value, valueTone }: { label: string; value: string; valueTone?: string }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.5 }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={700} sx={{ color: valueTone ?? 'text.primary', fontFamily: 'monospace' }}>
        {value || '—'}
      </Typography>
    </Box>
  )
}

export function McpExplanationDrawer({
  orgId, eventId, onClose,
}: { orgId: string; eventId: string | null; onClose: () => void }) {
  const [timelineSession, setTimelineSession] = useState<string | null>(null)
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.mcp.explanation(orgId, eventId),
    queryFn: () => getMcpEventExplanation(orgId, eventId!),
    enabled: !!orgId && !!eventId,
  })

  return (
    <Drawer anchor="right" open={!!eventId} onClose={onClose}
      slotProps={{ paper: { sx: { width: { xs: '100%', sm: 460 }, p: 0 } } }}>
      <Box sx={{ px: 2.5, py: 2, display: 'flex', alignItems: 'center', gap: 1, borderBottom: 1, borderColor: 'divider' }}>
        <ShieldAlert size={18} style={{ color: BRAND }} />
        <Typography variant="subtitle1" fontWeight={800} sx={{ flex: 1 }}>
          {t('mcp.explainTitle')}
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
      {isError && <Box sx={{ p: 2.5 }}><QueryError error={error} onRetry={refetch} label={t('mcp.explainTitle')} compact /></Box>}

      {data && (
        <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5, overflowY: 'auto' }}>
          <Typography sx={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700 }}>
            {data.toolName}{data.verb ? ` · ${data.verb}` : ''}
          </Typography>

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Chip size="small" label={`${t('mcp.verdict')}: ${data.verdict}`}
              sx={{ height: 22, fontWeight: 700, color: tone(data.verdict) }} />
            <Chip size="small" label={`${t('mcp.effective')}: ${data.effective}`}
              sx={{ height: 22, fontWeight: 700, color: tone(data.effective) }} />
            <Chip size="small" variant="outlined" label={`${t('mcp.rollout')}: ${data.rollout}`} sx={{ height: 22 }} />
            <Chip size="small" variant="outlined" label={`${t('mcp.source')}: ${data.source}`} sx={{ height: 22 }} />
          </Box>

          {data.floorRule && (
            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {t('mcp.floorRule')}
              </Typography>
              <Typography sx={{ fontFamily: 'monospace', fontSize: 13, mt: 0.25 }}>{data.floorRule}</Typography>
            </Box>
          )}

          <Divider />
          <Field label={t('mcp.targetTrust')} value={data.targetTrust} />
          <Field label={t('mcp.dataClass')} value={data.dataClass ?? ''} />
          <Field label={t('mcp.dataDirection')} value={data.dataDirection ?? ''} />
          <Field label={t('mcp.stateChange')} value={data.stateChange ? 'yes' : 'no'}
            valueTone={data.stateChange ? '#f59e0b' : undefined} />
          <Field label={t('mcp.sideEffect')} value={data.externalSideEffect ? 'yes' : 'no'}
            valueTone={data.externalSideEffect ? '#f59e0b' : undefined} />

          {data.evidence && data.evidence.length > 0 && (
            <>
              <Divider />
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {t('mcp.evidence')}
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {data.evidence.map((e, i) => (
                  <Typography key={i} component="li" variant="body2" sx={{ color: 'text.secondary' }}>{e}</Typography>
                ))}
              </Box>
            </>
          )}

          {data.lenses && Object.keys(data.lenses).length > 0 && (
            <>
              <Divider />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Scale size={14} style={{ color: BRAND }} />
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {t('mcp.lenses')}
                </Typography>
              </Box>
              {Object.entries(data.lenses).map(([k, v]) => (
                <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">{k}</Typography>
                  <Typography variant="body2" fontWeight={700} sx={{ fontFamily: 'monospace' }}>{v.toFixed(2)}</Typography>
                </Box>
              ))}
            </>
          )}

          <Divider />
          <Typography variant="caption" color="text.secondary">
            {t('mcp.recordedAtIngest')}: {data.recordedAtIngest.verdict} → {data.recordedAtIngest.effective} ({data.recordedAtIngest.rollout})
          </Typography>

          {data.sessionId && (
            <Button
              variant="outlined" size="small" startIcon={<ListTree size={15} />}
              onClick={() => setTimelineSession(data.sessionId!)}
              sx={{ alignSelf: 'flex-start', mt: 0.5 }}
            >
              {t('mcp.viewSessionTimeline')}
            </Button>
          )}
        </Box>
      )}

      <McpSessionTimelineDrawer
        orgId={orgId}
        sessionId={timelineSession}
        highlightEventId={data?.eventId}
        onClose={() => setTimelineSession(null)}
      />
    </Drawer>
  )
}
