/**
 * AIExplanation — lazy-loaded AI-generated 3-4 sentence explanation of
 * what the verdict means and what to do next. Decoupled from the
 * verdict badge so the badge appears instantly and the explanation
 * fills in async. Errors (no AI key, upstream down) render a
 * degraded-but-honest message rather than hiding the whole panel.
 */

import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { Sparkles, Loader2 } from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { explainExecution } from '@lib/engine'

export function AIExplanation({ executionId }: { executionId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: qk.security.verifyExplain(executionId),
    queryFn: () => explainExecution(executionId),
    staleTime: 60 * 60_000, // AI explanation is deterministic given inputs
  })

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        p: '12px 14px',
        borderRadius: 'var(--flyto-radius-sm, 8px)',
        bgcolor: 'rgba(139, 92, 246, 0.08)',
        border: '1px solid rgba(139, 92, 246, 0.18)',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.04em',
          color: 'rgb(167, 139, 250)',
          textTransform: 'uppercase',
        }}
      >
        <Sparkles size={14} />
        <span>{t('warroom.verifyAIExplainTitle')}</span>
      </Box>
      {isLoading && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 12, color: 'text.secondary' }}>
          <Loader2 size={12} className="animate-spin" />
          <span>{t('warroom.verifyAIExplainLoading')}</span>
        </Box>
      )}
      {error && (
        <Typography sx={{ fontSize: 12, color: 'rgb(239, 68, 68)' }}>
          {t('warroom.verifyAIExplainError')}
          {' '}
          <Box component="span" sx={{ fontSize: 12, opacity: 0.7 }}>{(error as Error).message}</Box>
        </Typography>
      )}
      {data && (
        <Typography sx={{ fontSize: 13, lineHeight: 1.6, color: 'text.primary' }}>
          {data.explanation}
        </Typography>
      )}
    </Box>
  )
}
