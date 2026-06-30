import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import { Clock, ExternalLink, Shield, ShieldAlert, ShieldCheck } from 'lucide-react'
import { t } from '@lib/i18n';

interface Verification {
  execution_id: string
  status: string
  verdict?: string
  evidence_url?: string
  created_at: string
}

interface Props {
  verifications?: Verification[]
  status?: string
  publishedAt?: string
}

const VERDICT_STYLE: Record<string, { color: string; bg: string }> = {
  exploitable:  { color: '#ef4444', bg: '#ef444418' },
  sanitized:    { color: '#86efac', bg: '#22c55e18' },
  unreachable:  { color: '#94a3b8', bg: '#94a3b818' },
  inconclusive: { color: '#94a3b8', bg: '#94a3b818' },
}

function verdictStyle(v: string) {
  return VERDICT_STYLE[v] ?? { color: '#94a3b8', bg: '#94a3b818' }
}

export function ActivityTab({ verifications, status, publishedAt }: Props) {
  const hasVerifications = verifications && verifications.length > 0

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, p: 2.5 }}>
      {/* Current status */}
      <Box sx={{ p: 2, borderRadius: 2, border: 1, borderColor: 'divider' }}>
        <Box className="flex items-center gap-2">
          <Clock size={13} style={{ opacity: 0.5 }} />
          <Typography variant="caption" fontWeight={700} color="text.secondary"
            sx={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 13 }}>
            {t('issues.currentStatus')}
          </Typography>
        </Box>
        <Box className="flex items-center gap-2 mt-1.5">
          <Chip
            label={status?.toUpperCase() ?? 'OPEN'}
            size="small"
            sx={{
              height: 22, fontSize: 13, fontWeight: 700,
              bgcolor: status === 'solved' ? '#22c55e18' : status === 'ignored' ? '#94a3b818' : '#f9731618',
              color: status === 'solved' ? '#86efac' : status === 'ignored' ? '#94a3b8' : '#fdba74',
            }}
          />
          {publishedAt && (
            <Typography variant="caption" color="text.secondary">
              {t('issues.firstDetected')}: {new Date(publishedAt).toLocaleDateString()}
            </Typography>
          )}
        </Box>
      </Box>

      {/* Verification history */}
      <Box>
        <Box className="flex items-center gap-1.5 mb-1.5">
          <Shield size={13} style={{ opacity: 0.5 }} />
          <Typography variant="caption" fontWeight={700} color="text.secondary"
            sx={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 13 }}>
            {t('findings.verifications')}
          </Typography>
          {hasVerifications && (
            <Chip label={verifications.length} size="small" sx={{ height: 18, fontSize: 12, fontWeight: 700 }} />
          )}
        </Box>

        {!hasVerifications && (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Shield size={24} style={{ opacity: 0.15, margin: '0 auto 8px' }} />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {t('issues.noVerifications')}
            </Typography>
          </Box>
        )}

        {hasVerifications && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {verifications.map((v, i) => {
              const vs = verdictStyle(v.verdict ?? '')
              return (
                <Box key={i} sx={{
                  display: 'flex', alignItems: 'center', gap: 1.5,
                  p: 1.5, borderRadius: 1, border: 1, borderColor: 'divider',
                  borderLeft: `3px solid ${vs.color}`,
                }}>
                  {v.verdict === 'exploitable' ? <ShieldAlert size={14} style={{ color: vs.color }} /> :
                   v.verdict === 'sanitized' ? <ShieldCheck size={14} style={{ color: vs.color }} /> :
                   <Shield size={14} style={{ color: vs.color }} />}
                  <Box sx={{ flex: 1 }}>
                    <Chip
                      label={v.verdict?.toUpperCase() || v.status.toUpperCase()}
                      size="small"
                      sx={{ height: 18, fontSize: 12, fontWeight: 700, bgcolor: vs.bg, color: vs.color }}
                    />
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: 13 }}>
                    {new Date(v.created_at).toLocaleDateString()}
                  </Typography>
                  {v.evidence_url && (
                    <a href={v.evidence_url} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#a78bfa', fontSize: 13 }}>
                      <ExternalLink size={10} />
                    </a>
                  )}
                </Box>
              )
            })}
          </Box>
        )}
      </Box>
    </Box>
  )
}
