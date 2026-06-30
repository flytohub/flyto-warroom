import { useQuery } from '@tanstack/react-query'
import { Box, Typography, Alert, Chip } from '@mui/material'
import { Cloud } from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { listCSPMRules } from '@lib/engine/system/cspm'
import EmptyStateGuide from '@atoms/EmptyStateGuide'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'

// CSPMRulesTab — cloud posture (CSPM) rule catalog.
// Wires GET /api/v1/system/cspm/rules. Read-only list; platform-admin gated.

function sevColor(sev: string): string {
  switch (sev.toLowerCase()) {
    case 'critical': return '#dc2626'
    case 'high': return '#ef4444'
    case 'medium': return '#f59e0b'
    case 'low': return '#3b82f6'
    default: return '#94a3b8'
  }
}

export function CSPMRulesTab() {
  const q = useQuery({
    queryKey: qk.platform.cspmRules(),
    queryFn: listCSPMRules,
    staleTime: 60_000,
  })
  const rules = q.data?.rules ?? []

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2, fontSize: 13 }}>
        {t('sys.cspm.intro')}
      </Alert>

      {q.isLoading && <LoadingState variant="spinner" py={4} />}
      {q.isError && <QueryError error={q.error} onRetry={q.refetch} label={t('sys.cspm.intro')} compact />}
      {!q.isLoading && !q.isError && rules.length === 0 && (
        <EmptyStateGuide icon={<Cloud size={28} />} title={t('sys.cspm.empty')} py={4} />
      )}

      {rules.map(r => (
        <Box key={`${r.id}-${r.version}`} sx={{
          display: 'grid', gridTemplateColumns: 'auto auto 1fr auto', gap: 1.5, alignItems: 'center',
          p: 1.5, mb: 0.5, border: '1px solid', borderColor: 'divider', borderRadius: 1,
        }}>
          <Chip size="small" label={r.severity}
            sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: `${sevColor(r.severity)}22`, color: sevColor(r.severity) }} />
          <Chip size="small" label={r.provider}
            sx={{ height: 20, fontSize: 12, bgcolor: 'rgba(124,58,237,0.15)', color: '#a78bfa' }} />
          <Box>
            <Typography variant="body2">{r.title}</Typography>
            {r.category && <Typography variant="caption" color="text.secondary">{r.category}</Typography>}
          </Box>
          <Chip size="small" label={r.enabled ? 'enabled' : 'disabled'}
            sx={{ height: 20, fontSize: 12, fontWeight: 700,
              bgcolor: r.enabled ? 'rgba(34,197,94,0.18)' : 'rgba(148,163,184,0.18)',
              color: r.enabled ? '#22c55e' : '#94a3b8' }} />
        </Box>
      ))}
    </Box>
  )
}
