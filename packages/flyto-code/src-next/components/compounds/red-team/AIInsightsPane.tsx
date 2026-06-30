import { useEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { Brain, ChevronRight, Loader2, Sparkles, Trophy } from 'lucide-react'
import { t } from '@lib/i18n';
import type { AIInsight } from '@lib/engine'
import { RedTeamEmptyState } from './RedTeamEmptyState'
import styles from './RedTeamView.module.css'

// Variant accents source from --rt-* semantic aliases (recon / ready /
// breach). Borders are derived via color-mix so both modes read from
// one expression.
const VARIANT_COLORS: Record<string, { border: string; accent: string }> = {
  generate: { border: 'color-mix(in srgb, var(--rt-recon) 20%, transparent)', accent: 'var(--rt-recon)' },
  conclude: { border: 'color-mix(in srgb, var(--rt-breach) 20%, transparent)', accent: 'var(--rt-breach)' },
  think:    { border: 'color-mix(in srgb, var(--rt-ready) 20%, transparent)', accent: 'var(--rt-ready)' },
}

export function AIInsightsPane({ insights, loading, empty, onPickTarget }: { insights: AIInsight[]; loading: boolean; empty: boolean; onPickTarget?: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [insights.length])

  return (
    <Paper
      variant="outlined"
      className={`${styles.scanlines} ${styles.glassPanel}`}
      sx={{
        flex: 1, borderRadius: 'var(--flyto-radius-lg)', borderColor: 'divider',
        borderLeft: '2px solid var(--rt-ready)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 180,
        position: 'relative',
        ['--rt-accent' as string]: 'var(--rt-ready)',
      }}
    >
      <Box className={`${styles.aboveDecoration} ${styles.panelHeader}`} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Brain size={16} color="var(--rt-ready)" />
        <Typography variant="body2" sx={{ fontWeight: 700, letterSpacing: 0.5, color: 'text.secondary', textTransform: 'uppercase', fontFamily: 'var(--flyto-font-mono)' }}>
          {t('warroom.redTeamTactics')}
        </Typography>
        {loading && !empty && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto' }}>
            <Box className={styles.pulse} sx={{
              width: 6, height: 6, borderRadius: '50%', bgcolor: 'var(--rt-ok)',
            }} />
            <Typography variant="caption" sx={{ color: 'var(--rt-ok)', fontSize: 12 }}>
              {t('warroom.redTeamAnalysing')}
            </Typography>
          </Box>
        )}
      </Box>
      <Box ref={ref} className={styles.aboveDecoration} sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
        {empty && (
          <RedTeamEmptyState
            icon={Sparkles}
            accent="var(--rt-ready)"
            title={t('warroom.rt.aiEmptyTitle')}
            body={t('warroom.redTeamAIIdle')}
            cta={onPickTarget ? { label: t('warroom.redTeamPickTarget'), onClick: onPickTarget, icon: Sparkles } : undefined}
          />
        )}
        {!empty && loading && insights.length === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 4, color: 'text.secondary' }}>
            <Loader2 size={16} className="animate-spin" />
            <Typography variant="caption">
              {t('warroom.redTeamAILoading')}
            </Typography>
          </Box>
        )}
        {insights.map((ins, i) => {
          const rawVariant = ins.type.toLowerCase()
          const variant = rawVariant === 'recommendation' ? 'generate' : rawVariant === 'critical' || rawVariant === 'warning' ? 'conclude' : 'think'
          const vc = VARIANT_COLORS[variant] || VARIANT_COLORS.think
          return (
            <Paper
              key={i}
              elevation={0}
              sx={{
                display: 'flex', gap: 1.5, p: 1.5, mb: 1,
                borderRadius: '10px', bgcolor: 'action.hover',
                border: '1px solid', borderColor: vc.border,
              }}
            >
              <Box sx={{ color: vc.accent, flexShrink: 0, mt: 0.25 }}>
                {variant === 'generate' ? <ChevronRight size={14} />
                  : variant === 'conclude' ? <Trophy size={14} />
                  : <Brain size={14} />}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                {ins.title && (
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', display: 'block', mb: 0.5 }}>
                    {ins.title}
                  </Typography>
                )}
                <Typography variant="body2" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.6, fontSize: 12 }}>
                  {ins.content}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mt: 0.75 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 13 }}>
                    {ins.source || 'AI'}
                  </Typography>
                  {ins.confidence && (
                    <Typography variant="caption" sx={{ color: vc.accent, fontSize: 13, fontWeight: 600 }}>
                      {ins.confidence}
                    </Typography>
                  )}
                </Box>
              </Box>
            </Paper>
          )
        })}
      </Box>
    </Paper>
  )
}
